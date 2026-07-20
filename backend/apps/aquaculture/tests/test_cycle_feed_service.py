"""
Tests unitaires pour CycleFeedService.

Teste la logique métier pure sans HTTP :
- Agrégation SQL des FeedingPlans (besoins)
- Agrégation des commandes liées au cycle (commandé)
- Calcul sacs consommés et reste à commander
- Cas limites (cycle sans plan, sans commandes)
"""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from aquaculture.models import CycleFeedStockEntry, FeedingPlan, ProductionCycle
from aquaculture.services.cycle_feed_service import BAG_WEIGHT_KG, CycleFeedService
from commerce.models import Order, OrderItem, Product


@pytest.mark.django_db
class TestCycleFeedServiceNoFeedingPlans:
    """Cycle sans FeedingPlan : tous les compteurs doivent être à zéro."""

    def test_all_counters_zero(self, production_cycle):
        FeedingPlan.objects.filter(cycle=production_cycle).delete()

        result = CycleFeedService.get_feed_status(production_cycle)

        assert result["total_bags_needed"] == 0
        assert result["total_bags_ordered"] == 0
        assert result["bags_remaining_to_order"] == 0
        assert result["bags_by_product"] == []

    def test_consumed_cost_ignores_zero_valued_stock_entries(self, production_cycle):
        CycleFeedStockEntry.objects.create(
            cycle=production_cycle,
            source=CycleFeedStockEntry.SOURCE_MANUAL,
            label="Déclaration sans prix",
            quantity_kg=Decimal("100"),
            total_cost_fcfa=Decimal("0"),
            entry_date=date.today(),
        )
        assert CycleFeedService.get_consumed_cost(
            production_cycle,
            period_end=date.today(),
            consumed_kg=10,
            fallback_price_per_kg=1250,
        ) == pytest.approx(12500)


@pytest.mark.django_db
class TestCycleFeedServiceFeedingPlans:
    """Les plans hebdomadaires ne remplacent pas le besoin complet du cycle."""

    def _create_feeding_plan(self, cycle: ProductionCycle, week: int, daily_kg: float) -> FeedingPlan:
        start = date.today() + timedelta(weeks=week - 1)
        return FeedingPlan.objects.create(
            cycle=cycle,
            week_number=week,
            estimated_fish_count=950,
            average_weight=Decimal("35"),
            biomass=Decimal("33.25"),
            daily_feed_amount=Decimal(str(daily_kg)),
            feeding_rate=Decimal("1.5"),
            meals_per_day=2,
            feed_per_meal=Decimal(str(round(daily_kg / 2, 2))),
            recommended_feed_type="DIBAQ Tilapia 2mm",
            feed_size_mm=Decimal("2.0"),
            protein_percentage=32,
            start_date=start,
            end_date=start + timedelta(days=6),
        )

    def test_partial_weekly_plans_do_not_become_cycle_total(self, production_cycle):
        FeedingPlan.objects.filter(cycle=production_cycle).delete()
        before = CycleFeedService.compute_total_feed_needed_kg(production_cycle)
        self._create_feeding_plan(production_cycle, 1, 5.0)
        self._create_feeding_plan(production_cycle, 2, 3.0)
        assert CycleFeedService.compute_total_feed_needed_kg(production_cycle) == before


@pytest.mark.django_db
class TestCycleFeedServiceOrders:
    """Calcul des sacs commandés via Order.production_cycle."""

    def _create_product(self) -> Product:
        return Product.objects.create(
            brand="dibaq",
            name="DIBAQ Tilapia 2mm",
            species="tilapia",
            pellet_size_mm=Decimal("2.00"),
            package_weight_kg=BAG_WEIGHT_KG,
            price_per_package=Decimal("15000.00"),
        )

    def _create_order(self, user, farm_profile, cycle, number="ORD-TEST-0001") -> Order:
        return Order.objects.create(
            user=user,
            farm_profile=farm_profile,
            production_cycle=cycle,
            order_number=number,
            status="confirmed",
            delivery_method="pickup",
            pickup_location="ndokoti",
            delivery_name="Test Farmer",
            delivery_phone="+237691000002",
            delivery_region="Centre",
            delivery_city="Yaoundé",
            delivery_full_address="Yaoundé, Centre",
            subtotal=Decimal("30000.00"),
            delivery_fee=Decimal("0.00"),
            total=Decimal("30000.00"),
        )

    def test_bags_ordered_counted(self, authenticated_user, farm_profile, production_cycle):
        """bags_ordered = somme des quantités commandées pour ce cycle."""
        FeedingPlan.objects.filter(cycle=production_cycle).delete()
        product = self._create_product()
        order = self._create_order(authenticated_user, farm_profile, production_cycle)
        OrderItem.objects.create(
            order=order,
            product=product,
            product_name=product.name,
            unit_price=Decimal("15000.00"),
            quantity=3,
            line_total=Decimal("45000.00"),
        )

        result = CycleFeedService.get_feed_status(production_cycle)

        assert result["total_bags_ordered"] == 3
        assert len(result["bags_by_product"]) == 1
        assert result["bags_by_product"][0]["bags_ordered"] == 3

    def test_bags_remaining_cannot_be_negative(self, authenticated_user, farm_profile, production_cycle):
        """bags_remaining_to_order >= 0 même si plus commandé que nécessaire."""
        FeedingPlan.objects.filter(cycle=production_cycle).delete()
        product = self._create_product()
        order = self._create_order(authenticated_user, farm_profile, production_cycle)
        # Commande 100 sacs alors qu'aucun plan → total_bags_needed = 0
        OrderItem.objects.create(
            order=order,
            product=product,
            product_name=product.name,
            unit_price=Decimal("15000.00"),
            quantity=100,
            line_total=Decimal("1500000.00"),
        )

        result = CycleFeedService.get_feed_status(production_cycle)

        assert result["bags_remaining_to_order"] == 0

    def test_orders_not_linked_to_cycle_excluded(self, authenticated_user, farm_profile, production_cycle):
        """Les commandes sans production_cycle ne doivent pas être comptées."""
        FeedingPlan.objects.filter(cycle=production_cycle).delete()
        product = self._create_product()
        # Commande sans cycle lié
        order = self._create_order(authenticated_user, farm_profile, production_cycle, "ORD-TEST-0002")
        order.production_cycle = None
        order.save()
        OrderItem.objects.create(
            order=order,
            product=product,
            product_name=product.name,
            unit_price=Decimal("15000.00"),
            quantity=5,
            line_total=Decimal("75000.00"),
        )

        result = CycleFeedService.get_feed_status(production_cycle)

        assert result["total_bags_ordered"] == 0
