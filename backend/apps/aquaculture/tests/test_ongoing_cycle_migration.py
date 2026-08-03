from __future__ import annotations

import importlib
from decimal import Decimal

import pytest
from aquaculture.models import CycleFeedStockEntry, ProductionCycle
from django.apps import apps as django_apps


@pytest.mark.django_db
def test_0047_backfills_legacy_cycle_and_stock_without_changing_current_state(
    production_cycle,
):
    original_current = (
        production_cycle.current_count,
        production_cycle.current_average_weight,
        production_cycle.current_biomass,
    )
    ProductionCycle.objects.filter(pk=production_cycle.pk).update(
        tracking_start_date=None,
        tracking_start_count=None,
        tracking_start_average_weight=None,
        tracking_start_biomass=None,
    )
    manual = CycleFeedStockEntry.objects.create(
        cycle=production_cycle,
        label='Legacy manual',
        quantity_kg=Decimal('5.00'),
        total_cost_fcfa=Decimal('0.00'),
        source='manual',
        entry_date=production_cycle.start_date,
    )
    order = CycleFeedStockEntry.objects.create(
        cycle=production_cycle,
        label='Legacy order',
        quantity_kg=Decimal('10.00'),
        total_cost_fcfa=Decimal('10000.00'),
        source='order',
        entry_date=production_cycle.start_date,
    )
    CycleFeedStockEntry.objects.filter(pk=manual.pk).update(
        entry_kind='opening_balance',
    )
    CycleFeedStockEntry.objects.filter(pk=order.pk).update(
        entry_kind='opening_balance',
    )

    migration = importlib.import_module(
        'aquaculture.migrations.0047_cycle_onboarding_and_opening_stock'
    )
    migration.backfill_tracking_baselines_and_stock_metadata(django_apps, None)

    production_cycle.refresh_from_db()
    manual.refresh_from_db()
    order.refresh_from_db()
    assert production_cycle.onboarding_mode == 'new'
    assert production_cycle.tracking_start_date == production_cycle.start_date
    assert production_cycle.tracking_start_count == production_cycle.initial_count
    assert (
        production_cycle.tracking_start_average_weight
        == production_cycle.initial_average_weight
    )
    assert production_cycle.tracking_start_biomass == production_cycle.initial_biomass
    assert (
        production_cycle.current_count,
        production_cycle.current_average_weight,
        production_cycle.current_biomass,
    ) == original_current
    assert (manual.entry_kind, manual.cost_status, manual.total_cost_fcfa) == (
        'manual_supply',
        'known',
        Decimal('0.00'),
    )
    assert (order.entry_kind, order.cost_status) == ('order_receipt', 'known')
