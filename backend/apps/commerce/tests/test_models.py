"""
Tests unitaires pour les modeles Product et Order du module commerce.
Coverage: Creation, validation, contraintes, methodes metier.
"""
from decimal import Decimal

import pytest
from accounts.models import FarmProfile, User
from commerce.models import Order, OrderItem, Product
from django.core.exceptions import ValidationError


@pytest.mark.django_db
class TestProductModel:
    """Tests pour le modele Product."""

    def test_create_product_success(self):
        """Test creation produit avec donnees valides."""
        product = Product.objects.create(
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

        assert product.name == "ALLER AQUA TILAPIA 3MM 20KG"
        assert product.brand == "aller_aqua"
        assert product.species == "tilapia"
        assert product.is_available is True

    def test_product_price_per_kg(self):
        """Test calcul automatique prix au kg."""
        product = Product.objects.create(
            name="Test Product",
            brand="aller_aqua",
            species="tilapia",
            phase="grossissement",
            pellet_size_mm=Decimal("3.0"),
            protein_percentage=Decimal("32.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("30000.00")
        )
        assert product.price_per_kg == Decimal("1500.00")

    def test_product_negative_price_validation(self):
        """Test validation prix negatif interdit."""
        product = Product(
            name="Test Product",
            brand="aller_aqua",
            species="tilapia",
            phase="grossissement",
            pellet_size_mm=Decimal("3.0"),
            protein_percentage=Decimal("32.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("-100.00")
        )
        with pytest.raises(ValidationError):
            product.full_clean()

    def test_product_zero_weight_validation(self):
        """Test validation poids zero interdit."""
        product = Product(
            name="Test Product",
            brand="aller_aqua",
            species="tilapia",
            phase="grossissement",
            pellet_size_mm=Decimal("3.0"),
            protein_percentage=Decimal("32.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("0.0"),
            price_per_package=Decimal("30000.00")
        )
        with pytest.raises(ValidationError):
            product.full_clean()


@pytest.mark.django_db
class TestOrderModel:
    """Tests pour le modele Order."""

    @pytest.fixture
    def test_user(self):
        return User.objects.create_user(
            phone_number="+237123456789",
            password="testpass123",
            first_name="Test",
            last_name="User",
            age_group="26_35"
        )

    @pytest.fixture
    def test_farm(self, test_user):
        farm_profile, _ = FarmProfile.objects.get_or_create(
            user=test_user,
            defaults={'farm_name': 'Test Farm'}
        )
        return farm_profile

    @pytest.fixture
    def test_product(self):
        return Product.objects.create(
            name="Test Product",
            brand="aller_aqua",
            species="tilapia",
            phase="grossissement",
            pellet_size_mm=Decimal("3.0"),
            protein_percentage=Decimal("32.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("30000.00")
        )

    def test_create_order_with_items(self, test_user, test_farm, test_product):
        """Test creation commande avec items."""
        order = Order.objects.create(
            user=test_user,
            farm_profile=test_farm,
            order_number="ORD-20250112-0001",
            delivery_method="home",
            delivery_name=f"{test_user.first_name} {test_user.last_name}",
            delivery_phone=test_user.phone_number,
            delivery_region="Littoral",
            delivery_city="Douala",
            delivery_full_address="Douala, Littoral, Cameroun",
            subtotal=Decimal("60000.00"),
            delivery_fee=Decimal("3000.00"),
            total=Decimal("63000.00")
        )
        OrderItem.objects.create(
            order=order,
            product=test_product,
            product_name=test_product.name,
            quantity=2,
            unit_price=Decimal("30000.00"),
            line_total=Decimal("60000.00")
        )
        assert order.items.count() == 1
        assert order.status == "confirmed"  # Default status est "confirmed" pas "pending"

    def test_order_number_generation(self, test_user, test_farm):
        """Test generation automatique numero commande."""
        order = Order.objects.create(
            user=test_user,
            farm_profile=test_farm,
            order_number="ORD-20250112-0002",
            delivery_method="home",
            delivery_name=f"{test_user.first_name} {test_user.last_name}",
            delivery_phone=test_user.phone_number,
            delivery_region="Littoral",
            delivery_city="Douala",
            delivery_full_address="Douala, Littoral, Cameroun",
            subtotal=Decimal("60000.00"),
            delivery_fee=Decimal("3000.00"),
            total=Decimal("63000.00")
        )
        assert order.order_number.startswith("ORD-")
        assert len(order.order_number) == 17
