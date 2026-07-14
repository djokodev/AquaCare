from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from notifications.services import NotificationService

from ..constants import OPTIMAL_PARAMETERS
from ..domain.calibration import WEIGHT_DIFFERENCE_WARNING_THRESHOLD, biomass_for
from ..domain.exceptions import BusinessRuleViolation
from ..models import CalibrationOperation, CycleUnitAllocation, ProductionCycle, ProductionUnit
from ..tasks import invalidate_dashboard_cache
from .cycle_service import ProductionCycleService


class CalibrationIdempotencyConflict(BusinessRuleViolation):
    """Un UUID de synchronisation a été réutilisé avec un autre mouvement."""


class CalibrationService:
    """Orchestre un mouvement vivant entre deux allocations précises."""

    @classmethod
    @transaction.atomic
    def calibrate(
        cls,
        *,
        source_allocation: CycleUnitAllocation,
        destination_production_unit: ProductionUnit,
        user,
        client_uuid: uuid.UUID,
        calibrated_at,
        transferred_count: int,
        transferred_average_weight_g: Decimal | None = None,
        sample_count: int | None = None,
        sample_total_weight_g: Decimal | None = None,
        size_category: str = '',
        notes: str = '',
        created_offline: bool = False,
    ):
        effective_weight = cls._resolve_average_weight(
            transferred_average_weight_g=transferred_average_weight_g,
            sample_count=sample_count,
            sample_total_weight_g=sample_total_weight_g,
            transferred_count=transferred_count,
        )
        existing = cls._find_existing(client_uuid)
        if existing is not None:
            cls._validate_replay(
                existing,
                user=user,
                source_allocation_id=source_allocation.pk,
                destination_production_unit_id=destination_production_unit.pk,
                calibrated_at=calibrated_at,
                transferred_count=transferred_count,
                transferred_average_weight_g=effective_weight,
            )
            return existing, cls._warnings_for(existing, effective_weight), False

        destination_unit = ProductionUnit.objects.select_for_update().get(pk=destination_production_unit.pk)
        source = (
            CycleUnitAllocation.objects.select_for_update()
            .select_related('cycle__farm_profile', 'production_unit')
            .get(pk=source_allocation.pk)
        )
        cls._validate_context(
            source=source,
            destination_unit=destination_unit,
            user=user,
            calibrated_at=calibrated_at,
            transferred_count=transferred_count,
            transferred_average_weight_g=effective_weight,
        )

        destination = (
            CycleUnitAllocation.objects.select_for_update()
            .select_related('cycle', 'production_unit')
            .filter(
                production_unit=destination_unit,
                status=CycleUnitAllocation.STATUS_ACTIVE,
            )
            .first()
        )
        if destination is not None and destination.cycle.species != source.cycle.species:
            raise BusinessRuleViolation(_('Le bac contient déjà une autre espèce.'))
        if destination is None:
            destination = cls._create_destination_allocation(
                source=source,
                destination_unit=destination_unit,
                calibrated_at=calibrated_at,
                first_count=transferred_count,
                first_average_weight_g=effective_weight,
            )

        transferred_biomass = biomass_for(transferred_count, effective_weight)
        if transferred_biomass <= 0 or transferred_biomass >= source.current_biomass_kg:
            raise BusinessRuleViolation(_('La biomasse transférée dépasse la biomasse disponible.'))

        operation_kwargs = {
            'client_uuid': client_uuid,
            'source_allocation': source,
            'destination_allocation': destination,
            'calibrated_at': calibrated_at,
            'transferred_count': transferred_count,
            'transferred_average_weight_g': effective_weight,
            'transferred_biomass_kg': transferred_biomass,
            'sample_count': sample_count,
            'sample_total_weight_g': sample_total_weight_g,
            'size_category': size_category,
            'notes': notes,
            'created_by': user,
            'created_offline': created_offline,
            'synced_at': timezone.now() if created_offline else None,
            'source_count_before': source.current_fish_count,
            'source_count_after': source.current_fish_count - transferred_count,
            'source_average_weight_before_g': ProductionCycleService._get_allocation_average_weight_g(source),
            'source_average_weight_after_g': Decimal('0'),
            'source_biomass_before_kg': source.current_biomass_kg,
            'source_biomass_after_kg': source.current_biomass_kg - transferred_biomass,
            'destination_count_before': destination.current_fish_count,
            'destination_count_after': destination.current_fish_count + transferred_count,
            'destination_average_weight_before_g': ProductionCycleService._get_allocation_average_weight_g(destination),
            'destination_average_weight_after_g': Decimal('0'),
            'destination_biomass_before_kg': destination.current_biomass_kg,
            'destination_biomass_after_kg': destination.current_biomass_kg + transferred_biomass,
        }
        try:
            with transaction.atomic():
                operation = CalibrationOperation.objects.create(**operation_kwargs)
        except IntegrityError:
            operation = cls._find_existing(client_uuid)
            if operation is None:
                raise
            cls._validate_replay(
                operation,
                user=user,
                source_allocation_id=source.pk,
                destination_production_unit_id=destination_unit.pk,
                calibrated_at=calibrated_at,
                transferred_count=transferred_count,
                transferred_average_weight_g=effective_weight,
            )
            return operation, cls._warnings_for(operation, effective_weight), False

        source = ProductionCycleService.recalculate_allocation_current_metrics(source)
        destination = ProductionCycleService.recalculate_allocation_current_metrics(destination)
        ProductionCycleService._sync_cycle_current_metrics_from_allocations(source.cycle)
        destination_cycle = ProductionCycleService._sync_cycle_current_metrics_from_allocations(destination.cycle)
        operation.refresh_from_db()
        warnings = cls._warnings_for(operation, effective_weight)

        NotificationService.create_notification(
            user=user,
            notification_type='alert',
            title=_('Calibrage effectué'),
            message=_(
                '%(count)s poissons ont été transférés de %(source)s vers %(tank)s. '
                'Le bac contient maintenant %(total)s poissons.'
            )
            % {
                'count': transferred_count,
                'source': source.production_unit.name,
                'tank': destination_unit.name,
                'total': destination.current_fish_count,
            },
            content_object=destination_cycle,
            metadata={'calibration_operation_id': str(operation.id)},
            channels=['in_app'],
        )
        transaction.on_commit(lambda: invalidate_dashboard_cache(str(user.id)))
        return operation, warnings, True

    @staticmethod
    def _find_existing(client_uuid):
        return (
            CalibrationOperation.objects.select_related(
                'source_allocation__cycle__farm_profile',
                'destination_allocation__production_unit',
            )
            .filter(client_uuid=client_uuid)
            .first()
        )

    @staticmethod
    def _resolve_average_weight(
        *,
        transferred_average_weight_g,
        sample_count,
        sample_total_weight_g,
        transferred_count,
    ) -> Decimal:
        direct = Decimal(transferred_average_weight_g) if transferred_average_weight_g is not None else None
        if sample_count is not None or sample_total_weight_g is not None:
            if not sample_count or not sample_total_weight_g or sample_count > transferred_count:
                raise BusinessRuleViolation(_('Les données d’échantillonnage sont invalides.'))
            sampled = (Decimal(sample_total_weight_g) / Decimal(sample_count)).quantize(Decimal('0.01'))
            if direct is not None and direct > 0 and abs(direct - sampled) / sampled > WEIGHT_DIFFERENCE_WARNING_THRESHOLD:
                raise BusinessRuleViolation(_('Le poids moyen et l’échantillon sont incohérents.'))
            direct = sampled
        if direct is None or direct <= 0:
            raise BusinessRuleViolation(_('Le poids moyen transféré doit être positif.'))
        return direct.quantize(Decimal('0.01'))

    @staticmethod
    def _validate_context(*, source, destination_unit, user, calibrated_at, transferred_count, transferred_average_weight_g):
        if source.cycle.farm_profile.user_id != user.id or destination_unit.farm_profile_id != source.cycle.farm_profile_id:
            raise BusinessRuleViolation(_('La source et le bac doivent appartenir à votre ferme.'))
        if source.status != CycleUnitAllocation.STATUS_ACTIVE or source.cycle.status != 'active':
            raise BusinessRuleViolation(_('Cette allocation source est inactive.'))
        if source.production_unit.status != 'active' or destination_unit.status != 'active':
            raise BusinessRuleViolation(_('Les unités source et destination doivent être actives.'))
        if destination_unit.purpose != ProductionUnit.PURPOSE_CALIBRATION or destination_unit.unit_type != 'tank':
            raise BusinessRuleViolation(_('La destination doit être un bac de calibrage.'))
        if not destination_unit.volume_m3 or destination_unit.volume_m3 <= 0:
            raise BusinessRuleViolation(_('Le volume du bac de calibrage doit être positif.'))
        if source.production_unit_id == destination_unit.id:
            raise BusinessRuleViolation(_('La source et la destination doivent être différentes.'))
        if transferred_count <= 0 or transferred_count >= source.current_fish_count:
            raise BusinessRuleViolation(_('Le transfert doit laisser des poissons dans la source.'))
        if transferred_average_weight_g <= 0:
            raise BusinessRuleViolation(_('Le poids moyen transféré doit être positif.'))
        if calibrated_at.date() < source.cycle.start_date or calibrated_at > timezone.now() + timedelta(minutes=10):
            raise BusinessRuleViolation(_('La date du calibrage est invalide.'))

    @staticmethod
    def _create_destination_allocation(*, source, destination_unit, calibrated_at, first_count, first_average_weight_g):
        first_biomass = biomass_for(first_count, first_average_weight_g)
        cycle = ProductionCycle.objects.create(
            farm_profile=source.cycle.farm_profile,
            cycle_name=f'{destination_unit.name} - Calibration {calibrated_at.date().isoformat()}',
            species=source.cycle.species,
            pond_identifier=destination_unit.name,
            pond_volume_m3=destination_unit.volume_m3,
            pond_surface_m2=None,
            infrastructure_type=['bac_calibrage'],
            start_date=calibrated_at.date(),
            initial_count=first_count,
            initial_average_weight=first_average_weight_g,
            initial_biomass=first_biomass,
            current_count=0,
            current_average_weight=Decimal('0'),
            current_biomass=Decimal('0'),
            total_feed_consumed=Decimal('0'),
            status='active',
            cycle_kind=ProductionCycle.CYCLE_KIND_CALIBRATION,
            target_harvest_weight_g=source.cycle.target_harvest_weight_g,
            planned_harvest_date=source.cycle.planned_harvest_date,
            planned_cycle_duration_days=source.cycle.planned_cycle_duration_days,
            expected_survival_rate_pct=source.cycle.expected_survival_rate_pct,
            planned_selling_price_per_kg_fcfa=source.cycle.planned_selling_price_per_kg_fcfa,
            fingerlings_cost_fcfa=Decimal('0'),
            other_operational_costs_fcfa=Decimal('0'),
        )
        return CycleUnitAllocation.objects.create(
            client_uuid=uuid.uuid4(),
            cycle=cycle,
            production_unit=destination_unit,
            initial_fish_count=0,
            current_fish_count=0,
            initial_biomass_kg=Decimal('0'),
            current_biomass_kg=Decimal('0'),
            expected_survival_rate_pct=source.expected_survival_rate_pct,
        )

    @staticmethod
    def _validate_replay(existing, *, user, source_allocation_id, destination_production_unit_id, calibrated_at, transferred_count, transferred_average_weight_g):
        same_payload = all(
            [
                existing.source_allocation.cycle.farm_profile.user_id == user.id,
                existing.source_allocation_id == source_allocation_id,
                existing.destination_allocation.production_unit_id == destination_production_unit_id,
                existing.calibrated_at == calibrated_at,
                existing.transferred_count == transferred_count,
                existing.transferred_average_weight_g == transferred_average_weight_g,
            ]
        )
        if not same_payload:
            raise CalibrationIdempotencyConflict(_('Cet UUID correspond à un autre calibrage.'))

    @staticmethod
    def _warnings_for(operation, transferred_average_weight_g):
        warnings = []
        destination = operation.destination_allocation
        destination_weight = operation.destination_average_weight_before_g
        if (
            destination.current_fish_count > 0
            and destination_weight > 0
            and abs(transferred_average_weight_g - destination_weight) / destination_weight
            > WEIGHT_DIFFERENCE_WARNING_THRESHOLD
        ):
            warnings.append('weight_difference')
        density = operation.destination_biomass_after_kg / destination.production_unit.volume_m3
        density_limit = Decimal(str(OPTIMAL_PARAMETERS[destination.cycle.species]['density_max_kg_m3']))
        if density > density_limit:
            warnings.append('high_density')
        return warnings
