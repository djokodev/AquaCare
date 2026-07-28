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
from django.db import IntegrityError, transaction
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
