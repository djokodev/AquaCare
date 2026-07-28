import importlib
from decimal import Decimal

import pytest
from accounts.models import User
from commerce.models import Order
from django.apps import apps as django_apps


@pytest.mark.django_db
def test_order_document_backfill_populates_bilingual_pickup_snapshots():
    user = User.objects.create_user(
        phone_number="+237 699 000 091",
        password="migration-test",
        first_name="Migration",
        last_name="Test",
        age_group="26_35",
    )
    order = Order.objects.create(
        order_number="ORD-MIGRATION-0001",
        user=user,
        farm_profile=user.farm_profile,
        delivery_method="pickup",
        pickup_location="ndokoti",
        delivery_name="Migration Test",
        delivery_phone="+237 699 000 091",
        delivery_region="",
        delivery_city="",
        delivery_full_address="",
        subtotal=Decimal("0"),
        delivery_fee=Decimal("0"),
        total=Decimal("0"),
        pickup_location_display_fr_snapshot="",
        pickup_location_display_en_snapshot="",
    )

    migration = importlib.import_module("commerce.migrations.0008_order_document_snapshots")
    migration.backfill_order_document_snapshots(django_apps, None)
    order.refresh_from_db()

    assert order.pickup_location_display_fr_snapshot == "Marché Ndokoti"
    assert order.pickup_location_display_en_snapshot == "Ndokoti Market"


@pytest.mark.django_db
def test_order_workflow_backfill_normalizes_legacy_pickup_delivery():
    user = User.objects.create_user(
        phone_number="+237 699 000 092",
        password="migration-test",
        first_name="Legacy",
        last_name="Pickup",
        age_group="26_35",
    )
    order = Order.objects.create(
        order_number="ORD-MIGRATION-0002",
        user=user,
        farm_profile=user.farm_profile,
        delivery_method="pickup",
        pickup_location="ndogpasi",
        status="delivered",
        delivery_name="Legacy Pickup",
        delivery_phone="+237 699 000 092",
        delivery_region="",
        delivery_city="",
        delivery_full_address="",
        subtotal=Decimal("0"),
        delivery_fee=Decimal("0"),
        total=Decimal("0"),
    )

    migration = importlib.import_module(
        "commerce.migrations.0009_order_delivered_at_order_delivered_by_and_more"
    )
    migration.backfill_order_fulfilment_workflow(django_apps, None)
    order.refresh_from_db()

    assert order.status == "ready_for_pickup"
    assert order.ready_for_pickup_at == order.updated_at
    assert order.ready_for_pickup_by is None
