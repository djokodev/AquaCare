"""Façade de compatibilité du moteur alimentaire exact."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, TypedDict

from aquaculture.models import ProductionCycle
from commerce.models import OrderItem


class ProductFeedStatus(TypedDict):
    product_id: str
    product_name: str
    package_weight_kg: str | None
    bags_ordered: int


class CycleFeedStatusResult(TypedDict):
    cycle_id: str
    calculation_status: str
    total_bags_needed: int | None
    total_feed_needed_kg: str | None
    bags_by_product: list[ProductFeedStatus]
    total_bags_ordered: int
    total_feed_consumed_kg: str
    bags_consumed_equivalent: None
    bags_remaining_to_order: int | None


class CycleFeedPhasesResult(TypedDict):
    feeding_phases: list[dict[str, Any]]


class CycleFeedService:
    """Expose le nouveau moteur aux anciens consommateurs sans sac standard."""

    @staticmethod
    def get_feed_status(cycle: ProductionCycle) -> CycleFeedStatusResult:
        from .cycle_feed_recommendation_service import CycleFeedRecommendationService

        recommendation = CycleFeedRecommendationService.build(cycle)
        available = recommendation['status'] != 'unavailable'
        total_bags = (
            sum(phase['total_bags'] or 0 for phase in recommendation['feeding_phases'])
            if available
            else None
        )
        bags_by_product, total_bags_ordered = CycleFeedService._compute_ordered_bags(cycle)
        summary = recommendation['summary']
        return {
            'cycle_id': str(cycle.id),
            'calculation_status': recommendation['status'],
            # Champs conservés pour compatibilité ; ils sont désormais calculés
            # depuis les vrais conditionnements par phase.
            'total_bags_needed': total_bags,
            'total_feed_needed_kg': summary.get('planned_total_feed_kg'),
            'bags_by_product': list(bags_by_product.values()),
            'total_bags_ordered': total_bags_ordered,
            'total_feed_consumed_kg': str(
                Decimal(str(cycle.total_feed_consumed or 0)).quantize(Decimal('0.01'))
            ),
            'bags_consumed_equivalent': None,
            'bags_remaining_to_order': total_bags,
        }

    @staticmethod
    def get_consumed_cost(
        cycle: ProductionCycle,
        *,
        period_end: date,
        consumed_kg: float,
        fallback_price_per_kg: float,
    ) -> float:
        """Valorise la consommation au coût moyen du stock reçu."""
        quantity = max(float(consumed_kg or 0), 0)
        if quantity <= 0:
            return 0.0
        entries = cycle.feed_stock_entries.filter(
            entry_date__lte=period_end,
            quantity_kg__gt=0,
            total_cost_fcfa__gt=0,
        )
        received_kg = sum(float(entry.quantity_kg) for entry in entries)
        received_cost = sum(float(entry.total_cost_fcfa) for entry in entries)
        unit_price = received_cost / received_kg if received_kg > 0 else float(
            fallback_price_per_kg or 0
        )
        return round(max(0.0, quantity * unit_price), 2)

    @staticmethod
    def get_feed_phases(cycle: ProductionCycle) -> CycleFeedPhasesResult:
        from .cycle_feed_recommendation_service import CycleFeedRecommendationService

        return CycleFeedRecommendationService.build(cycle)

    @staticmethod
    def compute_total_feed_needed_kg(cycle: ProductionCycle) -> Decimal | None:
        from .cycle_feed_recommendation_service import CycleFeedRecommendationService

        plan = CycleFeedRecommendationService.ensure_plan(cycle)
        return plan.total_feed_kg if plan else None

    @staticmethod
    def _compute_ordered_bags(
        cycle: ProductionCycle,
    ) -> tuple[dict[str, ProductFeedStatus], int]:
        """Agrège les commandes non annulées à partir de leurs snapshots."""
        order_items = OrderItem.objects.filter(
            order__production_cycle=cycle,
            order__status__in=['confirmed', 'ready_for_pickup', 'delivered', 'received'],
        ).select_related('product')

        bags_by_product: dict[str, ProductFeedStatus] = {}
        for item in order_items:
            product_id = str(item.product_id)
            if product_id not in bags_by_product:
                package = item.product_package_weight_kg_snapshot
                if package is None:
                    package = item.product.package_weight_kg
                bags_by_product[product_id] = {
                    'product_id': product_id,
                    'product_name': item.product_name,
                    'package_weight_kg': str(package) if package is not None else None,
                    'bags_ordered': 0,
                }
            bags_by_product[product_id]['bags_ordered'] += item.quantity

        return bags_by_product, sum(
            product['bags_ordered'] for product in bags_by_product.values()
        )
