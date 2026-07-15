from datetime import date, timedelta
from decimal import Decimal

from aquaculture.domain.dashboard_metrics import (
    calculate_cycle_days_remaining,
    calculate_cycle_progress_pct,
    estimate_market_value_fcfa,
)


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
