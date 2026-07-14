from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.core.cache import cache
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from notifications.services import NotificationService

from ..domain.calibration import WEIGHT_DIFFERENCE_WARNING_THRESHOLD, StockState, biomass_for, transfer
from ..domain.exceptions import BusinessRuleViolation
from ..models import CalibrationOperation, CalibrationTank, CycleUnitAllocation, ProductionCycle


class CalibrationService:
    @staticmethod
    @transaction.atomic
    def calibrate(*, source_cycle, destination_tank, user, client_uuid, calibrated_at, transferred_count,
                  transferred_average_weight_g=None, sample_count=None, sample_total_weight_g=None,
                  size_category='', notes='', created_offline=False, source_cycle_unit_allocation=None):
        existing = CalibrationOperation.objects.select_related('source_cycle', 'destination_cycle').filter(client_uuid=client_uuid).first()
        if existing:
            if existing.source_cycle.farm_profile.user_id != user.id:
                raise BusinessRuleViolation(_('Cet identifiant de synchronisation appartient à une autre ferme.'))
            return existing, [], False

        source = ProductionCycle.objects.select_for_update().select_related('farm_profile').get(pk=source_cycle.pk)
        source_allocation = None
        if source_cycle_unit_allocation:
            source_allocation = CycleUnitAllocation.objects.select_for_update().select_related('production_unit').filter(
                pk=source_cycle_unit_allocation,
                cycle=source,
                status=CycleUnitAllocation.STATUS_ACTIVE,
            ).first()
            if source_allocation is None:
                raise BusinessRuleViolation(_('Cette unité source est introuvable ou inactive.'))
        tank = CalibrationTank.objects.select_for_update().get(pk=destination_tank.pk)
        if source.farm_profile.user_id != user.id or tank.farm_profile_id != source.farm_profile_id:
            raise BusinessRuleViolation(_('La source et le bac doivent appartenir à votre ferme.'))
        if source.status != 'active':
            raise BusinessRuleViolation(_('Seule une unité active peut être calibrée.'))
        if not tank.is_active:
            raise BusinessRuleViolation(_('Ce bac de calibrage est inactif.'))
        if calibrated_at.date() < source.start_date or calibrated_at > timezone.now() + timedelta(minutes=10):
            raise BusinessRuleViolation(_('La date du calibrage est invalide.'))
        source_count = source_allocation.current_fish_count if source_allocation else source.current_count
        source_biomass = source_allocation.current_biomass_kg if source_allocation else source.current_biomass
        if transferred_count <= 0 or transferred_count >= source_count:
            raise BusinessRuleViolation(_('Le nombre transféré doit être positif et laisser des poissons dans la source.'))
        if sample_count is not None or sample_total_weight_g is not None:
            if not sample_count or not sample_total_weight_g or sample_count <= 0 or sample_total_weight_g <= 0:
                raise BusinessRuleViolation(_('Les deux données d’échantillonnage doivent être positives.'))
            transferred_average_weight_g = Decimal(sample_total_weight_g) / Decimal(sample_count)
        if transferred_average_weight_g is None or transferred_average_weight_g <= 0:
            raise BusinessRuleViolation(_('Le poids moyen transféré doit être positif.'))

        destination = ProductionCycle.objects.select_for_update().filter(
            calibration_tank=tank, status='active'
        ).first()
        if destination and destination.pk == source.pk:
            raise BusinessRuleViolation(_('Une unité ne peut pas être calibrée vers son propre bac.'))
        if destination and destination.species != source.species:
            raise BusinessRuleViolation(_('Le bac contient déjà une autre espèce.'))

        transferred_average_weight_g = Decimal(transferred_average_weight_g)
        transferred_biomass = biomass_for(transferred_count, transferred_average_weight_g)
        if transferred_biomass >= source_biomass:
            raise BusinessRuleViolation(_('La biomasse transférée dépasse la biomasse disponible.'))

        if destination is None:
            destination = ProductionCycle.objects.create(
                farm_profile=source.farm_profile, cycle_name=f'{tank.name} - Calibration {calibrated_at.date().isoformat()}',
                species=source.species, pond_identifier=tank.name, pond_volume_m3=tank.volume_m3,
                pond_surface_m2=None, infrastructure_type=['bac_calibrage'], start_date=calibrated_at.date(),
                initial_count=transferred_count, initial_average_weight=transferred_average_weight_g,
                initial_biomass=transferred_biomass, current_count=0, current_average_weight=transferred_average_weight_g,
                current_biomass=Decimal('0'), total_feed_consumed=Decimal('0'), status='active', unit_type='calibration',
                calibration_tank=tank, target_harvest_weight_g=source.target_harvest_weight_g,
                planned_harvest_date=source.planned_harvest_date, planned_cycle_duration_days=source.planned_cycle_duration_days,
                expected_survival_rate_pct=source.expected_survival_rate_pct,
                planned_selling_price_per_kg_fcfa=source.planned_selling_price_per_kg_fcfa,
                fingerlings_cost_fcfa=Decimal('0'), other_operational_costs_fcfa=Decimal('0'),
            )

        source_before = StockState(source_count, source_biomass)
        destination_before = StockState(destination.current_count, destination.current_biomass)
        source_after, destination_after, transferred_biomass = transfer(
            source_before, destination_before, transferred_count, transferred_average_weight_g
        )
        operation = CalibrationOperation.objects.create(
            client_uuid=client_uuid, source_cycle=source, source_cycle_unit_allocation=source_allocation,
            destination_cycle=destination, calibrated_at=calibrated_at,
            transferred_count=transferred_count, transferred_average_weight_g=transferred_average_weight_g,
            transferred_biomass_kg=transferred_biomass, sample_count=sample_count,
            sample_total_weight_g=sample_total_weight_g, size_category=size_category, notes=notes,
            created_by=user, created_offline=created_offline, synced_at=timezone.now() if created_offline else None,
            source_count_before=source_before.count, source_count_after=source_after.count,
            source_average_weight_before_g=source_before.average_weight_g, source_average_weight_after_g=source_after.average_weight_g,
            source_biomass_before_kg=source_before.biomass_kg, source_biomass_after_kg=source_after.biomass_kg,
            destination_count_before=destination_before.count, destination_count_after=destination_after.count,
            destination_average_weight_before_g=destination_before.average_weight_g,
            destination_average_weight_after_g=destination_after.average_weight_g,
            destination_biomass_before_kg=destination_before.biomass_kg,
            destination_biomass_after_kg=destination_after.biomass_kg,
        )
        if source_allocation:
            source_allocation.current_fish_count = source_after.count
            source_allocation.current_biomass_kg = source_after.biomass_kg
            source_allocation.save(update_fields=['current_fish_count', 'current_biomass_kg', 'updated_at'])
            source.current_count = sum(
                source.unit_allocations.filter(status=CycleUnitAllocation.STATUS_ACTIVE).values_list('current_fish_count', flat=True)
            )
            source.current_biomass = sum(
                source.unit_allocations.filter(status=CycleUnitAllocation.STATUS_ACTIVE).values_list('current_biomass_kg', flat=True),
                Decimal('0'),
            )
            source.current_average_weight = (
                source.current_biomass * Decimal('1000') / source.current_count
            ).quantize(Decimal('0.01'))
        else:
            source.current_count, source.current_biomass, source.current_average_weight = source_after.count, source_after.biomass_kg, source_after.average_weight_g
        destination.current_count, destination.current_biomass, destination.current_average_weight = destination_after.count, destination_after.biomass_kg, destination_after.average_weight_g
        source.save(update_fields=['current_count', 'current_biomass', 'current_average_weight', 'updated_at'])
        destination.save(update_fields=['current_count', 'current_biomass', 'current_average_weight', 'updated_at'])
        warnings = []
        if destination_before.count and abs(transferred_average_weight_g - destination_before.average_weight_g) / destination_before.average_weight_g > WEIGHT_DIFFERENCE_WARNING_THRESHOLD:
            warnings.append('weight_difference')
        if destination.pond_volume_m3 and destination.current_biomass / destination.pond_volume_m3 > Decimal('30'):
            warnings.append('high_density')
        NotificationService.create_notification(
            user=user, notification_type='alert', title=_('Calibrage effectué'),
            message=_('%(count)s poissons ont été transférés de %(source)s vers %(tank)s. Le bac contient maintenant %(total)s poissons.') % {
                'count': transferred_count,
                'source': source_allocation.production_unit.name if source_allocation else source.pond_identifier,
                'tank': tank.name,
                'total': destination.current_count,
            },
            content_object=destination, metadata={'calibration_operation_id': str(operation.id)}, channels=['in_app'],
        )
        transaction.on_commit(cache.clear)
        return operation, warnings, True
