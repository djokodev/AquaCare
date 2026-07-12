"""Shared cycle-duration business rules."""

from datetime import date, timedelta

from django.utils.translation import gettext_lazy as _

from ..constants import ECONOMIC_DEFAULTS_BY_SPECIES

MIN_CYCLE_DURATION_DAYS = 30
MAX_CYCLE_DURATION_DAYS = 365
CYCLE_DURATION_ERROR_MESSAGE = _(
    "The cycle duration must be between 30 and 365 days."
)


def get_default_cycle_duration_days(species: str | None) -> int:
    """Return the canonical recommended duration, with tilapia as fallback."""
    normalized_species = (species or "").lower()
    defaults = ECONOMIC_DEFAULTS_BY_SPECIES.get(
        normalized_species,
        ECONOMIC_DEFAULTS_BY_SPECIES["tilapia"],
    )
    return int(defaults["planned_cycle_duration_days"])


def validate_cycle_duration_days(duration_days: int) -> int:
    """Validate and normalize a configured cycle duration."""
    if isinstance(duration_days, bool) or not isinstance(duration_days, int):
        raise ValueError(str(CYCLE_DURATION_ERROR_MESSAGE))
    if not MIN_CYCLE_DURATION_DAYS <= duration_days <= MAX_CYCLE_DURATION_DAYS:
        raise ValueError(str(CYCLE_DURATION_ERROR_MESSAGE))
    return duration_days


def calculate_planned_harvest_date(start_date: date, duration_days: int) -> date:
    """Calculate the inclusive end date: the start date is cycle day one."""
    validate_cycle_duration_days(duration_days)
    return start_date + timedelta(days=duration_days - 1)
