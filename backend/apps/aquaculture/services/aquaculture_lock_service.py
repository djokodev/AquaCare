"""Ordre de verrouillage transactionnel partagé du domaine aquaculture."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from ..models import (
    CycleUnitAllocation,
    FinalHarvestOperation,
    ProductionCycle,
    ProductionUnit,
)


@dataclass(frozen=True)
class AquacultureLockContext:
    """Ressources verrouillées dans l'ordre canonique du domaine."""

    units: list[ProductionUnit]
    allocations: list[CycleUnitAllocation]
    final_harvest_operations: list[FinalHarvestOperation]
    cycles: list[ProductionCycle]


class AquacultureLockService:
    """Applique partout l'ordre unité, allocation, événement, cycle."""

    @staticmethod
    def lock_units(unit_ids: Iterable) -> list[ProductionUnit]:
        ids = sorted(set(unit_ids), key=str)
        return list(
            ProductionUnit.objects.select_for_update()
            .filter(pk__in=ids)
            .order_by('pk')
        )

    @staticmethod
    def lock_allocations(allocation_ids: Iterable) -> list[CycleUnitAllocation]:
        ids = sorted(set(allocation_ids), key=str)
        return list(
            CycleUnitAllocation.objects.select_for_update()
            .select_related('cycle__farm_profile__user', 'production_unit')
            .filter(pk__in=ids)
            .order_by('pk')
        )

    @staticmethod
    def lock_final_harvest_operations(
        allocation_ids: Iterable,
    ) -> list[FinalHarvestOperation]:
        ids = sorted(set(allocation_ids), key=str)
        return list(
            FinalHarvestOperation.objects.select_for_update()
            .select_related('allocation')
            .filter(allocation_id__in=ids)
            .order_by('pk')
        )

    @staticmethod
    def lock_cycles(cycle_ids: Iterable) -> list[ProductionCycle]:
        ids = sorted(set(cycle_ids), key=str)
        return list(
            ProductionCycle.objects.select_for_update()
            .select_related('farm_profile__user')
            .filter(pk__in=ids)
            .order_by('pk')
        )

    @classmethod
    def lock_cycle_harvest_context(
        cls,
        *,
        cycle_id,
        allocation_ids: Iterable | None = None,
    ) -> AquacultureLockContext:
        """Verrouille une récolte sans prendre le cycle avant ses unités."""
        allocation_query = CycleUnitAllocation.objects.filter(cycle_id=cycle_id)
        if allocation_ids is not None:
            allocation_query = allocation_query.filter(pk__in=allocation_ids)
        allocation_refs = list(
            allocation_query.values_list('pk', 'production_unit_id').order_by('pk')
        )

        locked_units = cls.lock_units(ref[1] for ref in allocation_refs)
        locked_allocations = cls.lock_allocations(ref[0] for ref in allocation_refs)
        locked_operations = cls.lock_final_harvest_operations(
            allocation.pk for allocation in locked_allocations
        )
        locked_cycles = cls.lock_cycles([cycle_id])
        if len(locked_cycles) != 1:
            raise ProductionCycle.DoesNotExist

        return AquacultureLockContext(
            units=locked_units,
            allocations=locked_allocations,
            final_harvest_operations=locked_operations,
            cycles=locked_cycles,
        )
