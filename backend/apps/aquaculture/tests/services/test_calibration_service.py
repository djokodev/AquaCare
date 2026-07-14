import uuid
from datetime import datetime, time
from decimal import Decimal

import pytest
from django.utils import timezone

from aquaculture.domain.exceptions import BusinessRuleViolation
from aquaculture.models import CalibrationOperation, CalibrationTank, CycleUnitAllocation, ProductionUnit
from aquaculture.services.calibration_service import CalibrationService


@pytest.mark.django_db
class TestCalibrationService:
    def setup_source(self, production_cycle):
        production_cycle.current_count = 1000
        production_cycle.current_average_weight = Decimal('100.00')
        production_cycle.current_biomass = Decimal('100.00')
        production_cycle.initial_count = 1000
        production_cycle.initial_average_weight = Decimal('100.00')
        production_cycle.initial_biomass = Decimal('100.00')
        production_cycle.save()
        return production_cycle

    def calibrate(self, source, tank, **overrides):
        payload = {
            'source_cycle': source,
            'destination_tank': tank,
            'user': source.farm_profile.user,
            'client_uuid': uuid.uuid4(),
            'calibrated_at': timezone.make_aware(datetime.combine(timezone.localdate(), time(9))),
            'transferred_count': 200,
            'transferred_average_weight_g': Decimal('150.00'),
        }
        payload.update(overrides)
        return CalibrationService.calibrate(**payload)

    def test_first_calibration_conserves_stock(self, production_cycle):
        source = self.setup_source(production_cycle)
        tank = CalibrationTank.objects.create(farm_profile=source.farm_profile, name='Bac A', volume_m3=10)
        operation, _, created = self.calibrate(source, tank)
        source.refresh_from_db()
        operation.destination_cycle.refresh_from_db()
        assert created is True
        assert (source.current_count, source.current_biomass, source.current_average_weight) == (800, Decimal('70.00'), Decimal('87.50'))
        assert (operation.destination_cycle.current_count, operation.destination_cycle.current_biomass) == (200, Decimal('30.00'))
        assert source.current_count + operation.destination_cycle.current_count == 1000
        assert source.current_biomass + operation.destination_cycle.current_biomass == Decimal('100.00')

    def test_second_arrival_uses_weighted_average_and_same_session(self, production_cycle):
        source = self.setup_source(production_cycle)
        tank = CalibrationTank.objects.create(farm_profile=source.farm_profile, name='Bac A', volume_m3=10)
        first, _, _ = self.calibrate(source, tank)
        second, _, _ = self.calibrate(source, tank, transferred_count=100, transferred_average_weight_g=Decimal('120'))
        second.destination_cycle.refresh_from_db()
        assert second.destination_cycle_id == first.destination_cycle_id
        assert second.destination_cycle.current_count == 300
        assert second.destination_cycle.current_biomass == Decimal('42.00')
        assert second.destination_cycle.current_average_weight == Decimal('140.00')

    def test_client_uuid_is_idempotent(self, production_cycle):
        source = self.setup_source(production_cycle)
        tank = CalibrationTank.objects.create(farm_profile=source.farm_profile, name='Bac A', volume_m3=10)
        client_uuid = uuid.uuid4()
        first, _, _ = self.calibrate(source, tank, client_uuid=client_uuid)
        second, _, created = self.calibrate(source, tank, client_uuid=client_uuid)
        assert first.pk == second.pk
        assert created is False
        assert CalibrationOperation.objects.count() == 1

    def test_different_species_is_rejected_atomically(self, production_cycle, farm_profile):
        source = self.setup_source(production_cycle)
        tank = CalibrationTank.objects.create(farm_profile=farm_profile, name='Bac A', volume_m3=10)
        first, _, _ = self.calibrate(source, tank)
        source.species = 'tilapia'
        source.save(update_fields=['species'])
        with pytest.raises(BusinessRuleViolation):
            self.calibrate(source, tank)
        assert CalibrationOperation.objects.count() == 1
        first.destination_cycle.refresh_from_db()
        assert first.destination_cycle.current_count == 200

    def test_calibration_from_unit_debits_only_selected_allocation(self, production_cycle):
        source = self.setup_source(production_cycle)
        unit = ProductionUnit.objects.create(
            farm_profile=source.farm_profile,
            name='Cage 1',
            unit_type='cage',
            volume_m3=Decimal('10'),
        )
        allocation = CycleUnitAllocation.objects.create(
            cycle=source,
            production_unit=unit,
            initial_fish_count=400,
            current_fish_count=400,
            initial_biomass_kg=Decimal('40'),
            current_biomass_kg=Decimal('40'),
        )
        tank = CalibrationTank.objects.create(
            farm_profile=source.farm_profile,
            name='Bac A',
            volume_m3=10,
        )

        operation, _, _ = self.calibrate(
            source,
            tank,
            source_cycle_unit_allocation=allocation.id,
            transferred_count=100,
            transferred_average_weight_g=Decimal('120'),
        )

        allocation.refresh_from_db()
        source.refresh_from_db()
        assert operation.source_cycle_unit_allocation_id == allocation.id
        assert allocation.current_fish_count == 300
        assert allocation.current_biomass_kg == Decimal('28.00')
        assert source.current_count == 300
