"""
Service métier pour la gestion des cycles de production aquacole.

Ce service centralise TOUTE la logique métier liée aux cycles de production,
depuis la création jusqu'à la récolte, en passant par les calculs de métriques.

Responsabilités :
- Création et validation de cycles
- Calculs de métriques (biomasse, FCR, survie)
- Opérations de récolte
- Recalcul complet des métriques
- Orchestration des opérations complexes

Architecture :
- Méthodes statiques (service stateless)
- Transactions atomiques pour opérations critiques
- Validation métier stricte
- Gestion d'erreurs explicite
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import TYPE_CHECKING, Any, TypedDict

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from ..constants import (
    DEFAULT_EXPECTED_SURVIVAL_RATE_PCT,
    DEFAULT_FINGERLINGS_COST_FCFA,
    DEFAULT_INITIAL_AVERAGE_WEIGHT_G_BY_SPECIES,
    DEFAULT_OTHER_OPERATIONAL_COSTS_FCFA,
    ECONOMIC_DEFAULTS_BY_SPECIES,
    MAX_STOCKING_DENSITY_POND_PER_M2,
    MAX_STOCKING_DENSITY_TANK_PER_M3,
)
from ..domain.calculators import AquacultureCalculator
from ..domain.cycle_duration import (
    CYCLE_DURATION_ERROR_MESSAGE,
    calculate_planned_harvest_date,
    validate_cycle_duration_days,
)
from ..domain.cycle_onboarding import CycleOnboardingRuleViolation, resolve_tracking_baseline
from ..domain.exceptions import (
    AllocationAlreadyFinallyHarvested,
    BusinessRuleViolation,
    CycleAlreadyHarvestedError,
    CycleNotActiveError,
    EventBeforeTrackingStartError,
    FinalHarvestIdempotencyConflict,
    FinalHarvestRequiresAllocationBreakdown,
    InsufficientFishCountError,
    InvalidDateRangeError,
    InvalidDensityError,
    InvalidHarvestDataError,
    OfflineSyncConflictError,
)
from ..domain.production_units import normalize_production_unit_type
from ..models import (
    CalibrationOperation,
    CycleLog,
    CycleUnitAllocation,
    FinalHarvestOperation,
    PartialHarvest,
    ProductionCycle,
    ProductionUnit,
)
from .allocation_ledger_service import AllocationLedgerService
from .aquaculture_lock_service import AquacultureLockService
from .base import BaseService
from .final_harvest_service import FinalHarvestService

if TYPE_CHECKING:
    from accounts.models import FarmProfile


class CycleCreatePayload(TypedDict, total=False):
    client_uuid: Any
    launch_payload_hash: str
    cycle_name: str
    species: str
    pond_identifier: str
    pond_surface_m2: Decimal
    pond_volume_m3: Decimal
    infrastructure_type: str
    start_date: date | str
    onboarding_mode: str
    initial_count: int
    initial_average_weight: Decimal | None
    tracking_start_date: date | str
    tracking_start_count: int
    tracking_start_average_weight: Decimal
    tracking_start_biomass: Decimal
    tracking_start_biomass_source: str
    target_harvest_weight_g: Decimal
    planned_cycle_duration_days: int
    planned_harvest_date: date | str
    expected_survival_rate_pct: Decimal
    planned_selling_price_per_kg_fcfa: Decimal
    fingerlings_cost_fcfa: Decimal
    other_operational_costs_fcfa: Decimal
    created_offline: bool
    synced_at: Any


@dataclass(frozen=True)
class HarvestCycleResult:
    """Résultat complet d'une commande de récolte globale."""

    cycle: ProductionCycle
    operations: list[FinalHarvestOperation]
    idempotent_replay: bool

    @property
    def reconciliation_status(self) -> str:
        """Agrège le statut des événements sans le faire deviner à la vue."""
        if any(
            operation.reconciliation_status == FinalHarvestOperation.STATUS_PENDING
            for operation in self.operations
        ):
            return FinalHarvestOperation.STATUS_PENDING
        return FinalHarvestOperation.STATUS_RECONCILED

    def __getattr__(self, name):
        """Préserve les anciens appels métier qui lisaient directement le cycle."""
        return getattr(self.cycle, name)


class ProductionCycleService(BaseService):
    """
    Service métier pour la gestion des cycles de production.

    Points d'entrée principaux :
    - create_cycle() : Création avec validation complète
    - harvest_cycle() : Finalisation avec calculs métriques
    - recalculate_all_metrics() : Recalcul complet depuis logs
    - update_current_metrics() : Mise à jour après nouveau log
    """

    # Densités maximales par infrastructure.
    MAX_STOCKING_DENSITY_POND_PER_M2 = MAX_STOCKING_DENSITY_POND_PER_M2
    MAX_STOCKING_DENSITY_TANK_PER_M3 = MAX_STOCKING_DENSITY_TANK_PER_M3

    # Poids minimum attendu par espèce (grammes)
    MIN_WEIGHT_BY_SPECIES = {
        'tilapia': 0.5,
        'clarias': 1.0,
    }

    @staticmethod
    @transaction.atomic
    def create_cycle(farm_profile: FarmProfile, cycle_data: CycleCreatePayload) -> ProductionCycle:
        """
        Crée un nouveau cycle de production avec validation métier complète.

        Validations effectuées :
        - Densité maximale respectée selon espèce
        - Poids initial cohérent
        - Date de début valide
        - Cohérence données bassin

        Opérations :
        1. Validation règles métier
        2. Calcul biomasse initiale
        3. Initialisation valeurs courantes
        4. Création enregistrement
        5. Génération plan alimentation semaine 1 (optionnel)

        Args:
            farm_profile: Profil de ferme propriétaire
            cycle_data: Données du cycle (déjà validées par serializer)

        Returns:
            ProductionCycle créé et initialisé

        Raises:
            InvalidDensityError: Si densité > max autorisée
            BusinessRuleViolation: Si autres règles violées
        """
        ProductionCycleService.log_operation(
            "create_cycle",
            {"farm_profile": farm_profile.id, "cycle_name": cycle_data.get('cycle_name')}
        )

        client_uuid = cycle_data.get('client_uuid')
        if client_uuid:
            existing_cycle = ProductionCycle.objects.select_related('farm_profile__user').filter(
                client_uuid=client_uuid
            ).first()
            if existing_cycle:
                if existing_cycle.farm_profile.user_id != farm_profile.user_id:
                    raise OfflineSyncConflictError(
                        _("Conflit de synchronisation : ce client_uuid appartient à un autre utilisateur.")
                    )
                return existing_cycle

        # Normaliser et compléter les paramètres économiques.
        ProductionCycleService._apply_economic_defaults(cycle_data)

        # 1. Validation métier approfondie
        ProductionCycleService._validate_cycle_business_rules(cycle_data)

        # 2. L'historique et la baseline sont deux sources distinctes.
        initial_weight = cycle_data.get('initial_average_weight')
        initial_biomass = (
            AquacultureCalculator.calculate_biomass(
                cycle_data['initial_count'],
                initial_weight,
            )
            if initial_weight is not None
            else None
        )
        cycle_start_date = cycle_data['start_date']
        if isinstance(cycle_start_date, str):
            cycle_start_date = date.fromisoformat(cycle_start_date)
        tracking_start_date = cycle_data.get('tracking_start_date')
        if isinstance(tracking_start_date, str):
            tracking_start_date = date.fromisoformat(tracking_start_date)
        try:
            baseline = resolve_tracking_baseline(
                onboarding_mode=cycle_data.get(
                    'onboarding_mode',
                    ProductionCycle.ONBOARDING_MODE_NEW,
                ),
                start_date=cycle_start_date,
                initial_count=cycle_data['initial_count'],
                initial_average_weight=initial_weight,
                tracking_baseline=(
                    {
                        'tracking_start_date': tracking_start_date,
                        'fish_count': cycle_data['tracking_start_count'],
                        'average_weight_g': cycle_data['tracking_start_average_weight'],
                        'biomass_kg': (
                            cycle_data['tracking_start_biomass']
                            if cycle_data.get('tracking_start_biomass_source')
                            == ProductionCycle.BIOMASS_SOURCE_DECLARED
                            else None
                        ),
                    }
                    if cycle_data.get('onboarding_mode')
                    == ProductionCycle.ONBOARDING_MODE_ONGOING
                    else None
                ),
                today=timezone.localdate(),
            )
        except CycleOnboardingRuleViolation as exc:
            raise BusinessRuleViolation({
                'code': exc.code,
                'detail': exc.detail,
                **(exc.context or {}),
            }) from exc

        # 3. Préparation données complètes
        cycle_data_complete = {
            **cycle_data,
            'farm_profile': farm_profile,
            'initial_biomass': initial_biomass,
            'tracking_start_date': baseline.tracking_start_date,
            'tracking_start_count': baseline.fish_count,
            'tracking_start_average_weight': baseline.average_weight_g,
            'tracking_start_biomass': baseline.biomass_kg,
            'tracking_start_biomass_source': baseline.biomass_source,
            'current_count': baseline.fish_count,
            'current_average_weight': baseline.average_weight_g,
            'current_biomass': baseline.biomass_kg,
            'total_feed_consumed': Decimal('0'),
            'status': 'active',
        }

        # 4. Création du cycle
        cycle = ProductionCycle.objects.create(**cycle_data_complete)

        # Le plan initial est un snapshot métier du lancement, jamais un effet
        # de bord normal d'un GET ultérieur.
        from .cycle_feed_recommendation_service import CycleFeedRecommendationService

        CycleFeedRecommendationService.create_initial_plan(cycle, source='cycle_launch')

        ProductionCycleService.log_operation(
            "cycle_created",
            {
                "cycle_id": str(cycle.id),
                "initial_biomass": (
                    float(initial_biomass) if initial_biomass is not None else None
                ),
                "tracking_start_biomass": float(baseline.biomass_kg),
            },
            level='info'
        )

        return cycle

    @staticmethod
    @transaction.atomic
    def harvest_cycle(
        cycle: ProductionCycle,
        harvest_date: date,
        final_count: int,
        final_average_weight: Decimal,
        final_harvested_at: datetime,
        client_uuid: uuid.UUID | None = None,
        harvest_notes: str = "",
        total_harvested_weight: Decimal | None = None,
        created_offline: bool = False,
        allow_pending_reconciliation: bool = False,
    ) -> HarvestCycleResult:
        """
        Finalise un cycle de production avec calculs de métriques finales.

        Règles métier strictes :
        - Cycle DOIT être actif
        - Date récolte >= date début cycle
        - Date récolte <= aujourd'hui + 7 jours (tolérance planning)
        - Final count <= current count
        - Final weight >= poids minimum espèce

        Calculs effectués :
        - Biomasse finale
        - Taux de survie
        - FCR (Feed Conversion Ratio)
        - Gain de poids total

        Args:
            cycle: Cycle à finaliser
            harvest_date: Date de récolte
            final_count: Nombre final de poissons récoltés
            final_average_weight: Poids moyen final (grammes)
            harvest_notes: Notes optionnelles sur la récolte

        Returns:
            Résultat structuré contenant le cycle, les opérations finales et
            l'indicateur de replay idempotent.

        Raises:
            CycleAlreadyHarvestedError: Si cycle déjà récolté
            InvalidHarvestDataError: Si données incohérentes
        """
        ProductionCycleService.log_operation(
            "harvest_cycle",
            {"cycle_id": str(cycle.id), "harvest_date": str(harvest_date)}
        )

        lock_context = AquacultureLockService.lock_cycle_harvest_context(
            cycle_id=cycle.pk,
        )
        cycle = lock_context.cycles[0]

        # Un retry arrive nécessairement après la clôture du cycle. Il faut donc
        # retrouver la commande avant de rejeter son statut harvested.
        if cycle.status == 'harvested':
            replay = ProductionCycleService._find_global_harvest_replay(
                cycle=cycle,
                harvest_date=harvest_date,
                final_harvested_at=final_harvested_at,
                final_count=final_count,
                final_average_weight=final_average_weight,
                client_uuid=client_uuid,
                harvest_notes=harvest_notes,
                total_harvested_weight=total_harvested_weight,
                created_offline=created_offline,
                locked_allocations=lock_context.allocations,
            )
            if replay is not None:
                return replay
            raise CycleAlreadyHarvestedError(
                _("Ce cycle a déjà été récolté le %(date)s") % {'date': cycle.end_date}
            )

        if cycle.status != 'active':
            raise CycleNotActiveError(
                _("Seuls les cycles actifs peuvent être récoltés (statut actuel: %(status)s)")
                % {'status': cycle.get_status_display()}
            )

        active_allocations = [
            allocation
            for allocation in lock_context.allocations
            if allocation.status == CycleUnitAllocation.STATUS_ACTIVE
        ]
        if active_allocations:
            current_total = sum(allocation.current_fish_count for allocation in active_allocations)
            if client_uuid is None:
                raise InvalidHarvestDataError(
                    _("Un UUID client est requis pour rendre la récolte finale idempotente.")
                )
            if len(active_allocations) > 1 and final_count != current_total:
                raise FinalHarvestRequiresAllocationBreakdown()
            harvested_cycle = cycle
            operations = []
            any_created = False
            for allocation in active_allocations:
                declared_count = (
                    final_count if len(active_allocations) == 1 else allocation.current_fish_count
                )
                harvest_result = ProductionCycleService.harvest_cycle_unit_allocation(
                    allocation,
                    harvest_date=harvest_date,
                    final_harvested_at=final_harvested_at,
                    final_count=declared_count,
                    final_average_weight=final_average_weight,
                    client_uuid=uuid.uuid5(client_uuid, str(allocation.pk)),
                    harvest_notes=harvest_notes,
                    total_harvested_weight=(
                        total_harvested_weight if len(active_allocations) == 1 else None
                    ),
                    created_offline=created_offline,
                    allow_pending_reconciliation=allow_pending_reconciliation,
                )
                harvested_cycle = harvest_result[0]
                operations.append(harvest_result[2])
                any_created = any_created or harvest_result[3]
            return HarvestCycleResult(
                cycle=harvested_cycle,
                operations=operations,
                idempotent_replay=not any_created,
            )

        # 2. Validation règles métier récolte
        ProductionCycleService._validate_harvest_business_rules(
            cycle, harvest_date, final_count, final_average_weight
        )

        # 3. Calcul biomasse finale
        final_biomass = AquacultureCalculator.calculate_biomass(
            final_count,
            final_average_weight
        )

        # 4. Calcul métriques finales
        survival_rate = AquacultureCalculator.calculate_survival_rate(
            cycle.analysis_start_count,
            final_count
        )

        # 5. Calcul FCR si données disponibles
        weight_gain = final_biomass - cycle.analysis_start_biomass
        fcr = None
        if weight_gain > 0 and cycle.total_feed_consumed > 0:
            fcr = AquacultureCalculator.calculate_fcr(
                cycle.total_feed_consumed,
                weight_gain
            )

        # 6. Mise à jour du cycle
        cycle.end_date = harvest_date
        cycle.final_count = final_count
        cycle.final_average_weight = final_average_weight
        cycle.final_biomass = final_biomass
        cycle.survival_rate = survival_rate
        cycle.fcr = fcr
        cycle.status = 'harvested'
        cycle.save()

        ProductionCycleService.log_operation(
            "cycle_harvested",
            {
                "cycle_id": str(cycle.id),
                "survival_rate": float(survival_rate) if survival_rate else None,
                "fcr": float(fcr) if fcr else None,
                "final_biomass": float(final_biomass)
            },
            level='info'
        )

        # 7. Actions post-récolte (désactiver plans futurs, etc.)
        ProductionCycleService._finalize_cycle_unit_allocations_on_cycle_harvest(
            cycle=cycle,
            harvest_date=harvest_date,
            final_harvested_at=final_harvested_at,
            final_average_weight=final_average_weight,
            harvest_notes=harvest_notes,
        )
        ProductionCycleService._post_harvest_actions(cycle)

        return HarvestCycleResult(cycle=cycle, operations=[], idempotent_replay=False)

    @staticmethod
    def _find_global_harvest_replay(
        *,
        cycle: ProductionCycle,
        harvest_date: date,
        final_harvested_at: datetime,
        final_count: int,
        final_average_weight: Decimal,
        client_uuid: uuid.UUID | None,
        harvest_notes: str,
        total_harvested_weight: Decimal | None,
        created_offline: bool,
        locked_allocations: list[CycleUnitAllocation] | None = None,
    ) -> HarvestCycleResult | None:
        """Reconnaît et valide une commande globale déjà appliquée."""
        allocations = locked_allocations
        if allocations is None:
            allocations = list(
                cycle.unit_allocations.select_related('final_harvest_operation').order_by('id')
            )
        if not allocations:
            # Les cycles historiques sans allocation ne possèdent aucun support
            # d'événement. Leur projection finale constitue donc la règle de
            # replay explicite (le client_uuid ne peut pas être persisté ici).
            # The historical path never persisted ``total_harvested_weight``;
            # its canonical projection has always been count × average weight.
            expected_biomass = AquacultureCalculator.calculate_biomass(
                final_count,
                final_average_weight,
            )
            if all([
                cycle.end_date == harvest_date,
                cycle.final_count == final_count,
                cycle.final_average_weight == final_average_weight,
                cycle.final_biomass == expected_biomass,
            ]):
                return HarvestCycleResult(cycle=cycle, operations=[], idempotent_replay=True)
            return None

        if client_uuid is None:
            return None

        expected_uuid_by_allocation = {
            allocation.pk: uuid.uuid5(client_uuid, str(allocation.pk))
            for allocation in allocations
        }
        existing_by_uuid = {
            operation.client_uuid: operation
            for operation in FinalHarvestOperation.objects.select_related('allocation').filter(
                client_uuid__in=expected_uuid_by_allocation.values(),
            )
        }
        if not existing_by_uuid:
            return None

        # Une projection portant exactement le datetime de cette commande devait
        # elle aussi avoir son événement enfant. Son absence est un conflit, pas
        # un replay partiel.
        concerned = [
            allocation for allocation in allocations
            if (
                expected_uuid_by_allocation[allocation.pk] in existing_by_uuid
                or allocation.final_harvested_at == final_harvested_at
            )
        ]
        if len(concerned) != len(existing_by_uuid):
            raise FinalHarvestIdempotencyConflict()

        if len(concerned) == 1:
            declared_counts = [final_count]
        else:
            operations = [
                existing_by_uuid.get(expected_uuid_by_allocation[allocation.pk])
                for allocation in concerned
            ]
            if any(operation is None for operation in operations):
                raise FinalHarvestIdempotencyConflict()
            declared_counts = [operation.declared_fish_count for operation in operations]
            if sum(declared_counts) != final_count:
                raise FinalHarvestIdempotencyConflict()

        replayed_operations = []
        for allocation, declared_count in zip(concerned, declared_counts, strict=True):
            child_uuid = expected_uuid_by_allocation[allocation.pk]
            declared_biomass = (
                Decimal(str(total_harvested_weight)).quantize(Decimal('0.01'))
                if len(concerned) == 1 and total_harvested_weight is not None
                else AquacultureCalculator.calculate_biomass(declared_count, final_average_weight)
            )
            operation = FinalHarvestService.find_idempotent_replay(
                client_uuid=child_uuid,
                allocation=allocation,
                harvested_at=final_harvested_at,
                declared_fish_count=declared_count,
                declared_average_weight_g=final_average_weight,
                declared_biomass_kg=declared_biomass,
                notes=harvest_notes,
                created_offline=created_offline,
            )
            if operation is None:
                raise FinalHarvestIdempotencyConflict()
            FinalHarvestService.assert_projection(operation)
            replayed_operations.append(operation)

        return HarvestCycleResult(
            cycle=cycle,
            operations=replayed_operations,
            idempotent_replay=True,
        )

    @staticmethod
    @transaction.atomic
    def recalculate_all_metrics(cycle: ProductionCycle) -> ProductionCycle:
        """
        Recalcule TOUTES les métriques d'un cycle à partir des logs.

        Utilisé dans les cas suivants :
        - Synchronisation offline bulk
        - Correction de logs erronés
        - Import/migration de données
        - Résolution de conflits

        Processus :
        1. Reset aux valeurs initiales
        2. Replay chronologique de tous les logs
        3. Recalcul métriques dérivées (biomasse, survie, FCR)

        Args:
            cycle: Cycle dont les métriques doivent être recalculées

        Returns:
            ProductionCycle avec métriques à jour
        """
        ProductionCycleService.log_operation(
            "recalculate_all_metrics",
            {"cycle_id": str(cycle.id)},
            level='debug'
        )

        if cycle.unit_allocations.exists():
            cycle = ProductionCycleService._recalculate_cycle_metrics_from_allocations(cycle)
            from .cycle_feed_plan_progression_service import (
                CycleFeedPlanProgressionService,
            )

            CycleFeedPlanProgressionService.record_progress_from_history(cycle)
            return cycle

        # Les sessions de calibrage rejouent leurs entrées depuis zéro afin de ne
        # jamais compter deux fois le premier mouvement.
        cycle.current_count = (
            0
            if cycle.cycle_kind == ProductionCycle.CYCLE_KIND_CALIBRATION
            else cycle.analysis_start_count
        )
        cycle.current_average_weight = cycle.analysis_start_average_weight
        cycle.current_biomass = (
            Decimal('0')
            if cycle.cycle_kind == ProductionCycle.CYCLE_KIND_CALIBRATION
            else cycle.analysis_start_biomass
        )
        cycle.total_feed_consumed = Decimal('0')

        logs = list(cycle.logs.order_by('log_date', 'created_at', 'id'))
        incoming = []
        outgoing = []
        events = []
        for log in logs:
            event_at = timezone.make_aware(datetime.combine(log.log_date, getattr(log, 'log_time', None) or time.min))
            events.append((event_at, log.created_at, str(log.id), 'log', log))
        events.extend((op.calibrated_at, op.created_at, str(op.id), 'in', op) for op in incoming)
        events.extend((op.calibrated_at, op.created_at, str(op.id), 'out', op) for op in outgoing)

        for _event_at, _created_at, _event_id, event_type, event in sorted(events, key=lambda item: item[:3]):
            if event_type == 'in':
                cycle.current_count += event.transferred_count
                cycle.current_biomass += event.transferred_biomass_kg
                cycle.current_average_weight = (
                    cycle.current_biomass * Decimal('1000') / cycle.current_count
                ).quantize(Decimal('0.01'))
                continue
            if event_type == 'out':
                cycle.current_count -= event.transferred_count
                cycle.current_biomass -= event.transferred_biomass_kg
                cycle.current_average_weight = (
                    cycle.current_biomass * Decimal('1000') / cycle.current_count
                ).quantize(Decimal('0.01'))
                continue
            log = event
            # Mise à jour mortalité
            if log.mortality_count:
                cycle.current_count = max(0, cycle.current_count - log.mortality_count)

            # Mise à jour poids moyen (prendre le dernier enregistré)
            if log.average_weight:
                cycle.current_average_weight = log.average_weight
            cycle.current_biomass = AquacultureCalculator.calculate_biomass(
                cycle.current_count, cycle.current_average_weight
            )

            # Cumul aliment distribué
            if log.feed_quantity:
                cycle.total_feed_consumed += log.feed_quantity

        # 3. Recalcul métriques dérivées
        total_in_count = sum(op.transferred_count for op in incoming)
        total_in_biomass = sum((op.transferred_biomass_kg for op in incoming), Decimal('0'))
        total_out_count = sum(op.transferred_count for op in outgoing)
        total_out_biomass = sum((op.transferred_biomass_kg for op in outgoing), Decimal('0'))
        total_stocked_count = (
            total_in_count
            if cycle.cycle_kind == ProductionCycle.CYCLE_KIND_CALIBRATION
            else cycle.analysis_start_count + total_in_count
        )
        total_stocked_biomass = (
            total_in_biomass
            if cycle.cycle_kind == ProductionCycle.CYCLE_KIND_CALIBRATION
            else (cycle.analysis_start_biomass or Decimal('0')) + total_in_biomass
        )
        cycle.survival_rate = (
            (
                Decimal(cycle.current_count + total_out_count)
                / Decimal(total_stocked_count)
                * Decimal('100')
            ).quantize(Decimal('0.01'))
            if total_stocked_count else None
        )

        # Calcul FCR si gain de poids positif
        weight_gain = cycle.current_biomass + total_out_biomass - total_stocked_biomass
        if weight_gain > 0 and cycle.total_feed_consumed > 0:
            cycle.fcr = AquacultureCalculator.calculate_fcr(
                cycle.total_feed_consumed,
                weight_gain
            )
        else:
            cycle.fcr = None

        cycle.save()
        from .cycle_feed_plan_progression_service import (
            CycleFeedPlanProgressionService,
        )

        CycleFeedPlanProgressionService.record_progress_from_history(cycle)

        ProductionCycleService.log_operation(
            "metrics_recalculated",
            {
                "cycle_id": str(cycle.id),
                "logs_processed": len(logs),
                "current_biomass": float(cycle.current_biomass)
            },
            level='debug'
        )

        return cycle

    @staticmethod
    def update_current_metrics_after_log(cycle: ProductionCycle, log: CycleLog) -> ProductionCycle:
        """
        Met à jour les métriques courantes du cycle après ajout d'un log.

        Optimisation : Au lieu de recalculer depuis zéro, on applique
        les changements du nouveau log aux valeurs actuelles.

        Utilisé par : signals.py après création/modification d'un CycleLog

        Args:
            cycle: Cycle à mettre à jour
            log: Log nouvellement créé/modifié

        Returns:
            ProductionCycle avec métriques mises à jour
        """
        if cycle.unit_allocations.exists():
            if log.cycle_unit_allocation_id:
                ProductionCycleService.recalculate_allocation_current_metrics(log.cycle_unit_allocation)
            cycle = ProductionCycleService._recalculate_cycle_metrics_from_allocations(cycle)
            from .cycle_feed_plan_progression_service import (
                CycleFeedPlanProgressionService,
            )

            CycleFeedPlanProgressionService.record_progress_from_log(log)
            return cycle

        # Mise à jour mortalité
        if log.mortality_count:
            cycle.current_count = max(0, cycle.current_count - log.mortality_count)

        # Mise à jour poids moyen
        if log.average_weight:
            cycle.current_average_weight = log.average_weight

        # Mise à jour aliment
        if log.feed_quantity:
            cycle.total_feed_consumed += log.feed_quantity

        # Recalcul métriques dérivées
        cycle.current_biomass = AquacultureCalculator.calculate_biomass(
            cycle.current_count,
            cycle.current_average_weight
        )

        cycle.survival_rate = AquacultureCalculator.calculate_survival_rate(
            cycle.analysis_start_count,
            cycle.current_count
        )

        # Recalcul FCR
        weight_gain = cycle.current_biomass - cycle.analysis_start_biomass
        if weight_gain > 0 and cycle.total_feed_consumed > 0:
            cycle.fcr = AquacultureCalculator.calculate_fcr(
                cycle.total_feed_consumed,
                weight_gain
            )

        cycle.save()
        from .cycle_feed_plan_progression_service import (
            CycleFeedPlanProgressionService,
        )

        CycleFeedPlanProgressionService.record_progress_from_log(log)
        return cycle

    @staticmethod
    @transaction.atomic
    def partial_harvest_cycle(
        cycle: ProductionCycle,
        harvest_date: date,
        count_harvested: int,
        average_weight_g: Decimal,
        sale_price_fcfa_per_kg: Decimal | None = None,
        notes: str = "",
        client_uuid=None,
        created_offline: bool = False,
    ) -> tuple[ProductionCycle, PartialHarvest]:
        """
        Enregistre une récolte partielle sur un cycle actif.

        Le cycle reste actif après l'opération. current_count est décrémenté
        du nombre de poissons récoltés.

        Args:
            cycle: Cycle actif à récolter partiellement
            harvest_date: Date de la récolte partielle
            count_harvested: Nombre de poissons récoltés
            average_weight_g: Poids moyen des poissons récoltés (grammes)
            sale_price_fcfa_per_kg: Prix de vente optionnel (FCFA/kg)
            notes: Notes optionnelles
            client_uuid: UUID client pour déduplication offline
            created_offline: True si créé sans connexion

        Returns:
            Tuple (cycle mis à jour, PartialHarvest créé)

        Raises:
            CycleNotActiveError: Si le cycle n'est pas actif
            InsufficientFishCountError: Si count_harvested > current_count
            InvalidHarvestDataError: Si poids en dessous du minimum commercial
        """
        ProductionCycleService.log_operation(
            "partial_harvest_cycle",
            {"cycle_id": str(cycle.id), "count_harvested": count_harvested}
        )
        locked_cycle = ProductionCycle.objects.select_for_update().select_related(
            'farm_profile__user'
        ).get(id=cycle.id)

        # 1. Validation état
        if locked_cycle.status != 'active':
            raise CycleNotActiveError(
                _("Seuls les cycles actifs peuvent faire l'objet d'une récolte partielle "
                  "(statut actuel: %(status)s)") % {'status': locked_cycle.get_status_display()}
            )

        if locked_cycle.unit_allocations.exists():
            raise BusinessRuleViolation(
                _(
                    "La récolte partielle globale est indisponible pour les cycles avec unités "
                    "de production. Utilisez la récolte partielle au niveau des unités."
                )
            )

        # 2. Déduplication offline
        if client_uuid:
            existing = PartialHarvest.objects.select_related('cycle__farm_profile__user').filter(
                client_uuid=client_uuid
            ).first()
            if existing:
                if existing.cycle.farm_profile.user_id != locked_cycle.farm_profile.user_id:
                    raise OfflineSyncConflictError(
                        _("Conflit de synchronisation : ce client_uuid appartient à un autre utilisateur.")
                    )
                if existing.cycle_id != locked_cycle.id:
                    raise OfflineSyncConflictError(
                        _("Conflit de synchronisation : ce client_uuid est déjà lié à un autre cycle.")
                    )
                cycle.current_count = locked_cycle.current_count
                cycle.current_biomass = locked_cycle.current_biomass
                return existing.cycle, existing

        # 3. Validation règles métier
        ProductionCycleService._validate_partial_harvest_rules(
            locked_cycle, harvest_date, count_harvested, average_weight_g
        )

        # 4. Calcul poids total
        total_weight_kg = Decimal(str(count_harvested)) * average_weight_g / Decimal('1000')

        # 5. Création de l'enregistrement PartialHarvest
        partial_harvest = PartialHarvest.objects.create(
            cycle=locked_cycle,
            harvest_date=harvest_date,
            count_harvested=count_harvested,
            average_weight_g=average_weight_g,
            total_weight_kg=total_weight_kg,
            sale_price_fcfa_per_kg=sale_price_fcfa_per_kg,
            notes=notes,
            client_uuid=client_uuid,
            created_offline=created_offline,
        )

        # 6. Soustraction de la biomasse réellement récoltée.
        remaining_count = locked_cycle.current_count - count_harvested
        remaining_biomass = Decimal(str(locked_cycle.current_biomass)) - total_weight_kg
        if remaining_count <= 0 or remaining_biomass <= 0:
            raise InvalidHarvestDataError(
                _("Une récolte partielle doit laisser un effectif et une biomasse strictement positifs.")
            )
        locked_cycle.current_count = remaining_count
        locked_cycle.current_biomass = remaining_biomass.quantize(Decimal('0.01'))
        locked_cycle.current_average_weight = (
            locked_cycle.current_biomass * Decimal('1000') / Decimal(remaining_count)
        ).quantize(Decimal('0.01'))
        locked_cycle.save(
            update_fields=['current_count', 'current_biomass', 'current_average_weight', 'updated_at']
        )

        ProductionCycleService.log_operation(
            "partial_harvest_recorded",
            {
                "cycle_id": str(cycle.id),
                "partial_harvest_id": str(partial_harvest.id),
                "remaining_count": locked_cycle.current_count,
            },
            level='info'
        )

        cycle.current_count = locked_cycle.current_count
        cycle.current_biomass = locked_cycle.current_biomass
        return locked_cycle, partial_harvest

    @staticmethod
    @transaction.atomic
    def partial_harvest_cycle_unit_allocation(
        allocation: CycleUnitAllocation,
        harvest_date: date,
        count_harvested: int,
        average_weight_g: Decimal,
        sale_price_fcfa_per_kg: Decimal | None = None,
        notes: str = "",
        client_uuid=None,
        created_offline: bool = False,
    ) -> tuple[ProductionCycle, CycleUnitAllocation, PartialHarvest]:
        """Enregistre une récolte partielle sur une unité de production précise."""
        ProductionCycleService.log_operation(
            "partial_harvest_cycle_unit_allocation",
            {"allocation_id": str(allocation.id), "count_harvested": count_harvested}
        )

        # Ordre de verrouillage global : unité puis allocation.
        ProductionUnit.objects.select_for_update().get(pk=allocation.production_unit_id)
        locked_allocation = CycleUnitAllocation.objects.select_for_update().select_related(
            'cycle__farm_profile__user',
            'production_unit',
        ).get(id=allocation.id)
        locked_cycle = locked_allocation.cycle
        client_uuid = client_uuid or uuid.uuid4()

        if locked_cycle.status != 'active':
            raise CycleNotActiveError(
                _("Seuls les cycles actifs peuvent être récoltés via une unité "
                  "(statut actuel: %(status)s)") % {'status': locked_cycle.get_status_display()}
            )

        if locked_allocation.status != CycleUnitAllocation.STATUS_ACTIVE:
            raise BusinessRuleViolation(
                _("Cette unité de production doit être active pour être récoltée.")
            )

        if client_uuid:
            existing = PartialHarvest.objects.select_related(
                'cycle__farm_profile__user',
                'cycle_unit_allocation__production_unit',
            ).filter(client_uuid=client_uuid).first()
            if existing:
                if existing.cycle.farm_profile.user_id != locked_cycle.farm_profile.user_id:
                    raise OfflineSyncConflictError(
                        _("Conflit de synchronisation : ce client_uuid appartient à un autre utilisateur.")
                    )
                if existing.cycle_id != locked_cycle.id:
                    raise OfflineSyncConflictError(
                        _("Conflit de synchronisation : ce client_uuid est déjà lié à un autre cycle.")
                    )
                if existing.cycle_unit_allocation_id != locked_allocation.id:
                    raise OfflineSyncConflictError(
                        _("Conflit de synchronisation : ce client_uuid est déjà lié à une autre unité.")
                    )
                return locked_cycle, locked_allocation, existing

        ProductionCycleService._validate_partial_harvest_rules(
            locked_cycle,
            harvest_date,
            count_harvested,
            average_weight_g,
            available_count=locked_allocation.current_fish_count,
            require_remaining_fish=True,
        )

        total_weight_kg = Decimal(str(count_harvested)) * average_weight_g / Decimal('1000')
        if total_weight_kg >= locked_allocation.current_biomass_kg:
            raise InvalidHarvestDataError(
                _("La biomasse récoltée doit rester inférieure à la biomasse disponible.")
            )

        partial_harvest = PartialHarvest.objects.create(
            cycle=locked_cycle,
            cycle_unit_allocation=locked_allocation,
            harvest_date=harvest_date,
            count_harvested=count_harvested,
            average_weight_g=average_weight_g,
            total_weight_kg=total_weight_kg,
            sale_price_fcfa_per_kg=sale_price_fcfa_per_kg,
            notes=notes,
            client_uuid=client_uuid,
            created_offline=created_offline,
        )

        locked_allocation = ProductionCycleService.recalculate_allocation_current_metrics(locked_allocation)
        locked_cycle = ProductionCycleService._sync_cycle_current_metrics_from_allocations(locked_cycle)
        ProductionCycleService._refresh_advanced_metrics(locked_cycle)

        ProductionCycleService.log_operation(
            "partial_harvest_unit_recorded",
            {
                "cycle_id": str(locked_cycle.id),
                "allocation_id": str(locked_allocation.id),
                "partial_harvest_id": str(partial_harvest.id),
                "remaining_count": locked_allocation.current_fish_count,
            },
            level='info'
        )

        return locked_cycle, locked_allocation, partial_harvest

    @staticmethod
    @transaction.atomic
    def harvest_cycle_unit_allocation(
        allocation: CycleUnitAllocation,
        harvest_date: date,
        final_count: int,
        final_average_weight: Decimal,
        final_harvested_at: datetime,
        client_uuid: uuid.UUID | None = None,
        harvest_notes: str = "",
        total_harvested_weight: Decimal | None = None,
        created_offline: bool = False,
        allow_pending_reconciliation: bool = False,
    ):
        """Finalise complètement une unité de production liée à un cycle."""
        ProductionCycleService.log_operation(
            "harvest_cycle_unit_allocation",
            {"allocation_id": str(allocation.id), "harvest_date": str(harvest_date)}
        )

        lock_context = AquacultureLockService.lock_cycle_harvest_context(
            cycle_id=allocation.cycle_id,
            allocation_ids=[allocation.pk],
        )
        locked_allocation = lock_context.allocations[0]
        locked_cycle = lock_context.cycles[0]
        client_uuid = client_uuid or uuid.uuid4()

        final_biomass = (
            Decimal(str(total_harvested_weight)).quantize(Decimal('0.01'))
            if total_harvested_weight is not None
            else AquacultureCalculator.calculate_biomass(final_count, final_average_weight)
        )
        existing_operation = FinalHarvestService.find_idempotent_replay(
            client_uuid=client_uuid,
            allocation=locked_allocation,
            harvested_at=final_harvested_at,
            declared_fish_count=final_count,
            declared_average_weight_g=final_average_weight,
            declared_biomass_kg=final_biomass,
            notes=harvest_notes,
            created_offline=created_offline,
        )
        if existing_operation is not None:
            FinalHarvestService.assert_projection(existing_operation)
            return locked_cycle, locked_allocation, existing_operation, False

        if FinalHarvestOperation.objects.filter(allocation=locked_allocation).exists():
            raise AllocationAlreadyFinallyHarvested()

        if locked_cycle.status != 'active':
            raise CycleNotActiveError(
                _("Seuls les cycles actifs peuvent être récoltés via une unité "
                  "(statut actuel: %(status)s)") % {'status': locked_cycle.get_status_display()}
            )

        if locked_allocation.status != CycleUnitAllocation.STATUS_ACTIVE:
            raise BusinessRuleViolation(
                _("Cette unité de production doit être active pour être récoltée.")
            )

        if harvest_date < locked_cycle.analysis_start_date:
            if locked_cycle.onboarding_mode == ProductionCycle.ONBOARDING_MODE_ONGOING:
                raise EventBeforeTrackingStartError(
                    tracking_start_date=locked_cycle.analysis_start_date,
                )
            raise InvalidHarvestDataError(
                _("Date de récolte (%(harvest)s) ne peut être avant le début du cycle (%(start)s)")
                % {
                    'harvest': harvest_date,
                    'start': locked_cycle.analysis_start_date,
                }
            )

        future_limit = timezone.localdate() + timedelta(days=7)
        if harvest_date > future_limit:
            raise InvalidHarvestDataError(
                _("Date de récolte ne peut être dans le futur")
            )
        if final_harvested_at is None or timezone.is_naive(final_harvested_at):
            raise InvalidHarvestDataError(_("Le datetime de récolte doit inclure un fuseau horaire."))
        local_harvest_date = timezone.localtime(final_harvested_at).date()
        if local_harvest_date != harvest_date:
            raise InvalidHarvestDataError(
                _("La date de récolte doit correspondre au datetime métier.")
            )
        if final_harvested_at > timezone.now():
            raise InvalidHarvestDataError(_("Le datetime de récolte ne peut être dans le futur."))
        cycle_started_at = AllocationLedgerService.session_started_at(locked_allocation)
        if final_harvested_at < cycle_started_at:
            raise InvalidHarvestDataError(
                _("Le datetime de récolte ne peut être avant le début de la session.")
            )

        if final_count < 0:
            raise InvalidHarvestDataError(_("Nombre final de poissons invalide"))
        if final_count == 0:
            raise InvalidHarvestDataError(
                _("Le nombre final doit être strictement positif.")
            )

        current_average_weight = ProductionCycleService._get_allocation_average_weight_g(locked_allocation)
        if current_average_weight > 0 and final_average_weight < current_average_weight * Decimal('0.8'):
            raise InvalidHarvestDataError(
                _("Poids moyen final (%(final).1fg) anormalement inférieur au poids actuel (%(current).1fg)")
                % {'final': final_average_weight, 'current': current_average_weight}
            )

        species = locked_cycle.species
        min_harvest_weight = {
            'tilapia': 200,
            'clarias': 250,
        }
        min_weight = min_harvest_weight.get(species, 150)
        if final_average_weight < min_weight:
            raise InvalidHarvestDataError(
                _("Poids moyen final trop faible (%(weight)s g). Minimum pour %(species)s : %(min)s g")
                % {'weight': final_average_weight, 'species': species, 'min': min_weight}
            )

        now = timezone.now()

        operation, created = FinalHarvestService.create(
            allocation=locked_allocation,
            client_uuid=client_uuid,
            harvested_at=final_harvested_at,
            declared_fish_count=final_count,
            declared_average_weight_g=final_average_weight,
            declared_biomass_kg=final_biomass,
            notes=harvest_notes,
            created_by=locked_cycle.farm_profile.user,
            created_offline=created_offline,
            allow_pending_reconciliation=allow_pending_reconciliation,
        )

        locked_allocation.final_fish_count = final_count
        locked_allocation.final_average_weight_g = final_average_weight
        locked_allocation.final_biomass_kg = final_biomass
        locked_allocation.final_harvest_date = harvest_date
        locked_allocation.final_harvested_at = final_harvested_at
        locked_allocation.final_harvest_notes = harvest_notes
        locked_allocation.harvested_at = now
        locked_allocation.status = CycleUnitAllocation.STATUS_HARVESTED
        locked_allocation.current_fish_count = 0
        locked_allocation.current_biomass_kg = Decimal('0')
        locked_allocation.save(
            update_fields=[
                'final_fish_count',
                'final_average_weight_g',
                'final_biomass_kg',
                'final_harvest_date',
                'final_harvested_at',
                'final_harvest_notes',
                'harvested_at',
                'status',
                'current_fish_count',
                'current_biomass_kg',
                'updated_at',
            ]
        )

        locked_cycle = ProductionCycleService._sync_cycle_current_metrics_from_allocations(locked_cycle)
        if not locked_cycle.unit_allocations.filter(status=CycleUnitAllocation.STATUS_ACTIVE).exists():
            locked_cycle = ProductionCycleService._close_cycle_after_last_allocation_harvest(
                locked_cycle,
                harvest_date=harvest_date,
            )
        ProductionCycleService._refresh_advanced_metrics(locked_cycle)

        ProductionCycleService.log_operation(
            "unit_harvest_recorded",
            {
                "cycle_id": str(locked_cycle.id),
                "allocation_id": str(locked_allocation.id),
                "final_count": final_count,
                "final_biomass": float(final_biomass),
            },
            level='info'
        )

        operation.allocation = locked_allocation
        FinalHarvestService.assert_projection(operation)
        return locked_cycle, locked_allocation, operation, created

    @staticmethod
    def _close_cycle_after_last_allocation_harvest(
        cycle: ProductionCycle,
        *,
        harvest_date: date,
    ) -> ProductionCycle:
        """Clôture le cycle quand sa dernière allocation active est récoltée."""
        allocations = list(cycle.unit_allocations.all())
        final_count = sum(allocation.final_fish_count or 0 for allocation in allocations)
        final_biomass = sum(
            (allocation.final_biomass_kg or Decimal('0') for allocation in allocations),
            Decimal('0'),
        ).quantize(Decimal('0.01'))
        final_average_weight = (
            final_biomass * Decimal('1000') / Decimal(final_count)
            if final_count > 0
            else Decimal('0')
        ).quantize(Decimal('0.01'))

        cycle.status = 'harvested'
        cycle.end_date = harvest_date
        cycle.final_count = final_count
        cycle.final_biomass = final_biomass
        cycle.final_average_weight = final_average_weight
        cycle.current_count = 0
        cycle.current_biomass = Decimal('0')
        cycle.current_average_weight = Decimal('0')
        cycle.save(
            update_fields=[
                'status',
                'end_date',
                'final_count',
                'final_biomass',
                'final_average_weight',
                'current_count',
                'current_biomass',
                'current_average_weight',
                'survival_rate',
                'fcr',
                'updated_at',
            ]
        )
        ProductionCycleService._post_harvest_actions(cycle)
        return cycle

    @staticmethod
    def _refresh_advanced_metrics(cycle: ProductionCycle) -> None:
        """Reconstruit CycleMetrics après un mouvement de stock significatif."""
        from .analytics_service import AnalyticsService

        AnalyticsService.update_cycle_metrics_data(cycle)

    @staticmethod
    def _get_allocation_average_weight_g(allocation: CycleUnitAllocation) -> Decimal:
        """Retourne le poids moyen courant estimé d'une allocation."""
        if allocation.current_fish_count > 0 and allocation.current_biomass_kg is not None:
            return (
                Decimal(str(allocation.current_biomass_kg)) * Decimal('1000')
                / Decimal(allocation.current_fish_count)
            )
        if allocation.final_fish_count and allocation.final_average_weight_g:
            return Decimal(str(allocation.final_average_weight_g))
        if allocation.initial_fish_count > 0 and allocation.initial_biomass_kg is not None:
            return (
                Decimal(str(allocation.initial_biomass_kg)) * Decimal('1000')
                / Decimal(allocation.initial_fish_count)
            )
        return Decimal('0')

    @staticmethod
    def _resolve_allocation_average_weight_g(
        allocation: CycleUnitAllocation,
        *,
        daily_logs: list[CycleLog] | None = None,
    ) -> Decimal:
        """Retourne le poids moyen pertinent pour l'état courant d'une allocation."""
        logs = daily_logs
        if logs is None:
            logs = list(
                allocation.daily_logs.order_by('-log_date', '-created_at')
            )

        latest_average_weight = next(
            (Decimal(str(log.average_weight)) for log in logs if log.average_weight is not None),
            None,
        )
        if latest_average_weight is not None:
            return latest_average_weight

        if allocation.initial_fish_count > 0 and allocation.initial_biomass_kg is not None:
            return (
                Decimal(str(allocation.initial_biomass_kg)) * Decimal('1000')
                / Decimal(allocation.initial_fish_count)
            ).quantize(Decimal('0.01'))

        return Decimal('0')

    @staticmethod
    def recalculate_allocation_current_metrics(allocation: CycleUnitAllocation) -> CycleUnitAllocation:
        """Rejoue chronologiquement le ledger vivant d'une allocation."""
        from .allocation_ledger_service import AllocationLedgerService

        locked_allocation = CycleUnitAllocation.objects.select_for_update().select_related(
            'cycle',
            'production_unit',
        ).get(id=allocation.id)
        replay = AllocationLedgerService.replay(locked_allocation)
        if locked_allocation.cycle.cycle_kind == ProductionCycle.CYCLE_KIND_CALIBRATION:
            first_incoming = next(
                (event for _at, event_type, event in replay['events'] if event_type == 'incoming'),
                None,
            )
            if first_incoming is not None:
                cycle = locked_allocation.cycle
                cycle.start_date = timezone.localtime(first_incoming.calibrated_at).date()
                cycle.initial_count = first_incoming.transferred_count
                cycle.initial_average_weight = first_incoming.transferred_average_weight_g
                cycle.initial_biomass = first_incoming.transferred_biomass_kg
                cycle.save(
                    update_fields=[
                        'start_date',
                        'initial_count',
                        'initial_average_weight',
                        'initial_biomass',
                        'updated_at',
                    ]
                )

        for _event_at, event_type, event in replay['events']:
            if event_type in {'incoming', 'outgoing'}:
                snapshot = replay['movement_snapshots'][str(event.id)]
                prefix = 'destination' if event_type == 'incoming' else 'source'
                for field, value in snapshot.items():
                    setattr(event, f'{prefix}_{field}', value)
                event.save(
                    update_fields=[
                        f'{prefix}_count_before',
                        f'{prefix}_count_after',
                        f'{prefix}_average_weight_before_g',
                        f'{prefix}_average_weight_after_g',
                        f'{prefix}_biomass_before_kg',
                        f'{prefix}_biomass_after_kg',
                    ]
                )
        locked_allocation.current_fish_count = replay['current_count']
        locked_allocation.current_biomass_kg = replay['current_biomass_kg']
        locked_allocation.save(
            update_fields=[
                'current_fish_count',
                'current_biomass_kg',
                'updated_at',
            ]
        )
        return locked_allocation

    @staticmethod
    def _recalculate_cycle_metrics_from_allocations(cycle: ProductionCycle) -> ProductionCycle:
        """Rejoue l'état courant du cycle à partir des allocations, logs unitaires et récoltes partielles."""
        allocations = list(
            cycle.unit_allocations.all().select_related('production_unit')
        )
        total_feed_consumed = Decimal('0')

        for allocation in allocations:
            ProductionCycleService.recalculate_allocation_current_metrics(allocation)
            total_feed_consumed += sum(
                (
                    log.feed_quantity or Decimal('0')
                    for log in allocation.daily_logs.all()
                ),
                Decimal('0'),
            )

        cycle.total_feed_consumed = total_feed_consumed.quantize(Decimal('0.01'))
        return ProductionCycleService._sync_cycle_current_metrics_from_allocations(cycle)

    @staticmethod
    def _sync_cycle_current_metrics_from_allocations(cycle: ProductionCycle) -> ProductionCycle:
        """Recalcule les métriques courantes d'un cycle à partir de ses allocations."""
        allocations = list(
            cycle.unit_allocations.all().select_related('production_unit')
        )
        if not allocations:
            return cycle

        total_count = sum((allocation.current_fish_count for allocation in allocations), 0)
        total_biomass = sum(
            (
                Decimal(str(allocation.current_biomass_kg))
                if allocation.current_biomass_kg is not None
                else Decimal('0')
                for allocation in allocations
            ),
            Decimal('0'),
        )

        cycle.current_count = total_count
        cycle.current_biomass = total_biomass.quantize(Decimal('0.01'))
        if total_count > 0:
            cycle.current_average_weight = (
                cycle.current_biomass * Decimal('1000') / Decimal(total_count)
            ).quantize(Decimal('0.01'))
        else:
            cycle.current_average_weight = Decimal('0')

        incoming_operations = CalibrationOperation.objects.filter(destination_allocation__cycle=cycle)
        outgoing_operations = CalibrationOperation.objects.filter(source_allocation__cycle=cycle)
        transferred_in_count = sum(incoming_operations.values_list('transferred_count', flat=True))
        transferred_in_biomass = sum(
            incoming_operations.values_list('transferred_biomass_kg', flat=True),
            Decimal('0'),
        )
        transferred_out_count = sum(outgoing_operations.values_list('transferred_count', flat=True))
        transferred_out_biomass = sum(
            outgoing_operations.values_list('transferred_biomass_kg', flat=True),
            Decimal('0'),
        )
        partial_harvest_count = sum(
            cycle.partial_harvests.values_list('count_harvested', flat=True)
        )
        partial_harvest_biomass = sum(
            cycle.partial_harvests.values_list('total_weight_kg', flat=True),
            Decimal('0'),
        )
        final_harvest_count = sum(
            allocation.final_fish_count or 0
            for allocation in allocations
            if allocation.status == CycleUnitAllocation.STATUS_HARVESTED
        )
        final_harvest_biomass = sum(
            (allocation.final_biomass_kg or Decimal('0') for allocation in allocations),
            Decimal('0'),
        )
        allocation_initial_count = sum(allocation.initial_fish_count for allocation in allocations)
        allocation_initial_biomass = sum(
            (allocation.initial_biomass_kg for allocation in allocations),
            Decimal('0'),
        )
        if cycle.cycle_kind == ProductionCycle.CYCLE_KIND_CALIBRATION:
            introduced_count = transferred_in_count
            introduced_biomass = transferred_in_biomass
        else:
            introduced_count = allocation_initial_count + transferred_in_count
            introduced_biomass = allocation_initial_biomass + transferred_in_biomass
        recognized_count = (
            cycle.current_count
            + transferred_out_count
            + partial_harvest_count
            + final_harvest_count
        )
        cycle.survival_rate = (
            (Decimal(recognized_count) / Decimal(introduced_count) * Decimal('100')).quantize(Decimal('0.01'))
            if introduced_count > 0
            else None
        )
        recognized_biomass = (
            cycle.current_biomass
            + transferred_out_biomass
            + partial_harvest_biomass
            + final_harvest_biomass
        )
        weight_gain = recognized_biomass - introduced_biomass
        if weight_gain > 0 and cycle.total_feed_consumed > 0:
            cycle.fcr = AquacultureCalculator.calculate_fcr(
                cycle.total_feed_consumed,
                weight_gain,
            )
        else:
            cycle.fcr = None

        cycle.save(
            update_fields=[
                'current_count',
                'current_biomass',
                'current_average_weight',
                'survival_rate',
                'fcr',
                'total_feed_consumed',
                'updated_at',
            ]
        )
        return cycle

    @staticmethod
    def _finalize_cycle_unit_allocations_on_cycle_harvest(
        *,
        cycle: ProductionCycle,
        harvest_date: date,
        final_harvested_at: datetime | None = None,
        final_average_weight: Decimal,
        harvest_notes: str = "",
    ) -> None:
        """Marque les unités restantes comme récoltées lors d'une récolte globale du cycle."""
        if not cycle.unit_allocations.exists():
            return

        now = timezone.now()
        for allocation in cycle.unit_allocations.select_for_update().select_related('production_unit'):
            if allocation.status == CycleUnitAllocation.STATUS_HARVESTED:
                continue

            current_count = allocation.current_fish_count
            if current_count <= 0:
                current_count = allocation.final_fish_count or 0

            current_average_weight = ProductionCycleService._get_allocation_average_weight_g(allocation)
            if current_average_weight <= 0:
                current_average_weight = Decimal(str(final_average_weight))

            allocation.final_fish_count = current_count
            allocation.final_average_weight_g = current_average_weight
            allocation.final_biomass_kg = allocation.current_biomass_kg or AquacultureCalculator.calculate_biomass(
                current_count,
                current_average_weight,
            )
            allocation.final_harvest_date = harvest_date
            allocation.final_harvested_at = final_harvested_at
            allocation.final_harvest_notes = harvest_notes
            allocation.harvested_at = now
            allocation.status = CycleUnitAllocation.STATUS_HARVESTED
            allocation.current_fish_count = 0
            allocation.current_biomass_kg = Decimal('0')
            allocation.save(
                update_fields=[
                    'final_fish_count',
                    'final_average_weight_g',
                    'final_biomass_kg',
                    'final_harvest_date',
                    'final_harvested_at',
                    'final_harvest_notes',
                    'harvested_at',
                    'status',
                    'current_fish_count',
                    'current_biomass_kg',
                    'updated_at',
                ]
            )

    # =================== MÉTHODES PRIVÉES (VALIDATION) ===================

    @staticmethod
    def _validate_cycle_business_rules(cycle_data: CycleCreatePayload) -> None:
        """
        Valide les règles métier pour la création d'un cycle.

        Raises:
            InvalidDensityError: Si densité trop élevée
            BusinessRuleViolation: Si autres règles violées
        """
        species = cycle_data.get('species')
        pond_surface = cycle_data.get('pond_surface_m2')
        initial_count = cycle_data.get('initial_count')
        initial_weight = cycle_data.get('initial_average_weight')
        start_date = cycle_data.get('start_date')
        target_weight = cycle_data.get('target_harvest_weight_g')
        planned_duration = cycle_data.get('planned_cycle_duration_days')
        planned_harvest_date = cycle_data.get('planned_harvest_date')
        expected_survival = cycle_data.get('expected_survival_rate_pct')
        selling_price = cycle_data.get('planned_selling_price_per_kg_fcfa')
        fingerlings_cost = cycle_data.get('fingerlings_cost_fcfa')
        other_costs = cycle_data.get('other_operational_costs_fcfa')
        infrastructure_types = cycle_data.get('infrastructure_type') or []
        normalized_infrastructure_types = ProductionCycleService._normalize_infrastructure_types(
            infrastructure_types
        )
        onboarding_mode = cycle_data.get(
            'onboarding_mode',
            ProductionCycle.ONBOARDING_MODE_NEW,
        )

        # Validation densité maximale (règle unifiée par infrastructure).
        # Source de vérité: backend/constants.py.
        # Si le cycle est lancé avec plusieurs types d'infrastructure,
        # la densité globale n'a plus de sens et la validation se fait
        # au niveau des allocations par unité.
        if initial_count and len(normalized_infrastructure_types) <= 1:
            is_pond = ProductionCycleService._is_pond_infrastructure(
                normalized_infrastructure_types or infrastructure_types
            )
            pond_volume = cycle_data.get('pond_volume_m3')

            if is_pond and pond_surface:
                density = initial_count / float(pond_surface)
                max_allowed = ProductionCycleService.MAX_STOCKING_DENSITY_POND_PER_M2
                if density > max_allowed:
                    raise InvalidDensityError(
                        _(
                            "Densité initiale trop élevée (%(density).0f poissons/m²). "
                            "Maximum recommandé : %(max_allowed)s poissons/m²."
                        )
                        % {'density': density, 'max_allowed': max_allowed}
                    )
            elif pond_volume:
                density = initial_count / float(pond_volume)
                max_allowed = ProductionCycleService.MAX_STOCKING_DENSITY_TANK_PER_M3
                if density > max_allowed:
                    raise InvalidDensityError(
                        _(
                            "Densité initiale trop élevée (%(density).0f poissons/m³). "
                            "Maximum recommandé : %(max_allowed)s poissons/m³."
                        )
                        % {'density': density, 'max_allowed': max_allowed}
                    )

        # Validation poids initial minimum uniquement lorsqu'il est déclaré.
        if species and initial_weight:
            min_weight = ProductionCycleService.MIN_WEIGHT_BY_SPECIES.get(species, 0.5)
            if float(initial_weight) < min_weight:
                raise BusinessRuleViolation(
                    _(f"Poids initial trop faible ({initial_weight}g). "
                      f"Minimum recommandé : {min_weight}g pour {species}")
                )

        # Validation date de début
        if start_date:
            if isinstance(start_date, str):
                start_date = date.fromisoformat(start_date)

            # Tolérance : cycle peut commencer jusqu'à 30 jours dans le futur
            future_limit = timezone.localdate() + timedelta(days=30)
            if start_date > future_limit:
                raise InvalidDateRangeError(
                    _("La date de début ne peut pas être plus de 30 jours dans le futur")
                )

        if target_weight and initial_weight and Decimal(str(target_weight)) <= Decimal(str(initial_weight)):
            raise BusinessRuleViolation(
                _("Le poids cible de récolte doit être supérieur au poids moyen initial")
            )

        if planned_duration is not None:
            try:
                validate_cycle_duration_days(planned_duration)
            except ValueError as exc:
                raise BusinessRuleViolation(str(CYCLE_DURATION_ERROR_MESSAGE)) from exc

        if expected_survival is not None:
            expected_survival_decimal = Decimal(str(expected_survival))
            if expected_survival_decimal < Decimal('0') or expected_survival_decimal > Decimal('100'):
                raise BusinessRuleViolation(
                    _("Le taux de survie prévisionnel doit être compris entre 0 et 100")
                )

        if selling_price is not None and Decimal(str(selling_price)) <= Decimal('0'):
            raise BusinessRuleViolation(
                _("Le prix de vente prévisionnel (FCFA/kg) doit être strictement positif")
            )

        if fingerlings_cost is not None and Decimal(str(fingerlings_cost)) < Decimal('0'):
            raise BusinessRuleViolation(
                _("Le coût des alevins ne peut pas être négatif")
            )

        if other_costs is not None and Decimal(str(other_costs)) < Decimal('0'):
            raise BusinessRuleViolation(
                _("Les autres charges opérationnelles ne peuvent pas être négatives")
            )

        if start_date and planned_harvest_date:
            if isinstance(planned_harvest_date, str):
                planned_harvest_date = date.fromisoformat(planned_harvest_date)
            if planned_harvest_date < start_date:
                raise InvalidDateRangeError(
                    _("La date prévisionnelle de récolte doit être après la date de début")
                )
            if onboarding_mode == ProductionCycle.ONBOARDING_MODE_ONGOING:
                tracking_start_date = cycle_data.get('tracking_start_date')
                if isinstance(tracking_start_date, str):
                    tracking_start_date = date.fromisoformat(tracking_start_date)
                if (
                    tracking_start_date is None
                    or planned_harvest_date <= tracking_start_date
                    or planned_harvest_date < timezone.localdate()
                ):
                    raise BusinessRuleViolation({
                        'code': 'ongoing_cycle_planned_harvest_elapsed',
                        'detail': _(
                            'La récolte planifiée est déjà dépassée pour cette reprise.'
                        ),
                    })

    @staticmethod
    def _apply_economic_defaults(cycle_data: CycleCreatePayload) -> None:
        species = cycle_data.get('species') or 'tilapia'
        defaults = ECONOMIC_DEFAULTS_BY_SPECIES.get(species, ECONOMIC_DEFAULTS_BY_SPECIES['tilapia'])
        start_date_value = cycle_data.get('start_date')
        if isinstance(start_date_value, str):
            start_date_value = date.fromisoformat(start_date_value)

        if cycle_data.get('cycle_name') is None and start_date_value:
            cycle_data['cycle_name'] = f"Cycle {species.capitalize()} {start_date_value.isoformat()}"

        if (
            cycle_data.get('initial_average_weight') is None
            and cycle_data.get('onboarding_mode') != ProductionCycle.ONBOARDING_MODE_ONGOING
        ):
            cycle_data['initial_average_weight'] = DEFAULT_INITIAL_AVERAGE_WEIGHT_G_BY_SPECIES.get(
                species,
                DEFAULT_INITIAL_AVERAGE_WEIGHT_G_BY_SPECIES['tilapia'],
            )

        if cycle_data.get('target_harvest_weight_g') is None:
            cycle_data['target_harvest_weight_g'] = defaults['target_harvest_weight_g']

        if cycle_data.get('planned_cycle_duration_days') is None:
            cycle_data['planned_cycle_duration_days'] = defaults['planned_cycle_duration_days']

        if cycle_data.get('expected_survival_rate_pct') is None:
            cycle_data['expected_survival_rate_pct'] = DEFAULT_EXPECTED_SURVIVAL_RATE_PCT

        if cycle_data.get('planned_selling_price_per_kg_fcfa') is None:
            cycle_data['planned_selling_price_per_kg_fcfa'] = defaults['planned_selling_price_per_kg_fcfa']

        if cycle_data.get('fingerlings_cost_fcfa') is None:
            cycle_data['fingerlings_cost_fcfa'] = DEFAULT_FINGERLINGS_COST_FCFA

        if cycle_data.get('other_operational_costs_fcfa') is None:
            cycle_data['other_operational_costs_fcfa'] = DEFAULT_OTHER_OPERATIONAL_COSTS_FCFA

        if cycle_data.get('start_date'):
            start_date_value = cycle_data['start_date']
            if isinstance(start_date_value, str):
                start_date_value = date.fromisoformat(start_date_value)
            try:
                duration = validate_cycle_duration_days(cycle_data['planned_cycle_duration_days'])
            except ValueError as exc:
                raise BusinessRuleViolation(str(CYCLE_DURATION_ERROR_MESSAGE)) from exc
            derived_harvest_date = calculate_planned_harvest_date(start_date_value, duration)
            supplied_harvest_date = cycle_data.get('planned_harvest_date')
            if isinstance(supplied_harvest_date, str):
                supplied_harvest_date = date.fromisoformat(supplied_harvest_date)
            if supplied_harvest_date is not None and supplied_harvest_date != derived_harvest_date:
                raise InvalidDateRangeError(
                    _(
                        "La date prévisionnelle de récolte doit correspondre "
                        "à la durée du cycle"
                    )
                )
            cycle_data['planned_harvest_date'] = derived_harvest_date

    @staticmethod
    def _validate_harvest_business_rules(
        cycle: ProductionCycle,
        harvest_date: date,
        final_count: int,
        final_average_weight: Decimal
    ) -> None:
        """
        Valide les règles métier pour la récolte d'un cycle.

        Raises:
            InvalidHarvestDataError: Si données incohérentes
        """
        errors = []

        # Date récolte >= date début
        if harvest_date < cycle.analysis_start_date:
            if cycle.onboarding_mode == ProductionCycle.ONBOARDING_MODE_ONGOING:
                raise EventBeforeTrackingStartError(
                    tracking_start_date=cycle.analysis_start_date,
                )
            errors.append(
                _("Date de récolte (%(harvest)s) ne peut être avant le début du cycle (%(start)s)")
                % {
                    'harvest': harvest_date,
                    'start': cycle.analysis_start_date,
                }
            )

        # Date récolte pas trop dans le futur (tolérance 7 jours)
        future_limit = timezone.localdate() + timedelta(days=7)
        if harvest_date > future_limit:
            errors.append(
                _("Date de récolte ne peut être plus de 7 jours dans le futur")
            )

        # Effectif final <= effectif actuel
        if final_count > cycle.current_count:
            errors.append(
                _("Effectif final (%(final)d) ne peut dépasser l'effectif actuel (%(current)d)")
                % {'final': final_count, 'current': cycle.current_count}
            )

        # Poids moyen final cohérent (pas de perte de poids significative)
        if final_average_weight < cycle.current_average_weight * Decimal('0.8'):
            errors.append(
                _("Poids moyen final (%(final).1fg) anormalement inférieur au poids actuel (%(current).1fg)")
                % {'final': final_average_weight, 'current': cycle.current_average_weight}
            )

        # Poids minimum selon espèce pour récolte
        min_harvest_weight = {
            'tilapia': 200,  # 200g minimum
            'clarias': 250,  # 250g minimum
        }
        min_weight = min_harvest_weight.get(cycle.species, 150)
        if float(final_average_weight) < min_weight:
            errors.append(
                _("Poids moyen final (%(weight).1fg) inférieur au minimum commercial "
                  "pour %(species)s (%(min)dg)")
                % {
                    'weight': final_average_weight,
                    'species': cycle.get_species_display(),
                    'min': min_weight
                }
            )

        if errors:
            raise InvalidHarvestDataError(
                _("Données de récolte invalides : ") + " ; ".join(errors)
            )

    @staticmethod
    def _validate_partial_harvest_rules(
        cycle: ProductionCycle,
        harvest_date: date,
        count_harvested: int,
        average_weight_g: Decimal,
        available_count: int | None = None,
        require_remaining_fish: bool = False,
    ) -> None:
        """
        Valide les règles métier d'une récolte partielle.

        Raises:
            InsufficientFishCountError: count_harvested > current_count
            InvalidHarvestDataError: poids sous le minimum commercial
        """
        # Effectif disponible
        current_available_count = cycle.current_count if available_count is None else available_count
        if count_harvested > current_available_count:
            raise InsufficientFishCountError(
                _("Nombre à récolter (%(n)d) supérieur à l'effectif disponible (%(c)d)")
                % {'n': count_harvested, 'c': current_available_count}
            )
        if require_remaining_fish and count_harvested >= current_available_count:
            raise BusinessRuleViolation(
                _("Cette quantité viderait l'unité. Utilisez la récolte complète de l'unité.")
            )

        # Poids minimum commercial par espèce
        min_harvest_weight = {
            'tilapia': 200,
            'clarias': 250,
        }
        min_weight = min_harvest_weight.get(cycle.species, 150)
        if float(average_weight_g) < min_weight:
            raise InvalidHarvestDataError(
                _("Poids moyen (%(weight).1fg) inférieur au minimum commercial "
                  "pour %(species)s (%(min)dg)")
                % {
                    'weight': average_weight_g,
                    'species': cycle.get_species_display(),
                    'min': min_weight,
                }
            )

        # Date cohérente
        if harvest_date < cycle.analysis_start_date:
            if cycle.onboarding_mode == ProductionCycle.ONBOARDING_MODE_ONGOING:
                raise EventBeforeTrackingStartError(
                    tracking_start_date=cycle.analysis_start_date,
                )
            raise InvalidHarvestDataError(
                _("Date de récolte (%(h)s) antérieure au début du cycle (%(s)s)")
                % {'h': harvest_date, 's': cycle.analysis_start_date}
            )

        future_limit = timezone.localdate() + timedelta(days=7)
        if harvest_date > future_limit:
            raise InvalidHarvestDataError(
                _("Date de récolte ne peut être plus de 7 jours dans le futur")
            )

    @staticmethod
    def _post_harvest_actions(cycle: ProductionCycle) -> None:
        """
        Actions à effectuer après la récolte d'un cycle.

        - Désactiver les plans d'alimentation futurs
        - Créer notification de félicitations
        - Archiver les données si nécessaire
        """
        # Désactiver plans d'alimentation futurs
        from .feeding_service import FeedingPlanService
        try:
            FeedingPlanService.deactivate_future_plans(cycle)
        except Exception as e:
            # Log mais ne pas bloquer la récolte
            ProductionCycleService.log_operation(
                "post_harvest_warning",
                {"cycle_id": str(cycle.id), "error": str(e)},
                level='warning'
            )

        # Notification de félicitations (géré par le signal check_cycle_completion)

    @staticmethod
    def _is_pond_infrastructure(infrastructure_types: Any) -> bool:
        """
        Détermine si l'infrastructure principale est de type étang.

        Fallback :
        - aucune info => étang (comportement historique surface/m²)
        """
        if not infrastructure_types:
            return True
        normalized_types = ProductionCycleService._normalize_infrastructure_types(infrastructure_types)
        if normalized_types:
            return normalized_types[0] == 'pond'
        if isinstance(infrastructure_types, str):
            return normalize_production_unit_type(infrastructure_types) == 'pond'
        if isinstance(infrastructure_types, (list, tuple)):
            return any(normalize_production_unit_type(item) == 'pond' for item in infrastructure_types)
        return True

    @staticmethod
    def _normalize_infrastructure_types(infrastructure_types: Any) -> list[str]:
        """Normalise les types d'infrastructure en types production unit uniques."""
        if not infrastructure_types:
            return []

        if isinstance(infrastructure_types, str):
            candidates = [infrastructure_types]
        elif isinstance(infrastructure_types, (list, tuple, set)):
            candidates = list(infrastructure_types)
        else:
            return []

        normalized: list[str] = []
        for candidate in candidates:
            normalized_type = normalize_production_unit_type(candidate)
            if normalized_type and normalized_type not in normalized:
                normalized.append(normalized_type)

        return normalized
