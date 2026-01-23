"""
Tests unitaires pour les services commerce.
Coverage: ProductService, OrderService, FeedingSuggestionService.
"""
import pytest
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone

from commerce.models import Product
from commerce.services import ProductService, OrderService, FeedingSuggestionService
from accounts.models import User, FarmProfile
from apps.aquaculture.models import ProductionCycle


@pytest.mark.django_db
class TestProductService:
    """Tests pour ProductService."""

    @pytest.fixture
    def tilapia_products(self):
        Product.objects.create(
            name="ALLER AQUA TILAPIA 1MM 20KG",
            brand="aller_aqua",
            species="tilapia",
            phase="alevinage",
            pellet_size_mm=Decimal("1.0"),
            protein_percentage=Decimal("45.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("35000.00")
        )
        Product.objects.create(
            name="ALLER AQUA TILAPIA 3MM 20KG",
            brand="aller_aqua",
            species="tilapia",
            phase="grossissement",
            pellet_size_mm=Decimal("3.0"),
            protein_percentage=Decimal("32.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("30000.00")
        )

    def test_get_all_products(self, tilapia_products):
        products = ProductService.get_all_products(include_unavailable=False)
        assert products.count() == 2

    def test_filter_by_species(self, tilapia_products):
        products = ProductService.filter_by_species("tilapia")
        assert products.count() == 2

    def test_get_recommended_product(self, tilapia_products):
        product = ProductService.get_recommended_product("tilapia", 2.0)
        assert product is not None
        assert product.pellet_size_mm == Decimal("1.0")


@pytest.mark.django_db
class TestOrderService:
    """Tests pour OrderService."""

    @pytest.fixture
    def test_user(self):
        return User.objects.create_user(
            phone_number="+237111222333",
            password="testpass123",
            first_name="Test",
            last_name="User",
            age_group="26_35"
        )

    @pytest.fixture
    def test_farm(self, test_user):
        farm_profile, _ = FarmProfile.objects.get_or_create(user=test_user, defaults={"farm_name": "Test Farm"})
        return farm_profile

    @pytest.fixture
    def test_product(self):
        return Product.objects.create(
            name="Product 1",
            brand="aller_aqua",
            species="tilapia",
            phase="grossissement",
            pellet_size_mm=Decimal("3.0"),
            protein_percentage=Decimal("32.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("30000.00")
        )

    def test_create_order_with_delivery(self, test_user, test_farm, test_product):
        items_data = [{"product_id": str(test_product.id), "quantity": 2}]
        order = OrderService.create_order(
            user=test_user,
            items_data=items_data,
            delivery_method="home"
        )
        assert order.user == test_user
        assert order.farm_profile == test_farm
        assert order.items.count() == 1
        assert order.subtotal == Decimal("60000.00")

    def test_calculate_delivery_fee_below_threshold(self, test_user, test_product):
        items_data = [{"product_id": str(test_product.id), "quantity": 2}]
        preview = OrderService.calculate_delivery_fee_preview(test_user, items_data, "home")
        assert preview['delivery_fee'] == Decimal("3000.00")
        assert preview['subtotal'] == Decimal("60000.00")

    def test_calculate_delivery_fee_above_threshold(self, test_user, test_product):
        # Règle: Livraison gratuite à Douala si >= 20 sacs
        test_user.region = "littoral"  # Douala (minuscule)
        test_user.save()

        items_data = [{"product_id": str(test_product.id), "quantity": 20}]  # 20 sacs >= seuil
        preview = OrderService.calculate_delivery_fee_preview(test_user, items_data, "home")
        assert preview['delivery_fee'] == Decimal("0.00")  # Gratuit (20+ sacs à Douala)
        assert preview['subtotal'] == Decimal("600000.00")  # 20×30000


@pytest.mark.django_db
class TestFeedingSuggestionService:
    """Tests pour FeedingSuggestionService."""

    @pytest.fixture
    def test_user(self):
        return User.objects.create_user(
            phone_number="+237444555666",
            password="testpass123",
            first_name="Test",
            last_name="User",
            age_group="26_35"
        )

    @pytest.fixture
    def test_farm(self, test_user):
        farm_profile, _ = FarmProfile.objects.get_or_create(user=test_user, defaults={"farm_name": "Test Farm"})
        return farm_profile

    @pytest.fixture
    def test_cycle(self, test_user, test_farm):
        return ProductionCycle.objects.create(
            user=test_user,
            farm_profile=test_farm,
            species="tilapia",
            initial_fish_count=1000,
            start_date=timezone.now().date() - timedelta(days=30),
            planned_harvest_date=timezone.now().date() + timedelta(days=60),
            status="active"
        )

    def test_get_feeding_suggestions_no_cycles(self, test_user):
        result = FeedingSuggestionService.get_feeding_suggestions(test_user.id)
        assert result["has_suggestions"] is False

    def test_calculate_confidence_high(self):
        confidence = FeedingSuggestionService._calculate_confidence(3, 3)
        assert confidence >= 90
