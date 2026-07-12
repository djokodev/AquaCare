from datetime import date

import pytest
from accounts.serializers import AnnualSimulationInputSerializer
from aquaculture.constants import ECONOMIC_DEFAULTS_BY_SPECIES
from aquaculture.domain.cycle_duration import (
    calculate_planned_harvest_date,
    get_default_cycle_duration_days,
    validate_cycle_duration_days,
)
from aquaculture.serializers import ProductionCycleSerializer
from aquaculture.services.annual_simulation_service import AnnualSimulationService
from commerce.constants import (
    CYCLE_DURATION_DEFAULT_CATFISH,
    CYCLE_DURATION_DEFAULT_TILAPIA,
)


@pytest.mark.parametrize(
    ("start", "duration", "expected"),
    [
        (date(2026, 4, 1), 120, date(2026, 7, 29)),
        (date(2026, 4, 1), 150, date(2026, 8, 28)),
        (date(2024, 2, 28), 30, date(2024, 3, 28)),
        (date(2026, 1, 31), 30, date(2026, 3, 1)),
    ],
)
def test_planned_harvest_date_uses_inclusive_cycle_days(start, duration, expected):
    assert calculate_planned_harvest_date(start, duration) == expected


def test_defaults_are_canonical_and_aligned():
    assert get_default_cycle_duration_days("clarias") == 120
    assert get_default_cycle_duration_days("tilapia") == 180
    assert get_default_cycle_duration_days("autre") == 180
    assert ECONOMIC_DEFAULTS_BY_SPECIES["clarias"]["planned_cycle_duration_days"] == 120
    assert ECONOMIC_DEFAULTS_BY_SPECIES["tilapia"]["planned_cycle_duration_days"] == 180
    assert CYCLE_DURATION_DEFAULT_CATFISH == get_default_cycle_duration_days("clarias")
    assert CYCLE_DURATION_DEFAULT_TILAPIA == get_default_cycle_duration_days("tilapia")


@pytest.mark.parametrize("duration", [30, 365])
def test_duration_boundaries_are_accepted(duration):
    assert validate_cycle_duration_days(duration) == duration


@pytest.mark.parametrize("duration", [0, 29, 366])
def test_duration_outside_range_is_rejected(duration):
    with pytest.raises(ValueError):
        validate_cycle_duration_days(duration)


@pytest.mark.parametrize("duration", [0, 29, 366, 150.5])
def test_api_duration_validation_rejects_invalid_values(duration):
    serializer = AnnualSimulationInputSerializer(
        data={
            "species": "clarias",
            "annual_production_target_kg": "1000.00",
            "num_cycles": 1,
            "cycle_duration_days": duration,
        }
    )

    assert serializer.is_valid() is False
    assert "cycle_duration_days" in serializer.errors
    assert "30 et 365" in str(serializer.errors["cycle_duration_days"])


@pytest.mark.django_db
def test_annual_simulation_uses_custom_duration_for_projection_and_breakdown():
    result = AnnualSimulationService.simulate(
        species="clarias",
        annual_production_target_kg=1000,
        num_cycles=1,
        start_date=date(2026, 4, 1),
        cycle_duration_days=150,
    )

    assert result["cycle_duration_days"] == 150
    assert result["cycles_per_year_derived"] == 2
    assert result["cycles_breakdown"][0]["duration_days"] == 150
    assert result["cycles_breakdown"][0]["end_date_estimate"] == "2026-08-28"


def test_production_cycle_serializer_rejects_contradictory_harvest_date():
    serializer = ProductionCycleSerializer(
        data={
            "species": "clarias",
            "start_date": "2026-04-01",
            "initial_count": 100,
            "pond_identifier": "Bassin test",
            "pond_surface_m2": 20,
            "planned_cycle_duration_days": 150,
            "planned_harvest_date": "2026-08-29",
        }
    )

    assert serializer.is_valid() is False
    assert "planned_harvest_date" in serializer.errors
