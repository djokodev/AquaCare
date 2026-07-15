"""Pure business calculations shared by aquaculture dashboards."""

from __future__ import annotations

from datetime import date
from decimal import Decimal


MONEY_QUANTIZE = Decimal("0.01")


def estimate_market_value_fcfa(
    biomass_kg: Decimal | None,
    selling_price_per_kg_fcfa: Decimal | None,
) -> Decimal | None:
    """Return the estimated market value when both canonical inputs are known."""
    if biomass_kg is None or selling_price_per_kg_fcfa is None:
        return None
    if biomass_kg < 0 or selling_price_per_kg_fcfa <= 0:
        return None
    return (biomass_kg * selling_price_per_kg_fcfa).quantize(MONEY_QUANTIZE)


def calculate_cycle_progress_pct(
    *,
    start_date: date | None,
    planned_duration_days: int | None,
    status: str,
    as_of: date,
) -> int | None:
    """Return an inclusive day-based cycle progress clamped to 0..100."""
    if start_date is None or planned_duration_days is None or planned_duration_days <= 0:
        return None
    if status == "harvested":
        return 100

    elapsed_days = max((as_of - start_date).days + 1, 0)
    progress = round(elapsed_days / planned_duration_days * 100)
    return min(max(progress, 0), 100)


def calculate_cycle_days_remaining(
    *,
    start_date: date | None,
    planned_duration_days: int | None,
    planned_harvest_date: date | None,
    status: str,
    as_of: date,
) -> int | None:
    """Return remaining days from canonical cycle planning data."""
    if status == "harvested":
        return 0
    if planned_harvest_date is not None:
        return max((planned_harvest_date - as_of).days, 0)
    if start_date is None or planned_duration_days is None or planned_duration_days <= 0:
        return None
    elapsed_days = max((as_of - start_date).days + 1, 0)
    return max(planned_duration_days - elapsed_days, 0)
