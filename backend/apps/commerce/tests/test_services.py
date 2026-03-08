"""
Tests unitaires pour les services commerce.
Coverage: ProductService, OrderService, FeedingSuggestionService.
"""
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from accounts.models import FarmProfile, User
from aquaculture.models import CycleLog, ProductionCycle
from commerce.domain.exceptions import InvalidOrderError, ProductNotAvailableError, ProductNotFoundError
from commerce.models import Product
from commerce.services import (
    CatalogApplicationService,
    CreateOrderCommand,
    DeliveryFeePreviewCommand,
    FeedingSuggestionService,
    FeedingSuggestionsQuery,
    OrderApplicationService,
    OrderService,
    ProductService,
    RecommendedProductQuery,
)
from django.utils import timezone


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

    def test_get_products_by_ids_uses_single_query(self, tilapia_products, django_assert_num_queries):
        products = list(Product.objects.all())
        product_ids = [str(product.id) for product in products]

        with django_assert_num_queries(1):
            result = ProductService.get_products_by_ids(product_ids)

        assert set(result.keys()) == set(product_ids)

    def test_get_products_by_ids_returns_empty_mapping_for_empty_payload(self):
        assert ProductService.get_products_by_ids([]) == {}

    def test_get_products_by_ids_raises_not_available_for_missing_or_unavailable_product(self, tilapia_products):
        unavailable_product = Product.objects.create(
            name="ALLER AQUA TILAPIA 5MM 20KG",
            brand="aller_aqua",
            species="tilapia",
            phase="grossissement",
            pellet_size_mm=Decimal("5.0"),
            protein_percentage=32,
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("31000.00"),
            is_available=False,
        )

        with pytest.raises(ProductNotAvailableError, match=str(unavailable_product.id)):
            ProductService.get_products_by_ids([str(unavailable_product.id)])

    def test_get_products_by_ids_raises_not_found_when_availability_check_disabled(self, tilapia_products):
        missing_product_id = str(uuid4())

        with pytest.raises(ProductNotFoundError, match=missing_product_id):
            ProductService.get_products_by_ids([missing_product_id], check_availability=False)

    def test_get_product_by_id_raises_for_unavailable_product(self, tilapia_products):
        unavailable_product = Product.objects.create(
            name="DIBAQ TILAPIA 4MM 20KG",
            brand="dibaq",
            species="tilapia",
            phase="grossissement",
            pellet_size_mm=Decimal("4.0"),
            protein_percentage=30,
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("28000.00"),
            is_available=False,
        )

        with pytest.raises(ProductNotAvailableError, match=unavailable_product.name):
            ProductService.get_product_by_id(str(unavailable_product.id))

        assert ProductService.get_product_by_id(
            str(unavailable_product.id),
            check_availability=False,
        ) == unavailable_product

    def test_get_product_by_id_raises_not_found_for_unknown_uuid(self):
        missing_product_id = str(uuid4())

        with pytest.raises(ProductNotFoundError, match=missing_product_id):
            ProductService.get_product_by_id(missing_product_id)

    def test_filter_by_phase_and_brand(self, tilapia_products):
        phase_products = ProductService.filter_by_phase("grossissement", species="tilapia")
        brand_products = ProductService.filter_by_brand("aller_aqua")

        assert phase_products.count() == 1
        assert phase_products.first().phase == "grossissement"
        assert brand_products.count() == 2

    def test_search_products_returns_none_for_short_query(self, tilapia_products):
        assert ProductService.search_products("").count() == 0
        assert ProductService.search_products("a").count() == 0

    def test_search_products_matches_brand_and_name(self, tilapia_products):
        assert ProductService.search_products("aller").count() == 2
        assert ProductService.search_products("3MM").count() == 1

    def test_get_recommended_product_falls_back_to_nearest_pellet_size(self, tilapia_products):
        fallback_product = ProductService.get_recommended_product("tilapia", 20.0)

        assert fallback_product is not None
        assert fallback_product.pellet_size_mm == Decimal("3.0")

    def test_get_products_for_cycle_returns_species_scope(self, tilapia_products):
        cycle = type("CycleStub", (), {"species": "tilapia"})()

        products = ProductService.get_products_for_cycle(cycle)

        assert products.count() == 2

    def test_get_price_range_with_filters(self, tilapia_products):
        price_range = ProductService.get_price_range(species="tilapia", phase="grossissement")

        assert price_range["min"] == Decimal("30000.00")
        assert price_range["max"] == Decimal("30000.00")
        assert price_range["avg"] == Decimal("30000.00")

    def test_get_price_range_returns_zeroes_when_no_product_matches(self):
        price_range = ProductService.get_price_range(species="catfish")

        assert price_range == {
            "min": Decimal("0"),
            "max": Decimal("0"),
            "avg": Decimal("0"),
        }


@pytest.mark.django_db
class TestCatalogApplicationService:
    """Tests pour les use cases applicatifs catalogue."""

    @pytest.fixture
    def test_user(self):
        return User.objects.create_user(
            phone_number="+237555111222",
            password="testpass123",
            first_name="Catalog",
            last_name="User",
            age_group="26_35",
        )

    @pytest.fixture
    def test_farm(self, test_user):
        farm_profile, _ = FarmProfile.objects.get_or_create(
            user=test_user,
            defaults={"farm_name": "Catalog Farm"},
        )
        return farm_profile

    @pytest.fixture
    def test_cycle(self, test_farm):
        return ProductionCycle.objects.create(
            farm_profile=test_farm,
            cycle_name="Cycle Catalogue",
            species="tilapia",
            pond_identifier="Pond C1",
            pond_surface_m2=Decimal("100.0"),
            start_date=timezone.now().date() - timedelta(days=7),
            initial_count=1000,
            initial_average_weight=Decimal("5.0"),
            initial_biomass=Decimal("5.0"),
            current_count=1000,
            current_average_weight=Decimal("5.0"),
            current_biomass=Decimal("5.0"),
            status="active",
        )

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
            price_per_package=Decimal("35000.00"),
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
            price_per_package=Decimal("30000.00"),
        )

    def test_get_products_for_user_cycle(self, test_user, test_cycle, tilapia_products):
        products = CatalogApplicationService.get_products_for_user_cycle(test_user, str(test_cycle.id))

        assert products.count() == 2

    def test_get_recommended_product(self, tilapia_products):
        product = CatalogApplicationService.get_recommended_product(
            RecommendedProductQuery(species="tilapia", weight_g=2.0),
        )

        assert product is not None
        assert product.pellet_size_mm == Decimal("1.0")

    def test_get_feeding_suggestions_without_cycles(self, test_user):
        suggestions = CatalogApplicationService.get_feeding_suggestions(
            user=test_user,
            query=FeedingSuggestionsQuery(),
        )

        assert suggestions["has_suggestions"] is False


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

    def test_calculate_delivery_fee_preview_batches_product_lookup(
        self,
        test_user,
        django_assert_num_queries,
    ):
        product_one = Product.objects.create(
            name="Product 2",
            brand="aller_aqua",
            species="tilapia",
            phase="grossissement",
            pellet_size_mm=Decimal("4.0"),
            protein_percentage=Decimal("32.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("32000.00"),
        )
        product_two = Product.objects.create(
            name="Product 3",
            brand="dibaq",
            species="tilapia",
            phase="grossissement",
            pellet_size_mm=Decimal("5.0"),
            protein_percentage=Decimal("30.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("28000.00"),
        )

        items_data = [
            {"product_id": str(product_one.id), "quantity": 2},
            {"product_id": str(product_two.id), "quantity": 3},
        ]

        with django_assert_num_queries(1):
            preview = OrderService.calculate_delivery_fee_preview(test_user, items_data, "home")

        assert preview['total_bags'] == 5

    def test_create_order_idempotent_same_client_uuid(self, test_user, test_farm, test_product):
        items_data = [{"product_id": str(test_product.id), "quantity": 1}]
        order_1 = OrderService.create_order(
            user=test_user,
            items_data=items_data,
            delivery_method="home",
            client_uuid="11111111-1111-4111-8111-111111111111",
            created_offline=True,
        )
        order_2 = OrderService.create_order(
            user=test_user,
            items_data=items_data,
            delivery_method="home",
            client_uuid="11111111-1111-4111-8111-111111111111",
            created_offline=True,
        )
        assert order_1.id == order_2.id

    def test_create_order_rejects_foreign_client_uuid(self, test_user, test_farm, test_product):
        other_user = User.objects.create_user(
            phone_number="+237222333444",
            password="testpass123",
            first_name="Other",
            last_name="User",
            age_group="26_35",
        )
        FarmProfile.objects.get_or_create(user=other_user, defaults={"farm_name": "Other Farm"})

        items_data = [{"product_id": str(test_product.id), "quantity": 1}]
        OrderService.create_order(
            user=test_user,
            items_data=items_data,
            delivery_method="home",
            client_uuid="22222222-2222-4222-8222-222222222222",
            created_offline=True,
        )

        with pytest.raises(InvalidOrderError):
            OrderService.create_order(
                user=other_user,
                items_data=items_data,
                delivery_method="home",
                client_uuid="22222222-2222-4222-8222-222222222222",
                created_offline=True,
            )

    def test_confirm_order_receipt_success(self, test_user, test_farm, test_product):
        order = OrderService.create_order(
            user=test_user,
            items_data=[{"product_id": str(test_product.id), "quantity": 1}],
            delivery_method="home",
        )
        order.status = "delivered"
        order.save(update_fields=["status", "updated_at"])

        updated = OrderService.confirm_order_receipt(order, test_user)

        assert updated.status == "received"

    def test_confirm_order_receipt_rejects_non_delivered(self, test_user, test_farm, test_product):
        order = OrderService.create_order(
            user=test_user,
            items_data=[{"product_id": str(test_product.id), "quantity": 1}],
            delivery_method="home",
        )

        with pytest.raises(InvalidOrderError):
            OrderService.confirm_order_receipt(order, test_user)


@pytest.mark.django_db
class TestOrderApplicationService:
    """Tests pour les use cases applicatifs commande."""

    @pytest.fixture
    def test_user(self):
        return User.objects.create_user(
            phone_number="+237666111222",
            password="testpass123",
            first_name="Order",
            last_name="User",
            age_group="26_35",
        )

    @pytest.fixture
    def test_farm(self, test_user):
        farm_profile, _ = FarmProfile.objects.get_or_create(
            user=test_user,
            defaults={"farm_name": "Order App Farm"},
        )
        return farm_profile

    @pytest.fixture
    def test_product(self):
        return Product.objects.create(
            name="Order App Product",
            brand="aller_aqua",
            species="tilapia",
            phase="grossissement",
            pellet_size_mm=Decimal("3.0"),
            protein_percentage=Decimal("32.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("30000.00"),
        )

    def test_create_order_use_case(self, test_user, test_farm, test_product):
        order = OrderApplicationService.create_order(
            user=test_user,
            command=CreateOrderCommand(
                items_data=[{"product_id": str(test_product.id), "quantity": 1}],
                delivery_method="home",
            ),
        )

        assert order.user == test_user
        assert order.items.count() == 1

    def test_preview_delivery_fee_use_case(self, test_user, test_product):
        preview = OrderApplicationService.preview_delivery_fee(
            user=test_user,
            command=DeliveryFeePreviewCommand(
                items_data=[{"product_id": str(test_product.id), "quantity": 2}],
                delivery_method="home",
            ),
        )

        assert preview["subtotal"] == Decimal("60000.00")
        assert preview["total_bags"] == 2


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
            farm_profile=test_farm,
            cycle_name="Cycle Test",
            species="tilapia",
            pond_identifier="Pond A",
            pond_surface_m2=Decimal("100.0"),
            start_date=timezone.now().date() - timedelta(days=30),
            initial_count=1000,
            initial_average_weight=Decimal("5.0"),
            initial_biomass=Decimal("5.0"),
            current_count=1000,
            current_average_weight=Decimal("5.0"),
            current_biomass=Decimal("5.0"),
            status="active",
        )

    def test_get_feeding_suggestions_no_cycles(self, test_user):
        result = FeedingSuggestionService.get_feeding_suggestions(test_user.id)
        assert result["has_suggestions"] is False

    def test_calculate_confidence_high(self):
        confidence = FeedingSuggestionService._calculate_confidence(3, 3)
        assert confidence >= 90

    def test_feeding_suggestions_include_cycle_name(self, test_user, test_cycle, monkeypatch):
        def _fake_analysis(cycle):
            return {
                "has_data": True,
                "cycle_id": str(cycle.id),
                "cycle_name": cycle.cycle_name,
                "species": cycle.species,
                "current_phase": "pre_grossissement",
                "current_avg_weight_g": 45.0,
                "days_remaining": 30,
                "avg_daily_consumption_kg": 3.5,
                "phases": [],
                "summary": {
                    "total_needed_kg": 100.0,
                    "total_bags": 5,
                    "total_price": 100000.0,
                    "coverage_days": 37,
                },
            }

        monkeypatch.setattr(
            FeedingSuggestionService,
            "_analyze_cycle_with_phases",
            staticmethod(_fake_analysis),
        )

        result = FeedingSuggestionService.get_feeding_suggestions(test_user.id)
        assert result["has_suggestions"] is True
        assert result["suggestions"][0]["cycle_name"] == test_cycle.cycle_name

    def test_get_feeding_suggestions_uses_three_queries(
        self,
        test_user,
        test_cycle,
        django_assert_num_queries,
    ):
        Product.objects.create(
            name="TILAPIA 3MM TEST 20KG",
            brand="aller_aqua",
            species="tilapia",
            phase="pre_grossissement",
            pellet_size_mm=Decimal("3.0"),
            protein_percentage=Decimal("35.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("30000.0"),
        )

        today = timezone.now().date()
        for offset in range(7):
            CycleLog.objects.create(
                cycle=test_cycle,
                log_date=today - timedelta(days=offset),
                feed_quantity=Decimal("2.0"),
                average_weight=Decimal("80.0"),
            )

        with django_assert_num_queries(3):
            result = FeedingSuggestionService.get_feeding_suggestions(test_user.id)

        assert result["has_suggestions"] is True

    def test_analyze_cycle_handles_clarias_and_planned_harvest_date(self, test_farm):
        cycle = ProductionCycle.objects.create(
            farm_profile=test_farm,
            cycle_name="Cycle Clarias",
            species="clarias",
            pond_identifier="Pond C",
            pond_surface_m2=Decimal("150.0"),
            start_date=timezone.now().date() - timedelta(days=20),
            initial_count=2000,
            initial_average_weight=Decimal("5.0"),
            initial_biomass=Decimal("10.0"),
            current_count=1900,
            current_average_weight=Decimal("80.0"),
            current_biomass=Decimal("152.0"),
            status="active",
            planned_harvest_date=timezone.now().date() + timedelta(days=20),
            target_harvest_weight_g=Decimal("400.0"),
        )

        Product.objects.create(
            name="CATFISH 3MM TEST 20KG",
            brand="aller_aqua",
            species="catfish",
            phase="pre_grossissement",
            pellet_size_mm=Decimal("3.0"),
            protein_percentage=Decimal("35.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("30000.0"),
        )

        today = timezone.now().date()
        for offset in range(7):
            CycleLog.objects.create(
                cycle=cycle,
                log_date=today - timedelta(days=offset),
                feed_quantity=Decimal("2.0"),
                average_weight=Decimal("80.0"),
            )

        analysis = FeedingSuggestionService._analyze_cycle_with_phases(cycle)

        assert analysis["has_data"] is True
        assert analysis["days_remaining"] == 20
        assert analysis["cycle_id"] == str(cycle.id)
