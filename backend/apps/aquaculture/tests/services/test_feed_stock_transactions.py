"""Invariants transactionnels du stock alimentaire."""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from decimal import Decimal
from threading import Barrier
from uuid import uuid4

import pytest
from aquaculture.domain.exceptions import FeedStockValidationError
from aquaculture.models import (
    CycleFeedStockAdjustment,
    CycleFeedStockEntry,
    CycleLog,
    CycleUnitAllocation,
    FarmFeedReference,
    ProductionUnit,
)
from aquaculture.services.administrative_log_deletion_service import AdministrativeLogDeletionService
from aquaculture.services.cycle_store_service import CycleStoreService
from aquaculture.services.log_service import CycleLogService
from commerce.models import Product
from django.db import close_old_connections, connection
from django.db.models import Sum

from tests.fixtures.factories import ProductionCycleFactory


def _feed_reference(cycle, *, name="Dibaq 2 mm", size="2.00"):
    return FarmFeedReference.objects.create(
        farm_profile=cycle.farm_profile,
        source=FarmFeedReference.SOURCE_EXTERNAL,
        name=name,
        species=cycle.species,
        pellet_size_mm=Decimal(size),
    )


def _stock(cycle, feed_reference, quantity="10.00", *, entry_date=None):
    return CycleFeedStockEntry.objects.create(
        cycle=cycle,
        feed_reference=feed_reference,
        source=CycleFeedStockEntry.SOURCE_MANUAL,
        label=feed_reference.name,
        feed_size_mm=feed_reference.pellet_size_mm,
        quantity_kg=Decimal(quantity),
        total_cost_fcfa=Decimal("10000.00"),
        entry_date=entry_date or date.today(),
    )


def _allocation(cycle, name):
    unit = ProductionUnit.objects.create(
        farm_profile=cycle.farm_profile,
        name=name,
        unit_type="tank",
        volume_m3=Decimal("5.00"),
    )
    return CycleUnitAllocation.objects.create(
        cycle=cycle,
        production_unit=unit,
        initial_fish_count=500,
        current_fish_count=500,
        initial_biomass_kg=Decimal("5.00"),
        current_biomass_kg=Decimal("5.00"),
    )


def _payload(
    feed_reference,
    allocation,
    quantity,
    *,
    client_uuid=None,
    log_date=None,
):
    payload = {
        "log_date": log_date or date.today(),
        "cycle_unit_allocation": allocation,
        "feed_reference": feed_reference,
        "feed_quantity": Decimal(quantity),
    }
    if client_uuid is not None:
        payload["client_uuid"] = client_uuid
    return payload


@pytest.mark.django_db
def test_future_stock_cannot_fund_historical_feed_log():
    today = date.today()
    cycle = ProductionCycleFactory(start_date=today - timedelta(days=30))
    feed_reference = _feed_reference(cycle)
    _stock(
        cycle,
        feed_reference,
        "10.00",
        entry_date=today - timedelta(days=20),
    )
    _stock(
        cycle,
        feed_reference,
        "100.00",
        entry_date=today - timedelta(days=1),
    )

    with pytest.raises(FeedStockValidationError) as exc_info:
        CycleLogService.create_log(
            cycle,
            _payload(
                feed_reference,
                _allocation(cycle, "Bac historique"),
                "50.00",
                log_date=today - timedelta(days=10),
            ),
        )

    assert exc_info.value.detail["code"] == "insufficient_feed_stock"
    assert exc_info.value.detail["available_feed_kg"] == "10.00"


@pytest.mark.django_db
def test_retroactive_feed_log_cannot_make_future_ledger_negative():
    today = date.today()
    cycle = ProductionCycleFactory(start_date=today - timedelta(days=30))
    feed_reference = _feed_reference(cycle)
    _stock(
        cycle,
        feed_reference,
        "10.00",
        entry_date=today - timedelta(days=20),
    )
    first = _allocation(cycle, "Bac futur 1")
    second = _allocation(cycle, "Bac futur 2")
    CycleLogService.create_log(
        cycle,
        _payload(
            feed_reference,
            first,
            "5.00",
            log_date=today - timedelta(days=17),
        ),
    )
    _stock(
        cycle,
        feed_reference,
        "20.00",
        entry_date=today - timedelta(days=15),
    )
    CycleLogService.create_log(
        cycle,
        _payload(
            feed_reference,
            second,
            "20.00",
            log_date=today - timedelta(days=10),
        ),
    )

    with pytest.raises(FeedStockValidationError) as exc_info:
        CycleLogService.create_log(
            cycle,
            _payload(
                feed_reference,
                _allocation(cycle, "Bac rétroactif"),
                "10.00",
                log_date=today - timedelta(days=18),
            ),
        )

    assert exc_info.value.detail["available_feed_kg"] == "5.00"


@pytest.mark.django_db
def test_retroactive_feed_log_is_accepted_when_full_timeline_stays_non_negative():
    today = date.today()
    cycle = ProductionCycleFactory(start_date=today - timedelta(days=30))
    feed_reference = _feed_reference(cycle)
    _stock(
        cycle,
        feed_reference,
        "20.00",
        entry_date=today - timedelta(days=20),
    )
    _stock(
        cycle,
        feed_reference,
        "20.00",
        entry_date=today - timedelta(days=10),
    )
    CycleLogService.create_log(
        cycle,
        _payload(
            feed_reference,
            _allocation(cycle, "Bac futur compatible"),
            "20.00",
            log_date=today - timedelta(days=5),
        ),
    )

    log = CycleLogService.create_log(
        cycle,
        _payload(
            feed_reference,
            _allocation(cycle, "Bac rétroactif compatible"),
            "10.00",
            log_date=today - timedelta(days=15),
        ),
    )

    assert log.feed_quantity == Decimal("10.00")


@pytest.mark.django_db
def test_feed_log_date_update_validates_full_future_timeline():
    today = date.today()
    cycle = ProductionCycleFactory(start_date=today - timedelta(days=30))
    feed_reference = _feed_reference(cycle)
    _stock(cycle, feed_reference, "10.00", entry_date=today - timedelta(days=20))
    _stock(cycle, feed_reference, "20.00", entry_date=today - timedelta(days=10))
    log = CycleLogService.create_log(
        cycle,
        _payload(
            feed_reference,
            _allocation(cycle, "Bac déplacement date"),
            "15.00",
            log_date=today - timedelta(days=5),
        ),
    )

    with pytest.raises(FeedStockValidationError):
        CycleLogService.update_log(
            log,
            {"log_date": today - timedelta(days=15)},
            user=cycle.farm_profile.user,
        )

    log.refresh_from_db()
    assert log.log_date == today - timedelta(days=5)
    assert log.feed_quantity == Decimal("15.00")


@pytest.mark.django_db
def test_same_day_entries_are_available_before_consumption():
    cycle = ProductionCycleFactory(start_date=date.today())
    feed_reference = _feed_reference(cycle)
    _stock(cycle, feed_reference, "4.00")
    _stock(cycle, feed_reference, "6.00")

    CycleLogService.create_log(
        cycle,
        _payload(
            feed_reference,
            _allocation(cycle, "Bac même jour"),
            "10.00",
        ),
    )

    available, _ = CycleStoreService.get_available_feed_quantity(
        cycle=cycle,
        feed_reference=feed_reference,
        log_date=date.today(),
    )
    assert available == Decimal("0.00")


@pytest.mark.django_db
def test_bulk_feed_reservations_follow_each_log_date():
    today = date.today()
    cycle = ProductionCycleFactory(start_date=today - timedelta(days=30))
    feed_reference = _feed_reference(cycle)
    _stock(cycle, feed_reference, "5.00", entry_date=today - timedelta(days=20))
    _stock(cycle, feed_reference, "10.00", entry_date=today - timedelta(days=5))

    result = CycleLogService.create_bulk_logs(
        [
            {
                "cycle": cycle.id,
                **_payload(
                    feed_reference,
                    _allocation(cycle, "Bac bulk ancien"),
                    "7.00",
                    log_date=today - timedelta(days=10),
                ),
            },
            {
                "cycle": cycle.id,
                **_payload(
                    feed_reference,
                    _allocation(cycle, "Bac bulk récent"),
                    "7.00",
                    log_date=today,
                ),
            },
        ],
        cycle.farm_profile.user,
    )

    assert result["created"] == 1
    assert len(result["errors"]) == 1
    assert result["logs"][0].log_date == today


@pytest.mark.django_db
def test_second_feed_log_cannot_exceed_reference_stock():
    cycle = ProductionCycleFactory(start_date=date.today())
    feed_reference = _feed_reference(cycle)
    _stock(cycle, feed_reference)

    CycleLogService.create_log(
        cycle,
        _payload(feed_reference, _allocation(cycle, "Bac 1"), "7.00"),
    )

    with pytest.raises(FeedStockValidationError) as exc_info:
        CycleLogService.create_log(
            cycle,
            _payload(feed_reference, _allocation(cycle, "Bac 2"), "7.00"),
        )

    assert exc_info.value.detail["code"] == "insufficient_feed_stock"
    assert exc_info.value.detail["available_feed_kg"] == "3.00"
    assert exc_info.value.detail["requested_feed_kg"] == "7.00"
    assert exc_info.value.detail["feed_reference_id"] == str(feed_reference.id)


@pytest.mark.django_db
def test_bulk_reserves_stock_between_units():
    cycle = ProductionCycleFactory(start_date=date.today())
    feed_reference = _feed_reference(cycle)
    _stock(cycle, feed_reference)
    first = _allocation(cycle, "Bac bulk 1")
    second = _allocation(cycle, "Bac bulk 2")

    result = CycleLogService.create_bulk_logs(
        [
            {"cycle": cycle.id, **_payload(feed_reference, first, "7.00")},
            {"cycle": cycle.id, **_payload(feed_reference, second, "7.00")},
        ],
        cycle.farm_profile.user,
    )

    assert result["created"] == 1
    assert len(result["errors"]) == 1
    assert CycleLog.objects.filter(cycle=cycle).aggregate(total=Sum("feed_quantity"))["total"] == Decimal("7.00")


@pytest.mark.django_db
def test_feed_log_update_restores_previous_quantity_and_can_change_reference():
    cycle = ProductionCycleFactory(start_date=date.today())
    feed_a = _feed_reference(cycle, name="Feed A")
    feed_b = _feed_reference(cycle, name="Feed B", size="3.00")
    _stock(cycle, feed_a)
    _stock(cycle, feed_b, "6.00")
    allocation = _allocation(cycle, "Bac update")
    log = CycleLogService.create_log(cycle, _payload(feed_a, allocation, "5.00"))

    CycleLogService.update_log(
        log,
        {"feed_reference": feed_a, "feed_quantity": Decimal("7.00")},
        user=cycle.farm_profile.user,
    )
    log.refresh_from_db()
    assert log.feed_quantity == Decimal("7.00")

    CycleLogService.update_log(
        log,
        {"feed_reference": feed_a, "feed_quantity": Decimal("4.00")},
        user=cycle.farm_profile.user,
    )
    CycleLogService.update_log(
        log,
        {"feed_reference": feed_b, "feed_quantity": Decimal("5.00")},
        user=cycle.farm_profile.user,
    )
    log.refresh_from_db()
    assert log.feed_reference_id == feed_b.id
    assert log.feed_quantity == Decimal("5.00")

    CycleLogService.update_log(
        log,
        {"feed_reference": None, "feed_quantity": Decimal("0.00")},
        user=cycle.farm_profile.user,
    )
    log.refresh_from_db()
    assert log.feed_reference_id is None
    assert log.feed_quantity == Decimal("0.00")


@pytest.mark.django_db
def test_identical_client_uuid_replay_does_not_consume_twice():
    cycle = ProductionCycleFactory(start_date=date.today())
    feed_reference = _feed_reference(cycle)
    _stock(cycle, feed_reference)
    allocation = _allocation(cycle, "Bac replay")
    client_uuid = uuid4()
    payload = _payload(feed_reference, allocation, "5.00", client_uuid=client_uuid)

    first = CycleLogService.create_log(cycle, dict(payload), created_offline=True)
    second = CycleLogService.create_log(cycle, dict(payload), created_offline=True)

    assert first.id == second.id
    assert CycleLog.objects.filter(client_uuid=client_uuid).count() == 1


@pytest.mark.django_db
def test_replaying_same_classification_is_idempotent():
    cycle = ProductionCycleFactory(start_date=date.today())
    reference = _feed_reference(cycle)
    entry = CycleFeedStockEntry.objects.create(
        cycle=cycle, source=CycleFeedStockEntry.SOURCE_MANUAL, label=reference.name,
        feed_size_mm=reference.pellet_size_mm, quantity_kg=Decimal('10.00'),
        total_cost_fcfa=Decimal('10000.00'), entry_date=date.today(),
    )

    first = CycleStoreService.classify_legacy_stock(
        user=cycle.farm_profile.user, cycle=cycle, entry_id=entry.id, feed_reference=reference,
    )
    second = CycleStoreService.classify_legacy_stock(
        user=cycle.farm_profile.user, cycle=cycle, entry_id=entry.id, feed_reference=reference,
    )

    assert first.id == second.id
    assert second.feed_reference_id == reference.id


@pytest.mark.django_db
def test_classification_adjustment_is_used_by_display_and_validation():
    cycle = ProductionCycleFactory(start_date=date.today())
    reference = _feed_reference(cycle, name='Dibaq historique')
    entry = CycleFeedStockEntry.objects.create(
        cycle=cycle,
        source=CycleFeedStockEntry.SOURCE_MANUAL,
        label=reference.name,
        feed_size_mm=reference.pellet_size_mm,
        quantity_kg=Decimal('110.00'),
        total_cost_fcfa=Decimal('100000.00'),
        entry_date=date.today(),
    )
    CycleLog.objects.create(
        cycle=cycle,
        log_date=date.today(),
        feed_quantity=Decimal('30.00'),
        feed_type=reference.name,
        feed_size_mm=reference.pellet_size_mm,
    )

    CycleStoreService.classify_legacy_stock(
        user=cycle.farm_profile.user,
        cycle=cycle,
        entry_id=entry.id,
        feed_reference=reference,
    )

    assert CycleFeedStockAdjustment.objects.get(stock_entry=entry).quantity_kg == Decimal('30.00')
    item = next(
        item
        for item in CycleStoreService.get_store_payload(cycle)['stock_items']
        if item['feed_reference_id'] == str(reference.id)
    )
    assert item['quantity_available_kg'] == '80.00'
    CycleStoreService.validate_daily_feed_quantity(
        cycle=cycle,
        feed_quantity=Decimal('80.00'),
        log_date=date.today(),
        feed_reference=reference,
    )
    with pytest.raises(FeedStockValidationError) as exc_info:
        CycleStoreService.validate_daily_feed_quantity(
            cycle=cycle,
            feed_quantity=Decimal('80.01'),
            log_date=date.today(),
            feed_reference=reference,
        )
    assert exc_info.value.detail['available_feed_kg'] == '80.00'


@pytest.mark.django_db
def test_successive_legacy_classifications_capture_each_consumption_once():
    cycle = ProductionCycleFactory(start_date=date.today() - timedelta(days=3))
    external = _feed_reference(cycle, name='Dibaq historique', size='2.00')
    product = Product.objects.create(
        brand='AquaCare',
        name='Dibaq historique',
        species='tilapia',
        pellet_size_mm=Decimal('2.00'),
        package_weight_kg=Decimal('25.00'),
        price_per_package=Decimal('25000.00'),
    )
    catalog = FarmFeedReference.objects.create(
        farm_profile=cycle.farm_profile,
        source=FarmFeedReference.SOURCE_CATALOG,
        catalog_product=product,
        name='Dibaq historique',
        species=cycle.species,
        pellet_size_mm=Decimal('2.00'),
    )
    entry_a = CycleFeedStockEntry.objects.create(
        cycle=cycle, source=CycleFeedStockEntry.SOURCE_MANUAL,
        label='Dibaq historique', feed_size_mm=Decimal('2.00'),
        quantity_kg=Decimal('60.00'), total_cost_fcfa=Decimal('60000.00'),
        entry_date=date.today() - timedelta(days=2),
    )
    entry_b = CycleFeedStockEntry.objects.create(
        cycle=cycle, source=CycleFeedStockEntry.SOURCE_MANUAL,
        label='Dibaq historique', feed_size_mm=Decimal('2.00'),
        quantity_kg=Decimal('50.00'), total_cost_fcfa=Decimal('50000.00'),
        entry_date=date.today() - timedelta(days=1),
    )
    CycleLog.objects.create(
        cycle=cycle, log_date=date.today() - timedelta(days=1),
        feed_quantity=Decimal('30.00'), feed_type='Dibaq historique',
        feed_size_mm=Decimal('2.00'),
    )

    CycleStoreService.classify_legacy_stock(
        user=cycle.farm_profile.user, cycle=cycle,
        entry_id=entry_a.id, feed_reference=external,
    )
    CycleStoreService.classify_legacy_stock(
        user=cycle.farm_profile.user, cycle=cycle,
        entry_id=entry_b.id, feed_reference=catalog,
    )
    CycleStoreService.classify_legacy_stock(
        user=cycle.farm_profile.user, cycle=cycle,
        entry_id=entry_b.id, feed_reference=catalog,
    )

    assert CycleFeedStockAdjustment.objects.aggregate(total=Sum('quantity_kg'))['total'] == Decimal('30.00')
    available = sum(
        Decimal(item['quantity_available_kg'])
        for item in CycleStoreService.get_store_payload(cycle)['stock_items']
    )
    assert available == Decimal('80.00')


@pytest.mark.django_db
def test_negative_feed_history_blocks_new_ration_but_allows_corrections():
    today = date.today()
    cycle = ProductionCycleFactory(start_date=today - timedelta(days=10))
    reference = _feed_reference(cycle)
    _stock(cycle, reference, '10.00', entry_date=today - timedelta(days=3))
    faulty_log = CycleLog.objects.create(
        cycle=cycle,
        log_date=today - timedelta(days=2),
        feed_quantity=Decimal('15.00'),
        feed_reference=reference,
        feed_type=reference.name,
        feed_size_mm=reference.pellet_size_mm,
    )
    _stock(cycle, reference, '20.00', entry_date=today - timedelta(days=1))

    with pytest.raises(FeedStockValidationError) as exc_info:
        CycleStoreService.validate_daily_feed_quantity(
            cycle=cycle,
            feed_quantity=Decimal('1.00'),
            log_date=today,
            feed_reference=reference,
        )
    assert exc_info.value.detail == {
        'code': 'feed_stock_history_inconsistent',
        'detail': exc_info.value.detail['detail'],
        'field': 'feed_quantity',
        'available_feed_kg': '15.00',
        'minimum_balance_kg': '-5.00',
        'requested_feed_kg': '1.00',
        'feed_reference_id': str(reference.id),
    }
    store = CycleStoreService.get_store_payload(cycle)
    assert 'feed_stock_history_inconsistent' in store['calculation_warnings']
    assert store['status'] == 'check_stock'

    CycleLogService.update_log(
        faulty_log,
        {'feed_quantity': Decimal('10.00')},
        user=cycle.farm_profile.user,
    )
    faulty_log.refresh_from_db()
    assert faulty_log.feed_quantity == Decimal('10.00')

    deletable = CycleLog.objects.create(
        cycle=cycle,
        log_date=today - timedelta(days=4),
        feed_quantity=Decimal('2.00'),
        feed_reference=reference,
        feed_type=reference.name,
        feed_size_mm=reference.pellet_size_mm,
    )
    AdministrativeLogDeletionService.delete(deletable)
    assert not CycleLog.objects.filter(pk=deletable.pk).exists()


@pytest.mark.skipif(connection.vendor != "postgresql", reason="Verrou PostgreSQL requis")
@pytest.mark.django_db(transaction=True)
def test_concurrent_feed_consumption_never_exceeds_stock():
    cycle = ProductionCycleFactory(start_date=date.today())
    feed_reference = _feed_reference(cycle)
    _stock(cycle, feed_reference)
    allocations = [_allocation(cycle, "Bac concurrent 1"), _allocation(cycle, "Bac concurrent 2")]
    barrier = Barrier(2)

    def consume(allocation_id):
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            local_cycle = type(cycle).objects.get(pk=cycle.pk)
            local_reference = FarmFeedReference.objects.get(pk=feed_reference.pk)
            local_allocation = CycleUnitAllocation.objects.get(pk=allocation_id)
            try:
                CycleLogService.create_log(
                    local_cycle,
                    _payload(local_reference, local_allocation, "7.00"),
                )
                return "created"
            except FeedStockValidationError:
                return "rejected"
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(consume, [item.id for item in allocations]))

    assert sorted(outcomes) == ["created", "rejected"]
    consumed = CycleLog.objects.filter(cycle=cycle).aggregate(total=Sum("feed_quantity"))["total"]
    assert consumed <= Decimal("10.00")


@pytest.mark.skipif(connection.vendor != "postgresql", reason="Verrou PostgreSQL requis")
@pytest.mark.django_db(transaction=True)
def test_concurrent_retroactive_feed_logs_never_make_future_ledger_negative():
    today = date.today()
    cycle = ProductionCycleFactory(start_date=today - timedelta(days=30))
    feed_reference = _feed_reference(cycle)
    _stock(cycle, feed_reference, "10.00", entry_date=today - timedelta(days=20))
    CycleLogService.create_log(
        cycle,
        _payload(
            feed_reference,
            _allocation(cycle, "Bac futur existant"),
            "5.00",
            log_date=today - timedelta(days=5),
        ),
    )
    allocations = [
        _allocation(cycle, "Bac rétroactif concurrent 1"),
        _allocation(cycle, "Bac rétroactif concurrent 2"),
    ]
    barrier = Barrier(2)

    def consume(allocation_id):
        close_old_connections()
        try:
            local_cycle = type(cycle).objects.get(pk=cycle.pk)
            local_reference = FarmFeedReference.objects.get(pk=feed_reference.pk)
            local_allocation = CycleUnitAllocation.objects.get(pk=allocation_id)
            barrier.wait(timeout=10)
            try:
                CycleLogService.create_log(
                    local_cycle,
                    _payload(
                        local_reference,
                        local_allocation,
                        "3.00",
                        log_date=today - timedelta(days=10),
                    ),
                )
                return "created"
            except FeedStockValidationError:
                return "rejected"
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(consume, [item.id for item in allocations]))

    assert sorted(outcomes) == ["created", "rejected"]


@pytest.mark.skipif(connection.vendor != 'postgresql', reason='Verrou PostgreSQL requis')
@pytest.mark.django_db(transaction=True)
def test_classification_and_ration_are_serialized_on_the_cycle():
    cycle = ProductionCycleFactory(start_date=date.today())
    reference = _feed_reference(cycle)
    entry = CycleFeedStockEntry.objects.create(
        cycle=cycle, source=CycleFeedStockEntry.SOURCE_MANUAL, label=reference.name,
        feed_size_mm=reference.pellet_size_mm, quantity_kg=Decimal('10.00'),
        total_cost_fcfa=Decimal('10000.00'), entry_date=date.today(),
    )
    allocation = _allocation(cycle, 'Bac classification concurrente')
    barrier = Barrier(2)

    def classify():
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            local_cycle = type(cycle).objects.get(pk=cycle.pk)
            local_reference = FarmFeedReference.objects.get(pk=reference.pk)
            CycleStoreService.classify_legacy_stock(
                user=local_cycle.farm_profile.user,
                cycle=local_cycle,
                entry_id=entry.id,
                feed_reference=local_reference,
            )
            return 'classified'
        finally:
            close_old_connections()

    def consume():
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            local_cycle = type(cycle).objects.get(pk=cycle.pk)
            local_reference = FarmFeedReference.objects.get(pk=reference.pk)
            local_allocation = CycleUnitAllocation.objects.get(pk=allocation.pk)
            try:
                CycleLogService.create_log(
                    local_cycle,
                    _payload(local_reference, local_allocation, '7.00'),
                )
                return 'created'
            except FeedStockValidationError:
                return 'rejected'
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = [executor.submit(classify), executor.submit(consume)]
        results = [future.result(timeout=15) for future in outcomes]

    entry.refresh_from_db()
    assert 'classified' in results
    assert entry.feed_reference_id == reference.id
    consumed = CycleLog.objects.filter(cycle=cycle).aggregate(total=Sum('feed_quantity'))['total'] or Decimal('0')
    assert consumed <= Decimal('10.00')
