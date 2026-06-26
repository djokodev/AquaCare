"""
Service de calcul du statut des aliments pour un cycle de production.

Encapsule la logique métier de suivi des achats d'aliments :
- Calcul des sacs nécessaires depuis les FeedingPlans
- Agrégation des commandes liées au cycle
- Calcul des sacs consommés et du reste à commander

Architecture : Application service conforme DDD/Hexagonal.
  views.py → CycleFeedService.get_feed_status() → QuerySet ORM
"""
from __future__ import annotations

import math
from typing import TypedDict

from aquaculture.models import FeedingPlan, ProductionCycle
from commerce.models import OrderItem
from django.db.models import Sum

BAG_WEIGHT_KG = 25  # Poids standard d'un sac DIBAQ (kg)
DAYS_PER_WEEK = 7


class ProductFeedStatus(TypedDict):
    product_id: str
    product_name: str
    package_weight_kg: float
    bags_ordered: int


class CycleFeedStatusResult(TypedDict):
    total_bags_needed: int
    total_feed_needed_kg: float
    bags_by_product: list[ProductFeedStatus]
    total_bags_ordered: int
    total_feed_consumed_kg: float
    bags_consumed_equivalent: int
    bags_remaining_to_order: int


class CycleFeedService:
    """
    Service de suivi des aliments pour un cycle de production.

    Fournit le statut consolidé des achats d'aliments :
    - besoins (depuis FeedingPlans)
    - commandé (depuis Order/OrderItem liés au cycle)
    - consommé (depuis ProductionCycle.total_feed_consumed)
    - reste à commander

    Usage:
        status = CycleFeedService.get_feed_status(cycle)
    """

    @staticmethod
    def get_feed_status(cycle: ProductionCycle) -> CycleFeedStatusResult:
        """
        Calcule le statut des aliments pour un cycle de production.

        Args:
            cycle: Le cycle de production à analyser.

        Returns:
            CycleFeedStatusResult avec tous les compteurs de suivi.
        """
        total_feed_needed_kg = CycleFeedService._compute_total_feed_needed_kg(cycle)
        total_bags_needed = (
            math.ceil(total_feed_needed_kg / BAG_WEIGHT_KG) if total_feed_needed_kg else 0
        )

        bags_by_product, total_bags_ordered = CycleFeedService._compute_ordered_bags(cycle)

        feed_consumed_kg = float(cycle.total_feed_consumed or 0)
        bags_consumed_equivalent = math.floor(feed_consumed_kg / BAG_WEIGHT_KG)

        bags_remaining = max(0, total_bags_needed - total_bags_ordered)

        return {
            'total_bags_needed': total_bags_needed,
            'total_feed_needed_kg': round(total_feed_needed_kg, 2),
            'bags_by_product': list(bags_by_product.values()),
            'total_bags_ordered': total_bags_ordered,
            'total_feed_consumed_kg': feed_consumed_kg,
            'bags_consumed_equivalent': bags_consumed_equivalent,
            'bags_remaining_to_order': bags_remaining,
        }

    @staticmethod
    def _compute_total_feed_needed_kg(cycle: ProductionCycle) -> float:
        """
        Calcule le total kg d'aliment nécessaire.

        Priorité :
        1. Agrégation des FeedingPlans (données précises semaine par semaine)
        2. Fallback sur planned_feed_bags × BAG_WEIGHT_KG (valeur issue de la simulation)
        3. Estimation depuis les paramètres du cycle (FCR conservateur 1.5)
        """
        result = (
            FeedingPlan.objects
            .filter(cycle=cycle)
            .aggregate(total=Sum('daily_feed_amount'))
        )
        daily_total = float(result['total'] or 0)
        if daily_total > 0:
            return daily_total * DAYS_PER_WEEK

        if cycle.planned_feed_bags:
            return float(cycle.planned_feed_bags) * BAG_WEIGHT_KG

        return CycleFeedService._estimate_feed_from_cycle_params(cycle)

    @staticmethod
    def _estimate_feed_from_cycle_params(cycle: ProductionCycle) -> float:
        """
        Estimation de la quantité d'aliment depuis les paramètres du cycle.

        Utilisé quand ni FeedingPlan ni planned_feed_bags ne sont disponibles
        (ex. cycle créé avant la migration ou sans simulation préalable).

        Délègue à CycleSimulationService pour utiliser les mêmes phases et
        produits DIBAQ que la simulation annuelle — calcul cohérent garanti.
        """
        if not cycle.initial_count or not cycle.target_harvest_weight_g:
            return 0.0

        try:
            from commerce.services.cycle_simulation_service import CycleSimulationService  # noqa: PLC0415
            survival_rate = float(cycle.expected_survival_rate_pct or 95) / 100
            cycle_sim = CycleSimulationService.simulate_cycle(
                species=cycle.species,
                initial_fish_count=cycle.initial_count,
                target_weight_g=float(cycle.target_harvest_weight_g),
                cycle_duration_days=cycle.planned_cycle_duration_days or 180,
                survival_rate=survival_rate,
                selling_price_per_kg_fcfa=float(cycle.planned_selling_price_per_kg_fcfa or 2800),
                fingerlings_cost_fcfa=float(cycle.fingerlings_cost_fcfa or 0),
                other_costs_fcfa=float(cycle.other_operational_costs_fcfa or 0),
            )
            total_bags = sum(
                p['quantity_bags']
                for phase in cycle_sim.get('feeding_phases', [])
                for p in phase.get('products', [])
            )
            return float(total_bags) * BAG_WEIGHT_KG
        except Exception:
            return 0.0

    @staticmethod
    def _compute_ordered_bags(cycle: ProductionCycle) -> tuple[dict[str, ProductFeedStatus], int]:
        """Agrège les sacs commandés par produit pour ce cycle."""
        order_items = (
            OrderItem.objects
            .filter(order__production_cycle=cycle)
            .select_related('product')
        )

        bags_by_product: dict[str, ProductFeedStatus] = {}
        for item in order_items:
            pid = str(item.product.id)
            if pid not in bags_by_product:
                bags_by_product[pid] = {
                    'product_id': pid,
                    'product_name': item.product.name,
                    'package_weight_kg': float(item.product.package_weight_kg),
                    'bags_ordered': 0,
                }
            bags_by_product[pid]['bags_ordered'] += item.quantity

        total_bags_ordered = sum(p['bags_ordered'] for p in bags_by_product.values())
        return bags_by_product, total_bags_ordered
