"""
Tests unitaires pour les API ViewSets.
Coverage: ProductViewSet, OrderViewSet endpoints.
"""
import pytest
from datetime import date
from decimal import Decimal
from rest_framework.test import APIClient
from rest_framework import status

from commerce.models import Product, Order
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
        assert response.data["count"] >= 1
        assert len(response.data["results"]) >= 1

    def test_order_statistics_endpoint(self, authenticated_client, test_farm, test_product):
        authenticated_client.post("/api/commerce/orders/", {
            "items": [{"product_id": str(test_product.id), "quantity": 1}],
            "delivery_method": "home"
        }, format="json")
        response = authenticated_client.get("/api/commerce/orders/statistics/")
        assert response.status_code == status.HTTP_200_OK
        assert "total_orders" in response.data

    def test_order_mutation_methods_are_blocked(self, authenticated_client, test_farm, test_product):
        create_response = authenticated_client.post("/api/commerce/orders/", {
            "items": [{"product_id": str(test_product.id), "quantity": 1}],
            "delivery_method": "home"
        }, format="json")
        order_id = create_response.data["id"]

        put_response = authenticated_client.put(
            f"/api/commerce/orders/{order_id}/",
            {"delivery_method": "pickup"},
            format="json",
        )
        patch_response = authenticated_client.patch(
            f"/api/commerce/orders/{order_id}/",
            {"delivery_method": "pickup"},
            format="json",
        )
        delete_response = authenticated_client.delete(f"/api/commerce/orders/{order_id}/")

        assert put_response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
        assert patch_response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
        assert delete_response.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

    def test_retrieve_order_cross_user_denied(self, api_client, test_farm, test_product):
        """Un utilisateur B ne peut pas accéder à la commande d'un utilisateur A."""
        user_b = User.objects.create_user(
            phone_number="+237999888777",
            password="testpass123",
            first_name="User",
            last_name="B",
            age_group="26_35"
        )
        FarmProfile.objects.get_or_create(user=user_b, defaults={"farm_name": "Farm B"})

        # Créer commande pour user_a (test_user via authenticated_client)
        client_a = APIClient()
        client_a.force_authenticate(user=test_farm.user)
        create_resp = client_a.post("/api/commerce/orders/", {
            "items": [{"product_id": str(test_product.id), "quantity": 1}],
            "delivery_method": "home"
        }, format="json")
        assert create_resp.status_code == status.HTTP_201_CREATED
        order_id = create_resp.data["id"]

        # User B tente d'accéder à la commande de User A → 404 (filtré par queryset)
        client_b = APIClient()
        client_b.force_authenticate(user=user_b)
        response = client_b.get(f"/api/commerce/orders/{order_id}/")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_for_cycle_cross_user_denied(self, api_client, test_farm, test_product):
        """Un utilisateur B ne peut pas accéder aux suggestions produits du cycle d'un utilisateur A."""
        from aquaculture.models import ProductionCycle

        user_a = test_farm.user
        user_b = User.objects.create_user(
            phone_number="+237666555444",
            password="testpass123",
            first_name="User",
            last_name="B",
            age_group="26_35"
        )

        # Créer un cycle avec les vrais champs du modèle ProductionCycle pour user_a
        cycle_a = ProductionCycle.objects.create(
            farm_profile=test_farm,
            cycle_name="Cycle Test A",
            species="tilapia",
            pond_identifier="Bassin A",
            start_date=date(2025, 1, 1),
            initial_count=1000,
            initial_average_weight=Decimal("5.0"),
            initial_biomass=Decimal("5.0"),
            current_count=1000,
            current_average_weight=Decimal("5.0"),
            current_biomass=Decimal("5.0"),
        )

        # User B tente d'accéder aux suggestions produits du cycle de User A → 404
        # (filtré par farm_profile__user=request.user dans la vue)
        client_b = APIClient()
        client_b.force_authenticate(user=user_b)
        response = client_b.get(f"/api/commerce/products/for_cycle/{cycle_a.id}/")
        assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]

    def test_create_order_empty_items(self, authenticated_client, test_farm):
        """Commande avec items vides → 400."""
        response = authenticated_client.post("/api/commerce/orders/", {
            "items": [],
            "delivery_method": "home"
        }, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_order_invalid_pickup_location(self, authenticated_client, test_farm, test_product):
        """Commande avec point de retrait invalide → 400."""
        response = authenticated_client.post("/api/commerce/orders/", {
            "items": [{"product_id": str(test_product.id), "quantity": 1}],
            "delivery_method": "pickup",
            "pickup_location": "marche_inconnu"
        }, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_notification_failure_does_not_break_order(
        self, authenticated_client, test_farm, test_product, monkeypatch
    ):
        """Échec du service de notification ne doit pas annuler la création de commande."""
        from commerce.services import order_service as os_module

        def failing_notification(order):
            raise RuntimeError("Service de notification indisponible")

        monkeypatch.setattr(
            os_module.OrderService, "_create_order_notification", staticmethod(failing_notification)
        )

        response = authenticated_client.post("/api/commerce/orders/", {
            "items": [{"product_id": str(test_product.id), "quantity": 1}],
            "delivery_method": "home"
        }, format="json")
        # La commande doit être créée malgré l'échec de la notification
        assert response.status_code == status.HTTP_201_CREATED
        assert "order_number" in response.data
