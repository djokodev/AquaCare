from datetime import date
from decimal import Decimal

import pytest
from accounts.serializers import AnnualSimulationInputSerializer
from aquaculture.constants import ECONOMIC_DEFAULTS_BY_SPECIES
from aquaculture.domain.cycle_duration import (
    calculate_planned_harvest_date,
    get_default_cycle_duration_days,
    validate_cycle_duration_days,
)
from aquaculture.models import ProductionCycle
from aquaculture.serializers import ProductionCycleSerializer
from aquaculture.services.annual_simulation_service import AnnualSimulationService
from commerce.constants import (
    CYCLE_DURATION_DEFAULT_CATFISH,
    CYCLE_DURATION_DEFAULT_TILAPIA,
)
from django.utils.translation import override


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


@pytest.mark.parametrize(
    ("language", "expected"),
    [
        ("fr", "La durée du cycle doit être comprise entre 30 et 365 jours."),
        ("en", "The cycle duration must be between 30 and 365 days."),
    ],
)
@pytest.mark.parametrize("value", [29, 366, 150.5, "150.5"])
def test_both_annual_serializers_return_localized_messages(language, expected, value):
    from aquaculture.production_plan_serializers import (
        AnnualSimulationInputSerializer as ProductionPlanSerializer,
    )

    serializer_classes = [AnnualSimulationInputSerializer, ProductionPlanSerializer]
    with override(language):
        for serializer_class in serializer_classes:
            serializer = serializer_class(
                data={
                    "species": "clarias",
                    "annual_production_target_kg": "1000.00",
                    "num_cycles": 1,
                    "cycle_duration_days": value,
                }
            )
            assert serializer.is_valid() is False
            assert str(serializer.errors["cycle_duration_days"][0]) == expected


@pytest.mark.parametrize("duration", [150.5, True, False, 0, 29, 366])
def test_production_cycle_service_rejects_untrusted_duration_without_truncation(duration):
    from aquaculture.domain.exceptions import BusinessRuleViolation
    from aquaculture.services.cycle_service import ProductionCycleService

    with pytest.raises(BusinessRuleViolation):
        ProductionCycleService._validate_cycle_business_rules(
            {"planned_cycle_duration_days": duration}
        )


@pytest.mark.django_db
def test_patch_without_duration_preserves_legacy_null_cycle(farm_profile):
    cycle = ProductionCycle.objects.create(
        farm_profile=farm_profile,
        species="clarias",
        pond_identifier="Bassin legacy",
        pond_surface_m2=Decimal("100"),
        start_date=date(2026, 4, 1),
        initial_count=100,
        initial_average_weight=Decimal("10"),
        initial_biomass=Decimal("1"),
        planned_cycle_duration_days=None,
        planned_harvest_date=None,
    )

    serializer = ProductionCycleSerializer(
        cycle,
        data={"cycle_name": "Cycle legacy modifié"},
        partial=True,
    )
    assert serializer.is_valid(), serializer.errors
    updated = serializer.save()
    assert updated.planned_cycle_duration_days is None
    assert updated.planned_harvest_date is None


@pytest.mark.django_db
def test_patch_species_preserves_custom_duration_and_date(farm_profile):
    cycle = ProductionCycle.objects.create(
        farm_profile=farm_profile,
        species="clarias",
        pond_identifier="Bassin custom",
        pond_surface_m2=Decimal("100"),
        start_date=date(2026, 4, 1),
        initial_count=100,
        initial_average_weight=Decimal("10"),
        initial_biomass=Decimal("1"),
        planned_cycle_duration_days=150,
        planned_harvest_date=date(2026, 8, 28),
    )

    serializer = ProductionCycleSerializer(cycle, data={"species": "tilapia"}, partial=True)
    assert serializer.is_valid(), serializer.errors
    updated = serializer.save()
    assert updated.planned_cycle_duration_days == 150
    assert updated.planned_harvest_date == date(2026, 8, 28)


def _make_modern_duration_cycle(farm_profile, *, duration=150, harvest_date=date(2026, 8, 28)):
    return ProductionCycle.objects.create(
        farm_profile=farm_profile,
        species="clarias",
        pond_identifier="Bassin durée",
        pond_surface_m2=Decimal("100"),
        start_date=date(2026, 4, 1),
        initial_count=100,
        initial_average_weight=Decimal("10"),
        initial_biomass=Decimal("1"),
        planned_cycle_duration_days=duration,
        planned_harvest_date=harvest_date,
    )


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("species", "expected_duration", "expected_harvest"),
    [
        ("clarias", 120, date(2026, 7, 29)),
        ("tilapia", 180, date(2026, 9, 27)),
    ],
)
def test_creation_with_explicit_null_persists_species_default(
    farm_profile, species, expected_duration, expected_harvest
):
    serializer = ProductionCycleSerializer(
        data={
            "species": species,
            "pond_identifier": "Bassin création null",
            "pond_surface_m2": Decimal("100"),
            "start_date": date(2026, 4, 1),
            "initial_count": 100,
            "initial_average_weight": Decimal("10"),
            "planned_cycle_duration_days": None,
        }
    )
    assert serializer.is_valid(), serializer.errors
    cycle = serializer.save(farm_profile=farm_profile)
    assert cycle.planned_cycle_duration_days == expected_duration
    assert cycle.planned_harvest_date == expected_harvest


@pytest.mark.django_db
def test_patch_explicit_null_preserves_modern_duration_and_date(farm_profile):
    cycle = _make_modern_duration_cycle(farm_profile)
    serializer = ProductionCycleSerializer(
        cycle,
        data={"species": "tilapia", "planned_cycle_duration_days": None},
        partial=True,
    )
    assert serializer.is_valid(), serializer.errors
    updated = serializer.save()
    assert updated.planned_cycle_duration_days == 150
    assert updated.planned_harvest_date == date(2026, 8, 28)


@pytest.mark.django_db
@pytest.mark.parametrize("harvest_date", [None, date(2026, 8, 28)])
def test_creation_derives_or_accepts_matching_harvest_date(farm_profile, harvest_date):
    data = {
        "species": "clarias",
        "pond_identifier": "Bassin création date",
        "pond_surface_m2": Decimal("100"),
        "start_date": date(2026, 4, 1),
        "initial_count": 100,
        "initial_average_weight": Decimal("10"),
        "planned_cycle_duration_days": 150,
    }
    if harvest_date is not None:
        data["planned_harvest_date"] = harvest_date
    else:
        data["planned_harvest_date"] = None

    serializer = ProductionCycleSerializer(data=data)
    assert serializer.is_valid(), serializer.errors
    cycle = serializer.save(farm_profile=farm_profile)
    assert cycle.planned_harvest_date == date(2026, 8, 28)


@pytest.mark.django_db
def test_creation_without_harvest_date_derives_from_custom_duration(farm_profile):
    serializer = ProductionCycleSerializer(
        data={
            "species": "clarias",
            "pond_identifier": "Bassin date absente",
            "pond_surface_m2": Decimal("100"),
            "start_date": date(2026, 4, 1),
            "initial_count": 100,
            "initial_average_weight": Decimal("10"),
            "planned_cycle_duration_days": 150,
        }
    )
    assert serializer.is_valid(), serializer.errors
    cycle = serializer.save(farm_profile=farm_profile)
    assert cycle.planned_harvest_date == date(2026, 8, 28)


@pytest.mark.django_db
def test_patch_start_date_uses_legacy_fallback_without_persisting_duration(farm_profile):
    cycle = ProductionCycle.objects.create(
        farm_profile=farm_profile,
        species="clarias",
        pond_identifier="Bassin legacy",
        pond_surface_m2=Decimal("100"),
        start_date=date(2026, 4, 1),
        initial_count=100,
        initial_average_weight=Decimal("10"),
        initial_biomass=Decimal("1"),
        planned_cycle_duration_days=None,
        planned_harvest_date=None,
    )

    serializer = ProductionCycleSerializer(
        cycle,
        data={"start_date": date(2026, 5, 1), "planned_cycle_duration_days": None},
        partial=True,
    )
    assert serializer.is_valid(), serializer.errors
    updated = serializer.save()
    assert updated.planned_cycle_duration_days is None
    assert updated.planned_harvest_date == date(2026, 8, 28)


@pytest.mark.django_db
def test_patch_explicit_null_preserves_legacy_duration_and_date(farm_profile):
    cycle = ProductionCycle.objects.create(
        farm_profile=farm_profile,
        species="clarias",
        pond_identifier="Bassin legacy null",
        pond_surface_m2=Decimal("100"),
        start_date=date(2026, 4, 1),
        initial_count=100,
        initial_average_weight=Decimal("10"),
        initial_biomass=Decimal("1"),
        planned_cycle_duration_days=None,
        planned_harvest_date=None,
    )
    serializer = ProductionCycleSerializer(
        cycle,
        data={"planned_cycle_duration_days": None},
        partial=True,
    )
    assert serializer.is_valid(), serializer.errors
    updated = serializer.save()
    assert updated.planned_cycle_duration_days is None
    assert updated.planned_harvest_date is None


@pytest.mark.django_db
def test_legacy_patch_accepts_matching_fallback_harvest_date(farm_profile):
    cycle = ProductionCycle.objects.create(
        farm_profile=farm_profile,
        species="clarias",
        pond_identifier="Bassin legacy date correcte",
        pond_surface_m2=Decimal("100"),
        start_date=date(2026, 4, 1),
        initial_count=100,
        initial_average_weight=Decimal("10"),
        initial_biomass=Decimal("1"),
        planned_cycle_duration_days=None,
        planned_harvest_date=None,
    )
    serializer = ProductionCycleSerializer(
        cycle,
        data={"planned_harvest_date": date(2026, 7, 29)},
        partial=True,
    )
    assert serializer.is_valid(), serializer.errors
    updated = serializer.save()
    assert updated.planned_cycle_duration_days is None
    assert updated.planned_harvest_date == date(2026, 7, 29)


@pytest.mark.django_db
def test_legacy_patch_rejects_contradictory_harvest_date(farm_profile):
    cycle = ProductionCycle.objects.create(
        farm_profile=farm_profile,
        species="clarias",
        pond_identifier="Bassin legacy date incorrecte",
        pond_surface_m2=Decimal("100"),
        start_date=date(2026, 4, 1),
        initial_count=100,
        initial_average_weight=Decimal("10"),
        initial_biomass=Decimal("1"),
        planned_cycle_duration_days=None,
        planned_harvest_date=None,
    )
    serializer = ProductionCycleSerializer(
        cycle,
        data={"planned_harvest_date": date(2026, 8, 15)},
        partial=True,
    )
    assert serializer.is_valid() is False
    assert "planned_harvest_date" in serializer.errors
    cycle.refresh_from_db()
    assert cycle.planned_cycle_duration_days is None
    assert cycle.planned_harvest_date is None


@pytest.mark.django_db
def test_legacy_patch_date_null_only_preserves_both_null_fields(farm_profile):
    cycle = ProductionCycle.objects.create(
        farm_profile=farm_profile,
        species="clarias",
        pond_identifier="Bassin legacy date nulle",
        pond_surface_m2=Decimal("100"),
        start_date=date(2026, 4, 1),
        initial_count=100,
        initial_average_weight=Decimal("10"),
        initial_biomass=Decimal("1"),
        planned_cycle_duration_days=None,
        planned_harvest_date=None,
    )
    serializer = ProductionCycleSerializer(
        cycle,
        data={"planned_harvest_date": None},
        partial=True,
    )
    assert serializer.is_valid(), serializer.errors
    updated = serializer.save()
    assert updated.planned_cycle_duration_days is None
    assert updated.planned_harvest_date is None


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


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("payload", "expected_date"),
    [
        ({"planned_harvest_date": date(2026, 8, 28)}, date(2026, 8, 28)),
        ({"planned_harvest_date": None}, date(2026, 8, 28)),
        ({"planned_cycle_duration_days": 120}, date(2026, 7, 29)),
        (
            {"planned_cycle_duration_days": 120, "planned_harvest_date": date(2026, 7, 29)},
            date(2026, 7, 29),
        ),
        ({"start_date": date(2026, 5, 1)}, date(2026, 9, 27)),
        (
            {"start_date": date(2026, 5, 1), "planned_harvest_date": date(2026, 9, 27)},
            date(2026, 9, 27),
        ),
    ],
)
def test_modern_patch_keeps_harvest_date_derived(farm_profile, payload, expected_date):
    cycle = _make_modern_duration_cycle(farm_profile)
    serializer = ProductionCycleSerializer(cycle, data=payload, partial=True)
    assert serializer.is_valid(), serializer.errors
    updated = serializer.save()
    assert updated.planned_harvest_date == expected_date


@pytest.mark.django_db
@pytest.mark.parametrize(
    "payload",
    [
        {"planned_harvest_date": date(2026, 9, 15)},
        {"planned_cycle_duration_days": 120, "planned_harvest_date": date(2026, 7, 30)},
        {"start_date": date(2026, 5, 1), "planned_harvest_date": date(2026, 9, 28)},
        {"planned_cycle_duration_days": None, "planned_harvest_date": date(2026, 9, 15)},
    ],
)
def test_modern_patch_rejects_contradictory_harvest_date(farm_profile, payload):
    cycle = _make_modern_duration_cycle(farm_profile)
    serializer = ProductionCycleSerializer(cycle, data=payload, partial=True)
    assert serializer.is_valid() is False
    assert "planned_harvest_date" in serializer.errors
    cycle.refresh_from_db()
    assert cycle.planned_cycle_duration_days == 150
    assert cycle.planned_harvest_date == date(2026, 8, 28)


@pytest.mark.parametrize(
    ("language", "expected"),
    [
        ("fr", "La date prévisionnelle de récolte doit correspondre à la durée du cycle."),
        ("en", "The estimated harvest date must match the cycle duration."),
    ],
)
def test_harvest_date_error_is_localized(language, expected):
    serializer = ProductionCycleSerializer(
        data={
            "species": "clarias",
            "start_date": "2026-04-01",
            "initial_count": 100,
            "pond_identifier": "Bassin message",
            "pond_surface_m2": 20,
            "planned_cycle_duration_days": 150,
            "planned_harvest_date": "2026-09-15",
        }
    )
    with override(language):
        assert serializer.is_valid() is False
        assert str(serializer.errors["planned_harvest_date"][0]) == expected
