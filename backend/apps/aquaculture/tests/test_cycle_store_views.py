from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from aquaculture.models import (
    CycleFeedStockEntry,
    FarmFeedReference,
    NutritionalGuide,
    ProductionCycle,
)
from commerce.models import Order, OrderItem, Product
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient


def _create_cycle(
    user,
    farm_name: str = 'Ferme Magasin',
    species: str = 'tilapia',
) -> ProductionCycle:
    from accounts.models import FarmProfile

    farm_profile, _ = FarmProfile.objects.get_or_create(
        user=user,
        defaults={'farm_name': farm_name},
    )
    return ProductionCycle.objects.create(
        farm_profile=farm_profile,
        cycle_name='Cycle Magasin',
        species=species,
        pond_identifier='Bassin 1',
        pond_surface_m2=Decimal('120.0'),
        start_date=timezone.localdate() - timedelta(days=15),
        initial_count=1200,
        initial_average_weight=Decimal('10.0'),
        initial_biomass=Decimal('12.0'),
        current_count=1160,
        current_average_weight=Decimal('42.0'),
        current_biomass=Decimal('48.72'),
        target_harvest_weight_g=Decimal('400.0'),
        planned_cycle_duration_days=120,
        planned_harvest_date=timezone.localdate() + timedelta(days=105),
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

    def test_repeated_external_feed_identity_creates_two_stock_entries(
        self,
        auth_client,
        authenticated_user,
    ):
        cycle = _create_cycle(authenticated_user, species='clarias')
        for minimum, maximum, pellet_size in ((0, 100, '2.0'), (100, 400, '4.0')):
            NutritionalGuide.objects.create(
                species='clarias',
                growth_stage='croissance',
                min_weight=Decimal(minimum),
                max_weight=Decimal(maximum),
                feeding_rate_percentage=Decimal('4.00'),
                protein_requirement=35,
                meals_per_day=3,
                feed_size_mm=Decimal(pellet_size),
                recommended_products=[],
                expected_fcr=Decimal('1.20'),
                source='DIBAQ',
            )
        store_url = reverse('aquaculture:production-cycle-store', kwargs={'pk': cycle.id})
        reference_url = reverse('aquaculture:feed-reference-list')
        stock_url = reverse(
            'aquaculture:production-cycle-store-manual-stock',
            kwargs={'pk': cycle.id},
        )
        baseline = auth_client.get(store_url)
        assert baseline.status_code == status.HTTP_200_OK

        first_reference_uuid = uuid4()
        second_reference_uuid = uuid4()
        reference_payload = {
            'farm_profile': str(cycle.farm_profile_id),
            'source': 'external',
            'name': 'Aliment marché QA',
            'species': 'clarias',
            'pellet_size_mm': '2.00',
        }
        first_reference = auth_client.post(
            reference_url,
            {**reference_payload, 'client_uuid': str(first_reference_uuid)},
            format='json',
        )
        second_reference = auth_client.post(
            reference_url,
            {**reference_payload, 'client_uuid': str(second_reference_uuid)},
            format='json',
        )

        assert first_reference.status_code == status.HTTP_201_CREATED
        assert second_reference.status_code == status.HTTP_201_CREATED
        assert second_reference.data['id'] == first_reference.data['id']
        assert second_reference.data['client_uuid'] == str(first_reference_uuid)

        first_stock_uuid = uuid4()
        second_stock_uuid = uuid4()
        first_entry_date = timezone.localdate() - timedelta(days=1)
        second_entry_date = timezone.localdate()
        first_stock_payload = {
            'feed_reference_id': first_reference.data['id'],
            'quantity_kg': '5.00',
            'total_cost_fcfa': '8000.00',
            'entry_date': first_entry_date.isoformat(),
            'note': 'QA lot externe A',
            'client_uuid': str(first_stock_uuid),
        }
        second_stock_payload = {
            'feed_reference_id': second_reference.data['id'],
            'quantity_kg': '5.00',
            'total_cost_fcfa': '7500.00',
            'entry_date': second_entry_date.isoformat(),
            'note': 'QA lot externe B',
            'client_uuid': str(second_stock_uuid),
        }

        first_stock = auth_client.post(stock_url, first_stock_payload, format='json')
        second_stock = auth_client.post(stock_url, second_stock_payload, format='json')

        assert first_stock.status_code == status.HTTP_200_OK, first_stock.data
        assert second_stock.status_code == status.HTTP_200_OK, second_stock.data
        references = FarmFeedReference.objects.filter(
            farm_profile=cycle.farm_profile,
            source='external',
            normalized_name='aliment marché qa',
            species='clarias',
            pellet_size_mm=Decimal('2.00'),
        )
        assert references.count() == 1
        entries = CycleFeedStockEntry.objects.filter(cycle=cycle).order_by('entry_date')
        assert entries.count() == 2
        assert sum((entry.quantity_kg for entry in entries), Decimal('0')) == Decimal('10.00')
        assert sum((entry.total_cost_fcfa for entry in entries), Decimal('0')) == Decimal('15500.00')
        assert [(entry.note, entry.entry_date) for entry in entries] == [
            ('QA lot externe A', first_entry_date),
            ('QA lot externe B', second_entry_date),
        ]
        assert all(entry.feed_reference_id == references.get().id for entry in entries)
        assert all(entry.feed_reference.species == 'clarias' for entry in entries)
        assert all(entry.feed_reference.pellet_size_mm == Decimal('2.00') for entry in entries)

        first_reload = auth_client.get(store_url)
        second_reload = auth_client.get(store_url)
        assert first_reload.status_code == status.HTTP_200_OK
        assert second_reload.status_code == status.HTTP_200_OK
        assert {
            key: value for key, value in first_reload.data.items() if key != 'calculated_at'
        } == {
            key: value for key, value in second_reload.data.items() if key != 'calculated_at'
        }
        assert first_reload.data['summary']['estimated_feed_remaining_kg'] == '10.00'
        assert first_reload.data['summary']['feed_expenses_fcfa'] == '15500.00'
        assert (
            Decimal(baseline.data['summary']['feed_to_secure_kg'])
            - Decimal(first_reload.data['summary']['feed_to_secure_kg'])
        ) == Decimal('10.00'), first_reload.data
        assert CycleFeedStockEntry.objects.filter(cycle=cycle).count() == 2

        replay = auth_client.post(stock_url, second_stock_payload, format='json')
        assert replay.status_code == status.HTTP_200_OK
        assert CycleFeedStockEntry.objects.filter(cycle=cycle).count() == 2
        assert replay.data['summary']['estimated_feed_remaining_kg'] == '10.00'
        assert replay.data['summary']['feed_expenses_fcfa'] == '15500.00'

        conflict = auth_client.post(
            stock_url,
            {**second_stock_payload, 'quantity_kg': '6.00'},
            format='json',
        )
        assert conflict.status_code == status.HTTP_409_CONFLICT
        assert conflict.data['code'] == 'stock_entry_idempotency_conflict'
        assert CycleFeedStockEntry.objects.filter(cycle=cycle).count() == 2

        distinct_reference = auth_client.post(
            reference_url,
            {
                **reference_payload,
                'pellet_size_mm': '4.00',
                'client_uuid': str(uuid4()),
            },
            format='json',
        )
        assert distinct_reference.status_code == status.HTTP_201_CREATED
        assert distinct_reference.data['id'] != first_reference.data['id']
        assert FarmFeedReference.objects.filter(
            farm_profile=cycle.farm_profile,
            normalized_name='aliment marché qa',
        ).count() == 2

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
