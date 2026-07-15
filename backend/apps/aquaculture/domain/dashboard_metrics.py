"""Pure business calculations shared by aquaculture dashboards."""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Literal


MONEY_QUANTIZE = Decimal("0.01")
BiomassSource = Literal['latest_weighing', 'allocation_current', 'initial_stocking', 'harvested']


def resolve_biomass_data(
    *,
    allocation_status: str,
    current_fish_count: int,
    current_biomass_kg: Decimal | None,
    initial_biomass_kg: Decimal | None,
    latest_average_weight_g: Decimal | None,
) -> tuple[Decimal | None, bool, BiomassSource | None]:
    """Resolve biomass and its provenance without treating a default zero as reliable."""
    if allocation_status == 'harvested':
        return Decimal('0.00'), True, 'harvested'

    if latest_average_weight_g is not None:
        biomass = (
            Decimal(current_fish_count) * latest_average_weight_g / Decimal('1000')
        ).quantize(MONEY_QUANTIZE, rounding=ROUND_HALF_UP)
        return biomass, True, 'latest_weighing'

    if (
        current_biomass_kg is not None
        and initial_biomass_kg is not None
        and initial_biomass_kg > 0
        and current_biomass_kg == initial_biomass_kg
    ):
        return initial_biomass_kg.quantize(MONEY_QUANTIZE, rounding=ROUND_HALF_UP), True, 'initial_stocking'

    if current_biomass_kg is not None and current_biomass_kg > 0:
        return current_biomass_kg.quantize(MONEY_QUANTIZE, rounding=ROUND_HALF_UP), True, 'allocation_current'

    return None, False, None


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
