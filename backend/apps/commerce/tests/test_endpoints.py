"""
Tests d'intégration pour tous les endpoints du module commerce.
Vérifie la logique métier et la cohérence des réponses.
"""
import pytest
from decimal import Decimal
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model

from apps.accounts.models import FarmProfile
from apps.commerce.models import Product, Order

User = get_user_model()


@pytest.mark.django_db
class TestProductEndpoints:
    """Tests pour endpoints ProductViewSet."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup pour tous les tests."""
        self.client = APIClient()

        # Créer utilisateur de test
        self.user = User.objects.create_user(
            phone_number="+237123456789",
            password="testpass123",
            first_name="Test",
            last_name="User",
            age_group="26_35",
            region="littoral"
        )

        # Créer profil ferme
        self.farm_profile, _ = FarmProfile.objects.get_or_create(
            user=self.user,
            defaults={'farm_name': 'Test Farm'}
        )

        # Authentifier
        self.client.force_authenticate(user=self.user)

        # Créer produits de test (tilapia)
        self.product_2mm = Product.objects.create(
            name="ALLER AQUA TILAPIA 2MM 20KG",
            brand="aller_aqua",
            species="tilapia",
            phase="alevinage",
            pellet_size_mm=Decimal("2.0"),
            protein_percentage=Decimal("45.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("30000.00")
        )

        self.product_3mm = Product.objects.create(
            name="ALLER AQUA TILAPIA 3MM 20KG",
            brand="aller_aqua",
            species="tilapia",
            phase="pre_grossissement",
            pellet_size_mm=Decimal("3.0"),
            protein_percentage=Decimal("32.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("28000.00")
        )

        self.product_4_5mm = Product.objects.create(
            name="ALLER AQUA TILAPIA 4.5MM 20KG",
            brand="aller_aqua",
            species="tilapia",
            phase="grossissement",
            pellet_size_mm=Decimal("4.5"),
            protein_percentage=Decimal("30.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("27000.00")
        )

    def test_list_products(self):
        """Test GET /api/commerce/products/ - Liste produits."""
        response = self.client.get('/api/commerce/products/')

        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
        assert len(response.data['results']) == 3

        # Vérifier structure d'un produit
        product = response.data['results'][0]
        assert 'id' in product
        assert 'name' in product
        assert 'brand' in product
        assert 'species' in product
        assert 'pellet_size_mm' in product
        assert 'price_per_package' in product

    def test_list_products_filter_species(self):
        """Test filtrage par espèce."""
        # Créer un produit catfish
        Product.objects.create(
            name="CATFISH FOOD 2MM",
            brand="raanan",
            species="catfish",
            phase="alevinage",
            pellet_size_mm=Decimal("2.0"),
            protein_percentage=Decimal("45.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("32000.00")
        )

        # Filtrer tilapia uniquement
        response = self.client.get('/api/commerce/products/?species=tilapia')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 3
        for product in response.data['results']:
            assert product['species'] == 'tilapia'

    def test_retrieve_product_detail(self):
        """Test GET /api/commerce/products/{id}/ - Détails produit."""
        response = self.client.get(f'/api/commerce/products/{self.product_2mm.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == "ALLER AQUA TILAPIA 2MM 20KG"
        assert response.data['brand'] == "aller_aqua"
        assert Decimal(response.data['price_per_package']) == Decimal("30000.00")

    def test_cycle_simulation_basic(self):
        """Test POST /api/commerce/products/cycle_simulation/ - Simulation basique."""
        payload = {
            'species': 'tilapia',
            'initial_fish_count': 1000
        }

        response = self.client.post(
            '/api/commerce/products/cycle_simulation/',
            data=payload,
            format='json'
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.data

        # Vérifier structure
        assert data['simulation_type'] == 'predictive'
        assert 'parameters' in data
        assert 'feeding_phases' in data
        assert 'summary' in data

        # Vérifier paramètres par défaut
        params = data['parameters']
        assert params['species'] == 'tilapia'
        assert params['initial_fish_count'] == 1000
        assert params['initial_weight_g'] == 5.0
        assert params['target_weight_g'] == 300.0
        assert params['cycle_duration_days'] == 120
        assert params['survival_rate'] == 0.85

        # Vérifier phases
        assert len(data['feeding_phases']) == 3  # Tilapia = 3 phases

        # Vérifier summary
        summary = data['summary']
        assert summary['total_feed_kg'] > 0
        assert summary['total_cost_fcfa'] > 0
        assert summary['estimated_fcr'] > 0
        assert summary['estimated_revenue_fcfa'] > 0
        assert summary['roi_percentage'] > 0

    def test_cycle_simulation_custom_params(self):
        """Test simulation avec paramètres personnalisés."""
        payload = {
            'species': 'tilapia',
            'initial_fish_count': 500,
            'initial_weight_g': 10.0,
            'target_weight_g': 250.0,
            'cycle_duration_days': 90,
            'survival_rate': 0.90
        }

        response = self.client.post(
            '/api/commerce/products/cycle_simulation/',
            data=payload,
            format='json'
        )

        assert response.status_code == status.HTTP_200_OK
        params = response.data['parameters']

        assert params['initial_fish_count'] == 500
        assert params['initial_weight_g'] == 10.0
        assert params['target_weight_g'] == 250.0
        assert params['cycle_duration_days'] == 90
        assert params['survival_rate'] == 0.90

    def test_cycle_simulation_invalid_data(self):
        """Test validation des données de simulation."""
        payload = {
            'species': 'unknown_species',
            'initial_fish_count': -100
        }

        response = self.client.post(
            '/api/commerce/products/cycle_simulation/',
            data=payload,
            format='json'
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_feeding_suggestions(self):
        """Test GET /api/commerce/products/feeding_suggestions/ - Suggestions intelligentes."""
        # Pas besoin de créer cycle, le service gère les cas sans cycle actif
        response = self.client.get('/api/commerce/products/feeding_suggestions/')

        assert response.status_code == status.HTTP_200_OK
        data = response.data

        # La réponse doit contenir has_suggestions et suggestions
        assert 'has_suggestions' in data
        assert 'suggestions' in data
        # Sans cycle actif, should be empty
        assert data['has_suggestions'] == False
        assert len(data['suggestions']) == 0

    def test_feeding_suggestions_with_farm_filter(self):
        """Test suggestions avec filtre farm_profile_id."""
        response = self.client.get(
            f'/api/commerce/products/feeding_suggestions/?farm_profile_id={self.farm_profile.id}'
        )

        assert response.status_code == status.HTTP_200_OK
        assert 'suggestions' in response.data


@pytest.mark.django_db
class TestOrderEndpoints:
    """Tests pour endpoints OrderViewSet."""

    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup pour tous les tests."""
        self.client = APIClient()

        # Créer utilisateur de test
        self.user = User.objects.create_user(
            phone_number="+237123456789",
            password="testpass123",
            first_name="Test",
            last_name="User",
            age_group="26_35",
            region="littoral"
        )

        # Créer profil ferme
        self.farm_profile, _ = FarmProfile.objects.get_or_create(
            user=self.user,
            defaults={'farm_name': 'Test Farm'}
        )

        # Authentifier
        self.client.force_authenticate(user=self.user)

        # Créer produit de test
        self.product = Product.objects.create(
            name="ALLER AQUA TILAPIA 2MM 20KG",
            brand="aller_aqua",
            species="tilapia",
            phase="alevinage",
            pellet_size_mm=Decimal("2.0"),
            protein_percentage=Decimal("45.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("30000.00")
        )

    def test_preview_delivery_fee_pickup(self):
        """Test POST /api/commerce/orders/preview_delivery_fee/ - Retrait."""
        payload = {
            'items': [
                {
                    'product_id': str(self.product.id),
                    'quantity': 5
                }
            ],
            'delivery_method': 'pickup',
            'pickup_location': 'ndokoti'
        }

        response = self.client.post(
            '/api/commerce/orders/preview_delivery_fee/',
            data=payload,
            format='json'
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.data

        # delivery_fee peut être "0" ou "0.00" selon implémentation
        assert Decimal(data['delivery_fee']) == Decimal("0")
        assert data['total_bags'] == 5
        assert Decimal(data['subtotal']) == Decimal("150000.00")  # 5 × 30000
        assert Decimal(data['total']) == Decimal("150000.00")

    def test_preview_delivery_fee_home_below_threshold(self):
        """Test livraison domicile < 20 sacs."""
        payload = {
            'items': [
                {
                    'product_id': str(self.product.id),
                    'quantity': 10
                }
            ],
            'delivery_method': 'home'
        }

        response = self.client.post(
            '/api/commerce/orders/preview_delivery_fee/',
            data=payload,
            format='json'
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.data

        # Utilisateur dans région Littoral (Douala) → frais standard
        assert Decimal(data['delivery_fee']) == Decimal("3000.00")
        assert Decimal(data['total']) == Decimal("303000.00")  # 300000 + 3000

    def test_preview_delivery_fee_home_free_threshold(self):
        """Test livraison gratuite pour 20+ sacs à Douala."""
        payload = {
            'items': [
                {
                    'product_id': str(self.product.id),
                    'quantity': 25
                }
            ],
            'delivery_method': 'home'
        }

        response = self.client.post(
            '/api/commerce/orders/preview_delivery_fee/',
            data=payload,
            format='json'
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.data

        # 25 sacs → livraison gratuite à Douala
        assert Decimal(data['delivery_fee']) == Decimal("0")
        assert Decimal(data['total']) == Decimal("750000.00")  # 25 × 30000

    def test_create_order_pickup(self):
        """Test POST /api/commerce/orders/ - Créer commande retrait."""
        payload = {
            'delivery_method': 'pickup',
            'pickup_location': 'ndokoti',
            'items': [
                {
                    'product_id': str(self.product.id),
                    'quantity': 3
                }
            ]
        }

        response = self.client.post(
            '/api/commerce/orders/',
            data=payload,
            format='json'
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.data

        assert data['delivery_method'] == 'pickup'
        assert data['pickup_location'] == 'ndokoti'
        assert data['status'] == 'confirmed'  # Statut confirmé dès la création
        assert Decimal(data['total']) == Decimal("90000.00")  # 3 × 30000
        assert len(data['items']) == 1

    def test_create_order_home_delivery(self):
        """Test création commande avec livraison domicile."""
        payload = {
            'delivery_method': 'home',
            'items': [
                {
                    'product_id': str(self.product.id),
                    'quantity': 15
                }
            ]
        }

        response = self.client.post(
            '/api/commerce/orders/',
            data=payload,
            format='json'
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.data

        assert data['delivery_method'] == 'home'
        # 15 sacs × 30000 = 450000 + frais livraison 3000
        assert Decimal(data['total']) == Decimal("453000.00")

    def test_list_orders(self):
        """Test GET /api/commerce/orders/ - Liste commandes utilisateur."""
        # Créer quelques commandes
        Order.objects.create(
            user=self.user,
            farm_profile=self.farm_profile,
            order_number='ORD-TEST-0001',
            delivery_method='pickup',
            pickup_location='ndokoti',
            subtotal=Decimal("90000.00"),
            delivery_fee=Decimal("0.00"),
            total=Decimal("90000.00"),
            status='confirmed'
        )

        Order.objects.create(
            user=self.user,
            farm_profile=self.farm_profile,
            order_number='ORD-TEST-0002',
            delivery_method='home',
            subtotal=Decimal("297000.00"),
            delivery_fee=Decimal("3000.00"),
            total=Decimal("300000.00"),
            status='confirmed'
        )

        response = self.client.get('/api/commerce/orders/')

        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
        assert len(response.data['results']) == 2

    def test_retrieve_order_detail(self):
        """Test GET /api/commerce/orders/{id}/ - Détails commande."""
        order = Order.objects.create(
            user=self.user,
            farm_profile=self.farm_profile,
            order_number='ORD-TEST-0003',
            delivery_method='pickup',
            pickup_location='ndokoti',
            subtotal=Decimal("90000.00"),
            delivery_fee=Decimal("0.00"),
            total=Decimal("90000.00"),
            status='confirmed'
        )

        response = self.client.get(f'/api/commerce/orders/{order.id}/')

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(order.id)
        assert response.data['status'] == 'confirmed'

    def test_statistics(self):
        """Test GET /api/commerce/orders/statistics/ - Statistiques utilisateur."""
        # Créer quelques commandes
        Order.objects.create(
            user=self.user,
            farm_profile=self.farm_profile,
            order_number='ORD-TEST-0004',
            delivery_method='pickup',
            pickup_location='ndokoti',
            subtotal=Decimal("90000.00"),
            delivery_fee=Decimal("0.00"),
            total=Decimal("90000.00"),
            status='confirmed'
        )
        Order.objects.create(
            user=self.user,
            farm_profile=self.farm_profile,
            order_number='ORD-TEST-0005',
            delivery_method='home',
            subtotal=Decimal("150000.00"),
            delivery_fee=Decimal("0.00"),
            total=Decimal("150000.00"),
            status='confirmed'
        )

        response = self.client.get('/api/commerce/orders/statistics/')

        assert response.status_code == status.HTTP_200_OK
        data = response.data

        assert 'total_orders' in data
        assert 'total_spent' in data
        assert data['total_orders'] >= 2

    def test_create_order_validation_missing_items(self):
        """Test validation : commande sans produits lève InvalidOrderError."""
        from apps.commerce.domain.exceptions import InvalidOrderError

        payload = {
            'delivery_method': 'pickup',
            'pickup_location': 'ndokoti',
            'items': []
        }

        # L'erreur InvalidOrderError est levée par le service et non capturée par DRF
        # TODO: Implémenter exception handler global dans DRF pour retourner 400
        with pytest.raises(InvalidOrderError):
            self.client.post(
                '/api/commerce/orders/',
                data=payload,
                format='json'
            )

    def test_create_order_validation_missing_pickup_location(self):
        """Test validation : retrait sans lieu de retrait."""
        payload = {
            'delivery_method': 'pickup',
            'items': [
                {
                    'product_id': str(self.product.id),
                    'quantity': 1
                }
            ]
        }

        response = self.client.post(
            '/api/commerce/orders/',
            data=payload,
            format='json'
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_create_order_home_delivery_accepted(self):
        """Test validation : livraison domicile acceptée (pas de champ delivery_address dans modèle)."""
        payload = {
            'delivery_method': 'home',
            'items': [
                {
                    'product_id': str(self.product.id),
                    'quantity': 1
                }
            ]
        }

        response = self.client.post(
            '/api/commerce/orders/',
            data=payload,
            format='json'
        )

        # Livraison domicile créée avec succès (pas de contrainte delivery_address)
        assert response.status_code == status.HTTP_201_CREATED
