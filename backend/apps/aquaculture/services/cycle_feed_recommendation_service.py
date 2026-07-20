"""Prévision et couverture alimentaire phase par phase."""

from __future__ import annotations

import math
from datetime import timedelta
from decimal import Decimal
from typing import Any

from commerce.models import OrderItem, Product
from commerce.services.cycle_simulation_service import CycleSimulationService
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from ..models import CycleFeedPlan, CycleLog, ProductionCycle
from .cycle_store_service import ZERO_DECIMAL, CycleStoreService


class CycleFeedRecommendationService:
    """Construit une recommandation déterministe à partir du cycle réel."""

    @staticmethod
    def _decimal(value: Any) -> Decimal:
        return Decimal(str(value or 0))

    @staticmethod
    def _catalog_species(species: str) -> str:
        return 'catfish' if species == 'clarias' else species

    @classmethod
    def _simulation(cls, cycle: ProductionCycle, *, current: bool) -> dict[str, Any]:
        if not cycle.initial_count or not cycle.target_harvest_weight_g:
            return {}
        if current:
            start_weight = cycle.current_average_weight
            count = cycle.current_count
            planned_end = cycle.planned_harvest_date or (
                cycle.start_date + timedelta(days=cycle.planned_cycle_duration_days or 180)
            )
            latest_log_date = cycle.logs.order_by('-log_date').values_list('log_date', flat=True).first()
            consumed_today = latest_log_date is not None and latest_log_date >= timezone.localdate()
            duration = max((planned_end - timezone.localdate()).days - int(consumed_today), 1)
            survival_rate = 1.0
        else:
            start_weight = cycle.initial_average_weight
            count = cycle.initial_count
            duration = cycle.planned_cycle_duration_days or 180
            survival_rate = float(cycle.expected_survival_rate_pct or 95) / 100
        if not start_weight or not count or Decimal(str(start_weight)) >= cycle.target_harvest_weight_g:
            return {}
        return CycleSimulationService.simulate_cycle(
            species=cycle.species,
            initial_fish_count=count,
            initial_weight_g=float(start_weight),
            target_weight_g=float(cycle.target_harvest_weight_g),
            cycle_duration_days=duration,
            survival_rate=survival_rate,
            selling_price_per_kg_fcfa=float(cycle.planned_selling_price_per_kg_fcfa or 2800),
            fingerlings_cost_fcfa=float(cycle.fingerlings_cost_fcfa or 0),
            other_costs_fcfa=float(cycle.other_operational_costs_fcfa or 0),
        )

    @staticmethod
    def _json_safe(value: Any) -> Any:
        if isinstance(value, Decimal):
            return str(value)
        if isinstance(value, dict):
            return {key: CycleFeedRecommendationService._json_safe(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [CycleFeedRecommendationService._json_safe(item) for item in value]
        return value

    @classmethod
    @transaction.atomic
    def ensure_plan(cls, cycle: ProductionCycle) -> CycleFeedPlan | None:
        existing = CycleFeedPlan.objects.filter(cycle=cycle).first()
        if existing:
            return existing
        simulation = cls._simulation(cycle, current=False)
        if not simulation:
            return None
        return CycleFeedPlan.objects.create(
            cycle=cycle,
            parameters=cls._json_safe(simulation['parameters']),
            phases=cls._json_safe(simulation['feeding_phases']),
            total_feed_kg=cls._decimal(simulation['summary']['total_feed_kg']).quantize(Decimal('0.01')),
        )

    @classmethod
    def build(cls, cycle: ProductionCycle) -> dict[str, Any]:
        plan = cls.ensure_plan(cycle)
        simulation = cls._simulation(cycle, current=True)
        if plan is None:
            return {
                'cycle_id': str(cycle.id),
                'status': 'unavailable',
                'source': 'cycle_progress',
                'calculated_at': timezone.now(),
                'summary': {},
                'feeding_phases': [],
                'warnings': ['feed_estimate_unavailable'],
            }

        if not simulation:
            target_reached = (
                cycle.current_count == 0
                or (
                    cycle.current_average_weight
                    and cycle.target_harvest_weight_g
                    and cycle.current_average_weight >= cycle.target_harvest_weight_g
                )
            )
            if not target_reached:
                return {
                    'cycle_id': str(cycle.id),
                    'status': 'unavailable',
                    'source': 'cycle_progress',
                    'calculated_at': timezone.now(),
                    'summary': {},
                    'feeding_phases': [],
                    'warnings': ['feed_estimate_unavailable'],
                }
            unclassified = cycle.feed_stock_entries.filter(feed_reference__isnull=True).aggregate(
                total=Sum('quantity_kg')
            )['total'] or ZERO_DECIMAL
            warnings = ['unclassified_stock'] if unclassified > 0 else []
            return {
                'cycle_id': str(cycle.id),
                'status': 'incomplete' if warnings else 'available',
                'source': 'cycle_progress',
                'calculated_at': timezone.now(),
                'summary': {
                    'planned_total_feed_kg': str(plan.total_feed_kg),
                    'estimated_remaining_need_kg': '0.00',
                    'compatible_stock_kg': '0.00',
                    'pending_order_kg': '0.00',
                    'feed_to_order_kg': '0.00',
                    'unclassified_stock_kg': str(unclassified.quantize(Decimal('0.01'))),
                },
                'feeding_phases': [],
                'warnings': warnings,
            }

        entries = list(cycle.feed_stock_entries.for_api().order_by('entry_date', 'created_at'))
        tracking_date = CycleStoreService._get_stock_tracking_started_at(entries)
        stock_items = CycleStoreService._build_stock_items(
            cycle=cycle,
            entries=entries,
            stock_tracking_started_at=tracking_date,
        )
        stock_by_size: dict[Decimal, Decimal] = {}
        for item in stock_items:
            if item['feed_reference_id'] and item['species'] == cycle.species and item['feed_size_mm']:
                size = cls._decimal(item['feed_size_mm'])
                stock_by_size[size] = stock_by_size.get(size, ZERO_DECIMAL) + cls._decimal(
                    item['quantity_available_kg']
                )

        pending_by_size: dict[Decimal, Decimal] = {}
        pending_items = OrderItem.objects.filter(
            order__production_cycle=cycle,
            order__status__in=['confirmed', 'ready_for_pickup', 'delivered'],
        ).select_related('product')
        for item in pending_items:
            size = item.product_pellet_size_mm_snapshot or item.product.pellet_size_mm
            package = item.product_package_weight_kg_snapshot or item.product.package_weight_kg
            if size is not None:
                decimal_size = cls._decimal(size)
                pending_by_size[decimal_size] = pending_by_size.get(decimal_size, ZERO_DECIMAL) + (
                    cls._decimal(package) * item.quantity
                )

        consumed_by_size: dict[Decimal, Decimal] = {}
        logs = CycleLog.objects.filter(cycle=cycle, feed_quantity__gt=0, feed_size_mm__isnull=False)
        for row in logs.values('feed_size_mm').annotate(total=Sum('feed_quantity')):
            consumed_by_size[cls._decimal(row['feed_size_mm'])] = cls._decimal(row['total'])

        phases = []
        total_remaining = ZERO_DECIMAL
        total_stock = ZERO_DECIMAL
        total_pending = ZERO_DECIMAL
        total_shortfall = ZERO_DECIMAL
        catalog_species = cls._catalog_species(cycle.species)
        for raw_phase in simulation['feeding_phases']:
            size = cls._decimal(raw_phase['pellet_size_mm'])
            required = cls._decimal(raw_phase['total_consumption_kg']).quantize(Decimal('0.01'))
            allocated_stock = min(stock_by_size.get(size, ZERO_DECIMAL), required)
            stock_by_size[size] = stock_by_size.get(size, ZERO_DECIMAL) - allocated_stock
            after_stock = required - allocated_stock
            allocated_pending = min(pending_by_size.get(size, ZERO_DECIMAL), after_stock)
            pending_by_size[size] = pending_by_size.get(size, ZERO_DECIMAL) - allocated_pending
            shortfall = max(after_stock - allocated_pending, ZERO_DECIMAL)

            product = Product.objects.available().filter(
                species=catalog_species,
                pellet_size_mm=size,
            ).order_by('-package_weight_kg', 'price_per_package').first()
            package_weight = cls._decimal(product.package_weight_kg) if product else ZERO_DECIMAL
            bags = math.ceil(shortfall / package_weight) if product and shortfall > 0 else 0
            ordered_kg = package_weight * bags
            product_payload = None
            if product:
                product_payload = {
                    'product_id': str(product.id),
                    'product_name': product.name,
                    'package_weight_kg': float(product.package_weight_kg),
                    'quantity_bags': bags,
                    'total_kg': float(ordered_kg),
                    'unit_price': float(product.price_per_package),
                    'total_price': float(product.price_per_package * bags),
                    'brand': product.brand,
                    'species': product.species,
                    'pellet_size_mm': float(product.pellet_size_mm),
                }
            phase_payload = {
                'phase_name': raw_phase['phase_name'],
                'days_range': raw_phase['days_range'],
                'weight_range_g': raw_phase['weight_range_g'],
                'pellet_size_mm': raw_phase['pellet_size_mm'],
                'duration_days': raw_phase['duration_days'],
                'remaining_need_kg': str(required),
                'consumed_kg': str(consumed_by_size.get(size, ZERO_DECIMAL).quantize(Decimal('0.01'))),
                'allocated_stock_kg': str(allocated_stock.quantize(Decimal('0.01'))),
                'allocated_pending_kg': str(allocated_pending.quantize(Decimal('0.01'))),
                'shortfall_kg': str(shortfall.quantize(Decimal('0.01'))),
                'surplus_kg': str(max(ordered_kg - shortfall, ZERO_DECIMAL).quantize(Decimal('0.01'))),
                'products': [product_payload] if product_payload and bags else [],
                'total_bags': bags,
                'total_price': float(product.price_per_package * bags) if product else 0.0,
                'product_available': product is not None,
            }
            phases.append(phase_payload)
            total_remaining += required
            total_stock += allocated_stock
            total_pending += allocated_pending
            total_shortfall += shortfall

        unclassified = sum(
            (entry.quantity_kg for entry in entries if entry.feed_reference_id is None),
            ZERO_DECIMAL,
        )
        warnings = ['unclassified_stock'] if unclassified > 0 else []
        return {
            'cycle_id': str(cycle.id),
            'status': 'incomplete' if warnings else 'available',
            'source': 'current_cycle_reforecast',
            'calculated_at': timezone.now(),
            'summary': {
                'planned_total_feed_kg': str(plan.total_feed_kg),
                'estimated_remaining_need_kg': str(total_remaining.quantize(Decimal('0.01'))),
                'compatible_stock_kg': str(total_stock.quantize(Decimal('0.01'))),
                'pending_order_kg': str(total_pending.quantize(Decimal('0.01'))),
                'feed_to_order_kg': str(total_shortfall.quantize(Decimal('0.01'))),
                'unclassified_stock_kg': str(unclassified.quantize(Decimal('0.01'))),
            },
            'feeding_phases': phases,
            'warnings': warnings,
        }
