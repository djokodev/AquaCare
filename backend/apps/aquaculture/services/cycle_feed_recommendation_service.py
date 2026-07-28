"""Prévision et couverture alimentaire auditable, phase par phase."""

from __future__ import annotations

from datetime import timedelta
from decimal import ROUND_CEILING, Decimal
from typing import Any

from commerce.domain.growth_calculator import NutritionalGuideResolver
from commerce.models import OrderItem, Product
from commerce.services.cycle_simulation_service import CycleSimulationService
from commerce.services.nutritional_guide_gateway import NutritionalGuideGateway
from django.db import IntegrityError, transaction
from django.utils import timezone

from ..models import CycleFeedPlan, FarmFeedReference, NutritionalGuide, ProductionCycle
from .cycle_store_service import ZERO_DECIMAL, CycleStoreService
from .feed_reference_service import FeedReferenceService
from .feed_stock_ledger_service import FeedStockLedgerService

QUANTIZE_KG = Decimal('0.01')
PLAN_VERSION = 2


class CycleFeedRecommendationService:
    """Construit une recommandation sans réécrire le plan initial."""

    @staticmethod
    def _decimal(value: Any) -> Decimal:
        if value is None or value == '':
            return ZERO_DECIMAL
        return value if isinstance(value, Decimal) else Decimal(str(value))

    @staticmethod
    def _kg(value: Any) -> str:
        return str(CycleFeedRecommendationService._decimal(value).quantize(QUANTIZE_KG))

    @staticmethod
    def _catalog_species(species: str) -> str:
        return 'catfish' if species == 'clarias' else species

    @staticmethod
    def _json_safe(value: Any) -> Any:
        if isinstance(value, Decimal):
            return str(value)
        if isinstance(value, dict):
            return {
                key: CycleFeedRecommendationService._json_safe(item)
                for key, item in value.items()
            }
        if isinstance(value, (list, tuple)):
            return [CycleFeedRecommendationService._json_safe(item) for item in value]
        return value

    @classmethod
    def _normalize_phase(cls, raw_phase: dict[str, Any], sequence: int) -> dict[str, Any]:
        products = raw_phase.get('products') or []
        recommended = products[0] if products else {}
        days_range = raw_phase.get('planned_days_range') or raw_phase.get('days_range') or [1, 1]
        weight_range = (
            raw_phase.get('planned_weight_range_g')
            or raw_phase.get('weight_range_g')
            or [0, 0]
        )
        consumption = raw_phase.get(
            'planned_consumption_kg',
            raw_phase.get('total_consumption_kg', 0),
        )
        return {
            'phase_id': raw_phase.get('phase_id') or f'phase-{sequence:03d}',
            'sequence': sequence,
            'original_sequence': sequence,
            'phase_name': raw_phase.get('phase_name') or f'phase_{sequence}',
            'planned_days_range': [int(days_range[0]), int(days_range[-1])],
            'planned_weight_range_g': [str(weight_range[0]), str(weight_range[-1])],
            'pellet_size_mm': (
                cls._kg(raw_phase.get('pellet_size_mm'))
                if raw_phase.get('pellet_size_mm') not in (None, '')
                else None
            ),
            'planned_consumption_kg': cls._kg(consumption),
            'planned_duration_days': int(
                raw_phase.get('planned_duration_days')
                or raw_phase.get('duration_days')
                or max(int(days_range[-1]) - int(days_range[0]) + 1, 1)
            ),
            'recommended_product_id': (
                str(recommended.get('product_id'))
                if recommended.get('product_id')
                else raw_phase.get('recommended_product_id')
            ),
        }

    @classmethod
    def _apply_nutritional_guide_sizes(
        cls,
        cycle: ProductionCycle,
        phases: list[dict[str, Any]],
        *,
        daily_feeding_schedule: list[dict[str, Any]] | None = None,
        recalibrate_from_sequence: int | None = None,
    ) -> list[dict[str, Any]]:
        """Recalibre les phases actuelles/futures sur les intervalles du guide.

        Chaque journée conserve son poids et sa ration biologique calculés par
        le simulateur. Les journées consécutives qui relèvent du même guide
        deviennent un segment ; aucune quantité n'est répartie selon une simple
        largeur d'intervalle de poids. Les phases passées restent inchangées.
        """
        if not phases:
            return phases
        guides = list(
            NutritionalGuide.objects.filter(
                species=FeedReferenceService.normalize_species(cycle.species),
            ).order_by('min_weight', 'max_weight', 'id')
        )
        if not guides:
            return phases

        schedule = sorted(
            daily_feeding_schedule or [],
            key=lambda entry: int(entry['day']),
        )
        adjusted: list[dict[str, Any]] = []
        for phase in phases:
            if (
                recalibrate_from_sequence is not None
                and phase.get('original_sequence', phase.get('sequence', 0))
                < recalibrate_from_sequence
            ):
                adjusted.append(phase)
                continue
            days_range = phase.get('planned_days_range') or phase.get('days_range') or [1, 1]
            phase_days = [
                entry
                for entry in schedule
                if int(days_range[0]) <= int(entry['day']) <= int(days_range[-1])
            ]
            if not phase_days:
                weight_range = (
                    phase.get('planned_weight_range_g')
                    or phase.get('weight_range_g')
                    or []
                )
                if len(weight_range) < 2:
                    adjusted.append(phase)
                    continue
                adjusted.append(cls._apply_guide_to_segment(
                    phase,
                    guides,
                    cls._decimal(weight_range[0]),
                    cls._decimal(weight_range[-1]),
                ))
                continue

            groups: list[dict[str, Any]] = []
            for entry in phase_days:
                selected, warning = cls._guide_for_weight(
                    guides,
                    cls._decimal(entry['weight_g']),
                )
                group_key = (
                    str(selected.feed_size_mm) if selected else None,
                    warning,
                )
                if (
                    not groups
                    or groups[-1]['key'] != group_key
                    or int(entry['day']) != int(groups[-1]['entries'][-1]['day']) + 1
                ):
                    groups.append({
                        'key': group_key,
                        'guide': selected,
                        'guide_ids': set(),
                        'guide_sources': set(),
                        'warning': warning,
                        'entries': [],
                    })
                if selected is not None:
                    groups[-1]['guide_ids'].add(str(selected.id))
                    groups[-1]['guide_sources'].add(selected.source)
                groups[-1]['entries'].append(entry)

            base_phase_id = (
                phase.get('phase_id')
                or f"{phase.get('phase_name', 'phase')}-{days_range[0]}"
            )
            segment_count = len(groups)
            for index, group in enumerate(groups, start=1):
                entries = group['entries']
                selected = group['guide']
                segment_consumption = sum(
                    (cls._decimal(entry['feed_kg']) for entry in entries),
                    ZERO_DECIMAL,
                ).quantize(QUANTIZE_KG)
                first_entry = entries[0]
                last_entry = entries[-1]
                segment = {
                    **phase,
                    'phase_id': (
                        base_phase_id
                        if segment_count == 1
                        else f'{base_phase_id}:segment-{index}'
                    ),
                    'sequence': phase.get('sequence', index),
                    'planned_days_range': [int(first_entry['day']), int(last_entry['day'])],
                    'days_range': [int(first_entry['day']), int(last_entry['day'])],
                    'planned_weight_range_g': [
                        str(first_entry['weight_g']),
                        str(last_entry['weight_g']),
                    ],
                    'weight_range_g': [
                        str(first_entry['weight_g']),
                        str(last_entry['weight_g']),
                    ],
                    'planned_consumption_kg': cls._kg(segment_consumption),
                    'total_consumption_kg': cls._kg(segment_consumption),
                    'planned_duration_days': len(entries),
                    'duration_days': len(entries),
                    'segment_index': index,
                    'segment_count': segment_count,
                    'pellet_size_mm': cls._kg(selected.feed_size_mm) if selected else None,
                    'nutritional_guide_source': (
                        next(iter(group['guide_sources']))
                        if len(group['guide_sources']) == 1
                        else 'mixed'
                    ) if selected else None,
                    'nutritional_guide_id': (
                        next(iter(group['guide_ids']))
                        if len(group['guide_ids']) == 1
                        else None
                    ) if selected else None,
                    'nutritional_guide_warning': group['warning'],
                }
                adjusted.append(segment)
        return adjusted

    @staticmethod
    def _guide_for_weight(
        guides: list[NutritionalGuide],
        weight: Decimal,
    ) -> tuple[NutritionalGuide | None, str | None]:
        """Réutilise le résolveur de frontières de la simulation."""
        rules = [
            {
                'id': str(guide.id),
                'min_weight': guide.min_weight,
                'max_weight': guide.max_weight,
                'growth_stage': guide.growth_stage,
                'feed_size_mm': guide.feed_size_mm,
                'source': guide.source,
            }
            for guide in guides
        ]
        selected, warning = NutritionalGuideResolver.resolve(rules, weight)
        if selected is None:
            return None, warning
        guides_by_id = {str(guide.id): guide for guide in guides}
        return guides_by_id[selected['id']], warning

    @classmethod
    def _apply_guide_to_segment(
        cls,
        phase: dict[str, Any],
        guides: list[NutritionalGuide],
        start_weight: Decimal,
        end_weight: Decimal,
    ) -> dict[str, Any]:
        selected, warning = cls._guide_for_weight(guides, start_weight)
        end_selected, end_warning = cls._guide_for_weight(guides, end_weight)
        same_pellet = (
            selected is not None
            and end_selected is not None
            and selected.feed_size_mm == end_selected.feed_size_mm
        )
        if not same_pellet:
            selected = None
            warning = warning or end_warning or 'nutritional_guide_gap'
        guide_source = None
        guide_id = None
        if selected is not None and end_selected is not None:
            guide_source = (
                selected.source
                if selected.source == end_selected.source
                else 'mixed'
            )
            if selected.id == end_selected.id:
                guide_id = str(selected.id)
        return {
            **phase,
            'pellet_size_mm': cls._kg(selected.feed_size_mm) if selected else None,
            'nutritional_guide_source': guide_source,
            'nutritional_guide_id': guide_id,
            'nutritional_guide_warning': warning,
        }

    @classmethod
    def _normalized_plan_phases(
        cls,
        plan: CycleFeedPlan,
        cycle: ProductionCycle | None = None,
    ) -> list[dict[str, Any]]:
        phases = [
            cls._normalize_phase(raw_phase, sequence)
            for sequence, raw_phase in enumerate(plan.phases, start=1)
        ]
        daily_feeding_schedule = cls._daily_schedule_from_parameters(plan.parameters)
        return cls._apply_nutritional_guide_sizes(
            cycle,
            phases,
            daily_feeding_schedule=daily_feeding_schedule,
            recalibrate_from_sequence=(
                plan.highest_reached_phase_sequence if plan else None
            ),
        ) if cycle else phases

    @staticmethod
    def _daily_schedule_from_parameters(
        parameters: dict[str, Any],
    ) -> list[dict[str, Any]]:
        required = {
            'initial_fish_count',
            'initial_weight_g',
            'target_weight_g',
            'cycle_duration_days',
            'survival_rate',
        }
        if not required.issubset(parameters):
            return []
        _, schedule = CycleSimulationService.build_daily_feeding_schedule(parameters)
        return schedule

    @classmethod
    def _initial_simulation(cls, cycle: ProductionCycle) -> dict[str, Any]:
        if (
            not cycle.initial_count
            or not cycle.initial_average_weight
            or not cycle.target_harvest_weight_g
            or cycle.initial_average_weight >= cycle.target_harvest_weight_g
        ):
            return {}
        simulation = CycleSimulationService.simulate_cycle(
            species=cycle.species,
            initial_fish_count=cycle.initial_count,
            initial_weight_g=float(cycle.initial_average_weight),
            target_weight_g=float(cycle.target_harvest_weight_g),
            cycle_duration_days=cycle.planned_cycle_duration_days or 180,
            survival_rate=float(cycle.expected_survival_rate_pct or 95) / 100,
            selling_price_per_kg_fcfa=float(cycle.planned_selling_price_per_kg_fcfa or 2800),
            fingerlings_cost_fcfa=float(cycle.fingerlings_cost_fcfa or 0),
            other_costs_fcfa=float(cycle.other_operational_costs_fcfa or 0),
            include_daily_feeding_schedule=True,
            nutritional_guide_rules=NutritionalGuideGateway.for_species(cycle.species),
        )
        simulation['feeding_phases'] = cls._apply_nutritional_guide_sizes(
            cycle,
            simulation['feeding_phases'],
            daily_feeding_schedule=simulation.get('_daily_feeding_schedule'),
        )
        return simulation

    @classmethod
    @transaction.atomic
    def create_initial_plan(
        cls,
        cycle: ProductionCycle,
        *,
        source: str = 'cycle_launch',
    ) -> CycleFeedPlan | None:
        """Crée une fois le snapshot initial, y compris sous concurrence."""
        cycle = ProductionCycle.objects.select_for_update().get(pk=cycle.pk)
        existing = CycleFeedPlan.objects.select_for_update().filter(cycle=cycle).first()
        if existing is not None:
            return existing
        simulation = cls._initial_simulation(cycle)
        if not simulation:
            return None
        phases = [
            cls._normalize_phase(raw_phase, sequence)
            for sequence, raw_phase in enumerate(simulation['feeding_phases'], start=1)
        ]
        parameters = cls._json_safe(simulation['parameters'])
        parameters['snapshot_source'] = source
        try:
            with transaction.atomic():
                initial_sequence = (
                    cls._current_phase_index(
                        phases,
                        cls._decimal(cycle.initial_average_weight),
                    )
                    + 1
                    if phases and cycle.initial_average_weight
                    else 0
                )
                return CycleFeedPlan.objects.create(
                    cycle=cycle,
                    version=PLAN_VERSION,
                    parameters=parameters,
                    phases=phases,
                    total_feed_kg=cls._decimal(
                        simulation['summary']['total_feed_kg']
                    ).quantize(QUANTIZE_KG),
                    highest_reached_phase_sequence=initial_sequence,
                )
        except IntegrityError:
            return CycleFeedPlan.objects.get(cycle=cycle)

    @classmethod
    def ensure_plan(cls, cycle: ProductionCycle) -> CycleFeedPlan | None:
        """Compatibilité des anciens cycles ; les nouveaux sont planifiés au lancement."""
        existing = CycleFeedPlan.objects.filter(cycle=cycle).first()
        return existing or cls.create_initial_plan(cycle, source='legacy_backfill')

    @classmethod
    def _resolve_current_weight(
        cls,
        cycle: ProductionCycle,
        phases: list[dict[str, Any]],
    ) -> tuple[Decimal | None, str | None]:
        if cycle.current_average_weight and cycle.current_average_weight > 0:
            return cls._decimal(cycle.current_average_weight), 'cycle_current_weight'
        latest_weight = cycle.logs.filter(average_weight__gt=0).order_by(
            '-log_date', '-created_at'
        ).values_list('average_weight', flat=True).first()
        if latest_weight:
            return cls._decimal(latest_weight), 'latest_weighing'
        if cycle.current_biomass and cycle.current_count and cycle.current_count > 0:
            return (
                cls._decimal(cycle.current_biomass) * Decimal('1000')
                / Decimal(cycle.current_count),
                'current_biomass',
            )
        if cycle.start_date and phases:
            age_days = max((timezone.localdate() - cycle.start_date).days + 1, 1)
            for phase in phases:
                start_day, end_day = phase['planned_days_range']
                if start_day <= age_days <= end_day:
                    low, high = map(cls._decimal, phase['planned_weight_range_g'])
                    progress = Decimal(age_days - start_day) / Decimal(max(end_day - start_day, 1))
                    return low + ((high - low) * progress), 'plan_age_progression'
        return None, None

    @classmethod
    def _current_simulation(
        cls,
        cycle: ProductionCycle,
        current_weight: Decimal,
    ) -> tuple[dict[str, Any], list[str]]:
        if cycle.target_harvest_weight_g is None:
            return {}, ['target_weight_unavailable']
        if not cycle.current_count or cycle.current_count <= 0:
            return {}, []
        if current_weight >= cycle.target_harvest_weight_g:
            return {}, []
        planned_end = cycle.planned_harvest_date or (
            cycle.start_date + timedelta(days=cycle.planned_cycle_duration_days or 180)
        )
        latest_feed_date = cycle.logs.filter(feed_quantity__gt=0).order_by(
            '-log_date'
        ).values_list('log_date', flat=True).first()
        starts_after_integrated_ration = int(
            latest_feed_date is not None and latest_feed_date >= timezone.localdate()
        )
        duration = (planned_end - timezone.localdate()).days - starts_after_integrated_ration
        if duration <= 0:
            return {}, ['planned_harvest_date_elapsed']
        simulation = CycleSimulationService.simulate_cycle(
            species=cycle.species,
            initial_fish_count=cycle.current_count,
            initial_weight_g=float(current_weight),
            target_weight_g=float(cycle.target_harvest_weight_g),
            cycle_duration_days=duration,
            survival_rate=1.0,
            selling_price_per_kg_fcfa=float(cycle.planned_selling_price_per_kg_fcfa or 2800),
            fingerlings_cost_fcfa=0.0,
            other_costs_fcfa=0.0,
            include_daily_feeding_schedule=True,
            nutritional_guide_rules=NutritionalGuideGateway.for_species(cycle.species),
        )
        simulation['feeding_phases'] = cls._apply_nutritional_guide_sizes(
            cycle,
            simulation['feeding_phases'],
            daily_feeding_schedule=simulation.get('_daily_feeding_schedule'),
        )
        return simulation, []

    @classmethod
    def _current_phase_index(
        cls,
        phases: list[dict[str, Any]],
        current_weight: Decimal,
    ) -> int:
        for index, phase in enumerate(phases):
            if current_weight <= cls._decimal(phase['planned_weight_range_g'][-1]):
                return index
        return max(len(phases) - 1, 0)

    @classmethod
    def _actual_consumption_by_phase(
        cls,
        cycle: ProductionCycle,
        phases: list[dict[str, Any]],
        current_index: int,
    ) -> tuple[list[Decimal], Decimal]:
        actual = [ZERO_DECIMAL for _ in phases]
        unclassified = ZERO_DECIMAL
        logs = CycleStoreService._get_consumption_queryset(cycle).filter(feed_quantity__gt=0).select_related(
            'feed_reference'
        ).order_by('log_date', 'created_at')
        for log in logs:
            quantity = cls._decimal(log.feed_quantity)
            feed_size = cls._decimal(log.feed_size_mm) if log.feed_size_mm is not None else None
            if feed_size is None and log.feed_reference is not None:
                feed_size = cls._decimal(log.feed_reference.pellet_size_mm)
            if log.feed_reference_id is None and feed_size is None:
                unclassified += quantity
                continue
            if log.feed_reference is not None and (
                log.feed_reference.farm_profile_id != cycle.farm_profile_id
                or FeedReferenceService.normalize_species(log.feed_reference.species)
                != FeedReferenceService.normalize_species(cycle.species)
            ):
                unclassified += quantity
                continue
            if log.feed_reference_id is None:
                # Une granulométrie seule n'est exploitable que si le cycle
                # possède une unique référence compatible. Une référence de
                # la ferme, ou une référence créée après ce journal, ne suffit
                # pas à prouver l'identité historique de l'aliment.
                compatible_references = list(
                    FarmFeedReference.objects.filter(
                        farm_profile=cycle.farm_profile,
                        species=FeedReferenceService.normalize_species(cycle.species),
                        pellet_size_mm=feed_size,
                        stock_entries__cycle=cycle,
                    ).distinct()
                ) if feed_size is not None else []
                if len(compatible_references) != 1:
                    unclassified += quantity
                    continue
                reference = compatible_references[0]
                first_entry_date = cycle.feed_stock_entries.filter(
                    feed_reference=reference,
                ).order_by('entry_date').values_list('entry_date', flat=True).first()
                if first_entry_date is None or log.log_date < first_entry_date:
                    unclassified += quantity
                    continue
                ledger = FeedStockLedgerService.calculate_for_size(
                    cycle=cycle,
                    feed_size_mm=feed_size,
                    at_date=log.log_date,
                    existing_log=log,
                )
                if ledger.balance_at_date < quantity:
                    unclassified += quantity
                    continue
            day = max((log.log_date - cycle.start_date).days + 1, 1)
            candidates = [
                index
                for index, phase in enumerate(phases)
                if phase['planned_days_range'][0] <= day <= phase['planned_days_range'][1]
                and cls._decimal(phase['pellet_size_mm']) == feed_size
                and (
                    log.feed_reference is None
                    or FeedReferenceService.normalize_species(log.feed_reference.species)
                    == FeedReferenceService.normalize_species(cycle.species)
                )
            ]
            if not candidates:
                compatible = [
                    index
                    for index, phase in enumerate(phases)
                    if cls._decimal(phase['pellet_size_mm']) == feed_size
                    and (
                        log.feed_reference is None
                        or FeedReferenceService.normalize_species(log.feed_reference.species)
                        == FeedReferenceService.normalize_species(cycle.species)
                    )
                ]
                candidates = [min(compatible, key=lambda index: abs(index - current_index))] if compatible else []
            if candidates:
                actual[candidates[0]] += quantity
            else:
                unclassified += quantity
        return actual, unclassified

    @classmethod
    def _future_need_by_phase(
        cls,
        phases: list[dict[str, Any]],
        current_index: int,
        simulation: dict[str, Any],
    ) -> list[Decimal]:
        needs = [ZERO_DECIMAL for _ in phases]
        simulation_phases = list(simulation.get('feeding_phases') or [])
        if not simulation_phases:
            return needs

        daily_schedule = list(simulation.get('_daily_feeding_schedule') or [])
        if daily_schedule:
            for entry in daily_schedule:
                day = int(entry['day'])
                raw_phase = next(
                    (
                        phase
                        for phase in simulation_phases
                        if int(phase['days_range'][0]) <= day <= int(phase['days_range'][-1])
                    ),
                    None,
                )
                if raw_phase is None:
                    continue
                raw_size = (
                    cls._decimal(raw_phase['pellet_size_mm'])
                    if raw_phase.get('pellet_size_mm') is not None
                    else None
                )
                weight = cls._decimal(entry['weight_g'])
                candidates: list[tuple[int, Decimal]] = []
                for index in range(current_index, len(phases)):
                    phase_size = (
                        cls._decimal(phases[index]['pellet_size_mm'])
                        if phases[index].get('pellet_size_mm') is not None
                        else None
                    )
                    if phase_size != raw_size:
                        continue
                    phase_range = phases[index].get('planned_weight_range_g') or []
                    if len(phase_range) < 2:
                        continue
                    phase_start, phase_end = map(cls._decimal, phase_range[:2])
                    distance = (
                        ZERO_DECIMAL
                        if phase_start <= weight <= phase_end
                        else min(abs(weight - phase_start), abs(weight - phase_end))
                    )
                    candidates.append((index, distance))
                if candidates:
                    selected_index = min(candidates, key=lambda item: (item[1], item[0]))[0]
                    needs[selected_index] += cls._decimal(entry['feed_kg'])
            return [value.quantize(QUANTIZE_KG) for value in needs]

        # Compatibilité des anciens snapshots de tests ou de plans qui ne
        # possèdent pas encore la progression journalière interne : une phase
        # reforecastée est affectée une seule fois à la phase la plus proche,
        # sans répartir ses kilogrammes selon une largeur de poids.
        for raw_phase in simulation_phases:
            raw_range = raw_phase.get('weight_range_g') or raw_phase.get('planned_weight_range_g') or []
            if len(raw_range) < 2:
                continue
            raw_start, raw_end = map(cls._decimal, raw_range[:2])
            raw_need = cls._decimal(raw_phase.get('total_consumption_kg'))
            raw_size = (
                cls._decimal(raw_phase['pellet_size_mm'])
                if raw_phase.get('pellet_size_mm') is not None
                else None
            )
            candidates: list[tuple[int, Decimal]] = []
            for index in range(current_index, len(phases)):
                phase_size = (
                    cls._decimal(phases[index]['pellet_size_mm'])
                    if phases[index].get('pellet_size_mm') is not None
                    else None
                )
                if phase_size != raw_size:
                    continue
                phase_range = phases[index].get('planned_weight_range_g') or []
                if len(phase_range) < 2:
                    continue
                phase_start, phase_end = map(cls._decimal, phase_range[:2])
                overlap = min(raw_end, phase_end) - max(raw_start, phase_start)
                distance = (
                    ZERO_DECIMAL
                    if overlap > ZERO_DECIMAL
                    else min(abs(raw_start - phase_end), abs(phase_start - raw_end))
                )
                candidates.append((index, distance))
            if not candidates:
                continue
            selected_index = min(candidates, key=lambda item: (item[1], item[0]))[0]
            needs[selected_index] += raw_need

        rounded = [value.quantize(QUANTIZE_KG) for value in needs]
        expected_total = sum(
            (
                cls._decimal(raw_phase.get('total_consumption_kg'))
                for raw_phase in simulation_phases
            ),
            ZERO_DECIMAL,
        ).quantize(QUANTIZE_KG)
        difference = expected_total - sum(rounded, ZERO_DECIMAL)
        if difference:
            populated = [index for index, value in enumerate(rounded) if value]
            if populated:
                rounded[populated[-1]] += difference
        return rounded

    @classmethod
    def _unavailable_payload(
        cls,
        cycle: ProductionCycle,
        phases: list[dict[str, Any]],
        plan: CycleFeedPlan | None,
        warnings: list[str],
    ) -> dict[str, Any]:
        return {
            'cycle_id': str(cycle.id),
            'status': 'unavailable',
            'source': 'cycle_progress',
            'calculated_at': timezone.now(),
            'summary': {
                'planned_total_feed_kg': str(plan.total_feed_kg) if plan else None,
                'estimated_remaining_need_kg': None,
                'compatible_stock_kg': None,
                'pending_order_kg': None,
                'feed_to_order_kg': None,
                'unclassified_stock_kg': None,
                'unclassified_consumption_kg': None,
            },
            'feeding_phases': [
                {
                    **phase,
                    'phase_status': 'unknown',
                    'planned_consumption_kg': phase['planned_consumption_kg'],
                    'actual_consumed_kg': None,
                    'estimated_remaining_need_kg': None,
                    'allocated_stock_kg': None,
                    'allocated_pending_kg': None,
                    'shortfall_kg': None,
                    'surplus_kg': None,
                    'product_available': False,
                    'products': [],
                    'total_bags': None,
                    'total_price': None,
                    'days_range': phase['planned_days_range'],
                    'weight_range_g': phase['planned_weight_range_g'],
                    'duration_days': phase['planned_duration_days'],
                    'remaining_need_kg': None,
                    'consumed_kg': None,
                }
                for phase in phases
            ],
            'warnings': warnings or ['feed_estimate_unavailable'],
        }

    @classmethod
    def build(cls, cycle: ProductionCycle) -> dict[str, Any]:
        plan = cls.ensure_plan(cycle)
        if plan is None:
            return cls._unavailable_payload(cycle, [], None, ['feed_estimate_unavailable'])
        phases = cls._normalized_plan_phases(plan, cycle)
        current_weight, weight_source = cls._resolve_current_weight(cycle, phases)
        if current_weight is None:
            return cls._unavailable_payload(cycle, phases, plan, ['current_weight_unavailable'])

        simulation, simulation_warnings = cls._current_simulation(cycle, current_weight)
        target_reached = (
            cycle.current_count == 0
            or (
                cycle.target_harvest_weight_g is not None
                and current_weight >= cycle.target_harvest_weight_g
            )
        )
        if simulation_warnings:
            return cls._unavailable_payload(cycle, phases, plan, simulation_warnings)
        if not simulation and not target_reached:
            return cls._unavailable_payload(cycle, phases, plan, ['feed_estimate_unavailable'])

        current_index = cls._current_phase_index(phases, current_weight)
        progression_index = current_index
        for index, phase in enumerate(phases):
            if phase.get('original_sequence', phase.get('sequence', index + 1)) >= plan.highest_reached_phase_sequence:
                progression_index = max(progression_index, index)
                break
        actual_by_phase, unclassified_consumption = cls._actual_consumption_by_phase(
            cycle,
            phases,
            progression_index,
        )
        future_needs = (
            [ZERO_DECIMAL for _ in phases]
            if target_reached
            else cls._future_need_by_phase(phases, progression_index, simulation)
        )

        entries = list(cycle.feed_stock_entries.for_api().order_by('entry_date', 'created_at'))
        stock_items = CycleStoreService._build_stock_items(
            cycle=cycle,
            entries=entries,
            stock_tracking_started_at=CycleStoreService._get_stock_tracking_started_at(entries),
        )
        stock_by_size: dict[Decimal, Decimal] = {}
        external_sizes: set[Decimal] = set()
        warnings: list[str] = []
        for item in stock_items:
            available = cls._decimal(item['quantity_available_kg'])
            if available < ZERO_DECIMAL:
                warnings.append('negative_feed_stock')
                continue
            if item['feed_reference_id'] and item['species'] == cycle.species and item['feed_size_mm']:
                size = cls._decimal(item['feed_size_mm'])
                stock_by_size[size] = stock_by_size.get(size, ZERO_DECIMAL) + available
                if item['source'] == 'external' and available > ZERO_DECIMAL:
                    external_sizes.add(size)

        pending_by_size: dict[Decimal, Decimal] = {}
        pending_items = OrderItem.objects.filter(
            order__production_cycle=cycle,
            order__status__in=['confirmed', 'ready_for_pickup', 'delivered'],
        ).select_related('product')
        for item in pending_items:
            species = item.product_species_snapshot or item.product.species
            if FeedReferenceService.normalize_species(species) != cycle.species:
                continue
            size = item.product_pellet_size_mm_snapshot
            package = item.product_package_weight_kg_snapshot
            if size is None:
                size = item.product.pellet_size_mm
            if package is None:
                package = item.product.package_weight_kg
            if size is None or package is None or cls._decimal(package) <= ZERO_DECIMAL:
                continue
            decimal_size = cls._decimal(size)
            pending_by_size[decimal_size] = pending_by_size.get(decimal_size, ZERO_DECIMAL) + (
                cls._decimal(package) * Decimal(item.quantity)
            )

        unclassified_stock = sum(
            (
                cls._decimal(item['quantity_available_kg'])
                for item in stock_items
                if item['feed_reference_id'] is None
            ),
            ZERO_DECIMAL,
        )
        if unclassified_stock > ZERO_DECIMAL:
            warnings.append('unclassified_stock')
        if unclassified_consumption > ZERO_DECIMAL:
            warnings.append('unclassified_consumption')

        phase_payloads: list[dict[str, Any]] = []
        total_remaining = ZERO_DECIMAL
        total_stock = ZERO_DECIMAL
        total_pending = ZERO_DECIMAL
        total_shortfall = ZERO_DECIMAL
        catalog_species = cls._catalog_species(cycle.species)
        for index, phase in enumerate(phases):
            phase_sequence = phase.get('original_sequence', phase.get('sequence', index + 1))
            phase_status = (
                'past' if phase_sequence < plan.highest_reached_phase_sequence
                else 'current' if phase_sequence == plan.highest_reached_phase_sequence
                else 'future'
            )
            size = (
                cls._decimal(phase['pellet_size_mm'])
                if phase.get('pellet_size_mm') is not None
                else None
            )
            if phase.get('nutritional_guide_warning'):
                warnings.append(phase['nutritional_guide_warning'])
            required = future_needs[index]
            allocated_stock = min(stock_by_size.get(size, ZERO_DECIMAL), required) if size is not None else ZERO_DECIMAL
            if size is not None:
                stock_by_size[size] = stock_by_size.get(size, ZERO_DECIMAL) - allocated_stock
            after_stock = required - allocated_stock
            allocated_pending = (
                min(pending_by_size.get(size, ZERO_DECIMAL), after_stock)
                if size is not None
                else ZERO_DECIMAL
            )
            if size is not None:
                pending_by_size[size] = pending_by_size.get(size, ZERO_DECIMAL) - allocated_pending
            shortfall = after_stock - allocated_pending

            products = (
                Product.objects.available().filter(
                    species=catalog_species,
                    pellet_size_mm=size,
                )
                if size is not None
                else Product.objects.none()
            )
            preferred_id = phase.get('recommended_product_id')
            product = products.filter(pk=preferred_id).first() if preferred_id else None
            product = product or products.order_by('-package_weight_kg', 'price_per_package').first()
            package_weight = cls._decimal(product.package_weight_kg) if product else ZERO_DECIMAL
            bags = (
                int((shortfall / package_weight).to_integral_value(rounding=ROUND_CEILING))
                if product and package_weight > ZERO_DECIMAL and shortfall > ZERO_DECIMAL
                else 0
            )
            ordered_kg = package_weight * Decimal(bags)
            product_payload = None
            if product and bags:
                product_payload = {
                    'product_id': str(product.id),
                    'product_name': product.name,
                    'package_weight_kg': cls._kg(product.package_weight_kg),
                    'quantity_bags': bags,
                    'total_kg': cls._kg(ordered_kg),
                    'unit_price': cls._kg(product.price_per_package),
                    'total_price': cls._kg(product.price_per_package * bags),
                    'brand': product.brand,
                    'species': product.species,
                    'pellet_size_mm': cls._kg(product.pellet_size_mm),
                }
            if shortfall > ZERO_DECIMAL and product is None:
                warnings.append('exact_product_unavailable')
            if shortfall > ZERO_DECIMAL and phase.get('nutritional_guide_warning') == 'nutritional_guide_gap':
                warnings.append('nutritional_guide_gap')
            if allocated_stock > ZERO_DECIMAL and size in external_sizes:
                warnings.append('external_feed_nutrition_unknown')

            phase_payloads.append({
                **phase,
                'phase_status': phase_status,
                'actual_consumed_kg': cls._kg(actual_by_phase[index]),
                'estimated_remaining_need_kg': cls._kg(required),
                'allocated_stock_kg': cls._kg(allocated_stock),
                'allocated_pending_kg': cls._kg(allocated_pending),
                'shortfall_kg': cls._kg(shortfall),
                'surplus_kg': cls._kg(max(ordered_kg - shortfall, ZERO_DECIMAL)),
                'products': [product_payload] if product_payload else [],
                'total_bags': bags,
                'total_price': cls._kg(product.price_per_package * bags) if product else '0.00',
                'product_available': product is not None,
                # Compatibilité du contrat mobile existant.
                'days_range': phase['planned_days_range'],
                'weight_range_g': phase['planned_weight_range_g'],
                'duration_days': phase['planned_duration_days'],
                'remaining_need_kg': cls._kg(required),
                'consumed_kg': cls._kg(actual_by_phase[index]),
            })
            total_remaining += required
            total_stock += allocated_stock
            total_pending += allocated_pending
            total_shortfall += shortfall

        simulated_total = sum(
            (
                cls._decimal(raw_phase.get('total_consumption_kg'))
                for raw_phase in simulation.get('feeding_phases') or []
            ),
            ZERO_DECIMAL,
        ).quantize(QUANTIZE_KG)
        if not target_reached and total_remaining.quantize(QUANTIZE_KG) != simulated_total:
            warnings.append('feed_phase_need_reconciliation_error')
        warnings = list(dict.fromkeys(warnings))
        return {
            'cycle_id': str(cycle.id),
            'status': 'incomplete' if warnings else 'available',
            'source': f'current_cycle_reforecast:{weight_source}',
            'calculated_at': timezone.now(),
            'summary': {
                'planned_total_feed_kg': cls._kg(plan.total_feed_kg),
                'estimated_remaining_need_kg': cls._kg(total_remaining),
                'compatible_stock_kg': cls._kg(total_stock),
                'pending_order_kg': cls._kg(total_pending),
                'feed_to_order_kg': cls._kg(total_shortfall),
                'unclassified_stock_kg': cls._kg(unclassified_stock),
                'unclassified_consumption_kg': cls._kg(unclassified_consumption),
            },
            'feeding_phases': phase_payloads,
            'warnings': warnings,
        }
