"""Création et réconciliation des événements de récolte finale."""

from __future__ import annotations

from decimal import Decimal

from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from ..domain.exceptions import (
    AllocationAlreadyFinallyHarvested,
    BusinessRuleViolation,
    FinalHarvestIdempotencyConflict,
    FinalHarvestStockMismatch,
)
from ..models import CycleUnitAllocation, FinalHarvestOperation
from .allocation_ledger_service import AllocationLedgerService


class FinalHarvestService:
    """Maintient le constat physique et sa projection sur l'allocation."""

    @staticmethod
    def replay_before_harvest(
        allocation: CycleUnitAllocation,
        harvested_at,
    ) -> dict:
        return AllocationLedgerService.replay(
            allocation,
            as_of=harvested_at,
            include_final_harvest=False,
            strictly_before_as_of=True,
        )

    @classmethod
    def find_idempotent_replay(
        cls,
        *,
        client_uuid,
        allocation: CycleUnitAllocation,
        harvested_at,
        declared_fish_count: int,
        declared_average_weight_g: Decimal,
        declared_biomass_kg: Decimal,
        notes: str,
        created_offline: bool,
    ) -> FinalHarvestOperation | None:
        existing = (
            FinalHarvestOperation.objects.select_related('allocation')
            .filter(client_uuid=client_uuid)
            .first()
        )
        if existing is None:
            return None
        same_payload = all([
            existing.allocation_id == allocation.pk,
            existing.harvested_at == harvested_at,
            existing.declared_fish_count == declared_fish_count,
            existing.declared_average_weight_g == declared_average_weight_g,
            existing.declared_biomass_kg == declared_biomass_kg,
            existing.notes == notes,
            existing.created_offline == created_offline,
        ])
        if not same_payload:
            raise FinalHarvestIdempotencyConflict()
        return existing

    @classmethod
    def create(
        cls,
        *,
        allocation: CycleUnitAllocation,
        client_uuid,
        harvested_at,
        declared_fish_count: int,
        declared_average_weight_g: Decimal,
        declared_biomass_kg: Decimal,
        notes: str,
        created_by,
        created_offline: bool,
        allow_pending_reconciliation: bool,
    ) -> tuple[FinalHarvestOperation, bool]:
        existing = cls.find_idempotent_replay(
            client_uuid=client_uuid,
            allocation=allocation,
            harvested_at=harvested_at,
            declared_fish_count=declared_fish_count,
            declared_average_weight_g=declared_average_weight_g,
            declared_biomass_kg=declared_biomass_kg,
            notes=notes,
            created_offline=created_offline,
        )
        if existing is not None:
            return existing, False

        try:
            allocation.final_harvest_operation
        except FinalHarvestOperation.DoesNotExist:
            pass
        else:
            raise AllocationAlreadyFinallyHarvested()

        before = cls.replay_before_harvest(allocation, harvested_at)
        computed_count = before['current_count']
        computed_biomass = before['current_biomass_kg']
        reconciled = computed_count == declared_fish_count
        if not reconciled and not (created_offline or allow_pending_reconciliation):
            raise FinalHarvestStockMismatch(
                computed_count=computed_count,
                declared_count=declared_fish_count,
            )

        operation = FinalHarvestOperation.objects.create(
            client_uuid=client_uuid,
            allocation=allocation,
            harvested_at=harvested_at,
            declared_fish_count=declared_fish_count,
            declared_average_weight_g=declared_average_weight_g,
            declared_biomass_kg=declared_biomass_kg,
            notes=notes,
            reconciliation_status=(
                FinalHarvestOperation.STATUS_RECONCILED
                if reconciled
                else FinalHarvestOperation.STATUS_PENDING
            ),
            computed_count_before_harvest=computed_count,
            computed_biomass_before_harvest_kg=computed_biomass,
            created_by=created_by,
            created_offline=created_offline,
            synced_at=timezone.now() if created_offline else None,
        )
        return operation, True

    @classmethod
    def reconcile_after_historical_event(
        cls,
        allocation: CycleUnitAllocation,
    ) -> FinalHarvestOperation | None:
        """Réconcilie une clôture affectée par un mouvement antidaté."""
        try:
            operation = FinalHarvestOperation.objects.select_for_update().get(
                allocation=allocation,
            )
        except FinalHarvestOperation.DoesNotExist:
            return None

        before = cls.replay_before_harvest(allocation, operation.harvested_at)
        computed_count = before['current_count']
        computed_biomass = before['current_biomass_kg']
        declared_count = operation.declared_fish_count

        if operation.reconciliation_status == FinalHarvestOperation.STATUS_RECONCILED:
            if computed_count != declared_count:
                raise BusinessRuleViolation(
                    _('Une opération antidatée invalide une récolte déjà réconciliée.')
                )
            return operation

        previous_count = operation.computed_count_before_harvest
        previous_gap = abs(declared_count - previous_count) if previous_count is not None else None
        current_gap = abs(declared_count - computed_count)
        if previous_gap is not None and current_gap >= previous_gap and current_gap != 0:
            raise BusinessRuleViolation(
                _('Cette opération ne rapproche pas le ledger de la récolte physique déclarée.')
            )

        operation.computed_count_before_harvest = computed_count
        operation.computed_biomass_before_harvest_kg = computed_biomass
        if computed_count == declared_count:
            operation.reconciliation_status = FinalHarvestOperation.STATUS_RECONCILED
        operation.save(update_fields=[
            'computed_count_before_harvest',
            'computed_biomass_before_harvest_kg',
            'reconciliation_status',
            'updated_at',
        ])
        return operation

    @staticmethod
    def assert_projection(operation: FinalHarvestOperation) -> None:
        allocation = operation.allocation
        expected = {
            'final_harvested_at': operation.harvested_at,
            'final_harvest_date': timezone.localtime(operation.harvested_at).date(),
            'final_fish_count': operation.declared_fish_count,
            'final_average_weight_g': operation.declared_average_weight_g,
            'final_biomass_kg': operation.declared_biomass_kg,
            'final_harvest_notes': operation.notes,
        }
        if any(getattr(allocation, field) != value for field, value in expected.items()):
            raise BusinessRuleViolation(
                _('La projection de récolte finale de l’allocation est incohérente.')
            )
