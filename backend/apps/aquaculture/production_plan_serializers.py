"""Serializers dedicated to aquaculture production-plan endpoints."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from accounts.models import FarmProfile
from django.core.exceptions import ObjectDoesNotExist
from django.utils.translation import gettext as _
from rest_framework import serializers

from .domain.farm_setup_rules import FarmSetupRules
from .services.farm_production_plan_service import FarmProductionPlanService


class DetailErrorResponseSerializer(serializers.Serializer):
    """Standard DRF error payload."""

    detail = serializers.CharField(read_only=True)
    code = serializers.CharField(read_only=True, required=False)


class ValidationErrorResponseSerializer(serializers.Serializer):
    """Validation error payload with field and non-field errors."""

    non_field_errors = serializers.ListField(
        child=serializers.CharField(),
        read_only=True,
        required=False,
    )


class ProductionPlanFarmProfileSerializer(serializers.ModelSerializer):
    """Farm profile projection used by production-plan endpoints."""

    is_certified = serializers.BooleanField(read_only=True)
    certification_status_display = serializers.CharField(
        source='get_certification_status_display',
        read_only=True,
    )
    default_feed_price_per_kg = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        read_only=True,
    )
    annual_production_target_kg = serializers.SerializerMethodField()
    num_cycles_per_year = serializers.SerializerMethodField()
    setup_infrastructure_type = serializers.SerializerMethodField()
    setup_unit_count = serializers.SerializerMethodField()
    setup_unit_volume_m3 = serializers.SerializerMethodField()
    setup_unit_surface_m2 = serializers.SerializerMethodField()
    setup_species = serializers.SerializerMethodField()
    fingerlings_cost_per_unit_fcfa = serializers.SerializerMethodField()
    planned_selling_price_per_kg_fcfa = serializers.SerializerMethodField()
    farm_setup_completed = serializers.SerializerMethodField()

    class Meta:
        model = FarmProfile
        fields = (
            'id',
            'farm_name',
            'certification_status',
            'total_ponds',
            'total_area_m2',
            'water_source',
            'main_species',
            'annual_production_kg',
            'default_feed_price_per_kg',
            'latitude',
            'longitude',
            'location_address',
            'annual_production_target_kg',
            'num_cycles_per_year',
            'setup_infrastructure_type',
            'setup_unit_count',
            'setup_unit_volume_m3',
            'setup_unit_surface_m2',
            'setup_species',
            'fingerlings_cost_per_unit_fcfa',
            'planned_selling_price_per_kg_fcfa',
            'farm_setup_completed',
            'created_at',
            'updated_at',
            'is_certified',
            'certification_status_display',
        )
        read_only_fields = fields

    def _get_plan_data(self, obj: FarmProfile) -> dict[str, Any]:
        return FarmProductionPlanService.get_plan_data(obj)

    @staticmethod
    def _format_decimal(value: Any) -> str | None:
        return f"{value:.2f}" if isinstance(value, Decimal) else value

    def get_annual_production_target_kg(self, obj: FarmProfile) -> Any:
        return self._format_decimal(self._get_plan_data(obj)['annual_production_target_kg'])

    def get_num_cycles_per_year(self, obj: FarmProfile) -> Any:
        return self._get_plan_data(obj)['num_cycles_per_year']

    def get_setup_infrastructure_type(self, obj: FarmProfile) -> Any:
        return self._get_plan_data(obj)['setup_infrastructure_type']

    def get_setup_unit_count(self, obj: FarmProfile) -> Any:
        return self._get_plan_data(obj)['setup_unit_count']

    def get_setup_unit_volume_m3(self, obj: FarmProfile) -> Any:
        return self._format_decimal(self._get_plan_data(obj)['setup_unit_volume_m3'])

    def get_setup_unit_surface_m2(self, obj: FarmProfile) -> Any:
        return self._format_decimal(self._get_plan_data(obj)['setup_unit_surface_m2'])

    def get_setup_species(self, obj: FarmProfile) -> Any:
        return self._get_plan_data(obj)['setup_species']

    def get_fingerlings_cost_per_unit_fcfa(self, obj: FarmProfile) -> Any:
        return self._format_decimal(self._get_plan_data(obj)['fingerlings_cost_per_unit_fcfa'])

    def get_planned_selling_price_per_kg_fcfa(self, obj: FarmProfile) -> Any:
        return self._format_decimal(self._get_plan_data(obj)['planned_selling_price_per_kg_fcfa'])

    def get_farm_setup_completed(self, obj: FarmProfile) -> bool:
        return bool(self._get_plan_data(obj)['farm_setup_completed'])

    def to_representation(self, instance: FarmProfile) -> dict[str, Any]:
        data = super().to_representation(instance)
        plan_data = self._get_plan_data(instance)
        data['default_feed_price_per_kg'] = self._format_decimal(plan_data['default_feed_price_per_kg'])
        return data


class FarmSetupSerializer(serializers.Serializer):
    """Payload for production plan setup."""

    setup_species = serializers.ChoiceField(
        choices=['tilapia', 'clarias', 'autre'],
        required=False,
    )
    setup_infrastructure_type = serializers.ChoiceField(
        choices=['etang', 'cage_flottante', 'bac_hors_sol', 'bac_en_sol'],
        required=False,
    )
    setup_unit_count = serializers.IntegerField(required=False, allow_null=True)
    setup_unit_volume_m3 = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    setup_unit_surface_m2 = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    annual_production_target_kg = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    num_cycles_per_year = serializers.IntegerField(
        min_value=1,
        max_value=3,
        required=False,
        allow_null=True,
    )
    fingerlings_cost_per_unit_fcfa = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    planned_selling_price_per_kg_fcfa = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        allow_null=True,
    )

    def validate_annual_production_target_kg(self, value: Any) -> Any:
        if value is not None and value <= 0:
            raise serializers.ValidationError(_("La production cible doit être supérieure à 0."))
        return value

    def validate_setup_unit_count(self, value: Any) -> Any:
        if value is not None and value <= 0:
            raise serializers.ValidationError(_("Le nombre d'unités doit être supérieur à 0."))
        return value

    def validate_setup_unit_volume_m3(self, value: Any) -> Any:
        if value is not None and value <= 0:
            raise serializers.ValidationError(_("Le volume par unité doit être supérieur à 0."))
        return value

    def validate_setup_unit_surface_m2(self, value: Any) -> Any:
        if value is not None and value <= 0:
            raise serializers.ValidationError(_("La surface par unité doit être supérieure à 0."))
        return value

    def validate_fingerlings_cost_per_unit_fcfa(self, value: Any) -> Any:
        if value is not None and value < 0:
            raise serializers.ValidationError(_("Le coût par alevin ne peut pas être négatif."))
        return value

    def validate_planned_selling_price_per_kg_fcfa(self, value: Any) -> Any:
        if value is not None and value <= 0:
            raise serializers.ValidationError(_("Le prix de vente prévu doit être supérieur à 0."))
        return value

    def validate_num_cycles_per_year(self, value: Any) -> int | None:
        return int(value) if value is not None else None

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        plan = None
        if self.instance is not None:
            try:
                plan = self.instance.production_plan
            except ObjectDoesNotExist:
                plan = None
        errors = FarmSetupRules.build_errors(attrs, plan)
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class AnnualSimulationInputSerializer(serializers.Serializer):
    """Validation payload for annual production simulation."""

    species = serializers.ChoiceField(
        choices=['tilapia', 'clarias'],
        help_text="Espèce : 'tilapia' ou 'clarias'",
    )
    annual_production_target_kg = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal('1'),
        help_text='Production annuelle cible en kg',
    )
    num_cycles = serializers.IntegerField(
        min_value=1,
        max_value=3,
        help_text='Nombre de cycles par an, minimum 1',
    )
    start_date = serializers.DateField(
        required=False,
        allow_null=True,
        help_text='Date de démarrage du premier cycle (YYYY-MM-DD)',
    )
    selling_price_per_kg_fcfa = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        allow_null=True,
        min_value=Decimal('1'),
        help_text='Prix de vente estimé (FCFA/kg)',
    )
    fingerlings_cost_per_unit_fcfa = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        allow_null=True,
        min_value=Decimal('0'),
        help_text='Coût par alevin (FCFA)',
    )
    other_costs_fcfa_per_year = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        default=Decimal('0'),
        min_value=Decimal('0'),
        help_text='Autres charges annuelles (FCFA)',
    )
    target_harvest_weight_g = serializers.DecimalField(
        max_digits=8,
        decimal_places=1,
        required=False,
        allow_null=True,
        min_value=Decimal('50'),
        max_value=Decimal('1000'),
        help_text='Poids cible de récolte (g), ex: 350',
    )
    expected_survival_rate_pct = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        required=False,
        allow_null=True,
        min_value=Decimal('1'),
        max_value=Decimal('100'),
        help_text='Taux de survie attendu (%, ex: 95)',
    )
    total_fingerlings_count = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
        help_text="Nombre total d'alevins achetés sur l'année (tous cycles confondus)",
    )

    def validate_num_cycles(self, value: Any) -> int:
        return int(value)


class AnnualSimulationCycleBreakdownSerializer(serializers.Serializer):
    """Per-cycle breakdown contract for annual simulation response."""

    cycle_num = serializers.IntegerField(read_only=True)
    production_kg = serializers.FloatField(read_only=True)
    start_date_estimate = serializers.DateField(read_only=True)
    end_date_estimate = serializers.DateField(read_only=True)
    duration_days = serializers.IntegerField(read_only=True)
    feed_bags_total = serializers.IntegerField(read_only=True)
    feed_cost_fcfa = serializers.FloatField(read_only=True)
    fingerlings_cost_fcfa = serializers.FloatField(read_only=True)
    initial_fish_count = serializers.IntegerField(read_only=True)


class AnnualSimulationResponseSerializer(serializers.Serializer):
    """Stable response contract for annual production simulation."""

    species = serializers.ChoiceField(choices=['tilapia', 'clarias'], read_only=True)
    num_cycles = serializers.IntegerField(read_only=True)
    annual_production_target_kg = serializers.FloatField(read_only=True)
    cycles_per_year_derived = serializers.IntegerField(read_only=True)
    technical_pause_days = serializers.IntegerField(read_only=True)
    other_costs_rate_pct = serializers.FloatField(read_only=True)
    annual_revenue_fcfa = serializers.FloatField(read_only=True)
    annual_feed_cost_fcfa = serializers.FloatField(read_only=True)
    annual_fingerlings_cost_fcfa = serializers.FloatField(read_only=True)
    annual_other_costs_fcfa = serializers.FloatField(read_only=True)
    annual_total_cost_fcfa = serializers.FloatField(read_only=True)
    aquacare_fee_fcfa = serializers.FloatField(read_only=True)
    annual_net_profit_fcfa = serializers.FloatField(read_only=True)
    annual_roi_pct = serializers.FloatField(read_only=True)
    cycle_production_kg = serializers.FloatField(read_only=True)
    cycle_revenue_fcfa = serializers.FloatField(read_only=True)
    cycle_feed_cost_fcfa = serializers.FloatField(read_only=True)
    cycle_fingerlings_cost_fcfa = serializers.FloatField(read_only=True)
    cycle_other_costs_fcfa = serializers.FloatField(read_only=True)
    cycle_aquacare_fee_fcfa = serializers.FloatField(read_only=True)
    cycle_total_cost_fcfa = serializers.FloatField(read_only=True)
    cycle_net_profit_fcfa = serializers.FloatField(read_only=True)
    cycle_roi_pct = serializers.FloatField(read_only=True)
    annual_projection_production_kg = serializers.FloatField(read_only=True)
    annual_projection_revenue_fcfa = serializers.FloatField(read_only=True)
    annual_projection_net_profit_fcfa = serializers.FloatField(read_only=True)
    annual_projection_aquacare_fee_fcfa = serializers.FloatField(read_only=True)
    production_per_cycle_kg = serializers.FloatField(read_only=True)
    cycle_duration_days = serializers.IntegerField(read_only=True)
    feed_bags_per_cycle = serializers.IntegerField(read_only=True)
    initial_fish_count_per_cycle = serializers.IntegerField(read_only=True)
    cycles_breakdown = AnnualSimulationCycleBreakdownSerializer(many=True, read_only=True)
