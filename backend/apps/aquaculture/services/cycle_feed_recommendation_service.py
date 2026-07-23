"""Prévision et couverture alimentaire auditable, phase par phase."""

from __future__ import annotations

from datetime import timedelta
from decimal import ROUND_CEILING, Decimal
from typing import Any

from commerce.models import OrderItem, Product
from commerce.services.cycle_simulation_service import CycleSimulationService
from django.db import IntegrityError, transaction
from django.utils import timezone

from ..models import CycleFeedPlan, ProductionCycle
from .cycle_store_service import ZERO_DECIMAL, CycleStoreService
from .feed_reference_service import FeedReferenceService

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
            'phase_name': raw_phase.get('phase_name') or f'phase_{sequence}',
            'planned_days_range': [int(days_range[0]), int(days_range[-1])],
            'planned_weight_range_g': [str(weight_range[0]), str(weight_range[-1])],
            'pellet_size_mm': cls._kg(raw_phase.get('pellet_size_mm')),
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
    def _normalized_plan_phases(cls, plan: CycleFeedPlan) -> list[dict[str, Any]]:
        return [
            cls._normalize_phase(raw_phase, sequence)
            for sequence, raw_phase in enumerate(plan.phases, start=1)
        ]

    @classmethod
    def _initial_simulation(cls, cycle: ProductionCycle) -> dict[str, Any]:
        if (
            not cycle.initial_count
            or not cycle.initial_average_weight
            or not cycle.target_harvest_weight_g
            or cycle.initial_average_weight >= cycle.target_harvest_weight_g
        ):
            return {}
        return CycleSimulationService.simulate_cycle(
            species=cycle.species,
            initial_fish_count=cycle.initial_count,
            initial_weight_g=float(cycle.initial_average_weight),
            target_weight_g=float(cycle.target_harvest_weight_g),
            cycle_duration_days=cycle.planned_cycle_duration_days or 180,
            survival_rate=float(cycle.expected_survival_rate_pct or 95) / 100,
            selling_price_per_kg_fcfa=float(cycle.planned_selling_price_per_kg_fcfa or 2800),
            fingerlings_cost_fcfa=float(cycle.fingerlings_cost_fcfa or 0),
            other_costs_fcfa=float(cycle.other_operational_costs_fcfa or 0),
        )

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
        return CycleSimulationService.simulate_cycle(
            species=cycle.species,
            initial_fish_count=cycle.current_count,
            initial_weight_g=float(current_weight),
            target_weight_g=float(cycle.target_harvest_weight_g),
            cycle_duration_days=duration,
            survival_rate=1.0,
            selling_price_per_kg_fcfa=float(cycle.planned_selling_price_per_kg_fcfa or 2800),
            fingerlings_cost_fcfa=0.0,
            other_costs_fcfa=0.0,
        ), []

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
            if log.feed_reference_id is None:
                unclassified += quantity
                continue
            day = max((log.log_date - cycle.start_date).days + 1, 1)
            candidates = [
                index
                for index, phase in enumerate(phases)
                if phase['planned_days_range'][0] <= day <= phase['planned_days_range'][1]
                and cls._decimal(phase['pellet_size_mm']) == log.feed_reference.pellet_size_mm
                and log.feed_reference.species == cycle.species
            ]
            if not candidates:
                compatible = [
                    index
                    for index, phase in enumerate(phases)
                    if cls._decimal(phase['pellet_size_mm']) == log.feed_reference.pellet_size_mm
                    and log.feed_reference.species == cycle.species
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
        unused = list(simulation.get('feeding_phases') or [])
        for index in range(current_index, len(phases)):
            planned_size = cls._decimal(phases[index]['pellet_size_mm'])
            matched_index = next(
                (
                    raw_index
                    for raw_index, raw_phase in enumerate(unused)
                    if cls._decimal(raw_phase.get('pellet_size_mm')) == planned_size
                ),
                None,
            )
            if matched_index is None:
                continue
            raw_phase = unused.pop(matched_index)
            needs[index] = cls._decimal(raw_phase.get('total_consumption_kg')).quantize(
                QUANTIZE_KG
            )
        return needs

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
        phases = cls._normalized_plan_phases(plan)
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
        progression_index = max(
            current_index,
            max(plan.highest_reached_phase_sequence - 1, 0),
        )
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
            phase_status = (
                'past' if index < plan.highest_reached_phase_sequence - 1
                else 'current' if index == plan.highest_reached_phase_sequence - 1
                else 'future'
            )
            size = cls._decimal(phase['pellet_size_mm'])
            required = future_needs[index]
            allocated_stock = min(stock_by_size.get(size, ZERO_DECIMAL), required)
            stock_by_size[size] = stock_by_size.get(size, ZERO_DECIMAL) - allocated_stock
            after_stock = required - allocated_stock
            allocated_pending = min(pending_by_size.get(size, ZERO_DECIMAL), after_stock)
            pending_by_size[size] = pending_by_size.get(size, ZERO_DECIMAL) - allocated_pending
            shortfall = after_stock - allocated_pending

            products = Product.objects.available().filter(
                species=catalog_species,
                pellet_size_mm=size,
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
