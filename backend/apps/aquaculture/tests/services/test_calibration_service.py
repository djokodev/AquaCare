from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from aquaculture.domain.exceptions import BusinessRuleViolation
from aquaculture.models import CalibrationOperation, CycleUnitAllocation, ProductionUnit
from aquaculture.services.calibration_service import (
    CalibrationIdempotencyConflict,
    CalibrationService,
)
from aquaculture.services.cycle_service import ProductionCycleService
from django.db import connection
from django.utils import timezone


@pytest.mark.django_db
class TestCalibrationService:
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
            'calibrated_at': timezone.make_aware(datetime.combine(timezone.localdate(), time(9))),
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
        today_at_nine = timezone.make_aware(datetime.combine(timezone.localdate(), time(9)))
        later, _, _ = self.calibrate(source, tank, calibrated_at=today_at_nine, transferred_count=100)
        earlier, _, _ = self.calibrate(
            source,
            tank,
            calibrated_at=today_at_nine - timedelta(hours=1),
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
            final_count=200,
            final_average_weight=Decimal('300.00'),
        )
        first.destination_allocation.refresh_from_db()
        assert first.destination_allocation.status == CycleUnitAllocation.STATUS_HARVESTED

        second, _, _ = self.calibrate(
            source,
            tank,
            transferred_count=100,
            transferred_average_weight_g=Decimal('300.00'),
        )
        assert second.destination_allocation_id != first_allocation_id
        assert second.destination_allocation.cycle_id != first_cycle_id
        assert tank.cycle_allocations.count() == 2
        assert tank.cycle_allocations.filter(status=CycleUnitAllocation.STATUS_ACTIVE).count() == 1


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'postgresql', reason='Concurrent row locks require PostgreSQL')
def test_concurrent_arrivals_create_one_active_calibration_session(production_cycle):
    helper = TestCalibrationService()
    source = helper.setup_source(production_cycle)
    tank = helper.create_tank(source)
    calibrated_at = timezone.make_aware(datetime.combine(timezone.localdate(), time(9)))

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
