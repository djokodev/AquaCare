from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

import pytest
from aquaculture.domain.exceptions import EventBeforeTrackingStartError
from aquaculture.models import (
    CycleFeedPlan,
    CycleFeedStockEntry,
    CycleLog,
    CycleUnitAllocation,
    FarmFeedReference,
    FarmProductionPlan,
    ProductionCycle,
    ProductionUnit,
)
from aquaculture.services.analytics_service import AnalyticsService
from aquaculture.services.cycle_feed_recommendation_service import (
    CycleFeedRecommendationService,
)
from aquaculture.services.cycle_store_application_service import (
    CycleStoreApplicationService,
)
from aquaculture.services.cycle_store_service import CycleStoreService
from aquaculture.services.log_service import CycleLogService
from django.db import IntegrityError, connection, transaction
from django.urls import reverse
from django.utils import timezone
from rest_framework import status


def ongoing_launch_payload() -> dict:
    today = timezone.localdate()
    return {
        'launch_uuid': str(uuid4()),
        'launch_kind': 'initial_setup',
        'production_plan': {
            'annual_production_target_kg': '1520.00',
            'num_cycles_per_year': 2,
            'fingerlings_cost_per_unit_fcfa': '50.00',
            'planned_selling_price_per_kg_fcfa': '2000.00',
        },
        'cycle': {
            'onboarding_mode': 'ongoing',
            'cycle_name': 'Clarias Bassins Nord',
            'species': 'clarias',
            'start_date': (today - timedelta(days=60)).isoformat(),
            'initial_count': 2000,
            'initial_average_weight': None,
            'target_harvest_weight_g': '400.00',
            'planned_cycle_duration_days': 150,
            'expected_survival_rate_pct': '95.00',
            'planned_selling_price_per_kg_fcfa': '2000.00',
            'fingerlings_cost_fcfa': '100000.00',
            'other_operational_costs_fcfa': '50000.00',
            'created_offline': False,
        },
        'tracking_baseline': {
            'tracking_start_date': today.isoformat(),
            'fish_count': 1850,
            'average_weight_g': '75.00',
            'biomass_kg': '140.00',
        },
        'production_units': [
            {
                'local_id': 'unit-a',
                'source': 'new',
                'name': 'Bassin A',
                'unit_type': 'tank',
                'volume_m3': '12.00',
            },
            {
                'local_id': 'unit-b',
                'source': 'new',
                'name': 'Bassin B',
                'unit_type': 'tank',
                'volume_m3': '8.00',
            },
        ],
        'allocations': [
            {'production_unit_local_id': 'unit-a', 'fish_count': 1000},
            {'production_unit_local_id': 'unit-b', 'fish_count': 850},
        ],
        'initial_feed_stocks': [
            {
                'local_id': 'opening-2mm',
                'external_feed': {
                    'client_uuid': str(uuid4()),
                    'name': ' Aliment marché Clarias ',
                    'pellet_size_mm': '2.00',
                    'brand': '',
                },
                'quantity_kg': '20.00',
                'cost_status': 'known',
                'total_cost_fcfa': '18000.00',
                'note': 'Reliquat au début du suivi',
            },
            {
                'local_id': 'opening-3mm',
                'external_feed': {
                    'client_uuid': str(uuid4()),
                    'name': 'Aliment local 3 mm',
                    'pellet_size_mm': '3.00',
                    'brand': '',
                },
                'quantity_kg': '45.00',
                'cost_status': 'unknown',
                'total_cost_fcfa': None,
                'note': '',
            },
        ],
        'calibration_units': [],
    }


@pytest.mark.django_db
def test_ongoing_launch_persists_baseline_opening_stock_and_remaining_plan(
    auth_client,
    farm_profile,
):
    payload = ongoing_launch_payload()
    response = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )

    assert response.status_code == status.HTTP_201_CREATED, response.data
    cycle = ProductionCycle.objects.get()
    assert cycle.onboarding_mode == ProductionCycle.ONBOARDING_MODE_ONGOING
    assert cycle.initial_average_weight is None
    assert cycle.initial_biomass is None
    assert cycle.tracking_start_count == 1850
    assert cycle.tracking_start_average_weight == Decimal('75.00')
    assert cycle.tracking_start_biomass == Decimal('140.00')
    assert cycle.tracking_start_biomass_source == 'declared'
    assert cycle.current_count == 1850
    assert cycle.current_average_weight == Decimal('75.00')
    assert cycle.current_biomass == Decimal('140.00')
    assert cycle.historical_count_gap == 150
    assert cycle.history_scope == 'since_tracking_start'
    assert CycleLog.objects.count() == 0

    allocations = list(CycleUnitAllocation.objects.order_by('production_unit__name'))
    assert sum((item.initial_biomass_kg for item in allocations), Decimal('0')) == Decimal('140.00')
    assert allocations[0].initial_biomass_kg == Decimal('75.68')
    assert allocations[1].initial_biomass_kg == Decimal('64.32')

    entries = list(CycleFeedStockEntry.objects.order_by('feed_size_mm'))
    assert len(entries) == 2
    assert all(item.entry_kind == 'opening_balance' for item in entries)
    assert all(item.entry_date == cycle.tracking_start_date for item in entries)
    assert entries[0].total_cost_fcfa == Decimal('18000.00')
    assert entries[1].cost_status == 'unknown'
    assert entries[1].total_cost_fcfa is None
    assert len(response.data['opening_feed_references']) == 2
    assert set(response.data['opening_stock_entry_id_by_local_id']) == {
        'opening-2mm',
        'opening-3mm',
    }

    plan = CycleFeedPlan.objects.get(cycle=cycle)
    assert plan.parameters['onboarding_mode'] == 'ongoing'
    assert plan.parameters['plan_scope'] == 'remaining_cycle'
    assert plan.parameters['pre_tracking_history'] == 'not_tracked'
    assert plan.parameters['initial_fish_count'] == 1850
    assert plan.parameters['initial_weight_g'] == 75.0

    replay = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )
    assert replay.status_code == status.HTTP_200_OK
    assert replay.data['idempotent_replay'] is True
    assert ProductionCycle.objects.count() == 1
    assert CycleFeedStockEntry.objects.count() == 2
    assert FarmFeedReference.objects.count() == 2
    assert CycleFeedPlan.objects.count() == 1


@pytest.mark.django_db
@pytest.mark.parametrize(
    ('mutate', 'expected_code'),
    [
        (
            lambda payload: payload['tracking_baseline'].update(
                tracking_start_date=(
                    timezone.localdate() + timedelta(days=1)
                ).isoformat()
            ),
            'ongoing_cycle_tracking_date_in_future',
        ),
        (
            lambda payload: payload['tracking_baseline'].update(fish_count=2001),
            'ongoing_cycle_current_count_exceeds_initial',
        ),
        (
            lambda payload: payload['tracking_baseline'].update(biomass_kg='200.00'),
            'ongoing_cycle_biomass_inconsistent',
        ),
    ],
)
def test_ongoing_launch_rejects_invalid_baselines(
    auth_client,
    farm_profile,
    mutate,
    expected_code,
):
    payload = ongoing_launch_payload()
    mutate(payload)
    if payload['tracking_baseline']['fish_count'] != 1850:
        payload['allocations'][1]['fish_count'] = (
            payload['tracking_baseline']['fish_count'] - 1000
        )

    response = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data['code'][0] == expected_code
    assert ProductionCycle.objects.count() == 0


@pytest.mark.django_db
def test_ongoing_launch_rolls_back_everything_when_opening_stock_fails(
    auth_client,
    farm_profile,
):
    payload = ongoing_launch_payload()
    initial_plan_count = FarmProductionPlan.objects.count()
    original = CycleStoreApplicationService.declare_opening_stock.__func__
    calls = 0

    def fail_second(cls, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise ValueError('injected opening stock failure')
        return original(cls, **kwargs)

    with patch.object(
        CycleStoreApplicationService,
        'declare_opening_stock',
        classmethod(fail_second),
    ), pytest.raises(ValueError, match='injected opening stock failure'):
        auth_client.post(
            reverse('aquaculture:production_cycle_launch'),
            payload,
            format='json',
        )

    assert FarmProductionPlan.objects.count() == initial_plan_count
    assert FarmProductionPlan.objects.get(farm_profile=farm_profile).setup_completed is False
    assert ProductionCycle.objects.count() == 0
    assert ProductionUnit.objects.count() == 0
    assert CycleUnitAllocation.objects.count() == 0
    assert FarmFeedReference.objects.count() == 0
    assert CycleFeedStockEntry.objects.count() == 0
    assert CycleFeedPlan.objects.count() == 0


@pytest.mark.django_db
def test_ongoing_observed_metrics_and_store_costs_start_at_tracking_baseline(
    auth_client,
    farm_profile,
):
    payload = ongoing_launch_payload()
    tracking_date = timezone.localdate() - timedelta(days=5)
    payload['tracking_baseline']['tracking_start_date'] = tracking_date.isoformat()
    response = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )
    assert response.status_code == status.HTTP_201_CREATED, response.data
    cycle = ProductionCycle.objects.get()
    allocation = cycle.unit_allocations.order_by('production_unit__name').first()

    CycleLogService.create_log(
        cycle,
        {
            'log_date': tracking_date,
            'cycle_unit_allocation': allocation,
            'mortality_count': 10,
            'average_weight': Decimal('76.00'),
        },
        user=farm_profile.user,
    )
    cycle.refresh_from_db()

    mortality = AnalyticsService.analyze_mortality(cycle)
    growth = AnalyticsService.analyze_growth(cycle)
    store = CycleStoreService.get_store_payload(cycle)

    assert mortality['total'] == 10
    assert mortality['percentage'] == pytest.approx(10 / 1850 * 100)
    assert cycle.current_count == 1840
    assert cycle.historical_count_gap == 150
    assert growth[0]['day'] == 0
    assert growth[0]['cumulative_gain'] == 1.0
    assert cycle.days_active() > cycle.days_tracked()
    assert store['summary']['known_opening_stock_cost_fcfa'] == '18000.00'
    assert store['summary']['tracked_feed_expenses_fcfa'] == '0.00'
    assert store['summary']['unknown_cost_entries_count'] == 1
    assert store['summary']['cost_history_complete'] is False


@pytest.mark.django_db
def test_ongoing_events_before_baseline_are_rejected_but_baseline_is_allowed(
    auth_client,
    farm_profile,
):
    payload = ongoing_launch_payload()
    tracking_date = timezone.localdate() - timedelta(days=2)
    payload['tracking_baseline']['tracking_start_date'] = tracking_date.isoformat()
    response = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )
    assert response.status_code == status.HTTP_201_CREATED
    cycle = ProductionCycle.objects.get()

    with pytest.raises(EventBeforeTrackingStartError):
        CycleLogService.create_log(
            cycle,
            {'log_date': tracking_date - timedelta(days=1)},
            user=farm_profile.user,
        )

    accepted = CycleLogService.create_log(
        cycle,
        {'log_date': tracking_date},
        user=farm_profile.user,
    )
    assert accepted.log_date == tracking_date

    reference = FarmFeedReference.objects.first()
    with pytest.raises(EventBeforeTrackingStartError):
        CycleStoreService.declare_manual_stock(
            user=farm_profile.user,
            cycle=cycle,
            feed_reference=reference,
            quantity_kg=Decimal('2.00'),
            total_cost_fcfa=Decimal('1000.00'),
            entry_date=tracking_date - timedelta(days=1),
        )


@pytest.mark.django_db
def test_target_weight_reached_creates_zero_remaining_plan_with_warning(
    auth_client,
    farm_profile,
):
    payload = ongoing_launch_payload()
    payload['tracking_baseline']['average_weight_g'] = '400.00'
    payload['tracking_baseline']['biomass_kg'] = None
    response = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )
    assert response.status_code == status.HTTP_201_CREATED, response.data
    cycle = ProductionCycle.objects.get()
    plan = CycleFeedPlan.objects.get(cycle=cycle)
    recommendation = CycleFeedRecommendationService.build(cycle)

    assert plan.total_feed_kg == Decimal('0.00')
    assert plan.phases == []
    assert recommendation['summary']['estimated_remaining_need_kg'] == '0.00'
    assert 'target_weight_reached' in recommendation['warnings']


@pytest.mark.django_db
def test_ongoing_density_uses_baseline_count_not_historical_count(
    auth_client,
    farm_profile,
):
    """Density is validated against tracking_start_count, not initial_count."""
    payload = ongoing_launch_payload()
    # Historical count (2000) exceeds pond capacity of 1200
    # Baseline count (1000) is within capacity
    payload['cycle']['initial_count'] = 2000
    payload['cycle']['tracking_start_count'] = 1000
    payload['production_units'] = [{
        'local_id': 'pond-a',
        'source': 'new',
        'name': 'Bassin A',
        'unit_type': 'tank',
        'volume_m3': 5,  # capacity = 5 * 300 = 1500 fish
    }]
    payload['allocations'] = [{
        'production_unit_local_id': 'pond-a',
        'fish_count': 1000,
    }]
    payload['tracking_baseline'] = {
        'tracking_start_date': payload['cycle']['start_date'],
        'fish_count': 1000,
        'average_weight_g': '150.00',
        'biomass_kg': None,
    }
    response = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )
    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db(transaction=True)
def test_ongoing_density_rejects_when_baseline_count_exceeds_capacity(
    auth_client,
    farm_profile,
):
    """Density is rejected when tracking_start_count exceeds capacity."""
    payload = ongoing_launch_payload()
    payload['cycle']['initial_count'] = 2000
    payload['cycle']['tracking_start_count'] = 2000
    payload['production_units'] = [{
        'local_id': 'pond-a',
        'source': 'new',
        'name': 'Bassin A',
        'unit_type': 'tank',
        'volume_m3': 5,  # capacity = 5 * 300 = 1500 fish
    }]
    payload['allocations'] = [{
        'production_unit_local_id': 'pond-a',
        'fish_count': 2000,
    }]
    payload['tracking_baseline'] = {
        'tracking_start_date': payload['cycle']['start_date'],
        'fish_count': 2000,
        'average_weight_g': '150.00',
        'biomass_kg': None,
    }
    response = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db(transaction=True)
def test_feed_stock_cost_status_database_constraint(
    auth_client,
    farm_profile,
):
    payload = ongoing_launch_payload()
    response = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )
    assert response.status_code == status.HTTP_201_CREATED
    cycle = ProductionCycle.objects.get()
    reference = FarmFeedReference.objects.first()

    with pytest.raises(IntegrityError), transaction.atomic():
        CycleFeedStockEntry.objects.create(
            cycle=cycle,
            feed_reference=reference,
            label=reference.name,
            quantity_kg=Decimal('1.00'),
            total_cost_fcfa=None,
            cost_status='known',
            entry_kind='manual_supply',
            entry_date=cycle.tracking_start_date,
        )


@pytest.mark.django_db(transaction=True)
def test_ongoing_cycle_baseline_not_null_constraint(
    auth_client,
    farm_profile,
):
    """PostgreSQL rejects every NULL ongoing baseline component at insertion."""
    if connection.vendor != 'postgresql':
        pytest.skip('PostgreSQL constraint integration test')

    today = timezone.localdate()
    baseline_values = {
        'tracking_start_date': today,
        'tracking_start_count': 100,
        'tracking_start_average_weight': Decimal('150.00'),
        'tracking_start_biomass': Decimal('15.00'),
    }

    for null_field in baseline_values:
        kwargs = {k: v for k, v in baseline_values.items()}
        kwargs[null_field] = None
        cycle = ProductionCycle(
            farm_profile=farm_profile,
            onboarding_mode='ongoing',
            cycle_name='Constraint Test',
            species='clarias',
            start_date=today - timedelta(days=30),
            initial_count=200,
            current_count=100,
            current_average_weight=Decimal('150.00'),
            current_biomass=Decimal('15.00'),
            total_feed_consumed=Decimal('0'),
            status='active',
            **kwargs,
        )
        with pytest.raises(IntegrityError):
            with transaction.atomic():
                ProductionCycle.objects.bulk_create([cycle])


@pytest.mark.django_db(transaction=True)
def test_ongoing_cycle_baseline_constraint_passes_for_valid_new_cycle(
    auth_client,
    farm_profile,
):
    """A new-mode cycle with default tracking_start_* values passes the constraint."""
    today = timezone.localdate()
    cycle = ProductionCycle.objects.create(
        farm_profile=farm_profile,
        onboarding_mode='new',
        cycle_name='Valid New',
        species='tilapia',
        start_date=today,
        initial_count=100,
        initial_average_weight=Decimal('50.00'),
        current_count=100,
        current_average_weight=Decimal('50.00'),
        current_biomass=Decimal('5.00'),
        total_feed_consumed=Decimal('0'),
        status='active',
        tracking_start_date=today,
        tracking_start_count=100,
        tracking_start_average_weight=Decimal('50.00'),
        tracking_start_biomass=Decimal('5.00'),
        tracking_start_biomass_source='calculated',
    )
    assert cycle.pk is not None


@pytest.mark.django_db(transaction=True)
def test_ongoing_fcr_scope_in_dashboard(
    auth_client,
    farm_profile,
):
    """An ongoing cycle with complete tracked data shows FCR with scope since_tracking_start."""
    today = timezone.localdate()
    tracking_start = today - timedelta(days=30)
    payload = ongoing_launch_payload()
    payload['cycle']['start_date'] = (today - timedelta(days=60)).isoformat()
    payload['cycle']['tracking_start_date'] = tracking_start.isoformat()
    payload['cycle']['planned_harvest_date'] = (today + timedelta(days=60)).isoformat()
    response = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )
    assert response.status_code == status.HTTP_201_CREATED
    cycle_id = response.data['production_cycle']['id']
    cycle = ProductionCycle.objects.get(pk=cycle_id)

    # Add tracked logs after baseline
    with transaction.atomic():
        for day_offset in range(1, 5):
            CycleLog.objects.create(
                cycle=cycle,
                log_date=tracking_start + timedelta(days=day_offset),
                mortality_count=0,
                feed_quantity=Decimal('10.00'),
                average_weight=Decimal('200.00'),
            )
    cycle.total_feed_consumed = Decimal('40.00')
    cycle.current_biomass = Decimal('30.00')
    cycle.fcr = Decimal('40.00') / (Decimal('30.00') - Decimal('140.00')).copy_abs()
    cycle.save()

    response = auth_client.get(
        reverse('aquaculture:production-cycle-dashboard', kwargs={'pk': cycle_id}),
    )
    assert response.status_code == status.HTTP_200_OK
    dashboard = response.data
    assert dashboard['cycle']['fcr'] is not None
    assert dashboard['cycle']['history_scope'] == 'since_tracking_start'


@pytest.mark.django_db(transaction=True)
def test_new_cycle_fcr_scope_full_cycle(
    auth_client,
    farm_profile,
):
    """A new cycle with complete data shows FCR with scope full_cycle."""
    today = timezone.localdate()
    payload = ongoing_launch_payload()
    payload['cycle']['onboarding_mode'] = 'new'
    payload['cycle']['initial_average_weight'] = '50.00'
    payload.pop('tracking_baseline', None)
    payload['cycle']['start_date'] = (today - timedelta(days=30)).isoformat()
    payload['cycle']['planned_harvest_date'] = (today + timedelta(days=90)).isoformat()
    # Allocations must sum to initial_count for new cycles
    payload['allocations'] = [
        {'production_unit_local_id': 'unit-a', 'fish_count': 1200},
        {'production_unit_local_id': 'unit-b', 'fish_count': 800},
    ]
    response = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )
    assert response.status_code == status.HTTP_201_CREATED
    cycle_id = response.data['production_cycle']['id']
    cycle = ProductionCycle.objects.get(pk=cycle_id)

    with transaction.atomic():
        for day_offset in range(1, 5):
            CycleLog.objects.create(
                cycle=cycle,
                log_date=cycle.start_date + timedelta(days=day_offset),
                mortality_count=0,
                feed_quantity=Decimal('10.00'),
                average_weight=Decimal('100.00'),
            )
    cycle.total_feed_consumed = Decimal('40.00')
    cycle.current_biomass = Decimal('20.00')
    cycle.fcr = Decimal('40.00') / Decimal('20.00')
    cycle.save()

    response = auth_client.get(
        reverse('aquaculture:production-cycle-dashboard', kwargs={'pk': cycle_id}),
    )
    assert response.status_code == status.HTTP_200_OK
    dashboard = response.data
    assert dashboard['cycle']['fcr'] is not None
    assert dashboard['cycle']['history_scope'] == 'full_cycle'


@pytest.mark.django_db(transaction=True)
def test_ongoing_fcr_null_in_dashboard_when_data_incomplete(
    auth_client,
    farm_profile,
):
    """An ongoing cycle with incomplete feed data shows fcr=None in dashboard."""
    today = timezone.localdate()
    tracking_start = today - timedelta(days=30)
    payload = ongoing_launch_payload()
    payload['cycle']['start_date'] = (today - timedelta(days=60)).isoformat()
    payload['cycle']['tracking_start_date'] = tracking_start.isoformat()
    payload['cycle']['planned_harvest_date'] = (today + timedelta(days=60)).isoformat()
    response = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )
    assert response.status_code == status.HTTP_201_CREATED
    cycle_id = response.data['production_cycle']['id']
    cycle = ProductionCycle.objects.get(pk=cycle_id)

    cycle.total_feed_consumed = Decimal('0')
    cycle.save()

    response = auth_client.get(
        reverse('aquaculture:production-cycle-dashboard', kwargs={'pk': cycle_id}),
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.data['cycle']['fcr'] is None


@pytest.mark.django_db(transaction=True)
def test_ongoing_launch_rejects_unknown_feed_reference_id(
    auth_client,
    farm_profile,
):
    """A non-existent feed_reference_id returns 404, not 500."""
    payload = ongoing_launch_payload()
    payload['initial_feed_stocks'] = [{
        'local_id': 'stock-1',
        'feed_reference_id': '00000000-0000-0000-0000-000000000000',
        'quantity_kg': '100.00',
        'cost_status': 'known',
        'total_cost_fcfa': '50000.00',
    }]
    response = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data['code'] == 'feed_reference_not_found'


@pytest.mark.django_db(transaction=True)
def test_ongoing_launch_rejects_unknown_feed_reference_client_uuid(
    auth_client,
    farm_profile,
):
    """A non-existent feed_reference_client_uuid returns 404, not 500."""
    payload = ongoing_launch_payload()
    payload['initial_feed_stocks'] = [{
        'local_id': 'stock-1',
        'feed_reference_client_uuid': '00000000-0000-0000-0000-000000000000',
        'quantity_kg': '100.00',
        'cost_status': 'known',
        'total_cost_fcfa': '50000.00',
    }]
    response = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data['code'] == 'feed_reference_not_found'


@pytest.mark.django_db(transaction=True)
def test_ongoing_launch_rejects_feed_reference_from_another_farm(
    auth_client,
    farm_profile,
    user_factory,
):
    """A feed reference owned by another farm returns 404 (no cross-farm leak)."""
    other_user = user_factory()
    reference = FarmFeedReference.objects.create(
        farm_profile=other_user.farm_profile,
        source='external',
        name='Other Farm Feed',
        normalized_name='other farm feed',
        species='clarias',
        pellet_size_mm=Decimal('2.00'),
    )
    payload = ongoing_launch_payload()
    payload['initial_feed_stocks'] = [{
        'local_id': 'stock-1',
        'feed_reference_id': str(reference.id),
        'quantity_kg': '100.00',
        'cost_status': 'known',
        'total_cost_fcfa': '50000.00',
    }]
    response = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.data['code'] == 'feed_reference_not_found'
    # No cycle, unit, allocation, stock, or reference should have been created
    assert ProductionCycle.objects.count() == 0
    assert ProductionUnit.objects.count() == 0
    assert CycleUnitAllocation.objects.count() == 0
    assert CycleFeedStockEntry.objects.count() == 0


@pytest.mark.django_db(transaction=True)
def test_ongoing_launch_rejects_species_mismatch_feed_reference(
    auth_client,
    farm_profile,
):
    """A feed reference with wrong species returns 400, not 500."""
    reference = FarmFeedReference.objects.create(
        farm_profile=farm_profile,
        source='external',
        name='Tilapia Feed',
        normalized_name='tilapia feed',
        species='tilapia',
        pellet_size_mm=Decimal('2.00'),
    )
    payload = ongoing_launch_payload()
    payload['cycle']['species'] = 'clarias'
    payload['initial_feed_stocks'] = [{
        'local_id': 'stock-1',
        'feed_reference_id': str(reference.id),
        'quantity_kg': '100.00',
        'cost_status': 'known',
        'total_cost_fcfa': '50000.00',
    }]
    response = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data['code'] == 'feed_reference_species_mismatch'
    assert ProductionCycle.objects.count() == 0
    assert CycleFeedStockEntry.objects.count() == 0
