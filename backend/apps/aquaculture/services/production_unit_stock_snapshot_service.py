"""Historical stock snapshots for cycle reports."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from ..models import CycleUnitAllocation, PartialHarvest


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
        logs = (
            list(daily_logs)
            if daily_logs is not None
            else list(allocation.daily_logs.filter(log_date__lte=as_of_date))
        )
        logs = [log for log in logs if log.log_date <= as_of_date]
        harvests = (
            list(partial_harvests)
            if partial_harvests is not None
            else list(allocation.unit_partial_harvests.filter(harvest_date__lte=as_of_date))
        )
        harvests = [harvest for harvest in harvests if harvest.harvest_date <= as_of_date]
        harvest_data_complete = all(harvest.total_weight_kg is not None for harvest in harvests)

        mortality_count = sum(int(log.mortality_count or 0) for log in logs)
        harvested_fish_count = sum(int(harvest.count_harvested or 0) for harvest in harvests)
        initial_fish_count = int(allocation.initial_fish_count or 0)
        remaining_before_final_harvest = max(
            initial_fish_count - mortality_count - harvested_fish_count,
            0,
        )
        final_harvest_applied = (
            allocation.status == CycleUnitAllocation.STATUS_HARVESTED
            and allocation.final_harvest_date is not None
            and allocation.final_harvest_date <= as_of_date
        )
        final_harvested_fish_count = (
            int(
                allocation.final_fish_count
                if allocation.final_fish_count is not None
                else remaining_before_final_harvest
            )
            if final_harvest_applied
            else 0
        )
        harvested_biomass_kg = sum(
            (Decimal(str(harvest.total_weight_kg or 0)) for harvest in harvests),
            Decimal("0"),
        )
        if final_harvest_applied:
            harvested_biomass_kg += Decimal(str(allocation.final_biomass_kg or 0))
            harvest_data_complete = harvest_data_complete and allocation.final_biomass_kg is not None
        harvested_fish_count += final_harvested_fish_count
        estimated_current_fish_count = 0 if final_harvest_applied else remaining_before_final_harvest
        mortality_rate_pct = (
            (Decimal(mortality_count) / Decimal(initial_fish_count) * Decimal("100")).quantize(Decimal("0.01"))
            if initial_fish_count
            else Decimal("0.00")
        )

        return {
            "initial_fish_count": initial_fish_count,
            "mortality_count": mortality_count,
            "harvested_fish_count": harvested_fish_count,
            "estimated_current_fish_count": estimated_current_fish_count,
            "mortality_rate_pct": mortality_rate_pct,
            "biological_survival_rate_pct": (
                (
                    Decimal(initial_fish_count - mortality_count)
                    / Decimal(initial_fish_count)
                    * Decimal("100")
                ).quantize(
                    Decimal("0.01")
                )
                if initial_fish_count
                else None
            ),
            "survival_rate_pct": (
                (
                    Decimal(initial_fish_count - mortality_count)
                    / Decimal(initial_fish_count)
                    * Decimal("100")
                ).quantize(Decimal("0.01"))
                if initial_fish_count
                else None
            ),
            "stock_remaining_rate_pct": (
                (Decimal(estimated_current_fish_count) / Decimal(initial_fish_count) * Decimal("100")).quantize(
                    Decimal("0.01")
                )
                if initial_fish_count
                else None
            ),
            "harvested_biomass_kg": harvested_biomass_kg.quantize(Decimal("0.01")),
            "final_harvested_fish_count": final_harvested_fish_count,
            "harvest_data_complete": harvest_data_complete,
            "calculated_as_of": as_of_date.isoformat(),
            "source_event_counts": {
                "mortality_logs": len(logs),
                "partial_harvests": len(harvests),
                "final_harvest": int(final_harvest_applied),
            },
        }
