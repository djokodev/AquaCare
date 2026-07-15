from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from aquaculture.domain.dashboard_metrics import (
    calculate_cycle_days_remaining,
    calculate_cycle_progress_pct,
    estimate_market_value_fcfa,
    resolve_biomass_data,
)
from aquaculture.services.cycle_dashboard_service import CycleDashboardService


def test_estimate_market_value_preserves_zero_and_rejects_missing_inputs():
    assert estimate_market_value_fcfa(Decimal('0'), Decimal('2000')) == Decimal('0.00')
    assert estimate_market_value_fcfa(Decimal('12.50'), Decimal('2000')) == Decimal('25000.00')
    assert estimate_market_value_fcfa(None, Decimal('2000')) is None
    assert estimate_market_value_fcfa(Decimal('12.50'), None) is None


def test_cycle_progress_handles_bounds_missing_and_harvested_cycles():
    today = date(2026, 7, 15)
    assert calculate_cycle_progress_pct(
        start_date=today + timedelta(days=2), planned_duration_days=100, status='planned', as_of=today
    ) == 0
    assert calculate_cycle_progress_pct(
        start_date=today - timedelta(days=49), planned_duration_days=100, status='active', as_of=today
    ) == 50
    assert calculate_cycle_progress_pct(
        start_date=today - timedelta(days=150), planned_duration_days=100, status='active', as_of=today
    ) == 100
    assert calculate_cycle_progress_pct(
        start_date=today, planned_duration_days=None, status='active', as_of=today
    ) is None
    assert calculate_cycle_progress_pct(
        start_date=today, planned_duration_days=100, status='harvested', as_of=today
    ) == 100


def test_cycle_days_remaining_uses_planned_date_or_duration():
    today = date(2026, 7, 15)
    assert calculate_cycle_days_remaining(
        start_date=today - timedelta(days=9),
        planned_duration_days=100,
        planned_harvest_date=None,
        status='active',
        as_of=today,
    ) == 90
    assert calculate_cycle_days_remaining(
        start_date=today,
        planned_duration_days=None,
        planned_harvest_date=today + timedelta(days=8),
        status='active',
        as_of=today,
    ) == 8
    assert calculate_cycle_days_remaining(
        start_date=today,
        planned_duration_days=None,
        planned_harvest_date=None,
        status='active',
        as_of=today,
    ) is None


def test_resolve_biomass_data_distinguishes_missing_zero_and_measured_values():
    assert resolve_biomass_data(
        allocation_status='active',
        current_fish_count=900,
        current_biomass_kg=Decimal('0'),
        initial_biomass_kg=Decimal('10'),
        latest_average_weight_g=None,
    ) == (None, False, None)
    assert resolve_biomass_data(
        allocation_status='harvested',
        current_fish_count=0,
        current_biomass_kg=Decimal('0'),
        initial_biomass_kg=Decimal('10'),
        latest_average_weight_g=None,
    ) == (Decimal('0.00'), True, 'harvested')
    assert resolve_biomass_data(
        allocation_status='active',
        current_fish_count=900,
        current_biomass_kg=Decimal('0'),
        initial_biomass_kg=Decimal('10'),
        latest_average_weight_g=Decimal('20'),
    ) == (Decimal('18.00'), True, 'latest_weighing')
    assert resolve_biomass_data(
        allocation_status='active',
        current_fish_count=900,
        current_biomass_kg=Decimal('10'),
        initial_biomass_kg=Decimal('10'),
        latest_average_weight_g=None,
    ) == (Decimal('10.00'), True, 'initial_stocking')
    assert resolve_biomass_data(
        allocation_status='active',
        current_fish_count=900,
        current_biomass_kg=Decimal('12.345'),
        initial_biomass_kg=Decimal('10'),
        latest_average_weight_g=None,
    ) == (Decimal('12.35'), True, 'allocation_current')


def test_direct_production_cost_excludes_other_operational_costs():
    cycle = SimpleNamespace(
        farm_profile=object(),
        planned_selling_price_per_kg_fcfa=Decimal('2000'),
        fingerlings_cost_fcfa=Decimal('100000'),
        other_operational_costs_fcfa=Decimal('500000'),
        start_date=None,
        planned_cycle_duration_days=None,
        planned_harvest_date=None,
        status='active',
    )
    with patch(
        'aquaculture.services.cycle_dashboard_service.FarmProductionPlanService.get_plan_data',
        return_value={'default_feed_price_per_kg': Decimal('1250')},
    ):
        metrics = CycleDashboardService._build_business_metrics(
            cycle,
            biomass_kg=Decimal('10'),
            feed_consumed_kg=Decimal('160'),
        )

    assert metrics['direct_production_cost_fcfa'] == Decimal('300000.00')
