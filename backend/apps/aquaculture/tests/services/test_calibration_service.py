from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, time, timedelta
from decimal import Decimal
from threading import Barrier

import pytest
from aquaculture.domain.exceptions import (
    AllocationAlreadyFinallyHarvested,
    BusinessRuleViolation,
    FinalHarvestIdempotencyConflict,
    FinalHarvestStockMismatch,
)
from aquaculture.models import (
    CalibrationOperation,
    CycleUnitAllocation,
    FinalHarvestOperation,
    ProductionUnit,
)
from aquaculture.services.calibration_service import (
    CalibrationIdempotencyConflict,
    CalibrationService,
)
from aquaculture.services.cycle_service import ProductionCycleService
from aquaculture.services.production_unit_stock_snapshot_service import (
    ProductionUnitStockSnapshotService,
)
from django.core.exceptions import ValidationError
from django.db import connection
from django.utils import timezone


@pytest.mark.django_db
class TestCalibrationService:
    @staticmethod
    def at(day, hour):
        return timezone.make_aware(
            datetime.combine(day, time(hour=hour)),
            timezone.get_current_timezone(),
        )

    def setup_source(self, production_cycle):
        production_cycle.initial_count = 1000
        production_cycle.initial_average_weight = Decimal('100.00')
        production_cycle.initial_biomass = Decimal('100.00')
        production_cycle.current_count = 1000
        production_cycle.current_average_weight = Decimal('100.00')
        production_cycle.current_biomass = Decimal('100.00')
        production_cycle.save()
        unit = ProductionUnit.objects.create(
            farm_profile=production_cycle.farm_profile,
            name='Cage source',
            unit_type='cage',
            volume_m3=Decimal('10.00'),
        )
        allocation = CycleUnitAllocation.objects.create(
            cycle=production_cycle,
            production_unit=unit,
            initial_fish_count=1000,
            current_fish_count=1000,
            initial_biomass_kg=Decimal('100.00'),
            current_biomass_kg=Decimal('100.00'),
        )
        return allocation

    def create_tank(self, allocation, name='Bac A'):
        return ProductionUnit.objects.create(
            farm_profile=allocation.cycle.farm_profile,
            name=name,
            unit_type='tank',
            purpose=ProductionUnit.PURPOSE_CALIBRATION,
            volume_m3=Decimal('10.00'),
        )

    def calibrate(self, source, tank, **overrides):
        payload = {
            'source_allocation': source,
            'destination_production_unit': tank,
            'user': source.cycle.farm_profile.user,
            'client_uuid': uuid.uuid4(),
            'calibrated_at': timezone.now().replace(second=0, microsecond=0),
            'transferred_count': 200,
            'transferred_average_weight_g': Decimal('150.00'),
        }
        payload.update(overrides)
        return CalibrationService.calibrate(**payload)

    def test_first_calibration_conserves_stock(self, production_cycle):
        source = self.setup_source(production_cycle)
        operation, warnings, created = self.calibrate(source, self.create_tank(source))

        source.refresh_from_db()
        destination = operation.destination_allocation
        destination.refresh_from_db()
        assert created is True
        assert warnings == []
        assert (source.current_fish_count, source.current_biomass_kg) == (800, Decimal('70.00'))
        assert (destination.current_fish_count, destination.current_biomass_kg) == (200, Decimal('30.00'))
        assert source.current_fish_count + destination.current_fish_count == 1000
        assert source.current_biomass_kg + destination.current_biomass_kg == Decimal('100.00')
        source.cycle.refresh_from_db()
        destination.cycle.refresh_from_db()
        assert source.cycle.survival_rate == Decimal('100.00')
        assert destination.cycle.survival_rate == Decimal('100.00')
        assert source.cycle.fcr is None
        assert destination.cycle.fcr is None

        source_before = ProductionUnitStockSnapshotService.build_as_of(
            allocation=source,
            as_of_date=operation.calibrated_at - timedelta(seconds=1),
        )
        source_after = ProductionUnitStockSnapshotService.build_as_of(
            allocation=source,
            as_of_date=operation.calibrated_at,
        )
        destination_before = ProductionUnitStockSnapshotService.build_as_of(
            allocation=destination,
            as_of_date=operation.calibrated_at - timedelta(seconds=1),
        )
        destination_after = ProductionUnitStockSnapshotService.build_as_of(
            allocation=destination,
            as_of_date=operation.calibrated_at,
        )
        assert source_before['estimated_current_fish_count'] == 1000
        assert source_after['estimated_current_fish_count'] == 800
        assert destination_before['estimated_current_fish_count'] == 0
        assert destination_after['estimated_current_fish_count'] == 200

    def test_second_arrival_uses_weighted_average_and_same_allocation(self, production_cycle):
        source = self.setup_source(production_cycle)
        tank = self.create_tank(source)
        first, _, _ = self.calibrate(source, tank)
        second, _, _ = self.calibrate(
            source,
            tank,
            transferred_count=100,
            transferred_average_weight_g=Decimal('120.00'),
        )

        destination = second.destination_allocation
        destination.refresh_from_db()
        assert destination.id == first.destination_allocation_id
        assert destination.current_fish_count == 300
        assert destination.current_biomass_kg == Decimal('42.00')

    def test_client_uuid_is_idempotent_and_conflicting_payload_is_rejected(self, production_cycle):
        source = self.setup_source(production_cycle)
        tank = self.create_tank(source)
        client_uuid = uuid.uuid4()
        first, _, _ = self.calibrate(source, tank, client_uuid=client_uuid)
        second, _, created = self.calibrate(source, tank, client_uuid=client_uuid)

        assert first.pk == second.pk
        assert created is False
        assert CalibrationOperation.objects.count() == 1
        with pytest.raises(CalibrationIdempotencyConflict):
            self.calibrate(source, tank, client_uuid=client_uuid, transferred_count=100)

    def test_sampling_computes_weight_and_rejects_incoherent_values(self, production_cycle):
        source = self.setup_source(production_cycle)
        tank = self.create_tank(source)
        operation, _, _ = self.calibrate(
            source,
            tank,
            transferred_average_weight_g=None,
            sample_count=20,
            sample_total_weight_g=Decimal('3000.00'),
        )
        assert operation.transferred_average_weight_g == Decimal('150.00')

        with pytest.raises(BusinessRuleViolation):
            self.calibrate(
                source,
                tank,
                transferred_average_weight_g=Decimal('100.00'),
                sample_count=20,
                sample_total_weight_g=Decimal('3000.00'),
            )

    def test_backdated_operation_replays_snapshots_and_current_stock(self, production_cycle):
        source = self.setup_source(production_cycle)
        tank = self.create_tank(source)
        later_at = timezone.now().replace(second=0, microsecond=0)
        later, _, _ = self.calibrate(source, tank, calibrated_at=later_at, transferred_count=100)
        earlier, _, _ = self.calibrate(
            source,
            tank,
            calibrated_at=later_at - timedelta(hours=1),
            transferred_count=200,
        )

        later.refresh_from_db()
        earlier.refresh_from_db()
        source.refresh_from_db()
        assert earlier.source_count_before == 1000
        assert earlier.source_count_after == 800
        assert later.source_count_before == 800
        assert later.source_count_after == 700
        assert source.current_fish_count == 700

    def test_source_and_destination_harvests_are_autonomous_and_tank_is_reused(self, production_cycle):
        source = self.setup_source(production_cycle)
        tank = self.create_tank(source)
        operation, _, _ = self.calibrate(
            source,
            tank,
            transferred_count=200,
            transferred_average_weight_g=Decimal('250.00'),
        )
        destination = operation.destination_allocation

        ProductionCycleService.harvest_cycle_unit_allocation(
            destination,
            harvest_date=timezone.localdate(),
            final_harvested_at=timezone.now(),
            final_count=200,
            final_average_weight=Decimal('250.00'),
        )
        destination.refresh_from_db()
        destination.cycle.refresh_from_db()
        tank.refresh_from_db()
        assert destination.status == CycleUnitAllocation.STATUS_HARVESTED
        assert destination.cycle.status == 'harvested'
        assert destination.cycle.current_count == 0
        assert tank.status == 'active'

        source.refresh_from_db()
        production_cycle.refresh_from_db()
        assert source.status == CycleUnitAllocation.STATUS_ACTIVE
        assert source.current_fish_count == 800
        assert production_cycle.status == 'active'
        second_operation, _, _ = self.calibrate(
            source,
            tank,
            calibrated_at=destination.final_harvested_at + timedelta(seconds=1),
            transferred_count=100,
        )
        assert second_operation.destination_allocation.cycle_id != destination.cycle_id

    def test_partial_harvest_subtracts_actual_biomass_and_replays(self, production_cycle):
        source = self.setup_source(production_cycle)
        operation, _, _ = self.calibrate(
            source,
            self.create_tank(source),
            transferred_count=200,
            transferred_average_weight_g=Decimal('250.00'),
        )
        _, allocation, harvest = ProductionCycleService.partial_harvest_cycle_unit_allocation(
            operation.destination_allocation,
            harvest_date=timezone.localdate(),
            count_harvested=10,
            average_weight_g=Decimal('300.00'),
        )
        allocation.refresh_from_db()
        assert harvest.total_weight_kg == Decimal('3.00')
        assert allocation.current_fish_count == 190
        assert allocation.current_biomass_kg == Decimal('47.00')
        assert ProductionCycleService._get_allocation_average_weight_g(allocation).quantize(
            Decimal('0.01')
        ) == Decimal('247.37')

    def test_invalid_destination_and_cross_farm_are_rejected_atomically(
        self,
        production_cycle,
        user_factory,
    ):
        source = self.setup_source(production_cycle)
        regular_tank = ProductionUnit.objects.create(
            farm_profile=source.cycle.farm_profile,
            name='Bac production',
            unit_type='tank',
            volume_m3=Decimal('10.00'),
        )
        with pytest.raises(BusinessRuleViolation):
            self.calibrate(source, regular_tank)

        foreign_farm = user_factory().farm_profile
        foreign_tank = ProductionUnit.objects.create(
            farm_profile=foreign_farm,
            name='Bac étranger',
            unit_type='tank',
            purpose=ProductionUnit.PURPOSE_CALIBRATION,
            volume_m3=Decimal('10.00'),
        )
        with pytest.raises(BusinessRuleViolation):
            self.calibrate(source, foreign_tank)
        assert CalibrationOperation.objects.count() == 0

    def test_harvest_releases_tank_and_next_arrival_starts_new_session(self, production_cycle):
        source = self.setup_source(production_cycle)
        tank = self.create_tank(source)
        first, _, _ = self.calibrate(
            source,
            tank,
            transferred_count=200,
            transferred_average_weight_g=Decimal('300.00'),
        )
        first_allocation_id = first.destination_allocation_id
        first_cycle_id = first.destination_allocation.cycle_id

        ProductionCycleService.harvest_cycle_unit_allocation(
            allocation=first.destination_allocation,
            harvest_date=timezone.localdate(),
            final_harvested_at=timezone.now(),
            final_count=200,
            final_average_weight=Decimal('300.00'),
        )
        first.destination_allocation.refresh_from_db()
        assert first.destination_allocation.status == CycleUnitAllocation.STATUS_HARVESTED

        second, _, _ = self.calibrate(
            source,
            tank,
            calibrated_at=first.destination_allocation.final_harvested_at + timedelta(seconds=1),
            transferred_count=100,
            transferred_average_weight_g=Decimal('300.00'),
        )
        assert second.destination_allocation_id != first_allocation_id
        assert second.destination_allocation.cycle_id != first_cycle_id
        assert tank.cycle_allocations.count() == 2
        assert tank.cycle_allocations.filter(status=CycleUnitAllocation.STATUS_ACTIVE).count() == 1

    def test_same_day_backdated_arrival_uses_session_closed_later(self, production_cycle):
        day = timezone.localdate() - timedelta(days=1)
        production_cycle.start_date = day
        production_cycle.save(update_fields=['start_date'])
        source = self.setup_source(production_cycle)
        tank = self.create_tank(source)
        first, _, _ = self.calibrate(source, tank, calibrated_at=self.at(day, 8))
        destination = first.destination_allocation
        ProductionCycleService.harvest_cycle_unit_allocation(
            destination,
            harvest_date=day,
            final_harvested_at=self.at(day, 18),
            final_count=200,
            final_average_weight=Decimal('300.00'),
        )
        with pytest.raises(BusinessRuleViolation):
            self.calibrate(
                source,
                tank,
                calibrated_at=self.at(day, 12),
                transferred_count=100,
                transferred_average_weight_g=Decimal('300.00'),
            )

        assert CalibrationOperation.objects.count() == 1
        assert tank.cycle_allocations.count() == 1
        assert tank.cycle_allocations.filter(status=CycleUnitAllocation.STATUS_ACTIVE).count() == 0

    def test_same_day_arrival_after_closure_creates_new_session(self, production_cycle):
        day = timezone.localdate() - timedelta(days=1)
        production_cycle.start_date = day
        production_cycle.save(update_fields=['start_date'])
        source = self.setup_source(production_cycle)
        tank = self.create_tank(source)
        first, _, _ = self.calibrate(source, tank, calibrated_at=self.at(day, 8))
        ProductionCycleService.harvest_cycle_unit_allocation(
            first.destination_allocation,
            harvest_date=day,
            final_harvested_at=self.at(day, 18),
            final_count=200,
            final_average_weight=Decimal('300.00'),
        )

        later, _, _ = self.calibrate(
            source,
            tank,
            calibrated_at=self.at(day, 20),
            transferred_count=100,
            transferred_average_weight_g=Decimal('300.00'),
        )

        assert later.destination_allocation_id != first.destination_allocation_id
        assert tank.cycle_allocations.count() == 2
        assert tank.cycle_allocations.filter(status=CycleUnitAllocation.STATUS_ACTIVE).count() == 1

    def test_backdated_arrival_invalidating_final_harvest_rolls_back(self, production_cycle):
        day = timezone.localdate() - timedelta(days=1)
        production_cycle.start_date = day
        production_cycle.save(update_fields=['start_date'])
        source = self.setup_source(production_cycle)
        tank = self.create_tank(source)
        first, _, _ = self.calibrate(source, tank, calibrated_at=self.at(day, 8))
        ProductionCycleService.harvest_cycle_unit_allocation(
            first.destination_allocation,
            harvest_date=day,
            final_harvested_at=self.at(day, 18),
            final_count=200,
            final_average_weight=Decimal('300.00'),
        )

        with pytest.raises(BusinessRuleViolation):
            self.calibrate(
                source,
                tank,
                calibrated_at=self.at(day, 12),
                transferred_count=100,
                transferred_average_weight_g=Decimal('300.00'),
            )

        source.refresh_from_db()
        assert CalibrationOperation.objects.count() == 1
        assert source.current_fish_count == 800
        assert tank.cycle_allocations.count() == 1

    def test_backdated_arrival_expands_active_session_without_overlap(self, production_cycle):
        day = timezone.localdate() - timedelta(days=1)
        production_cycle.start_date = day
        production_cycle.save(update_fields=['start_date'])
        source = self.setup_source(production_cycle)
        tank = self.create_tank(source)
        first, _, _ = self.calibrate(source, tank, calibrated_at=self.at(day, 8))
        ProductionCycleService.harvest_cycle_unit_allocation(
            first.destination_allocation,
            harvest_date=day,
            final_harvested_at=self.at(day, 18),
            final_count=200,
            final_average_weight=Decimal('300.00'),
        )
        later, _, _ = self.calibrate(source, tank, calibrated_at=self.at(day, 20), transferred_count=100)

        backdated, _, _ = self.calibrate(
            source,
            tank,
            calibrated_at=self.at(day, 19),
            transferred_count=50,
        )

        assert backdated.destination_allocation_id == later.destination_allocation_id
        assert tank.cycle_allocations.count() == 2
        assert tank.cycle_allocations.filter(status=CycleUnitAllocation.STATUS_ACTIVE).count() == 1

    def test_destination_final_harvest_pending_then_reconciled(self, production_cycle):
        day = timezone.localdate() - timedelta(days=1)
        production_cycle.start_date = day
        production_cycle.save(update_fields=['start_date'])
        source = self.setup_source(production_cycle)
        tank = self.create_tank(source)
        first, _, _ = self.calibrate(source, tank, calibrated_at=self.at(day, 8))
        destination = first.destination_allocation

        _, _, final_harvest, _ = ProductionCycleService.harvest_cycle_unit_allocation(
            destination,
            harvest_date=day,
            final_harvested_at=self.at(day, 18),
            final_count=300,
            final_average_weight=Decimal('300.00'),
            client_uuid=uuid.uuid4(),
            created_offline=True,
            allow_pending_reconciliation=True,
        )
        assert final_harvest.reconciliation_status == FinalHarvestOperation.STATUS_PENDING
        assert final_harvest.computed_count_before_harvest == 200

        second, _, _ = self.calibrate(
            source,
            tank,
            calibrated_at=self.at(day, 12),
            transferred_count=100,
            transferred_average_weight_g=Decimal('150.00'),
            created_offline=True,
        )
        final_harvest.refresh_from_db()
        destination.refresh_from_db()
        assert second.destination_allocation_id == destination.id
        assert final_harvest.computed_count_before_harvest == 300
        assert final_harvest.reconciliation_status == FinalHarvestOperation.STATUS_RECONCILED
        assert destination.current_fish_count == 0

    def test_source_final_harvest_pending_then_reconciled(self, production_cycle):
        day = timezone.localdate() - timedelta(days=1)
        production_cycle.start_date = day
        production_cycle.save(update_fields=['start_date'])
        source = self.setup_source(production_cycle)
        tank = self.create_tank(source)

        _, _, final_harvest, _ = ProductionCycleService.harvest_cycle_unit_allocation(
            source,
            harvest_date=day,
            final_harvested_at=self.at(day, 18),
            final_count=900,
            final_average_weight=Decimal('300.00'),
            client_uuid=uuid.uuid4(),
            created_offline=True,
            allow_pending_reconciliation=True,
        )
        self.calibrate(
            source,
            tank,
            calibrated_at=self.at(day, 12),
            transferred_count=100,
            transferred_average_weight_g=Decimal('100.00'),
            created_offline=True,
        )
        final_harvest.refresh_from_db()
        source.refresh_from_db()
        assert final_harvest.computed_count_before_harvest == 900
        assert final_harvest.reconciliation_status == FinalHarvestOperation.STATUS_RECONCILED
        assert source.current_fish_count == 0

    def test_pending_harvest_accepts_multiple_events_that_close_the_gap(self, production_cycle):
        day = timezone.localdate() - timedelta(days=1)
        production_cycle.start_date = day
        production_cycle.save(update_fields=['start_date'])
        source = self.setup_source(production_cycle)
        tank = self.create_tank(source)
        first, _, _ = self.calibrate(source, tank, calibrated_at=self.at(day, 8))
        destination = first.destination_allocation
        _, _, final_harvest, _ = ProductionCycleService.harvest_cycle_unit_allocation(
            destination,
            harvest_date=day,
            final_harvested_at=self.at(day, 18),
            final_count=300,
            final_average_weight=Decimal('300.00'),
            client_uuid=uuid.uuid4(),
            created_offline=True,
        )
        self.calibrate(source, tank, calibrated_at=self.at(day, 12), transferred_count=50)
        final_harvest.refresh_from_db()
        assert final_harvest.computed_count_before_harvest == 250
        assert final_harvest.reconciliation_status == FinalHarvestOperation.STATUS_PENDING
        self.calibrate(source, tank, calibrated_at=self.at(day, 13), transferred_count=50)
        final_harvest.refresh_from_db()
        assert final_harvest.computed_count_before_harvest == 300
        assert final_harvest.reconciliation_status == FinalHarvestOperation.STATUS_RECONCILED

    def test_final_harvest_mismatch_requires_explicit_pending_mode(self, production_cycle):
        source = self.setup_source(production_cycle)
        with pytest.raises(FinalHarvestStockMismatch):
            ProductionCycleService.harvest_cycle_unit_allocation(
                source,
                harvest_date=timezone.localdate(),
                final_harvested_at=timezone.now(),
                final_count=900,
                final_average_weight=Decimal('300.00'),
                client_uuid=uuid.uuid4(),
            )

    def test_final_harvest_idempotency_contract(self, production_cycle):
        source = self.setup_source(production_cycle)
        client_uuid = uuid.uuid4()
        harvested_at = timezone.now()
        first = ProductionCycleService.harvest_cycle_unit_allocation(
            source,
            harvest_date=timezone.localdate(),
            final_harvested_at=harvested_at,
            final_count=1000,
            final_average_weight=Decimal('300.00'),
            client_uuid=client_uuid,
        )
        second = ProductionCycleService.harvest_cycle_unit_allocation(
            source,
            harvest_date=timezone.localdate(),
            final_harvested_at=harvested_at,
            final_count=1000,
            final_average_weight=Decimal('300.00'),
            client_uuid=client_uuid,
        )
        assert first[2].id == second[2].id
        assert second[3] is False
        with pytest.raises(FinalHarvestIdempotencyConflict):
            ProductionCycleService.harvest_cycle_unit_allocation(
                source,
                harvest_date=timezone.localdate(),
                final_harvested_at=harvested_at,
                final_count=999,
                final_average_weight=Decimal('300.00'),
                client_uuid=client_uuid,
                created_offline=True,
            )

    def test_cycle_harvest_single_allocation_can_be_pending(self, production_cycle):
        source = self.setup_source(production_cycle)
        harvested_at = timezone.now() - timedelta(seconds=1)

        harvested_cycle = ProductionCycleService.harvest_cycle(
            source.cycle,
            harvest_date=timezone.localdate(harvested_at),
            final_harvested_at=harvested_at,
            final_count=900,
            final_average_weight=Decimal('300.00'),
            client_uuid=uuid.uuid4(),
            created_offline=True,
            allow_pending_reconciliation=True,
        )

        operation = FinalHarvestOperation.objects.get(allocation=source)
        assert harvested_cycle.status == 'harvested'
        assert operation.reconciliation_status == FinalHarvestOperation.STATUS_PENDING
        assert operation.computed_count_before_harvest == 1000

    def test_final_harvest_projection_cannot_diverge_silently(self, production_cycle):
        source = self.setup_source(production_cycle)
        harvested_at = timezone.now() - timedelta(seconds=1)
        ProductionCycleService.harvest_cycle_unit_allocation(
            source,
            harvest_date=timezone.localdate(harvested_at),
            final_harvested_at=harvested_at,
            final_count=1000,
            final_average_weight=Decimal('300.00'),
            client_uuid=uuid.uuid4(),
        )
        source.refresh_from_db()
        source.final_fish_count = 999

        with pytest.raises(ValidationError, match='projection'):
            source.save()


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'postgresql', reason='Concurrent row locks require PostgreSQL')
def test_concurrent_arrivals_create_one_active_calibration_session(production_cycle):
    helper = TestCalibrationService()
    source = helper.setup_source(production_cycle)
    tank = helper.create_tank(source)
    calibrated_at = timezone.now().replace(second=0, microsecond=0)

    def calibrate_once(index):
        connection.close()
        try:
            return CalibrationService.calibrate(
                source_allocation=source,
                destination_production_unit=tank,
                user=source.cycle.farm_profile.user,
                client_uuid=uuid.uuid4(),
                calibrated_at=calibrated_at + timedelta(seconds=index),
                transferred_count=150,
                transferred_average_weight_g=Decimal('150.00'),
            )
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(calibrate_once, range(2)))

    assert all(created for _operation, _warnings, created in results)
    assert CalibrationOperation.objects.count() == 2
    assert tank.cycle_allocations.count() == 1
    destination = tank.cycle_allocations.get(status=CycleUnitAllocation.STATUS_ACTIVE)
    source.refresh_from_db()
    destination.refresh_from_db()
    assert source.current_fish_count == 700
    assert destination.current_fish_count == 300


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'postgresql', reason='Concurrent row locks require PostgreSQL')
def test_concurrent_transfers_from_same_source_never_oversubscribe(production_cycle):
    helper = TestCalibrationService()
    source = helper.setup_source(production_cycle)
    tanks = [helper.create_tank(source, name=f'Bac concurrent {index}') for index in range(2)]
    calibrated_at = timezone.now().replace(second=0, microsecond=0)

    def calibrate_once(index):
        connection.close()
        try:
            CalibrationService.calibrate(
                source_allocation=source,
                destination_production_unit=tanks[index],
                user=source.cycle.farm_profile.user,
                client_uuid=uuid.uuid4(),
                calibrated_at=calibrated_at + timedelta(seconds=index),
                transferred_count=600,
                transferred_average_weight_g=Decimal('100.00'),
            )
            return True
        except BusinessRuleViolation:
            return False
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(calibrate_once, range(2)))

    source.refresh_from_db()
    assert results.count(True) == 1
    assert CalibrationOperation.objects.count() == 1
    assert source.current_fish_count == 400


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'postgresql', reason='Concurrent row locks require PostgreSQL')
def test_concurrent_cross_transfers_follow_global_lock_order(production_cycle):
    helper = TestCalibrationService()
    original_source = helper.setup_source(production_cycle)
    tank_a = helper.create_tank(original_source, name='Bac croisé A')
    tank_b = helper.create_tank(original_source, name='Bac croisé B')
    allocation_a = helper.calibrate(original_source, tank_a, transferred_count=200)[0].destination_allocation
    allocation_b = helper.calibrate(original_source, tank_b, transferred_count=200)[0].destination_allocation
    calibrated_at = timezone.now().replace(second=0, microsecond=0) + timedelta(minutes=1)

    def calibrate_once(source, destination, index):
        connection.close()
        try:
            return CalibrationService.calibrate(
                source_allocation=source,
                destination_production_unit=destination,
                user=production_cycle.farm_profile.user,
                client_uuid=uuid.uuid4(),
                calibrated_at=calibrated_at + timedelta(seconds=index),
                transferred_count=50,
                transferred_average_weight_g=Decimal('150.00'),
            )
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(calibrate_once, allocation_a, tank_b, 0),
            executor.submit(calibrate_once, allocation_b, tank_a, 1),
        ]
        results = [future.result(timeout=10) for future in futures]

    allocation_a.refresh_from_db()
    allocation_b.refresh_from_db()
    assert all(created for _operation, _warnings, created in results)
    assert allocation_a.current_fish_count == 200
    assert allocation_b.current_fish_count == 200


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'postgresql', reason='Concurrent row locks require PostgreSQL')
def test_concurrent_final_harvest_and_calibration_reconcile_without_deadlock(production_cycle):
    helper = TestCalibrationService()
    day = timezone.localdate() - timedelta(days=1)
    production_cycle.start_date = day
    production_cycle.save(update_fields=['start_date'])
    source = helper.setup_source(production_cycle)
    tank = helper.create_tank(source)
    first = helper.calibrate(source, tank, calibrated_at=helper.at(day, 8))[0]
    destination = first.destination_allocation
    barrier = Barrier(2)

    def harvest_once():
        connection.close()
        try:
            barrier.wait()
            return ProductionCycleService.harvest_cycle_unit_allocation(
                destination,
                harvest_date=day,
                final_harvested_at=helper.at(day, 18),
                final_count=300,
                final_average_weight=Decimal('300.00'),
                client_uuid=uuid.uuid4(),
                created_offline=True,
                allow_pending_reconciliation=True,
            )
        finally:
            connection.close()

    def calibrate_once():
        connection.close()
        try:
            barrier.wait()
            return CalibrationService.calibrate(
                source_allocation=source,
                destination_production_unit=tank,
                user=production_cycle.farm_profile.user,
                client_uuid=uuid.uuid4(),
                calibrated_at=helper.at(day, 12),
                transferred_count=100,
                transferred_average_weight_g=Decimal('150.00'),
                created_offline=True,
            )
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(harvest_once), executor.submit(calibrate_once)]
        [future.result(timeout=10) for future in futures]

    destination.refresh_from_db()
    final_harvest = FinalHarvestOperation.objects.get(allocation=destination)
    assert final_harvest.reconciliation_status == FinalHarvestOperation.STATUS_RECONCILED
    assert final_harvest.computed_count_before_harvest == 300
    assert destination.current_fish_count == 0
    assert CalibrationOperation.objects.count() == 2


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'postgresql', reason='Concurrent row locks require PostgreSQL')
def test_concurrent_final_harvests_create_exactly_one_operation(production_cycle):
    helper = TestCalibrationService()
    source = helper.setup_source(production_cycle)
    harvested_at = timezone.now()
    barrier = Barrier(2)

    def harvest_once():
        connection.close()
        try:
            barrier.wait()
            ProductionCycleService.harvest_cycle_unit_allocation(
                source,
                harvest_date=timezone.localdate(harvested_at),
                final_harvested_at=harvested_at,
                final_count=1000,
                final_average_weight=Decimal('300.00'),
                client_uuid=uuid.uuid4(),
            )
            return 'created'
        except AllocationAlreadyFinallyHarvested as exc:
            return exc.default_code
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _index: harvest_once(), range(2)))

    assert sorted(results) == ['allocation_already_finally_harvested', 'created']
    assert FinalHarvestOperation.objects.filter(allocation=source).count() == 1


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'postgresql', reason='Concurrent row locks require PostgreSQL')
def test_two_concurrent_calibrations_and_final_harvest_keep_all_events(production_cycle):
    helper = TestCalibrationService()
    day = timezone.localdate() - timedelta(days=1)
    production_cycle.start_date = day
    production_cycle.save(update_fields=['start_date'])
    source = helper.setup_source(production_cycle)
    tank = helper.create_tank(source)
    destination = helper.calibrate(source, tank, calibrated_at=helper.at(day, 8))[0].destination_allocation
    barrier = Barrier(3)

    def calibrate_once(hour):
        connection.close()
        try:
            barrier.wait()
            return CalibrationService.calibrate(
                source_allocation=source,
                destination_production_unit=tank,
                user=production_cycle.farm_profile.user,
                client_uuid=uuid.uuid4(),
                calibrated_at=helper.at(day, hour),
                transferred_count=50,
                transferred_average_weight_g=Decimal('150.00'),
                created_offline=True,
            )
        finally:
            connection.close()

    def harvest_once():
        connection.close()
        try:
            barrier.wait()
            return ProductionCycleService.harvest_cycle_unit_allocation(
                destination,
                harvest_date=day,
                final_harvested_at=helper.at(day, 18),
                final_count=300,
                final_average_weight=Decimal('300.00'),
                client_uuid=uuid.uuid4(),
                created_offline=True,
                allow_pending_reconciliation=True,
            )
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [
            executor.submit(calibrate_once, 12),
            executor.submit(calibrate_once, 13),
            executor.submit(harvest_once),
        ]
        [future.result(timeout=15) for future in futures]

    destination.refresh_from_db()
    final_harvest = FinalHarvestOperation.objects.get(allocation=destination)
    assert CalibrationOperation.objects.count() == 3
    assert final_harvest.computed_count_before_harvest == 300
    assert final_harvest.reconciliation_status == FinalHarvestOperation.STATUS_RECONCILED
    assert destination.current_fish_count == 0
