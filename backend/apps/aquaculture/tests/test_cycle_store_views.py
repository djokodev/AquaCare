from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from aquaculture.models import CycleFeedStockEntry, FarmFeedReference, ProductionCycle
from commerce.models import Order, OrderItem, Product
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient


def _create_cycle(user, farm_name: str = 'Ferme Magasin') -> ProductionCycle:
    from accounts.models import FarmProfile

    farm_profile, _ = FarmProfile.objects.get_or_create(
        user=user,
        defaults={'farm_name': farm_name},
    )
    return ProductionCycle.objects.create(
        farm_profile=farm_profile,
        cycle_name='Cycle Magasin',
        species='tilapia',
        pond_identifier='Bassin 1',
        pond_surface_m2=Decimal('120.0'),
        start_date=timezone.localdate() - timedelta(days=15),
        initial_count=1200,
        initial_average_weight=Decimal('10.0'),
        initial_biomass=Decimal('12.0'),
        current_count=1160,
        current_average_weight=Decimal('42.0'),
        current_biomass=Decimal('48.72'),
        status='active',
    )


def _create_product(name: str = 'DIBAQ Tilapia 3MM 20KG') -> Product:
    return Product.objects.create(
        name=name,
        brand='dibaq',
        species='tilapia',
        phase='grossissement',
        pellet_size_mm=Decimal('3.0'),
        protein_percentage=32,
        lipid_percentage=10,
        package_weight_kg=20,
        price_per_package=Decimal('30000.00'),
    )


def _create_pending_order(user, cycle: ProductionCycle) -> Order:
    product = _create_product()
    order = Order.objects.create(
        user=user,
        farm_profile=cycle.farm_profile,
        production_cycle=cycle,
        order_number=f'ORD-{timezone.localdate().strftime("%Y%m%d")}-VW01',
        status='confirmed',
        delivery_method='pickup',
        pickup_location='ndokoti',
        delivery_name='Stock User',
        delivery_phone='+237690000010',
        delivery_region='Littoral',
        delivery_city='Douala',
        delivery_full_address='Douala, Littoral',
        subtotal=product.price_per_package * 2,
        delivery_fee=Decimal('0.00'),
        total=product.price_per_package * 2,
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        product_name=product.name,
        unit_price=product.price_per_package,
        quantity=2,
        line_total=product.price_per_package * 2,
    )
    return order


@pytest.mark.django_db
class TestCycleStoreViews:
    def test_get_store_returns_pending_orders_and_summary(self, auth_client, authenticated_user, farm_profile):
        cycle = _create_cycle(authenticated_user)
        _create_pending_order(authenticated_user, cycle)

        url = reverse('aquaculture:production-cycle-store', kwargs={'pk': cycle.id})
        response = auth_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['summary']['pending_orders_count'] == 1
        assert response.data['summary']['pending_order_feed_kg'] == '40.00'
        assert response.data['summary']['total_feed_added_kg'] == '0.00'
        assert response.data['status'] == 'not_started'
        assert len(response.data['pending_orders']) == 1

    def test_manual_stock_post_updates_store_payload(self, auth_client, authenticated_user, farm_profile):
        cycle = _create_cycle(authenticated_user)

        url = reverse('aquaculture:production-cycle-store-manual-stock', kwargs={'pk': cycle.id})
        response = auth_client.post(
            url,
            {
                'label': 'Aliment starter 20kg',
                'feed_size_mm': '2.00',
                'quantity_kg': '60.00',
                'total_cost_fcfa': '90000.00',
                'entry_date': timezone.localdate().isoformat(),
                'note': 'Premier dépôt',
                'created_offline': True,
            },
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['summary']['manual_feed_kg'] == '60.00'
        assert response.data['summary']['estimated_feed_remaining_kg'] == '60.00'
        assert response.data['status'] == 'ok'
        assert response.data['stock_items'][0]['feed_size_mm'] == '2.00'
        assert cycle.feed_stock_entries.count() == 1

    def test_store_is_hidden_from_other_users(self, authenticated_user, user_factory):
        cycle = _create_cycle(authenticated_user)
        other_user = user_factory(
            phone_number='+237690000011',
            first_name='Other',
            last_name='Farmer',
        )

        other_client = APIClient()
        other_client.force_authenticate(user=other_user)

        url = reverse('aquaculture:production-cycle-store', kwargs={'pk': cycle.id})
        response = other_client.get(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_manual_stock_resolves_offline_feed_reference_by_client_uuid(
        self, auth_client, authenticated_user, farm_profile,
    ):
        cycle = _create_cycle(authenticated_user)
        reference = FarmFeedReference.objects.create(
            farm_profile=cycle.farm_profile,
            client_uuid=uuid4(),
            source='external',
            name='Aliment offline',
            species='tilapia',
            pellet_size_mm=Decimal('2.00'),
        )

        response = auth_client.post(
            reverse('aquaculture:production-cycle-store-manual-stock', kwargs={'pk': cycle.id}),
            {
                'feed_reference_client_uuid': str(reference.client_uuid),
                'quantity_kg': '50.00',
                'total_cost_fcfa': '50000.00',
                'entry_date': timezone.localdate().isoformat(),
                'client_uuid': str(uuid4()),
                'created_offline': True,
            },
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        assert cycle.feed_stock_entries.get().feed_reference_id == reference.id

    def test_manual_stock_rejects_mismatched_id_and_client_uuid(
        self, auth_client, authenticated_user, farm_profile,
    ):
        cycle = _create_cycle(authenticated_user)
        references = [
            FarmFeedReference.objects.create(
                farm_profile=cycle.farm_profile,
                client_uuid=uuid4(),
                source='external',
                name=f'Aliment {index}',
                species='tilapia',
                pellet_size_mm=Decimal(f'{index + 2}.00'),
            )
            for index in range(2)
        ]

        response = auth_client.post(
            reverse('aquaculture:production-cycle-store-manual-stock', kwargs={'pk': cycle.id}),
            {
                'feed_reference_id': str(references[0].id),
                'feed_reference_client_uuid': str(references[1].client_uuid),
                'quantity_kg': '50.00',
                'total_cost_fcfa': '50000.00',
                'entry_date': timezone.localdate().isoformat(),
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert CycleFeedStockEntry.objects.filter(cycle=cycle).count() == 0

    def test_cycle_log_resolves_feed_reference_by_client_uuid(
        self, auth_client, authenticated_user, farm_profile,
    ):
        cycle = _create_cycle(authenticated_user)
        reference = FarmFeedReference.objects.create(
            farm_profile=cycle.farm_profile,
            client_uuid=uuid4(),
            source='external',
            name='Ration offline',
            species='tilapia',
            pellet_size_mm=Decimal('2.00'),
        )
        CycleFeedStockEntry.objects.create(
            cycle=cycle,
            feed_reference=reference,
            source='manual',
            label=reference.name,
            feed_size_mm=reference.pellet_size_mm,
            quantity_kg=Decimal('50.00'),
            total_cost_fcfa=Decimal('50000.00'),
            entry_date=timezone.localdate(),
        )

        response = auth_client.post(
            reverse('aquaculture:cycle-log-list'),
            {
                'cycle': str(cycle.id),
                'log_date': timezone.localdate().isoformat(),
                'feed_quantity': '5.00',
                'feed_reference_client_uuid': str(reference.client_uuid),
                'client_uuid': str(uuid4()),
                'created_offline': True,
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['feed_reference'] == reference.id

    def test_cycle_log_resolves_stock_by_pellet_size_without_origin_choice(
        self, auth_client, authenticated_user, farm_profile,
    ):
        cycle = _create_cycle(authenticated_user)
        references = [
            FarmFeedReference.objects.create(
                farm_profile=cycle.farm_profile,
                source='external',
                name=f'Aliment externe {index}',
                species='tilapia',
                pellet_size_mm=Decimal('2.00'),
            )
            for index in range(2)
        ]
        for reference, quantity in zip(references, (Decimal('4.00'), Decimal('6.00'))):
            CycleFeedStockEntry.objects.create(
                cycle=cycle,
                feed_reference=reference,
                source='manual',
                label=reference.name,
                feed_size_mm=reference.pellet_size_mm,
                quantity_kg=quantity,
                total_cost_fcfa=Decimal('10000.00'),
                entry_date=timezone.localdate(),
            )

        response = auth_client.post(
            reverse('aquaculture:cycle-log-list'),
            {
                'cycle': str(cycle.id),
                'log_date': timezone.localdate().isoformat(),
                'feed_quantity': '10.00',
                'feed_size_mm': '2.0',
                'client_uuid': str(uuid4()),
                'created_offline': True,
            },
            format='json',
        )

        assert response.status_code == status.HTTP_201_CREATED, response.data
        assert response.data['feed_size_mm'] == '2.0'
        assert response.data['feed_reference'] is None

        store_response = auth_client.get(
            reverse('aquaculture:production-cycle-store', kwargs={'pk': cycle.id}),
        )
        assert store_response.data['stock_by_size'] == [{
            'feed_size_mm': '2',
            'quantity_added_kg': '10.00',
            'quantity_consumed_kg': '10.00',
            'quantity_available_kg': '0.00',
        }]
        assert all(item['quantity_available_kg'] == '0.00' for item in store_response.data['stock_items'])

    def test_cycle_log_rejects_a_pellet_size_without_compatible_stock(
        self, auth_client, authenticated_user,
    ):
        cycle = _create_cycle(authenticated_user)

        response = auth_client.post(
            reverse('aquaculture:cycle-log-list'),
            {
                'cycle': str(cycle.id),
                'log_date': timezone.localdate().isoformat(),
                'feed_quantity': '5.00',
                'feed_size_mm': '4.00',
                'client_uuid': str(uuid4()),
            },
            format='json',
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'feed_size_mm' in response.data

    def test_unclassified_stock_with_size_is_not_exposed_as_usable_stock(
        self, auth_client, authenticated_user,
    ):
        cycle = _create_cycle(authenticated_user)
        CycleFeedStockEntry.objects.create(
            cycle=cycle,
            source='order',
            label='Ancien aliment',
            feed_size_mm=Decimal('2.00'),
            quantity_kg=Decimal('30.00'),
            total_cost_fcfa=Decimal('45000.00'),
            entry_date=timezone.localdate(),
        )

        store_response = auth_client.get(
            reverse('aquaculture:production-cycle-store', kwargs={'pk': cycle.id}),
        )
        assert store_response.status_code == status.HTTP_200_OK
        assert store_response.data['stock_by_size'] == []
        assert store_response.data['summary']['unclassified_stock_kg'] == '30.00'

        log_response = auth_client.post(
            reverse('aquaculture:cycle-log-list'),
            {
                'cycle': str(cycle.id),
                'log_date': timezone.localdate().isoformat(),
                'feed_quantity': '5.00',
                'feed_size_mm': '2.0',
                'client_uuid': str(uuid4()),
            },
            format='json',
        )

        assert log_response.status_code == status.HTTP_400_BAD_REQUEST
        assert log_response.data['code'] == 'feed_stock_item_unavailable', log_response.data
