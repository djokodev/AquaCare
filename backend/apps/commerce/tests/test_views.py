"""
Tests unitaires pour les API ViewSets.
Coverage: ProductViewSet, OrderViewSet endpoints.
"""
import pytest
from decimal import Decimal
from rest_framework.test import APIClient
from rest_framework import status

from apps.commerce.models import Product
from accounts.models import User, FarmProfile


@pytest.mark.django_db
class TestProductViewSet:
    """Tests pour ProductViewSet endpoints."""

    @pytest.fixture
    def api_client(self):
        return APIClient()

    @pytest.fixture
    def test_user(self):
        return User.objects.create_user(
            phone_number="+237777888999",
            password="testpass123",
            first_name="Test",
            last_name="User",
            age_group="26_35"
        )

    @pytest.fixture
    def authenticated_client(self, api_client, test_user):
        api_client.force_authenticate(user=test_user)
        return api_client

    @pytest.fixture
    def test_products(self):
        Product.objects.create(
            name="TILAPIA 3MM 20KG",
            brand="aller_aqua",
            species="tilapia",
            phase="grossissement",
            pellet_size_mm=Decimal("3.0"),
            protein_percentage=Decimal("32.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("30000.00"),
            is_available=True
        )
        Product.objects.create(
            name="CLARIAS 4MM 20KG",
            brand="dibaq",
            species="catfish",
            phase="grossissement",
            pellet_size_mm=Decimal("4.0"),
            protein_percentage=Decimal("35.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("32000.00"),
            is_available=True
        )

    def test_list_products_unauthenticated(self, api_client, test_products):
        response = api_client.get("/api/commerce/products/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_products_authenticated(self, authenticated_client, test_products):
        response = authenticated_client.get("/api/commerce/products/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 2
        assert len(response.data['results']) == 2

    def test_filter_products_by_species(self, authenticated_client, test_products):
        response = authenticated_client.get("/api/commerce/products/?species=tilapia")
        assert response.status_code == status.HTTP_200_OK
        assert response.data['count'] == 1
        assert len(response.data['results']) == 1

    def test_feeding_suggestions_no_cycles(self, authenticated_client):
        response = authenticated_client.get("/api/commerce/products/feeding_suggestions/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["has_suggestions"] is False


@pytest.mark.django_db
class TestOrderViewSet:
    """Tests pour OrderViewSet endpoints."""

    @pytest.fixture
    def api_client(self):
        return APIClient()

    @pytest.fixture
    def test_user(self):
        return User.objects.create_user(
            phone_number="+237100200300",
            password="testpass123",
            first_name="Test",
            last_name="User",
            age_group="26_35"
        )

    @pytest.fixture
    def test_farm(self, test_user):
        farm_profile, _ = FarmProfile.objects.get_or_create(user=test_user, defaults={"farm_name": "Order Test Farm"})
        return farm_profile

    @pytest.fixture
    def authenticated_client(self, api_client, test_user):
        api_client.force_authenticate(user=test_user)
        return api_client

    @pytest.fixture
    def test_product(self):
        return Product.objects.create(
            name="Test Product Order",
            brand="aller_aqua",
            species="tilapia",
            phase="grossissement",
            pellet_size_mm=Decimal("3.0"),
            protein_percentage=Decimal("32.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("30000.00")
        )

    def test_create_order_unauthenticated(self, api_client, test_product):
        response = api_client.post("/api/commerce/orders/", {
            "items": [{"product_id": str(test_product.id), "quantity": 1}],
            "delivery_method": "home"
        }, format="json")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_create_order_success(self, authenticated_client, test_farm, test_product):
        response = authenticated_client.post("/api/commerce/orders/", {
            "items": [{"product_id": str(test_product.id), "quantity": 2}],
            "delivery_method": "home"
        }, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert "order_number" in response.data

    def test_list_user_orders(self, authenticated_client, test_farm, test_product):
        authenticated_client.post("/api/commerce/orders/", {
            "items": [{"product_id": str(test_product.id), "quantity": 1}],
            "delivery_method": "home"
        }, format="json")
        response = authenticated_client.get("/api/commerce/orders/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_order_statistics_endpoint(self, authenticated_client, test_farm, test_product):
        authenticated_client.post("/api/commerce/orders/", {
            "items": [{"product_id": str(test_product.id), "quantity": 1}],
            "delivery_method": "home"
        }, format="json")
        response = authenticated_client.get("/api/commerce/orders/statistics/")
        assert response.status_code == status.HTTP_200_OK
        assert "total_orders" in response.data
