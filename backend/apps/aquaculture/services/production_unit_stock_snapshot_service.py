"""Historical stock snapshots for cycle reports."""

from __future__ import annotations

from datetime import date
from typing import Any

from ..models import CycleUnitAllocation, PartialHarvest
from .allocation_ledger_service import AllocationLedgerService


class ProductionUnitStockSnapshotService:
    """Reconstruct an allocation stock without reading mutable current fields."""

    @staticmethod
    def build_as_of(
        *,
        allocation: CycleUnitAllocation,
        as_of_date: date,
        daily_logs: list[Any] | None = None,
        partial_harvests: list[PartialHarvest] | None = None,
    ) -> dict[str, Any]:
        caller_prefetched_events = daily_logs is not None and partial_harvests is not None
        replay = AllocationLedgerService.replay(
            allocation,
            as_of=as_of_date,
            daily_logs=daily_logs,
            partial_harvests=partial_harvests,
            incoming_operations=(
                getattr(allocation, 'report_incoming_calibrations', [])
                if caller_prefetched_events else None
            ),
            outgoing_operations=(
                getattr(allocation, 'report_outgoing_calibrations', [])
                if caller_prefetched_events else None
            ),
        )
        return {
            "initial_fish_count": replay['introduced_count'],
            "initial_biomass_kg": replay['introduced_biomass_kg'],
            "mortality_count": replay['mortality_count'],
            "harvested_fish_count": replay['harvested_count'],
            "estimated_current_fish_count": replay['current_count'],
            "estimated_current_biomass_kg": replay['current_biomass_kg'],
            "estimated_current_average_weight_g": replay['current_average_weight_g'],
            "mortality_rate_pct": (
                100 - replay['biological_survival_rate_pct']
                if replay['biological_survival_rate_pct'] is not None else None
            ),
            "biological_survival_rate_pct": replay['biological_survival_rate_pct'],
            "survival_rate_pct": replay['biological_survival_rate_pct'],
            "stock_remaining_rate_pct": replay['stock_remaining_rate_pct'],
            "harvested_biomass_kg": replay['harvested_biomass_kg'],
            "final_harvested_fish_count": replay['final_harvest_count'],
            "incoming_fish_count": replay['incoming_count'],
            "incoming_biomass_kg": replay['incoming_biomass_kg'],
            "outgoing_fish_count": replay['outgoing_count'],
            "outgoing_biomass_kg": replay['outgoing_biomass_kg'],
            "harvest_data_complete": True,
            "calculated_as_of": as_of_date.isoformat(),
            "source_event_counts": {
                "mortality_logs": sum(
                    1
                    for _at, kind, event in replay['events']
                    if kind == 'log' and (event.mortality_count or 0) > 0
                ),
                "partial_harvests": sum(1 for _at, kind, _event in replay['events'] if kind == 'partial_harvest'),
                "final_harvest": sum(1 for _at, kind, _event in replay['events'] if kind == 'final_harvest'),
            },
        }
