from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from accounts.models import FarmProfile
from aquaculture.models import CycleFeedStockEntry, FarmFeedReference, ProductionCycle
from aquaculture.services.cycle_feed_recommendation_service import CycleFeedRecommendationService
from aquaculture.services.cycle_store_application_service import CycleStoreApplicationService
from commerce.models import Order, OrderItem, Product
from django.urls import reverse
from django.utils import timezone


def create_cycle(user, *, species='tilapia'):
    farm, _ = FarmProfile.objects.get_or_create(user=user, defaults={'farm_name': f'Ferme {uuid4().hex[:6]}'})
    return ProductionCycle.objects.create(
        farm_profile=farm,
        cycle_name='Cycle recommandation',
        species=species,
        pond_identifier='B1',
        start_date=timezone.localdate() - timedelta(days=20),
        initial_count=1000,
        initial_average_weight=Decimal('10'),
        initial_biomass=Decimal('10'),
        current_count=900,
        current_average_weight=Decimal('50'),
        current_biomass=Decimal('45'),
        target_harvest_weight_g=Decimal('400'),
        planned_cycle_duration_days=120,
        planned_harvest_date=timezone.localdate() + timedelta(days=100),
        status='active',
    )


@pytest.mark.django_db
def test_external_feed_is_idempotent_and_scoped_to_farm(auth_client, authenticated_user):
    cycle = create_cycle(authenticated_user)
    client_uuid = uuid4()
    payload = {
        'farm_profile': str(cycle.farm_profile_id),
        'source': 'external',
        'name': 'Aliment du marché',
        'species': 'tilapia',
        'pellet_size_mm': '2.00',
        'client_uuid': str(client_uuid),
        'created_offline': True,
    }
    url = reverse('aquaculture:feed-reference-list')
    first = auth_client.post(url, payload, format='json')
    second = auth_client.post(url, payload, format='json')

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.data['id'] == second.data['id']
    assert FarmFeedReference.objects.filter(client_uuid=client_uuid).count() == 1


@pytest.mark.django_db
def test_external_feed_requires_name_species_and_pellet_size(auth_client, authenticated_user):
    cycle = create_cycle(authenticated_user)
    response = auth_client.post(
        reverse('aquaculture:feed-reference-list'),
        {
            'farm_profile': str(cycle.farm_profile_id),
            'source': 'external',
            'name': 'Aliment incomplet',
            'species': 'tilapia',
        },
        format='json',
    )

    assert response.status_code == 400
    assert 'detail' in response.data


@pytest.mark.django_db
def test_classifying_legacy_stock_preserves_quantity_cost_and_date(authenticated_user):
    cycle = create_cycle(authenticated_user)
    entry_date = timezone.localdate() - timedelta(days=2)
    entry = CycleFeedStockEntry.objects.create(
        cycle=cycle,
        source='manual',
        label='Ancien aliment',
        quantity_kg=Decimal('110'),
        total_cost_fcfa=Decimal('88000'),
        entry_date=entry_date,
    )
    reference = FarmFeedReference.objects.create(
        farm_profile=cycle.farm_profile,
        source='external',
        name='Aliment identifié',
        species=cycle.species,
        pellet_size_mm=Decimal('3'),
    )

    CycleStoreApplicationService.classify_legacy_stock(
        user=authenticated_user,
        cycle=cycle,
        entry_id=entry.id,
        feed_reference_id=reference.id,
    )
    entry.refresh_from_db()

    assert entry.feed_reference == reference
    assert entry.quantity_kg == Decimal('110')
    assert entry.total_cost_fcfa == Decimal('88000')
    assert entry.entry_date == entry_date


@pytest.mark.django_db
def test_recommendation_allocates_external_stock_and_pending_order(
    authenticated_user,
    monkeypatch,
):
    cycle = create_cycle(authenticated_user)
    product = Product.objects.create(
        brand='dibaq',
        name='DIBAQ Tilapia 2mm',
        species='tilapia',
        pellet_size_mm=Decimal('2'),
        package_weight_kg=15,
        price_per_package=Decimal('23500'),
    )
    external = FarmFeedReference.objects.create(
        farm_profile=cycle.farm_profile,
        source='external',
        name='Aliment externe 2mm',
        species='tilapia',
        pellet_size_mm=Decimal('2'),
    )
    CycleFeedStockEntry.objects.create(
        cycle=cycle,
        feed_reference=external,
        source='manual',
        label=external.name,
        feed_size_mm=external.pellet_size_mm,
        quantity_kg=Decimal('15'),
        entry_date=timezone.localdate(),
    )
    order = Order.objects.create(
        user=authenticated_user,
        farm_profile=cycle.farm_profile,
        production_cycle=cycle,
        order_number='ORD-RECOMMENDATION',
        status='confirmed',
        delivery_method='pickup',
        pickup_location='ndokoti',
        delivery_name='Test',
        delivery_phone='+237690000001',
        delivery_region='Littoral',
        delivery_city='Douala',
        delivery_full_address='Douala',
        subtotal=product.price_per_package,
        delivery_fee=Decimal('0'),
        total=product.price_per_package,
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        product_name=product.name,
        unit_price=product.price_per_package,
        quantity=1,
        line_total=product.price_per_package,
    )
    simulation = {
        'parameters': {'species': 'tilapia'},
        'summary': {'total_feed_kg': Decimal('40')},
        'feeding_phases': [{
            'phase_name': 'grossissement',
            'days_range': [1, 10],
            'weight_range_g': [50, 100],
            'pellet_size_mm': 2,
            'duration_days': 10,
            'total_consumption_kg': Decimal('40'),
        }],
    }
    monkeypatch.setattr(
        CycleFeedRecommendationService,
        '_simulation',
        classmethod(lambda cls, target_cycle, current: simulation),
    )

    result = CycleFeedRecommendationService.build(cycle)
    phase = result['feeding_phases'][0]

    assert phase['allocated_stock_kg'] == '15.00'
    assert phase['allocated_pending_kg'] == '15.00'
    assert phase['shortfall_kg'] == '10.00'
    assert phase['total_bags'] == 1
    assert phase['surplus_kg'] == '5.00'


@pytest.mark.django_db
def test_unclassified_stock_is_not_allocated(authenticated_user, monkeypatch):
    cycle = create_cycle(authenticated_user)
    CycleFeedStockEntry.objects.create(
        cycle=cycle,
        source='manual',
        label='Ancien Dibaq',
        feed_size_mm=None,
        quantity_kg=Decimal('110'),
        entry_date=timezone.localdate(),
    )
    simulation = {
        'parameters': {'species': 'tilapia'},
        'summary': {'total_feed_kg': Decimal('40')},
        'feeding_phases': [{
            'phase_name': 'grossissement', 'days_range': [1, 10], 'weight_range_g': [50, 100],
            'pellet_size_mm': 2, 'duration_days': 10, 'total_consumption_kg': Decimal('40'),
        }],
    }
    monkeypatch.setattr(
        CycleFeedRecommendationService,
        '_simulation',
        classmethod(lambda cls, target_cycle, current: simulation),
    )

    result = CycleFeedRecommendationService.build(cycle)

    assert result['status'] == 'incomplete'
    assert result['summary']['compatible_stock_kg'] == '0.00'
    assert result['summary']['unclassified_stock_kg'] == '110.00'


@pytest.mark.django_db
def test_target_weight_reached_returns_covered_zero_need(authenticated_user, monkeypatch):
    cycle = create_cycle(authenticated_user)
    cycle.current_average_weight = cycle.target_harvest_weight_g
    cycle.save(update_fields=['current_average_weight'])
    initial_simulation = {
        'parameters': {'species': 'tilapia'},
        'summary': {'total_feed_kg': Decimal('80')},
        'feeding_phases': [],
    }
    monkeypatch.setattr(
        CycleFeedRecommendationService,
        '_simulation',
        classmethod(lambda cls, target_cycle, current: {} if current else initial_simulation),
    )

    result = CycleFeedRecommendationService.build(cycle)

    assert result['status'] == 'available'
    assert result['summary']['estimated_remaining_need_kg'] == '0.00'
    assert result['summary']['feed_to_order_kg'] == '0.00'
