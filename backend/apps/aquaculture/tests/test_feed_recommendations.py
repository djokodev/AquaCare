from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from threading import Barrier
from uuid import uuid4

import pytest
from accounts.models import FarmProfile
from aquaculture.models import (
    CycleFeedPlan,
    CycleFeedStockAdjustment,
    CycleFeedStockEntry,
    CycleLog,
    FarmFeedReference,
    ProductionCycle,
)
from aquaculture.services.cycle_feed_plan_progression_service import (
    CycleFeedPlanProgressionService,
)
from aquaculture.services.cycle_feed_recommendation_service import CycleFeedRecommendationService
from aquaculture.services.cycle_store_application_service import CycleStoreApplicationService
from aquaculture.services.log_service import CycleLogService
from commerce.models import Order, OrderItem, Product
from django.db import close_old_connections, connection
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


def create_plan(cycle, simulation):
    return CycleFeedPlan.objects.create(
        cycle=cycle,
        version=2,
        parameters=CycleFeedRecommendationService._json_safe(simulation.get('parameters', {})),
        phases=CycleFeedRecommendationService._json_safe(simulation.get('feeding_phases', [])),
        total_feed_kg=Decimal(str(simulation['summary']['total_feed_kg'])),
    )


@pytest.mark.django_db
def test_daily_weight_persists_monotone_phase_progression(authenticated_user):
    cycle = create_cycle(authenticated_user)
    plan = CycleFeedPlan.objects.create(
        cycle=cycle,
        version=2,
        parameters={},
        phases=[
            {'planned_weight_range_g': ['1', '50'], 'planned_consumption_kg': '10'},
            {'planned_weight_range_g': ['51', '150'], 'planned_consumption_kg': '20'},
            {'planned_weight_range_g': ['151', '300'], 'planned_consumption_kg': '30'},
        ],
        total_feed_kg=Decimal('60'),
        highest_reached_phase_sequence=1,
    )

    CycleLogService.create_log(
        cycle,
        {
            'log_date': timezone.localdate(),
            'mortality_count': 0,
            'sample_count': 10,
            'sample_total_weight': Decimal('2500'),
            'mortality_reason': '',
            'observations': '',
        },
        user=authenticated_user,
    )

    plan.refresh_from_db()
    assert plan.highest_reached_phase_sequence == 3
    CycleFeedPlanProgressionService.record_progress_from_weight(
        cycle=cycle,
        observed_weight=Decimal('20'),
    )
    plan.refresh_from_db()
    assert plan.highest_reached_phase_sequence == 3


@pytest.mark.skipif(connection.vendor != 'postgresql', reason='Nécessite PostgreSQL.')
@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize('weights', [
    (Decimal('120'), Decimal('250')),
    (Decimal('250'), Decimal('20')),
])
def test_concurrent_phase_progress_keeps_highest_sequence(
    authenticated_user,
    weights,
):
    cycle = create_cycle(authenticated_user)
    plan = CycleFeedPlan.objects.create(
        cycle=cycle,
        version=2,
        parameters={},
        phases=[
            {'planned_weight_range_g': ['1', '50']},
            {'planned_weight_range_g': ['51', '150']},
            {'planned_weight_range_g': ['151', '300']},
        ],
        total_feed_kg=Decimal('60'),
        highest_reached_phase_sequence=1,
    )
    barrier = Barrier(2)

    def record(weight):
        close_old_connections()
        try:
            local_cycle = ProductionCycle.objects.get(pk=cycle.pk)
            barrier.wait(timeout=5)
            CycleFeedPlanProgressionService.record_progress_from_weight(
                cycle=local_cycle,
                observed_weight=weight,
            )
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(record, weights))

    plan.refresh_from_db()
    assert plan.highest_reached_phase_sequence == 3


@pytest.mark.skipif(connection.vendor != 'postgresql', reason='Nécessite PostgreSQL.')
@pytest.mark.django_db(transaction=True)
def test_concurrent_legacy_plan_backfill_creates_one_snapshot(authenticated_user):
    cycle = create_cycle(authenticated_user)
    barrier = Barrier(2)

    def ensure_plan():
        close_old_connections()
        try:
            local_cycle = ProductionCycle.objects.get(pk=cycle.pk)
            barrier.wait(timeout=5)
            return CycleFeedRecommendationService.ensure_plan(local_cycle).id
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        ids = list(executor.map(lambda _: ensure_plan(), range(2)))

    assert ids[0] == ids[1]
    assert CycleFeedPlan.objects.filter(cycle=cycle).count() == 1


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
def test_external_feed_replay_with_different_payload_conflicts(auth_client, authenticated_user):
    cycle = create_cycle(authenticated_user)
    client_uuid = uuid4()
    url = reverse('aquaculture:feed-reference-list')
    payload = {
        'farm_profile': str(cycle.farm_profile_id),
        'source': 'external',
        'name': 'Aliment stable',
        'species': 'tilapia',
        'pellet_size_mm': '2.00',
        'client_uuid': str(client_uuid),
    }
    assert auth_client.post(url, payload, format='json').status_code == 201

    response = auth_client.post(
        url,
        {**payload, 'pellet_size_mm': '3.00'},
        format='json',
    )

    assert response.status_code == 409
    assert response.data['code'] == 'feed_reference_idempotency_conflict'


@pytest.mark.django_db
def test_feed_reference_identity_cannot_be_patched(auth_client, authenticated_user):
    cycle = create_cycle(authenticated_user)
    reference = FarmFeedReference.objects.create(
        farm_profile=cycle.farm_profile,
        source='external',
        name='Identité immuable',
        species='tilapia',
        pellet_size_mm=Decimal('2.00'),
    )

    response = auth_client.patch(
        reverse('aquaculture:feed-reference-detail', args=[reference.id]),
        {'pellet_size_mm': '3.00'},
        format='json',
    )

    assert response.status_code == 405


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
def test_classifying_legacy_stock_preserves_physical_remainder(authenticated_user):
    cycle = create_cycle(authenticated_user)
    entry_date = timezone.localdate() - timedelta(days=2)
    entry = CycleFeedStockEntry.objects.create(
        cycle=cycle,
        source='manual',
        label='Ancien aliment 2 mm',
        feed_size_mm=Decimal('2.00'),
        quantity_kg=Decimal('110.00'),
        total_cost_fcfa=Decimal('88000.00'),
        entry_date=entry_date,
    )
    CycleLog.objects.create(
        cycle=cycle,
        log_date=entry_date + timedelta(days=1),
        feed_quantity=Decimal('30.00'),
        feed_type='Ancien aliment 2 mm',
        feed_size_mm=Decimal('2.00'),
    )
    reference = FarmFeedReference.objects.create(
        farm_profile=cycle.farm_profile,
        source='external',
        name='Aliment identifié',
        species=cycle.species,
        pellet_size_mm=Decimal('2.00'),
    )

    before = CycleStoreApplicationService.get_store(cycle)
    assert before['unclassified_entries'] == [{
        'id': str(entry.id),
        'label': 'Ancien aliment 2 mm',
        'quantity_kg': '110.00',
        'quantity_added_kg': '110.00',
        'historical_consumption_kg': '30.00',
        'quantity_available_kg': '80.00',
    }]
    CycleStoreApplicationService.classify_legacy_stock(
        user=authenticated_user,
        cycle=cycle,
        entry_id=entry.id,
        feed_reference_id=reference.id,
    )
    after = CycleStoreApplicationService.get_store(cycle)

    assert before['summary']['estimated_feed_remaining_kg'] == '80.00'
    assert after['summary']['estimated_feed_remaining_kg'] == '80.00'
    assert after['stock_items'][0]['quantity_available_kg'] == '80.00'
    assert CycleFeedStockAdjustment.objects.get(stock_entry=entry).quantity_kg == Decimal('30.00')


@pytest.mark.django_db
def test_legacy_consumption_is_allocated_fifo_across_same_identity(authenticated_user):
    cycle = create_cycle(authenticated_user)
    entry_date = timezone.localdate() - timedelta(days=2)
    entries = [
        CycleFeedStockEntry.objects.create(
            cycle=cycle,
            source='manual',
            label='Même aliment',
            feed_size_mm=Decimal('2.00'),
            quantity_kg=Decimal('50.00'),
            entry_date=entry_date,
        )
        for _ in range(2)
    ]
    CycleLog.objects.create(
        cycle=cycle,
        log_date=entry_date + timedelta(days=1),
        feed_quantity=Decimal('10.00'),
        feed_type='Même aliment',
        feed_size_mm=Decimal('2.00'),
    )
    reference = FarmFeedReference.objects.create(
        farm_profile=cycle.farm_profile,
        source='external',
        name='Même aliment identifié',
        species=cycle.species,
        pellet_size_mm=Decimal('2.00'),
    )

    before = CycleStoreApplicationService.get_store(cycle)
    breakdown = {
        item['id']: item
        for item in before['unclassified_entries']
    }
    assert breakdown[str(entries[0].id)]['historical_consumption_kg'] == '10.00'
    assert breakdown[str(entries[0].id)]['quantity_available_kg'] == '40.00'
    assert breakdown[str(entries[1].id)]['historical_consumption_kg'] == '0.00'
    assert breakdown[str(entries[1].id)]['quantity_available_kg'] == '50.00'

    CycleStoreApplicationService.classify_legacy_stock(
        user=authenticated_user,
        cycle=cycle,
        entry_id=entries[0].id,
        feed_reference_id=reference.id,
    )

    assert (
        CycleFeedStockAdjustment.objects.get(stock_entry=entries[0]).quantity_kg
        == Decimal('10.00')
    )
    assert not CycleFeedStockAdjustment.objects.filter(
        stock_entry=entries[1],
    ).exists()


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
    create_plan(cycle, simulation)
    monkeypatch.setattr(
        CycleFeedRecommendationService,
        '_current_simulation',
        classmethod(lambda cls, target_cycle, current_weight: (simulation, [])),
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
    create_plan(cycle, simulation)
    monkeypatch.setattr(
        CycleFeedRecommendationService,
        '_current_simulation',
        classmethod(lambda cls, target_cycle, current_weight: (simulation, [])),
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
    create_plan(cycle, initial_simulation)

    result = CycleFeedRecommendationService.build(cycle)

    assert result['status'] == 'available'
    assert result['summary']['estimated_remaining_need_kg'] == '0.00'
    assert result['summary']['feed_to_order_kg'] == '0.00'


@pytest.mark.django_db
def test_phase_ids_and_past_phase_stay_stable_after_weighing(authenticated_user, monkeypatch):
    cycle = create_cycle(authenticated_user)
    simulation = {
        'parameters': {'species': 'tilapia'},
        'summary': {'total_feed_kg': '90.00'},
        'feeding_phases': [
            {
                'phase_name': f'phase_{index}',
                'days_range': [start, start + 9],
                'weight_range_g': weights,
                'pellet_size_mm': size,
                'duration_days': 10,
                'total_consumption_kg': '30.00',
            }
            for index, (start, weights, size) in enumerate(
                [(1, [10, 50], 1), (11, [51, 150], 2), (21, [151, 400], 3)],
                start=1,
            )
        ],
    }
    plan = create_plan(cycle, simulation)
    monkeypatch.setattr(
        CycleFeedRecommendationService,
        '_current_simulation',
        classmethod(lambda cls, target_cycle, current_weight: (simulation, [])),
    )

    before = CycleFeedRecommendationService.build(cycle)
    cycle.current_average_weight = Decimal('180.00')
    cycle.save(update_fields=['current_average_weight'])
    CycleFeedPlanProgressionService.record_progress_from_weight(
        cycle=cycle,
        observed_weight=cycle.current_average_weight,
    )
    after = CycleFeedRecommendationService.build(cycle)

    assert [phase['phase_id'] for phase in before['feeding_phases']] == [
        phase['phase_id'] for phase in after['feeding_phases']
    ]
    assert after['feeding_phases'][0]['phase_status'] == 'past'
    assert after['feeding_phases'][0]['planned_consumption_kg'] == '30.00'
    plan.refresh_from_db()
    assert plan.phases == CycleFeedRecommendationService._json_safe(simulation['feeding_phases'])


@pytest.mark.django_db
def test_same_pellet_size_consumption_is_allocated_once_chronologically(
    authenticated_user,
    monkeypatch,
):
    cycle = create_cycle(authenticated_user)
    cycle.start_date = timezone.localdate() - timedelta(days=15)
    cycle.current_average_weight = Decimal('120.00')
    cycle.save(update_fields=['start_date', 'current_average_weight'])
    simulation = {
        'parameters': {'species': 'tilapia'},
        'summary': {'total_feed_kg': '40.00'},
        'feeding_phases': [
            {
                'phase_name': 'starter_a', 'days_range': [1, 10], 'weight_range_g': [10, 80],
                'pellet_size_mm': 2, 'duration_days': 10, 'total_consumption_kg': '20.00',
            },
            {
                'phase_name': 'starter_b', 'days_range': [11, 20], 'weight_range_g': [81, 160],
                'pellet_size_mm': 2, 'duration_days': 10, 'total_consumption_kg': '20.00',
            },
        ],
    }
    create_plan(cycle, simulation)
    reference = FarmFeedReference.objects.create(
        farm_profile=cycle.farm_profile,
        source='external',
        name='Feed 2 mm',
        species=cycle.species,
        pellet_size_mm=Decimal('2.00'),
    )
    CycleLog.objects.create(
        cycle=cycle,
        log_date=cycle.start_date + timedelta(days=4),
        feed_quantity=Decimal('3.00'),
        feed_reference=reference,
        feed_type=reference.name,
        feed_size_mm=reference.pellet_size_mm,
    )
    CycleLog.objects.create(
        cycle=cycle,
        log_date=cycle.start_date + timedelta(days=14),
        feed_quantity=Decimal('4.00'),
        feed_reference=reference,
        feed_type=reference.name,
        feed_size_mm=reference.pellet_size_mm,
    )
    monkeypatch.setattr(
        CycleFeedRecommendationService,
        '_current_simulation',
        classmethod(lambda cls, target_cycle, current_weight: (simulation, [])),
    )

    result = CycleFeedRecommendationService.build(cycle)
    actual = [Decimal(phase['actual_consumed_kg']) for phase in result['feeding_phases']]

    assert actual == [Decimal('3.00'), Decimal('4.00')]
    assert sum(actual) == Decimal('7.00')


@pytest.mark.django_db
def test_unclassified_consumption_is_kept_outside_phases(authenticated_user, monkeypatch):
    cycle = create_cycle(authenticated_user)
    simulation = {
        'parameters': {'species': 'tilapia'},
        'summary': {'total_feed_kg': '20.00'},
        'feeding_phases': [{
            'phase_name': 'starter', 'days_range': [1, 30], 'weight_range_g': [10, 100],
            'pellet_size_mm': 2, 'duration_days': 30, 'total_consumption_kg': '20.00',
        }],
    }
    create_plan(cycle, simulation)
    CycleLog.objects.create(
        cycle=cycle,
        log_date=timezone.localdate(),
        feed_quantity=Decimal('5.00'),
        feed_type='Legacy 2 mm',
        feed_size_mm=Decimal('2.00'),
    )
    monkeypatch.setattr(
        CycleFeedRecommendationService,
        '_current_simulation',
        classmethod(lambda cls, target_cycle, current_weight: (simulation, [])),
    )

    result = CycleFeedRecommendationService.build(cycle)

    assert result['feeding_phases'][0]['actual_consumed_kg'] == '0.00'
    assert result['summary']['unclassified_consumption_kg'] == '5.00'
    assert 'unclassified_consumption' in result['warnings']


@pytest.mark.django_db
def test_elapsed_harvest_date_never_forces_one_day_simulation(authenticated_user):
    cycle = create_cycle(authenticated_user)
    simulation = {
        'parameters': {'species': 'tilapia'},
        'summary': {'total_feed_kg': '20.00'},
        'feeding_phases': [{
            'phase_name': 'starter', 'days_range': [1, 30], 'weight_range_g': [10, 400],
            'pellet_size_mm': 2, 'duration_days': 30, 'total_consumption_kg': '20.00',
        }],
    }
    create_plan(cycle, simulation)
    cycle.planned_harvest_date = timezone.localdate() - timedelta(days=1)
    cycle.current_average_weight = Decimal('100.00')
    cycle.save(update_fields=['planned_harvest_date', 'current_average_weight'])

    result = CycleFeedRecommendationService.build(cycle)

    assert result['status'] == 'unavailable'
    assert result['summary']['feed_to_order_kg'] is None
    assert 'planned_harvest_date_elapsed' in result['warnings']


@pytest.mark.django_db
def test_exact_fifteen_kg_package_recommends_four_bags_for_52_kg(
    authenticated_user,
    monkeypatch,
):
    cycle = create_cycle(authenticated_user)
    Product.objects.create(
        brand='dibaq',
        name='Exact 2 mm 15 kg',
        species='tilapia',
        pellet_size_mm=Decimal('2.00'),
        package_weight_kg=15,
        price_per_package=Decimal('23500.00'),
    )
    simulation = {
        'parameters': {'species': 'tilapia'},
        'summary': {'total_feed_kg': '52.00'},
        'feeding_phases': [{
            'phase_name': 'starter', 'days_range': [1, 100], 'weight_range_g': [10, 400],
            'pellet_size_mm': 2, 'duration_days': 100, 'total_consumption_kg': '52.00',
        }],
    }
    create_plan(cycle, simulation)
    monkeypatch.setattr(
        CycleFeedRecommendationService,
        '_current_simulation',
        classmethod(lambda cls, target_cycle, current_weight: (simulation, [])),
    )

    result = CycleFeedRecommendationService.build(cycle)

    assert result['feeding_phases'][0]['total_bags'] == 4
    assert result['feeding_phases'][0]['products'][0]['total_kg'] == '60.00'
