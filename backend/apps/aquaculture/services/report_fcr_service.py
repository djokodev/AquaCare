"""Canonical FCR calculations for historical cycle report snapshots."""

from __future__ import annotations

from decimal import Decimal


class ReportFcrService:
    """Calculate FCR only when all biomass inputs are meaningful."""

    @staticmethod
    def calculate(
        *,
        feed_consumed_kg: Decimal | float | None,
        initial_biomass_kg: Decimal | float | None,
        current_biomass_kg: Decimal | float | None,
        harvested_biomass_kg: Decimal | float | None,
        harvest_data_complete: bool = True,
    ) -> float | None:
        if not harvest_data_complete:
            return None
        values = [feed_consumed_kg, initial_biomass_kg, current_biomass_kg, harvested_biomass_kg]
        if any(value is None for value in values):
            return None
        feed = Decimal(str(feed_consumed_kg))
        gain = (
            Decimal(str(current_biomass_kg))
            + Decimal(str(harvested_biomass_kg))
            - Decimal(str(initial_biomass_kg))
        )
        if feed <= 0 or gain <= 0:
            return None
        return float((feed / gain).quantize(Decimal("0.01")))
