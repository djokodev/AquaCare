"""Super-admin workflow for deleting daily logs without hiding ledger impact."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, time

from django.db import transaction
from django.utils import timezone

from ..domain.exceptions import BusinessRuleViolation
from ..models import CycleLog, CycleUnitAllocation, FinalHarvestOperation
from .cycle_service import ProductionCycleService
from .final_harvest_service import FinalHarvestService


@dataclass(frozen=True)
class AdministrativeLogDeletionResult:
    """Outcome exposed to the admin layer after a forced deletion."""

    final_harvest_requires_reconciliation: bool
    cycle_requires_ledger_review: bool


class AdministrativeLogDeletionService:
    """Delete a daily log and explicitly reconcile its historical effects."""

    @staticmethod
    def _materialize_legacy_final_harvests(
        allocations: list[CycleUnitAllocation],
    ) -> None:
        """Turn legacy allocation projections into reconcilable ledger events."""
        operation_allocation_ids = set(
            FinalHarvestOperation.objects.filter(
                allocation_id__in=[allocation.id for allocation in allocations],
            ).values_list("allocation_id", flat=True),
        )
        for allocation in allocations:
            if (
                allocation.status != CycleUnitAllocation.STATUS_HARVESTED
                or allocation.id in operation_allocation_ids
            ):
                continue
            harvested_at = allocation.final_harvested_at
            if harvested_at is None:
                harvested_at = timezone.make_aware(
                    datetime.combine(allocation.final_harvest_date, time.max),
                    timezone.get_current_timezone(),
                )
            FinalHarvestOperation.objects.create(
                client_uuid=uuid.uuid4(),
                allocation=allocation,
                harvested_at=harvested_at,
                declared_fish_count=allocation.final_fish_count,
                declared_average_weight_g=allocation.final_average_weight_g,
                declared_biomass_kg=allocation.final_biomass_kg,
                notes=allocation.final_harvest_notes,
                reconciliation_status=FinalHarvestOperation.STATUS_PENDING,
                created_by=allocation.cycle.farm_profile.user,
            )

    @classmethod
    @transaction.atomic
    def delete(cls, cycle_log: CycleLog) -> AdministrativeLogDeletionResult:
        """Delete one log while keeping final-harvest reconciliation explicit."""
        # The allocation relation is nullable. Joining it here makes PostgreSQL
        # reject FOR UPDATE on the nullable side of the resulting outer join.
        # Lock the log first, then lock its allocation explicitly below.
        cycle_log = CycleLog.objects.select_for_update().get(pk=cycle_log.pk)
        allocations = list(
            CycleUnitAllocation.objects.select_for_update()
            .select_related("cycle__farm_profile__user")
            .filter(cycle_id=cycle_log.cycle_id),
        )
        cls._materialize_legacy_final_harvests(allocations)
        allocation_ids = [allocation.id for allocation in allocations]
        operations = list(
            FinalHarvestOperation.objects.select_for_update()
            .select_related("allocation")
            .filter(allocation_id__in=allocation_ids),
        )
        if operations:
            FinalHarvestOperation.objects.filter(
                pk__in=[operation.pk for operation in operations],
            ).update(
                reconciliation_status=FinalHarvestOperation.STATUS_PENDING,
                updated_at=timezone.now(),
            )

        cycle = cycle_log.cycle
        cycle_log._skip_automatic_metrics_recalculation = True
        cycle_log.delete()

        requires_reconciliation = False
        for operation in operations:
            operation.refresh_from_db()
            before = FinalHarvestService.replay_before_harvest(
                operation.allocation,
                operation.harvested_at,
            )
            operation.computed_count_before_harvest = before["current_count"]
            operation.computed_biomass_before_harvest_kg = before["current_biomass_kg"]
            if before["current_count"] == operation.declared_fish_count:
                operation.reconciliation_status = FinalHarvestOperation.STATUS_RECONCILED
            else:
                operation.reconciliation_status = FinalHarvestOperation.STATUS_PENDING
                requires_reconciliation = True
            operation.save(update_fields=[
                "computed_count_before_harvest",
                "computed_biomass_before_harvest_kg",
                "reconciliation_status",
                "updated_at",
            ])

        cycle_requires_ledger_review = False
        try:
            with transaction.atomic():
                ProductionCycleService.recalculate_all_metrics(cycle)
        except BusinessRuleViolation:
            cycle_requires_ledger_review = True

        return AdministrativeLogDeletionResult(
            final_harvest_requires_reconciliation=requires_reconciliation,
            cycle_requires_ledger_review=cycle_requires_ledger_review,
        )
