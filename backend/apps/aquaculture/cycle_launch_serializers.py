"""HTTP contracts for the transactional production-cycle launch."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from .constants import MAX_INITIAL_FISH_COUNT
from .domain.cycle_duration import MAX_CYCLE_DURATION_DAYS, MIN_CYCLE_DURATION_DAYS
from .domain.production_units import (
    normalize_production_unit_type,
    validate_production_unit_capacity,
    validate_production_unit_dimensions,
)
from .production_plan_serializers import ProductionPlanFarmProfileSerializer
from .serializers import CycleUnitAllocationSerializer, ProductionCycleSerializer, ProductionUnitSerializer


class CycleLaunchProductionPlanSerializer(serializers.Serializer):
    """The subset of production-plan values controlled by the launch form."""

    species = serializers.ChoiceField(choices=["tilapia", "clarias"], required=False)
    annual_production_target_kg = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    num_cycles_per_year = serializers.IntegerField(min_value=1, max_value=3)
    fingerlings_cost_per_unit_fcfa = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal("0"),
    )
    planned_selling_price_per_kg_fcfa = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal("0.01"),
        required=False,
        allow_null=True,
    )


class CycleLaunchCycleSerializer(serializers.Serializer):
    """Client-controlled cycle inputs; server-derived fields are intentionally absent."""

    cycle_name = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    species = serializers.ChoiceField(choices=["tilapia", "clarias"])
    start_date = serializers.DateField()
    initial_count = serializers.IntegerField(
        min_value=1,
        max_value=MAX_INITIAL_FISH_COUNT,
    )
    initial_average_weight = serializers.DecimalField(
        max_digits=6,
        decimal_places=2,
        min_value=Decimal("0.1"),
        required=False,
    )
    target_harvest_weight_g = serializers.DecimalField(
        max_digits=6,
        decimal_places=2,
        min_value=Decimal("50"),
        required=False,
    )
    planned_cycle_duration_days = serializers.IntegerField(
        min_value=MIN_CYCLE_DURATION_DAYS,
        max_value=MAX_CYCLE_DURATION_DAYS,
    )
    expected_survival_rate_pct = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        min_value=Decimal("1"),
        max_value=Decimal("100"),
    )
    planned_selling_price_per_kg_fcfa = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
        required=False,
        allow_null=True,
    )
    fingerlings_cost_fcfa = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0"),
    )
    other_operational_costs_fcfa = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0"),
    )
    planned_feed_bags = serializers.IntegerField(min_value=1, required=False)
    created_offline = serializers.BooleanField(required=False, default=False)


class CycleLaunchUnitSerializer(serializers.Serializer):
    """A discriminated new or existing production unit reference."""

    local_id = serializers.CharField(max_length=120, trim_whitespace=True)
    source = serializers.ChoiceField(choices=["new", "existing"])
    name = serializers.CharField(max_length=120, trim_whitespace=True, required=False, allow_blank=True)
    unit_type = serializers.CharField(max_length=20, trim_whitespace=True, required=False, allow_blank=True)
    production_unit_id = serializers.UUIDField(required=False)
    volume_m3 = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal("0.01"),
        required=False,
        allow_null=True,
    )
    surface_m2 = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal("0.01"),
        required=False,
        allow_null=True,
    )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        local_id = attrs.get("local_id", "").strip()
        if not local_id:
            raise serializers.ValidationError({"local_id": _("L'identifiant local de l'unité est obligatoire.")})
        attrs["local_id"] = local_id

        if attrs["source"] == "existing":
            creation_fields = {"name", "unit_type", "volume_m3", "surface_m2"}
            if creation_fields.intersection(attrs):
                raise serializers.ValidationError(
                    {"source": _("Une unité existante ne peut pas contenir des champs de création.")}
                )
            if not attrs.get("production_unit_id"):
                raise serializers.ValidationError(
                    {"production_unit_id": _("L'identifiant de l'unité existante est obligatoire.")}
                )
            return attrs

        if attrs.get("production_unit_id"):
            raise serializers.ValidationError(
                {"production_unit_id": _("Une nouvelle unité ne peut pas référencer une unité existante.")}
            )
        name = attrs.get("name", "").strip()
        unit_type = normalize_production_unit_type(attrs.get("unit_type"))
        if not name:
            raise serializers.ValidationError({"name": _("Le nom de l'unité est obligatoire.")})
        try:
            validate_production_unit_dimensions(
                unit_type,
                volume_m3=attrs.get("volume_m3"),
                surface_m2=attrs.get("surface_m2"),
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict or exc.messages) from exc
        attrs["name"] = name
        attrs["unit_type"] = unit_type
        return attrs


class CycleLaunchAllocationSerializer(serializers.Serializer):
    production_unit_local_id = serializers.CharField(
        max_length=120,
        trim_whitespace=True,
        allow_blank=True,
    )
    fish_count = serializers.IntegerField(min_value=1)

    def validate_production_unit_local_id(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError(_("L'unité de l'allocation est obligatoire."))
        return value


class CycleLaunchCalibrationUnitSerializer(serializers.Serializer):
    """Bac de calibrage physique créé vide dans la transaction de lancement."""

    client_uuid = serializers.UUIDField()
    name = serializers.CharField(max_length=120, trim_whitespace=True)
    volume_m3 = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.01'))


class CycleLaunchRequestSerializer(serializers.Serializer):
    """Validates every structural launch invariant before any database write."""

    launch_uuid = serializers.UUIDField()
    launch_kind = serializers.ChoiceField(choices=["initial_setup", "additional_cycle"])
    production_plan = CycleLaunchProductionPlanSerializer(required=False, allow_null=True)
    cycle = CycleLaunchCycleSerializer()
    production_units = CycleLaunchUnitSerializer(many=True, allow_empty=False)
    allocations = CycleLaunchAllocationSerializer(many=True, allow_empty=False)
    calibration_units = CycleLaunchCalibrationUnitSerializer(many=True, required=False, default=list)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        units = attrs["production_units"]
        allocations = attrs["allocations"]
        cycle = attrs["cycle"]
        plan = attrs.get("production_plan")
        launch_kind = attrs["launch_kind"]
        calibration_units = attrs.get('calibration_units', [])

        calibration_names = [item['name'].casefold() for item in calibration_units]
        if len(calibration_names) != len(set(calibration_names)):
            raise serializers.ValidationError(
                {'calibration_units': _('Chaque bac de calibrage doit avoir un nom unique.')}
            )

        if launch_kind == "initial_setup" and not plan:
            raise serializers.ValidationError(
                {"production_plan": _("Le plan de production est obligatoire pour le setup initial.")}
            )

        expected_source = "new" if launch_kind == "initial_setup" else "existing"
        invalid_sources = [
            unit["local_id"] for unit in units if unit["source"] != expected_source
        ]
        if invalid_sources:
            raise serializers.ValidationError(
                {"production_units": _("Le type d'unité ne correspond pas au mode de lancement.")}
            )

        local_ids = [unit["local_id"] for unit in units]
        duplicate_unit_ids = sorted({local_id for local_id in local_ids if local_ids.count(local_id) > 1})
        if duplicate_unit_ids:
            raise serializers.ValidationError(
                {"production_units": _("Chaque unité doit avoir un identifiant local unique.")}
            )

        unit_ids = set(local_ids)
        allocation_ids = [allocation["production_unit_local_id"] for allocation in allocations]
        duplicate_allocation_ids = {
            local_id for local_id in allocation_ids if allocation_ids.count(local_id) > 1
        }
        if duplicate_allocation_ids:
            raise serializers.ValidationError(
                {"allocations": _("Chaque unité doit avoir exactement une allocation.")}
            )

        unknown_ids = sorted(set(allocation_ids) - unit_ids)
        missing_ids = sorted(unit_ids - set(allocation_ids))
        if unknown_ids:
            raise serializers.ValidationError(
                {"allocations": _("Une allocation référence une unité inconnue.")}
            )
        if missing_ids or len(allocations) != len(units):
            raise serializers.ValidationError(
                {"allocations": _("Chaque unité doit avoir exactement une allocation.")}
            )

        if plan and plan.get("species") and plan["species"] != cycle["species"]:
            raise serializers.ValidationError(
                {"production_plan": {"species": _("L'espèce du plan doit correspondre à celle du cycle.")}}
            )

        total_allocated = sum(allocation["fish_count"] for allocation in allocations)
        if total_allocated != cycle["initial_count"]:
            raise serializers.ValidationError(
                {"allocations": _("La somme des allocations doit correspondre à l'effectif initial du cycle.")}
            )

        units_by_id = {unit["local_id"]: unit for unit in units}
        existing_unit_ids = [unit.get("production_unit_id") for unit in units if unit["source"] == "existing"]
        if len(set(existing_unit_ids)) != len(existing_unit_ids):
            raise serializers.ValidationError(
                {"production_units": _("Une même unité ne peut être sélectionnée deux fois.")}
            )
        capacity_errors: dict[str, str] = {}
        for allocation in allocations:
            unit = units_by_id[allocation["production_unit_local_id"]]
            if unit["source"] == "existing":
                continue
            try:
                validate_production_unit_capacity(
                    unit_type=unit["unit_type"],
                    fish_count=allocation["fish_count"],
                    volume_m3=unit.get("volume_m3"),
                    surface_m2=unit.get("surface_m2"),
                )
            except DjangoValidationError as exc:
                capacity_errors[allocation["production_unit_local_id"]] = str(
                    exc.message
                )
        if capacity_errors:
            raise serializers.ValidationError({"allocations": capacity_errors})

        return attrs


class CycleLaunchResponseSerializer(serializers.Serializer):
    """Response contract composed from the existing read serializers."""

    launch_uuid = serializers.UUIDField()
    idempotent_replay = serializers.BooleanField()
    farm_profile = ProductionPlanFarmProfileSerializer()
    production_cycle = ProductionCycleSerializer()
    production_units = ProductionUnitSerializer(many=True)
    cycle_unit_allocations = CycleUnitAllocationSerializer(many=True)
    production_unit_id_by_local_id = serializers.DictField(child=serializers.UUIDField())
