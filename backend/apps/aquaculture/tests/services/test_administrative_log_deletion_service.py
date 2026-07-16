import uuid
from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from aquaculture.models import (
    CycleLog,
    CycleUnitAllocation,
    FinalHarvestOperation,
    PartialHarvest,
    ProductionUnit,
)
from aquaculture.services.administrative_log_deletion_service import (
    AdministrativeLogDeletionService,
)
from django.template.loader import get_template
from django.utils import timezone


def create_allocation(
    production_cycle,
    *,
    unit_name: str = "Bac suppression admin",
) -> CycleUnitAllocation:
    unit = ProductionUnit.objects.create(
        farm_profile=production_cycle.farm_profile,
        name=unit_name,
        unit_type="tank",
        volume_m3=Decimal("3.00"),
    )
    return CycleUnitAllocation.objects.create(
        cycle=production_cycle,
        production_unit=unit,
        initial_fish_count=100,
        current_fish_count=100,
        initial_biomass_kg=Decimal("1.00"),
        current_biomass_kg=Decimal("1.00"),
    )


def close_allocation(allocation, *, declared_count: int) -> FinalHarvestOperation:
    harvested_at = timezone.make_aware(
        datetime.combine(timezone.localdate(), time(hour=18)),
        timezone.get_current_timezone(),
    )
    allocation.status = CycleUnitAllocation.STATUS_HARVESTED
    allocation.final_harvested_at = harvested_at
    allocation.final_harvest_date = timezone.localdate()
    allocation.final_fish_count = declared_count
    allocation.final_average_weight_g = Decimal("10.00")
    allocation.final_biomass_kg = Decimal("0.90")
    allocation.current_fish_count = 0
    allocation.current_biomass_kg = Decimal("0.00")
    allocation.save()
    return FinalHarvestOperation.objects.create(
        client_uuid=uuid.uuid4(),
        allocation=allocation,
        harvested_at=harvested_at,
        declared_fish_count=declared_count,
        declared_average_weight_g=Decimal("10.00"),
        declared_biomass_kg=Decimal("0.90"),
        reconciliation_status=FinalHarvestOperation.STATUS_RECONCILED,
        computed_count_before_harvest=declared_count,
        computed_biomass_before_harvest_kg=Decimal("0.90"),
        created_by=allocation.cycle.farm_profile.user,
    )


def close_legacy_allocation(allocation, *, declared_count: int) -> None:
    harvested_at = timezone.make_aware(
        datetime.combine(timezone.localdate(), time(hour=18)),
        timezone.get_current_timezone(),
    )
    allocation.status = CycleUnitAllocation.STATUS_HARVESTED
    allocation.final_harvested_at = harvested_at
    allocation.final_harvest_date = timezone.localdate()
    allocation.final_fish_count = declared_count
    allocation.final_average_weight_g = Decimal("10.00")
    allocation.final_biomass_kg = Decimal("0.90")
    allocation.current_fish_count = 0
    allocation.current_biomass_kg = Decimal("0.00")
    allocation.save()


@pytest.mark.django_db
def test_superadmin_deletion_marks_affected_final_harvest_pending(production_cycle):
    allocation = create_allocation(production_cycle)
    cycle_log = CycleLog.objects.create(
        cycle=production_cycle,
        cycle_unit_allocation=allocation,
        log_date=timezone.localdate() - timedelta(days=1),
        mortality_count=10,
        average_weight=Decimal("10.00"),
    )
    operation = close_allocation(allocation, declared_count=90)

    result = AdministrativeLogDeletionService.delete(cycle_log)

    operation.refresh_from_db()
    assert not CycleLog.objects.filter(pk=cycle_log.pk).exists()
    assert result.final_harvest_requires_reconciliation is True
    assert operation.reconciliation_status == FinalHarvestOperation.STATUS_PENDING
    assert operation.computed_count_before_harvest == 100


@pytest.mark.django_db
def test_global_log_deletion_prepares_every_final_harvest(production_cycle):
    first_allocation = create_allocation(production_cycle)
    second_allocation = create_allocation(
        production_cycle,
        unit_name="Second bac suppression admin",
    )
    cycle_log = CycleLog.objects.create(
        cycle=production_cycle,
        cycle_unit_allocation=None,
        log_date=timezone.localdate() - timedelta(days=1),
        mortality_count=1,
        average_weight=Decimal("10.00"),
    )
    first_operation = close_allocation(first_allocation, declared_count=100)
    second_operation = close_allocation(second_allocation, declared_count=90)

    result = AdministrativeLogDeletionService.delete(cycle_log)

    first_operation.refresh_from_db()
    second_operation.refresh_from_db()
    assert not CycleLog.objects.filter(pk=cycle_log.pk).exists()
    assert result.final_harvest_requires_reconciliation is True
    assert first_operation.reconciliation_status == FinalHarvestOperation.STATUS_RECONCILED
    assert second_operation.reconciliation_status == FinalHarvestOperation.STATUS_PENDING


@pytest.mark.django_db
def test_deletion_materializes_legacy_final_harvest(production_cycle):
    allocation = create_allocation(production_cycle)
    cycle_log = CycleLog.objects.create(
        cycle=production_cycle,
        cycle_unit_allocation=allocation,
        log_date=timezone.localdate() - timedelta(days=1),
        mortality_count=10,
        average_weight=Decimal("10.00"),
    )
    close_legacy_allocation(allocation, declared_count=90)

    result = AdministrativeLogDeletionService.delete(cycle_log)

    operation = FinalHarvestOperation.objects.get(allocation=allocation)
    assert not CycleLog.objects.filter(pk=cycle_log.pk).exists()
    assert result.final_harvest_requires_reconciliation is True
    assert operation.declared_fish_count == 90
    assert operation.computed_count_before_harvest == 100
    assert operation.reconciliation_status == FinalHarvestOperation.STATUS_PENDING


@pytest.mark.django_db
def test_deletion_survives_preexisting_invalid_harvest_order(production_cycle):
    allocation = create_allocation(production_cycle)
    cycle_log = CycleLog.objects.create(
        cycle=production_cycle,
        cycle_unit_allocation=allocation,
        log_date=timezone.localdate() - timedelta(days=1),
        mortality_count=5,
        average_weight=Decimal("10.00"),
    )
    close_legacy_allocation(allocation, declared_count=90)
    PartialHarvest.objects.create(
        cycle=production_cycle,
        cycle_unit_allocation=allocation,
        harvest_date=timezone.localdate() + timedelta(days=1),
        count_harvested=10,
        average_weight_g=Decimal("10.00"),
        total_weight_kg=Decimal("0.100"),
    )

    result = AdministrativeLogDeletionService.delete(cycle_log)

    assert not CycleLog.objects.filter(pk=cycle_log.pk).exists()
    assert result.final_harvest_requires_reconciliation is True
    assert result.cycle_requires_ledger_review is True


def test_admin_delete_confirmation_explains_ledger_consequences():
    template = get_template(
        "admin/aquaculture/cyclelog/delete_confirmation.html",
    )
    source = template.template.source

    assert "suppression métier irréversible" in source
    assert "récolte finale" in source
