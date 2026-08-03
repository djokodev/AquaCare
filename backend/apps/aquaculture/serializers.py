"""
Sérialiseurs DRF pour le module aquaculture de AquaCare.

Ce fichier contient tous les sérialiseurs Django REST Framework pour l'API aquaculture.
Gère la validation des données, la sérialisation/désérialisation et la communication API
pour les opérations de pisciculture.

Fonctionnalités principales :
- Validation métier des données aquacoles
- Calculs automatiques de biomasse et métriques
- Support synchronisation offline avec déduplication UUID
- Sérialiseurs spécialisés pour dashboard mobile et analytics
- Validation cohérence échantillonnage et paramètres environnementaux

Architecture offline-first avec sérialiseurs bulk pour synchronisation mobile.
"""
from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Any, cast

from commerce.models import Product
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Sum
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import extend_schema_field
from notifications.serializers import (
    NotificationSerializer as GlobalNotificationSerializer,
)
from rest_framework import serializers
from rest_framework.request import Request

from .constants import (
    DEFAULT_EXPECTED_SURVIVAL_RATE_PCT,
    DEFAULT_FEED_PRICE_PER_KG,
    DEFAULT_FINGERLINGS_COST_FCFA,
    DEFAULT_INITIAL_AVERAGE_WEIGHT_G_BY_SPECIES,
    DEFAULT_OTHER_OPERATIONAL_COSTS_FCFA,
    ECONOMIC_DEFAULTS_BY_SPECIES,
    FEEDING_WEEK_DURATION_DAYS,
    LOG_TEMPERATURE_MAX,
    LOG_TEMPERATURE_MIN,
    MAX_GENERATION_WEEKS,
    MAX_INITIAL_FISH_COUNT,
    SPECIES_CHOICES,
)
from .domain.calculators import AquacultureCalculator
from .domain.cycle_duration import (
    CYCLE_DURATION_ERROR_MESSAGE,
    CYCLE_HARVEST_DATE_ERROR_MESSAGE,
    MAX_CYCLE_DURATION_DAYS,
    MIN_CYCLE_DURATION_DAYS,
    calculate_planned_harvest_date,
    get_default_cycle_duration_days,
    validate_cycle_duration_days,
)
from .domain.exceptions import BusinessRuleViolation
from .domain.feed_phase_calculator import get_feed_phase
from .domain.production_units import (
    normalize_production_unit_type,
    validate_cycle_unit_allocation_counts,
    validate_production_unit_dimensions,
)
from .models import (
    CalibrationOperation,
    CycleLog,
    CycleMetrics,
    CycleUnitAllocation,
    FarmFeedReference,
    FeedingPlan,
    FinalHarvestOperation,
    NutritionalGuide,
    PartialHarvest,
    ProductionCycle,
    ProductionReport,
    ProductionUnit,
    ReportDispatchLog,
    SanitaryLog,
)
from .services.allocation_ledger_service import AllocationLedgerService
from .services.cycle_service import ProductionCycleService
from .services.farm_production_plan_service import FarmProductionPlanService
from .services.production_unit_service import ProductionUnitLifecycleService


class ProductionUnitTypeField(serializers.ChoiceField):
    """Champ de type d'unité qui accepte les alias legacy AquaCare."""

    def to_internal_value(self, data):
        normalized = normalize_production_unit_type(data)
        if normalized is None:
            self.fail('invalid_choice', input=data)
        return super().to_internal_value(normalized)


class ProductionUnitSerializer(serializers.ModelSerializer):
    """Sérialiseur des unités de production réelles."""

    unit_type = ProductionUnitTypeField(choices=[choice[0] for choice in ProductionUnit.UNIT_TYPE_CHOICES])
    farm_name = serializers.CharField(source='farm_profile.farm_name', read_only=True)
    unit_type_display = serializers.CharField(source='get_unit_type_display', read_only=True)
    purpose_display = serializers.CharField(source='get_purpose_display', read_only=True)
    recommended_capacity = serializers.SerializerMethodField()
    capacity_density_unit = serializers.SerializerMethodField()
    display_dimension = serializers.SerializerMethodField()

    class Meta:
        model = ProductionUnit
        fields = [
            'id',
            'client_uuid',
            'farm_profile',
            'farm_name',
            'name',
            'unit_type',
            'unit_type_display',
            'purpose',
            'purpose_display',
            'volume_m3',
            'surface_m2',
            'display_dimension',
            'capacity_density_unit',
            'recommended_capacity',
            'status',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'farm_profile',
            'farm_name',
            'unit_type_display',
            'purpose_display',
            'display_dimension',
            'capacity_density_unit',
            'recommended_capacity',
            'created_at',
            'updated_at',
        ]

    def get_recommended_capacity(self, obj):
        return obj.recommended_capacity

    def get_capacity_density_unit(self, obj):
        return str(obj.capacity_density_unit) if obj.capacity_density_unit else None

    def get_display_dimension(self, obj):
        return str(obj.display_dimension) if obj.display_dimension else None

    def validate(self, attrs):
        unit_type = attrs.get('unit_type') or getattr(self.instance, 'unit_type', None)
        volume_m3 = attrs.get('volume_m3') if 'volume_m3' in attrs else getattr(self.instance, 'volume_m3', None)
        surface_m2 = attrs.get('surface_m2') if 'surface_m2' in attrs else getattr(self.instance, 'surface_m2', None)
        request = self.context.get('request')
        name = attrs.get('name', getattr(self.instance, 'name', None))

        if request is not None and name:
            duplicate = ProductionUnit.objects.filter(
                farm_profile=request.user.farm_profile,
                name__iexact=name.strip(),
            )
            if self.instance is not None:
                duplicate = duplicate.exclude(pk=self.instance.pk)
            if duplicate.exists():
                detail = _("Une unité portant ce nom existe déjà.")
                raise serializers.ValidationError(
                    {
                        'code': 'duplicate_production_unit_name',
                        'field': 'name',
                        'detail': detail,
                        'name': [detail],
                    }
                )

        try:
            validate_production_unit_dimensions(
                unit_type,
                volume_m3=volume_m3,
                surface_m2=surface_m2,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict or exc.messages)

        if self.instance is not None:
            try:
                ProductionUnitLifecycleService.validate_update(self.instance, attrs)
            except BusinessRuleViolation as exc:
                raise serializers.ValidationError({'detail': str(exc)}) from exc

        return attrs


class CycleUnitAllocationSerializer(serializers.ModelSerializer):
    """Sérialiseur des allocations de cycle par unité de production."""

    cycle_name = serializers.CharField(source='cycle.cycle_name', read_only=True)
    cycle_start_date = serializers.DateField(source='cycle.start_date', read_only=True)
    production_unit_name = serializers.CharField(source='production_unit.name', read_only=True)
    production_unit_type = serializers.CharField(source='production_unit.unit_type', read_only=True)
    production_unit_display_dimension = serializers.CharField(
        source='production_unit.display_dimension',
        read_only=True,
    )
    production_unit_capacity_density_unit = serializers.CharField(
        source='production_unit.capacity_density_unit',
        read_only=True,
    )
    production_unit_recommended_capacity = serializers.IntegerField(
        source='production_unit.recommended_capacity',
        read_only=True,
    )
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    survival_rate_pct = serializers.SerializerMethodField()
    final_harvest_reconciliation_status = serializers.SerializerMethodField()
    final_harvest_computed_count = serializers.SerializerMethodField()
    session_started_at = serializers.SerializerMethodField()

    class Meta:
        model = CycleUnitAllocation
        fields = [
            'id',
            'cycle',
            'cycle_name',
            'cycle_start_date',
            'production_unit',
            'production_unit_name',
            'production_unit_type',
            'production_unit_display_dimension',
            'production_unit_capacity_density_unit',
            'production_unit_recommended_capacity',
            'initial_fish_count',
            'current_fish_count',
            'initial_biomass_kg',
            'current_biomass_kg',
            'status',
            'status_display',
            'harvested_at',
            'final_harvested_at',
            'final_harvest_date',
            'final_harvest_notes',
            'final_fish_count',
            'final_average_weight_g',
            'final_biomass_kg',
            'final_harvest_reconciliation_status',
            'final_harvest_computed_count',
            'session_started_at',
            'expected_survival_rate_pct',
            'survival_rate_pct',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'cycle_name',
            'cycle_start_date',
            'production_unit_name',
            'production_unit_type',
            'production_unit_display_dimension',
            'production_unit_capacity_density_unit',
            'production_unit_recommended_capacity',
            'status',
            'status_display',
            'harvested_at',
            'final_harvested_at',
            'final_harvest_date',
            'final_harvest_notes',
            'final_fish_count',
            'final_average_weight_g',
            'final_biomass_kg',
            'final_harvest_reconciliation_status',
            'final_harvest_computed_count',
            'session_started_at',
            'survival_rate_pct',
            'created_at',
            'updated_at',
        ]

    def get_survival_rate_pct(self, obj):
        return float(obj.survival_rate_pct) if obj.survival_rate_pct is not None else None

    def get_final_harvest_reconciliation_status(self, obj):
        operation = getattr(obj, 'final_harvest_operation', None)
        return operation.reconciliation_status if operation is not None else None

    def get_final_harvest_computed_count(self, obj):
        operation = getattr(obj, 'final_harvest_operation', None)
        return operation.computed_count_before_harvest if operation is not None else None

    @extend_schema_field(serializers.DateTimeField(allow_null=True))
    def get_session_started_at(self, obj):
        return AllocationLedgerService.session_started_at(obj)

    def validate(self, attrs):
        cycle = attrs.get('cycle') or getattr(self.instance, 'cycle', None)
        production_unit = attrs.get('production_unit') or getattr(self.instance, 'production_unit', None)
        request = self.context.get('request')
        user = getattr(request, 'user', None)

        if cycle and user and cycle.farm_profile.user_id != user.id:
            raise serializers.ValidationError({
                'cycle': _("Ce cycle n'appartient pas à votre ferme"),
            })

        if production_unit and user and production_unit.farm_profile.user_id != user.id:
            raise serializers.ValidationError({
                'production_unit': _("Cette unité n'appartient pas à votre ferme"),
            })

        if cycle and production_unit and cycle.farm_profile_id != production_unit.farm_profile_id:
            raise serializers.ValidationError({
                'production_unit': _("L'unité doit appartenir à la même ferme que le cycle"),
            })

        initial_fish_count = attrs.get('initial_fish_count', getattr(self.instance, 'initial_fish_count', 0))
        current_fish_count = attrs.get('current_fish_count', getattr(self.instance, 'current_fish_count', 0))
        initial_biomass_kg = attrs.get('initial_biomass_kg', getattr(self.instance, 'initial_biomass_kg', Decimal('0')))
        current_biomass_kg = attrs.get('current_biomass_kg', getattr(self.instance, 'current_biomass_kg', Decimal('0')))
        expected_survival_rate_pct = attrs.get(
            'expected_survival_rate_pct',
            getattr(self.instance, 'expected_survival_rate_pct', None),
        )

        try:
            validate_cycle_unit_allocation_counts(
                initial_fish_count=initial_fish_count,
                current_fish_count=current_fish_count,
                initial_biomass_kg=initial_biomass_kg,
                current_biomass_kg=current_biomass_kg,
                expected_survival_rate_pct=expected_survival_rate_pct,
            )
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict or exc.messages)

        return attrs


class ProductionCycleSerializer(serializers.ModelSerializer):
    """
    Sérialiseur pour les cycles de production avec calculs automatiques.
    Inclut des champs calculés en lecture seule et validation logique métier.

    Architecture refactorée (Octobre 2025):
    - Expose les métriques CycleMetrics pour éviter recalculs frontend
    - Calcule total_feed_cost avec prix configurable
    - Source unique de vérité pour toutes les métriques aquacoles
    """
    # Champs calculés depuis modèle ProductionCycle
    days_active = serializers.SerializerMethodField()
    days_tracked = serializers.SerializerMethodField()
    current_density_kg_m3 = serializers.SerializerMethodField()

    # Champs calculés depuis CycleMetrics (métriques avancées)
    daily_growth_rate = serializers.SerializerMethodField()
    specific_growth_rate = serializers.SerializerMethodField()
    average_daily_feed = serializers.SerializerMethodField()
    performance_score = serializers.SerializerMethodField()

    # Champs calculés pour coûts
    total_feed_cost = serializers.SerializerMethodField()

    planned_cycle_duration_days = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=MIN_CYCLE_DURATION_DAYS,
        max_value=MAX_CYCLE_DURATION_DAYS,
        help_text=(
            'Optional cycle duration in days. A null value is accepted for legacy '
            'clients and never erases an existing configured duration.'
        ),
        error_messages={
            'min_value': CYCLE_DURATION_ERROR_MESSAGE,
            'max_value': CYCLE_DURATION_ERROR_MESSAGE,
            'invalid': CYCLE_DURATION_ERROR_MESSAGE,
        },
    )

    # Phase d'alimentation actuelle (basée sur le poids moyen courant)
    feed_phase = serializers.SerializerMethodField()

    # Champs display
    species_display = serializers.CharField(source='get_species_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    farm_name = serializers.CharField(source='farm_profile.farm_name', read_only=True)
    cycle_kind_display = serializers.CharField(source='get_cycle_kind_display', read_only=True)
    is_calibration_unit = serializers.BooleanField(read_only=True)
    total_stocked_count = serializers.SerializerMethodField()
    total_stocked_biomass = serializers.SerializerMethodField()
    total_transferred_out_count = serializers.SerializerMethodField()
    total_transferred_out_biomass = serializers.SerializerMethodField()

    class Meta:
        model = ProductionCycle
        fields = [
            'id', 'client_uuid', 'farm_profile', 'cycle_name', 'species', 'species_display',
            'cycle_kind', 'cycle_kind_display', 'is_calibration_unit',
            'onboarding_mode',
            'total_stocked_count', 'total_stocked_biomass', 'total_transferred_out_count',
            'total_transferred_out_biomass',
            'pond_identifier', 'pond_surface_m2', 'pond_volume_m3', 'infrastructure_type',
            'start_date', 'initial_count', 'initial_average_weight', 'initial_biomass',
            'tracking_start_date', 'tracking_start_count',
            'tracking_start_average_weight', 'tracking_start_biomass',
            'tracking_start_biomass_source', 'historical_count_gap',
            'history_scope', 'has_partial_history',
            'target_harvest_weight_g', 'planned_cycle_duration_days', 'planned_harvest_date', 'planned_feed_bags',
            'expected_survival_rate_pct', 'planned_selling_price_per_kg_fcfa',
            'fingerlings_cost_fcfa', 'other_operational_costs_fcfa',
            'current_count', 'current_average_weight', 'current_biomass',
            'total_feed_consumed', 'end_date', 'final_count', 'final_average_weight',
            'final_biomass', 'survival_rate', 'fcr', 'status', 'status_display',
            'days_active', 'days_tracked', 'current_density_kg_m3', 'farm_name',
            # Métriques CycleMetrics exposées
            'daily_growth_rate', 'specific_growth_rate', 'average_daily_feed', 'performance_score',
            # Coûts calculés
            'total_feed_cost',
            # Phase alimentation courante
            'feed_phase',
            'created_offline', 'synced_at', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'farm_profile', 'initial_biomass', 'current_count', 'current_average_weight',
            'current_biomass', 'total_feed_consumed', 'survival_rate', 'fcr',
            'cycle_kind', 'onboarding_mode', 'tracking_start_date',
            'tracking_start_count', 'tracking_start_average_weight',
            'tracking_start_biomass', 'tracking_start_biomass_source',
            'status', 'end_date', 'final_count', 'final_average_weight',
            'final_biomass', 'synced_at', 'created_at', 'updated_at'
        ]
        extra_kwargs = {
            'client_uuid': {'validators': []},
            'cycle_name': {'required': False},
            'initial_average_weight': {'required': False},
        }

    def get_days_active(self, obj):
        """Calcule les jours depuis le début du cycle."""
        return obj.days_active()

    def get_days_tracked(self, obj):
        return obj.days_tracked()

    def get_total_stocked_count(self, obj):
        incoming = self._calibration_totals(obj)['in_count']
        return incoming if obj.cycle_kind == 'calibration' else obj.analysis_start_count + incoming

    def get_total_stocked_biomass(self, obj):
        incoming = self._calibration_totals(obj)['in_biomass']
        return (
            incoming
            if obj.cycle_kind == 'calibration'
            else (obj.analysis_start_biomass or Decimal('0')) + incoming
        )

    def get_total_transferred_out_count(self, obj):
        return self._calibration_totals(obj)['out_count']

    def get_total_transferred_out_biomass(self, obj):
        return self._calibration_totals(obj)['out_biomass']

    @staticmethod
    def _calibration_totals(obj):
        """Never silently report zero merely because a caller omitted for_api()."""
        cached = getattr(obj, '_serializer_calibration_totals', None)
        if cached is not None:
            return cached
        annotated_fields = (
            'calibration_in_count',
            'calibration_in_biomass',
            'calibration_out_count',
            'calibration_out_biomass',
        )
        if all(hasattr(obj, field) for field in annotated_fields):
            totals = {
                'in_count': obj.calibration_in_count,
                'in_biomass': obj.calibration_in_biomass,
                'out_count': obj.calibration_out_count,
                'out_biomass': obj.calibration_out_biomass,
            }
        else:
            incoming = CalibrationOperation.objects.filter(
                destination_allocation__cycle_id=obj.pk,
            ).aggregate(count=Sum('transferred_count'), biomass=Sum('transferred_biomass_kg'))
            outgoing = CalibrationOperation.objects.filter(
                source_allocation__cycle_id=obj.pk,
            ).aggregate(count=Sum('transferred_count'), biomass=Sum('transferred_biomass_kg'))
            totals = {
                'in_count': incoming['count'] or 0,
                'in_biomass': incoming['biomass'] or Decimal('0'),
                'out_count': outgoing['count'] or 0,
                'out_biomass': outgoing['biomass'] or Decimal('0'),
            }
        obj._serializer_calibration_totals = totals
        return totals

    def get_current_density_kg_m3(self, obj):
        """Calcule la densité d'élevage actuelle."""
        density = obj.current_density_kg_m3()
        return float(density) if density else None

    def get_daily_growth_rate(self, obj):
        """
        Taux de croissance journalier (g/jour) depuis CycleMetrics.
        Évite recalcul frontend - Backend est source unique de vérité.
        """
        if hasattr(obj, 'metrics') and obj.metrics and obj.metrics.daily_growth_rate:
            return float(obj.metrics.daily_growth_rate)
        return None


    def get_specific_growth_rate(self, obj):
        """
        Taux de croissance spécifique SGR (%/jour) depuis CycleMetrics.
        Formule scientifique: ((ln(Pf) - ln(Pi)) / jours) × 100
        Évite recalcul frontend - Backend est source unique de vérité.
        """
        if hasattr(obj, 'metrics') and obj.metrics and obj.metrics.specific_growth_rate:
            return float(obj.metrics.specific_growth_rate)
        return None

    def get_average_daily_feed(self, obj):
        """
        Alimentation journalière moyenne (kg/jour) depuis CycleMetrics.
        Évite recalcul frontend - Backend est source unique de vérité.
        """
        if hasattr(obj, 'metrics') and obj.metrics and obj.metrics.average_daily_feed:
            return float(obj.metrics.average_daily_feed)
        return None

    def get_performance_score(self, obj):
        """
        Score de performance global (0-100) depuis CycleMetrics.
        Évite recalcul frontend - Backend est source unique de vérité.
        """
        if hasattr(obj, 'metrics') and obj.metrics and obj.metrics.performance_score:
            return float(obj.metrics.performance_score)
        return None

    def get_feed_phase(self, obj):
        """
        Retourne la phase d'alimentation recommandée selon l'espèce et le poids moyen courant.
        Phase : 'pre_grossissement' (10-100g) ou 'grossissement' (100g+).
        """
        weight = obj.current_average_weight or obj.initial_average_weight
        if not weight:
            return None
        result = get_feed_phase(obj.species, float(weight))
        if not result:
            return None
        return {
            'phase_key': result.phase_key,
            'phase_label': result.phase_label,
            'weight_range_g': list(result.weight_range_g),
            'recommended_product': result.recommended_product,
            'products': result.products,
            'protein_pct': result.protein_pct,
            'bag_weight_kg': result.bag_weight_kg,
            'price_per_bag_fcfa': result.price_per_bag_fcfa,
        }

    def get_total_feed_cost(self, obj):
        """
        Calcule le coût total de l'aliment consommé (FCFA).
        Utilise prix configurable depuis FarmProfile ou défaut 500 FCFA/kg.
        Évite hardcoding frontend - Backend gère prix configurable.
        """
        if not obj.total_feed_consumed or obj.total_feed_consumed <= 0:
            return None

        plan_data = FarmProductionPlanService.get_plan_data(obj.farm_profile)
        price_per_kg = plan_data["default_feed_price_per_kg"] or DEFAULT_FEED_PRICE_PER_KG

        # Calcul via domain calculator
        total_cost = AquacultureCalculator.calculate_feed_cost(
            obj.total_feed_consumed,
            price_per_kg
        )
        return float(total_cost)

    def validate(self, attrs):
        species = attrs.get('species') or getattr(self.instance, 'species', None)
        defaults = ECONOMIC_DEFAULTS_BY_SPECIES.get(species or 'tilapia', ECONOMIC_DEFAULTS_BY_SPECIES['tilapia'])
        is_create = self.instance is None
        duration_was_supplied = 'planned_cycle_duration_days' in attrs
        start_date_was_supplied = 'start_date' in attrs
        harvest_date_was_supplied = 'planned_harvest_date' in attrs
        supplied_harvest_date = attrs.get('planned_harvest_date')

        start_date_value = attrs.get('start_date') or getattr(self.instance, 'start_date', None)
        if attrs.get('cycle_name') is None and not getattr(self.instance, 'cycle_name', None) and start_date_value:
            attrs['cycle_name'] = f"Cycle {(species or 'tilapia').capitalize()} {start_date_value.isoformat()}"

        if (
            attrs.get('initial_average_weight') is None
            and getattr(self.instance, 'initial_average_weight', None) is None
        ):
            attrs['initial_average_weight'] = DEFAULT_INITIAL_AVERAGE_WEIGHT_G_BY_SPECIES.get(
                species or 'tilapia',
                DEFAULT_INITIAL_AVERAGE_WEIGHT_G_BY_SPECIES['tilapia'],
            )

        # Set economic defaults when omitted
        if attrs.get('target_harvest_weight_g') is None and not getattr(self.instance, 'target_harvest_weight_g', None):
            attrs['target_harvest_weight_g'] = defaults['target_harvest_weight_g']

        stored_duration = getattr(self.instance, 'planned_cycle_duration_days', None)
        supplied_duration = attrs.get('planned_cycle_duration_days')
        effective_duration = supplied_duration if supplied_duration is not None else stored_duration
        if effective_duration is not None:
            try:
                effective_duration = validate_cycle_duration_days(effective_duration)
            except ValueError as exc:
                raise serializers.ValidationError({'planned_cycle_duration_days': str(exc)}) from exc
        elif is_create:
            effective_duration = get_default_cycle_duration_days(species)
            attrs['planned_cycle_duration_days'] = effective_duration

        if not is_create and duration_was_supplied and supplied_duration is None:
            # ``null`` is accepted for legacy clients, but never means "erase"
            # on an update.  Keep the stored value (including legacy null).
            attrs.pop('planned_cycle_duration_days', None)

        if (
            attrs.get('expected_survival_rate_pct') is None
            and not getattr(self.instance, 'expected_survival_rate_pct', None)
        ):
            attrs['expected_survival_rate_pct'] = DEFAULT_EXPECTED_SURVIVAL_RATE_PCT

        if (
            attrs.get('planned_selling_price_per_kg_fcfa') is None
            and not getattr(self.instance, 'planned_selling_price_per_kg_fcfa', None)
        ):
            attrs['planned_selling_price_per_kg_fcfa'] = defaults['planned_selling_price_per_kg_fcfa']

        if attrs.get('fingerlings_cost_fcfa') is None and getattr(self.instance, 'fingerlings_cost_fcfa', None) is None:
            attrs['fingerlings_cost_fcfa'] = DEFAULT_FINGERLINGS_COST_FCFA

        if (
            attrs.get('other_operational_costs_fcfa') is None
            and getattr(self.instance, 'other_operational_costs_fcfa', None) is None
        ):
            attrs['other_operational_costs_fcfa'] = DEFAULT_OTHER_OPERATIONAL_COSTS_FCFA

        if attrs.get('end_date') and attrs.get('start_date'):
            if attrs['end_date'] < attrs['start_date']:
                raise serializers.ValidationError({
                    'end_date': _("La date de fin doit être après la date de début")
                })

        # Validate reasonable fish count
        if attrs.get('initial_count', 0) > MAX_INITIAL_FISH_COUNT:
            raise serializers.ValidationError({
                'initial_count': _("Le nombre initial de poissons semble trop élevé")
            })

        initial_weight = attrs.get('initial_average_weight') or getattr(self.instance, 'initial_average_weight', None)
        target_weight = attrs.get('target_harvest_weight_g') or getattr(self.instance, 'target_harvest_weight_g', None)
        if initial_weight and target_weight and Decimal(str(target_weight)) <= Decimal(str(initial_weight)):
            raise serializers.ValidationError({
                'target_harvest_weight_g': _("Le poids cible doit être supérieur au poids moyen initial")
            })

        expected_survival = (
            attrs.get('expected_survival_rate_pct')
            or getattr(self.instance, 'expected_survival_rate_pct', None)
        )
        if expected_survival is not None and (
            Decimal(str(expected_survival)) < Decimal('0') or Decimal(str(expected_survival)) > Decimal('100')
        ):
            raise serializers.ValidationError({
                'expected_survival_rate_pct': _("Le taux de survie prévisionnel doit être compris entre 0 et 100")
            })

        selling_price = (
            attrs.get('planned_selling_price_per_kg_fcfa')
            or getattr(self.instance, 'planned_selling_price_per_kg_fcfa', None)
        )
        if selling_price is not None and Decimal(str(selling_price)) <= Decimal('0'):
            raise serializers.ValidationError({
                'planned_selling_price_per_kg_fcfa': _("Le prix de vente prévisionnel doit être strictement positif")
            })

        # Validate that at least one of pond_surface_m2 or pond_volume_m3 is provided
        # (only for creation, not update)
        if not self.instance:  # Creation only
            has_surface = attrs.get('pond_surface_m2') is not None
            has_volume = attrs.get('pond_volume_m3') is not None

            if not has_surface and not has_volume:
                raise serializers.ValidationError({
                    'pond_surface_m2': _("Veuillez renseigner au moins la surface OU le volume du bassin")
                })

        # Validate pond/tank capacity (density check)
        initial_count = attrs.get('initial_count') or getattr(self.instance, 'initial_count', None)
        pond_surface = attrs.get('pond_surface_m2') or getattr(self.instance, 'pond_surface_m2', None)
        pond_volume = attrs.get('pond_volume_m3') or getattr(self.instance, 'pond_volume_m3', None)
        infrastructure_types = attrs.get('infrastructure_type') or getattr(self.instance, 'infrastructure_type', None)
        normalized_infrastructure_types = ProductionCycleService._normalize_infrastructure_types(
            infrastructure_types
        )

        if initial_count and len(normalized_infrastructure_types) <= 1:
            if ProductionCycleService._is_pond_infrastructure(
                normalized_infrastructure_types or infrastructure_types
            ) and pond_surface:
                density_per_m2 = initial_count / float(pond_surface)
                max_density = ProductionCycleService.MAX_STOCKING_DENSITY_POND_PER_M2
                if density_per_m2 > max_density:
                    raise serializers.ValidationError({
                        'initial_count': _(
                            "Densité initiale trop élevée (max %(max_density)s poissons/m²)"
                        ) % {'max_density': max_density}
                    })
            elif pond_volume:
                density_per_m3 = initial_count / float(pond_volume)
                max_density = ProductionCycleService.MAX_STOCKING_DENSITY_TANK_PER_M3
                if density_per_m3 > max_density:
                    raise serializers.ValidationError({
                        'initial_count': _(
                            "Densité initiale trop élevée (max %(max_density)s poissons/m³)"
                        ) % {'max_density': max_density}
                    })

        start_date_value = attrs.get('start_date') if start_date_was_supplied else getattr(
            self.instance,
            'start_date',
            None,
        )
        should_recalculate_harvest = (
            is_create
            or start_date_was_supplied
            or duration_was_supplied
            or harvest_date_was_supplied
        )
        calculation_duration = effective_duration
        if calculation_duration is None and (start_date_was_supplied or supplied_harvest_date is not None):
            calculation_duration = get_default_cycle_duration_days(species)
        derived_harvest = (
            calculate_planned_harvest_date(start_date_value, calculation_duration)
            if should_recalculate_harvest and start_date_value and calculation_duration is not None
            else None
        )
        if (
            supplied_harvest_date is not None
            and derived_harvest
            and supplied_harvest_date != derived_harvest
        ):
            raise serializers.ValidationError({
                'planned_harvest_date': CYCLE_HARVEST_DATE_ERROR_MESSAGE
            })
        if derived_harvest:
            attrs['planned_harvest_date'] = derived_harvest

        planned_harvest = attrs.get('planned_harvest_date') or getattr(self.instance, 'planned_harvest_date', None)
        if start_date_value and planned_harvest and planned_harvest < start_date_value:
            raise serializers.ValidationError({
                'planned_harvest_date': _("La date prévisionnelle de récolte doit être après la date de début")
            })

        return attrs

    def create(self, validated_data):
        """Crée un cycle avec calcul automatique de biomasse."""
        # Calculate initial biomass
        validated_data['initial_biomass'] = AquacultureCalculator.calculate_biomass(
            validated_data['initial_count'],
            validated_data['initial_average_weight']
        )
        
        # Initialize current values
        validated_data['current_count'] = validated_data['initial_count']
        validated_data['current_average_weight'] = validated_data['initial_average_weight']
        validated_data['current_biomass'] = validated_data['initial_biomass']
        
        return super().create(validated_data)


class CalibrationTankSerializer(serializers.ModelSerializer):
    """Façade API des ProductionUnit dédiées au calibrage."""

    is_occupied = serializers.SerializerMethodField()
    active_session = serializers.SerializerMethodField()
    active_allocation = serializers.SerializerMethodField()
    allocations = serializers.SerializerMethodField()
    is_active = serializers.BooleanField(required=False)
    pending_sync = serializers.SerializerMethodField()

    class Meta:
        model = ProductionUnit
        fields = [
            'id', 'client_uuid', 'farm_profile', 'name', 'volume_m3', 'is_active', 'is_occupied',
            'active_session', 'active_allocation', 'allocations', 'pending_sync', 'created_offline', 'synced_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'farm_profile', 'is_occupied', 'active_session', 'active_allocation', 'allocations', 'pending_sync',
            'synced_at', 'created_at', 'updated_at',
        ]
        extra_kwargs = {'client_uuid': {'validators': []}}

    @extend_schema_field(serializers.BooleanField)
    def get_is_occupied(self, obj) -> bool:
        return any(allocation.status == CycleUnitAllocation.STATUS_ACTIVE for allocation in obj.cycle_allocations.all())

    @extend_schema_field(ProductionCycleSerializer)
    def get_active_session(self, obj):
        allocation = next(
            (
                item
                for item in obj.cycle_allocations.all()
                if item.status == CycleUnitAllocation.STATUS_ACTIVE
            ),
            None,
        )
        cycle = allocation.cycle if allocation else None
        return ProductionCycleSerializer(cycle, context=self.context).data if cycle else None

    @extend_schema_field(CycleUnitAllocationSerializer)
    def get_active_allocation(self, obj):
        allocation = next(
            (item for item in obj.cycle_allocations.all() if item.status == CycleUnitAllocation.STATUS_ACTIVE),
            None,
        )
        return CycleUnitAllocationSerializer(allocation, context=self.context).data if allocation else None

    @extend_schema_field(CycleUnitAllocationSerializer(many=True))
    def get_allocations(self, obj):
        return CycleUnitAllocationSerializer(obj.cycle_allocations.all(), many=True, context=self.context).data

    @extend_schema_field(serializers.BooleanField)
    def get_pending_sync(self, obj) -> bool:
        return obj.created_offline and obj.synced_at is None

    def validate(self, attrs):
        request = self.context.get('request')
        if request is None:
            return attrs
        farm = request.user.farm_profile
        name = attrs.get('name', getattr(self.instance, 'name', None))
        client_uuid = attrs.get('client_uuid', getattr(self.instance, 'client_uuid', None))
        duplicate = ProductionUnit.objects.filter(
            farm_profile=farm,
            name__iexact=name,
        )
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists() and not (
            client_uuid and duplicate.filter(client_uuid=client_uuid).exists()
        ):
            detail = _('Une unité portant ce nom existe déjà dans cette ferme.')
            raise serializers.ValidationError(
                {
                    'code': 'duplicate_production_unit_name',
                    'field': 'name',
                    'detail': detail,
                    'name': [detail],
                }
            )
        if self.instance is not None:
            lifecycle_changes = dict(attrs)
            if 'is_active' in lifecycle_changes:
                lifecycle_changes['status'] = 'active' if lifecycle_changes.pop('is_active') else 'inactive'
            try:
                ProductionUnitLifecycleService.validate_update(self.instance, lifecycle_changes)
            except BusinessRuleViolation as exc:
                raise serializers.ValidationError({'detail': str(exc)}) from exc
        return attrs


class CalibrationOperationSerializer(serializers.ModelSerializer):
    source_cycle_name = serializers.CharField(source='source_allocation.cycle.cycle_name', read_only=True)
    source_unit_name = serializers.CharField(source='source_allocation.production_unit.name', read_only=True)
    destination_cycle_name = serializers.CharField(source='destination_allocation.cycle.cycle_name', read_only=True)
    destination_unit_name = serializers.CharField(source='destination_allocation.production_unit.name', read_only=True)

    class Meta:
        model = CalibrationOperation
        fields = '__all__'
        read_only_fields = [field.name for field in CalibrationOperation._meta.fields]


class CalibrationRequestSerializer(serializers.Serializer):
    client_uuid = serializers.UUIDField()
    source_allocation_id = serializers.UUIDField(required=False)
    source_allocation_client_uuid = serializers.UUIDField(required=False)
    destination_production_unit_id = serializers.UUIDField(required=False)
    destination_production_unit_client_uuid = serializers.UUIDField(required=False)
    calibrated_at = serializers.DateTimeField()
    transferred_count = serializers.IntegerField(min_value=1)
    transferred_average_weight_g = serializers.DecimalField(max_digits=8, decimal_places=2, required=False)
    sample_count = serializers.IntegerField(min_value=1, required=False)
    sample_total_weight_g = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    size_category = serializers.ChoiceField(choices=CalibrationOperation.SIZE_CHOICES, required=False, allow_blank=True)
    notes = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    created_offline = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if not attrs.get('destination_production_unit_id') and not attrs.get(
            'destination_production_unit_client_uuid'
        ):
            raise serializers.ValidationError({'destination_production_unit_id': _('Un bac destination est requis.')})
        if attrs.get('sample_count') and attrs['sample_count'] > attrs['transferred_count']:
            raise serializers.ValidationError({'sample_count': _("L'échantillon ne peut pas dépasser le transfert.")})
        if attrs.get('transferred_average_weight_g') is None and not (
            attrs.get('sample_count') and attrs.get('sample_total_weight_g')
        ):
            raise serializers.ValidationError(_('Indiquez un poids moyen ou un échantillon complet.'))
        return attrs


class CalibrationResponseSerializer(serializers.Serializer):
    """Réponse canonique après un calibrage ou son rejeu idempotent."""

    operation = CalibrationOperationSerializer()
    source_allocation = CycleUnitAllocationSerializer()
    destination_allocation = CycleUnitAllocationSerializer()
    source_cycle = ProductionCycleSerializer()
    destination_cycle = ProductionCycleSerializer()
    destination_tank = CalibrationTankSerializer()
    warnings = serializers.ListField(
        child=serializers.ChoiceField(choices=['weight_difference', 'high_density'])
    )
    idempotent_replay = serializers.BooleanField()


class CycleLogSerializer(serializers.ModelSerializer):
    """
    Sérialiseur pour les logs quotidiens de cycle avec validation pour synchronisation offline.
    """
    # Calculated fields
    calculated_average_weight = serializers.SerializerMethodField()
    production_unit = serializers.SerializerMethodField()
    production_unit_name = serializers.SerializerMethodField()
    production_unit_type = serializers.SerializerMethodField()
    production_unit_display_dimension = serializers.SerializerMethodField()
    cycle_unit_allocation = serializers.PrimaryKeyRelatedField(
        queryset=CycleUnitAllocation.objects.select_related(
            'cycle__farm_profile__user',
            'production_unit__farm_profile',
        ),
        required=False,
        allow_null=True,
    )
    feed_reference_client_uuid = serializers.UUIDField(required=False, allow_null=True, write_only=True)
    
    class Meta:
        model = CycleLog
        fields = [
            'id', 'client_uuid', 'cycle', 'cycle_unit_allocation', 'production_unit',
            'production_unit_name', 'production_unit_type', 'production_unit_display_dimension',
            'log_date', 'log_time',
            'mortality_count', 'mortality_reason', 'sample_count',
            'sample_total_weight', 'average_weight', 'calculated_average_weight',
            'feed_quantity', 'feed_type', 'feed_size_mm', 'feed_reference',
            'feed_reference_client_uuid', 'feeding_times',
            'water_temperature', 'dissolved_oxygen', 'ph_level', 'ammonia_level',
            'observations', 'created_offline', 'synced_at', 'created_at'
        ]
        read_only_fields = [
            'id',
            'log_time',
            'production_unit',
            'production_unit_name',
            'production_unit_type',
            'production_unit_display_dimension',
            'synced_at',
            'created_at',
        ]
        # On gère l'upsert (cycle/log_date) au niveau de la vue, donc on retire
        # la validation unique automatique pour éviter un 400 avant la mise à jour.
        validators = []

    def get_calculated_average_weight(self, obj):
        """Calcule le poids moyen à partir des données d'échantillonnage."""
        if obj.sample_count and obj.sample_total_weight:
            return float(obj.sample_total_weight / obj.sample_count)
        return None

    def get_production_unit(self, obj):
        allocation = getattr(obj, 'cycle_unit_allocation', None)
        return str(allocation.production_unit_id) if allocation else None

    def get_production_unit_name(self, obj):
        allocation = getattr(obj, 'cycle_unit_allocation', None)
        if allocation and allocation.production_unit:
            return allocation.production_unit.name
        return None

    def get_production_unit_type(self, obj):
        allocation = getattr(obj, 'cycle_unit_allocation', None)
        if allocation and allocation.production_unit:
            return allocation.production_unit.unit_type
        return None

    def get_production_unit_display_dimension(self, obj):
        allocation = getattr(obj, 'cycle_unit_allocation', None)
        if allocation and allocation.production_unit and allocation.production_unit.display_dimension:
            return str(allocation.production_unit.display_dimension)
        return None

    def validate(self, attrs):
        """Valide la cohérence des données de log et les règles métier."""
        from aquaculture.domain.validators import (
            validate_cycle_log_date,
            validate_cycle_unit_allocation_context,
            validate_sampling_data,
        )
        from django.core.exceptions import ValidationError as DjangoValidationError

        cycle = attrs.get('cycle')
        log_date = attrs.get('log_date')
        request = self.context.get('request')
        request_user = getattr(request, 'user', None)

        if self.instance is not None and 'cycle' in attrs:
            requested_cycle = attrs['cycle']
            if str(requested_cycle.id) != str(self.instance.cycle_id):
                raise serializers.ValidationError({
                    'cycle': {
                        'code': 'cycle_immutable',
                        'detail': _('Le cycle d’un journal existant ne peut pas être modifié.'),
                    }
                })

        effective_cycle = cycle or getattr(self.instance, 'cycle', None)
        feed_quantity = attrs.get('feed_quantity', getattr(self.instance, 'feed_quantity', None))
        feed_reference = attrs.get('feed_reference', getattr(self.instance, 'feed_reference', None))
        feed_size_mm = attrs.get('feed_size_mm', getattr(self.instance, 'feed_size_mm', None))
        feed_reference_client_uuid = attrs.pop('feed_reference_client_uuid', None)
        if feed_reference_client_uuid:
            if effective_cycle is None:
                raise serializers.ValidationError({'cycle': _('Le cycle est requis.')})
            from .models import FarmFeedReference

            resolved_reference = FarmFeedReference.objects.for_api().filter(
                client_uuid=feed_reference_client_uuid,
                farm_profile=effective_cycle.farm_profile,
            ).first()
            if resolved_reference is None:
                raise serializers.ValidationError(
                    {'feed_reference_client_uuid': _('Référence aliment introuvable pour cette ferme.')}
                )
            if feed_reference is not None and feed_reference.id != resolved_reference.id:
                raise serializers.ValidationError(
                    {'feed_reference_client_uuid': _(
                        'L’identifiant et le client_uuid désignent deux aliments différents.'
                    )}
                )
            feed_reference = resolved_reference
            attrs['feed_reference'] = resolved_reference
        if feed_quantity is not None and feed_quantity > 0:
            if feed_reference is None and feed_size_mm is None:
                raise serializers.ValidationError({'feed_size_mm': _('Sélectionnez la granulométrie distribuée.')})
            # Une saisie mobile par granulométrie peut couvrir plusieurs
            # références compatibles. La résolution et la validation du stock
            # doivent rester dans le service métier afin de retourner une
            # erreur structurée lorsqu'aucune référence n'est disponible.
            if (
                feed_reference is not None
                and effective_cycle
                and feed_reference.farm_profile_id != effective_cycle.farm_profile_id
            ):
                raise serializers.ValidationError({'feed_reference': _('Cet aliment appartient à une autre ferme.')})
            if feed_reference is not None and effective_cycle and feed_reference.species != effective_cycle.species:
                raise serializers.ValidationError(
                    {'feed_reference': _('Cet aliment ne correspond pas à l’espèce du cycle.')}
                )
            if (
                feed_reference is not None
                and feed_size_mm is not None
                and feed_reference.pellet_size_mm is not None
                and feed_reference.pellet_size_mm != feed_size_mm
            ):
                raise serializers.ValidationError(
                    {'feed_size_mm': _('La granulométrie ne correspond pas à l’aliment sélectionné.')}
                )
            if feed_reference is not None and (attrs.get('feed_reference') is not None or feed_reference_client_uuid):
                attrs['feed_type'] = feed_reference.name
                attrs['feed_size_mm'] = feed_reference.pellet_size_mm
            elif feed_reference is None:
                # A size-only mobile entry may consume several compatible
                # origins. Keep the origin unset so the service can allocate
                # the quantity deterministically instead of choosing one.
                attrs['feed_size_mm'] = feed_size_mm
        elif feed_quantity in (None, 0):
            attrs['feed_reference'] = None
            attrs['feed_size_mm'] = None

        # Validate log date within cycle period (shared domain validator)
        if cycle and log_date:
            try:
                validate_cycle_log_date(log_date, cycle.start_date, cycle.end_date)
            except DjangoValidationError as e:
                raise serializers.ValidationError({'log_date': e.message})

        cycle_unit_allocation = attrs.get('cycle_unit_allocation') or getattr(
            self.instance,
            'cycle_unit_allocation',
            None,
        )
        try:
            validate_cycle_unit_allocation_context(
                cycle=cycle or getattr(self.instance, 'cycle', None),
                cycle_unit_allocation=cycle_unit_allocation,
                user=request_user if getattr(request_user, 'is_authenticated', False) else None,
            )
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.message_dict or e.messages)

        # Validate sampling data consistency (shared domain validator)
        if attrs.get('sample_count') and attrs.get('sample_total_weight'):
            try:
                validate_sampling_data(
                    attrs['sample_count'], attrs['sample_total_weight'],
                    attrs.get('average_weight'),
                )
            except DjangoValidationError as e:
                raise serializers.ValidationError({'average_weight': e.message})
            if not attrs.get('average_weight'):
                attrs['average_weight'] = attrs['sample_total_weight'] / attrs['sample_count']

        # Validate mortality doesn't exceed current fish count
        if attrs.get('mortality_count') and cycle:
            if attrs['mortality_count'] > cycle.current_count:
                raise serializers.ValidationError({
                    'mortality_count': _("Le nombre de morts ne peut dépasser l'effectif actuel")
                })

        # Validate environmental parameters
        if attrs.get('water_temperature'):
            temp = attrs['water_temperature']
            if temp < LOG_TEMPERATURE_MIN or temp > LOG_TEMPERATURE_MAX:
                raise serializers.ValidationError({
                    'water_temperature': _("Température hors plage normale (15-40°C)")
                })

        return attrs


class BulkCycleLogSerializer(serializers.ListSerializer):
    """
    Sérialiseur bulk pour synchronisation offline de multiples logs.
    Délègue la logique métier (déduplication, upsert) à CycleLogService.
    """
    def create(self, validated_data: list[dict[str, Any]]) -> list[CycleLog]:
        """Délègue la création bulk au CycleLogService (respect Views → Services)."""
        from .services.log_service import CycleLogService
        request = cast(Request | None, self.context.get('request'))
        user = getattr(request, 'user', None)
        result = CycleLogService.create_bulk_logs(validated_data, user)
        return result['logs']


class CycleLogSyncSerializer(CycleLogSerializer):
    """
    Sérialiseur spécialisé pour les endpoints de synchronisation.
    Utilise un sérialiseur de liste bulk pour les opérations par lot.
    """
    class Meta(CycleLogSerializer.Meta):
        list_serializer_class = BulkCycleLogSerializer
        extra_kwargs = {'client_uuid': {'validators': []}}


class BulkCycleLogRequestSerializer(serializers.Serializer):
    """Payload de creation bulk des logs quotidiens."""

    logs = CycleLogSyncSerializer(many=True)


class BulkCycleLogResponseSerializer(serializers.Serializer):
    """Reponse DRF de creation bulk des logs quotidiens."""

    created = serializers.IntegerField()
    updated = serializers.IntegerField()
    errors = serializers.ListField()
    logs = CycleLogSerializer(many=True)


class FeedingPlanSerializer(serializers.ModelSerializer):
    """
    Sérialiseur pour les plans d'alimentation avec calculs automatiques.
    """
    cycle = serializers.PrimaryKeyRelatedField(
        queryset=ProductionCycle.objects.select_related('farm_profile', 'farm_profile__user'),
        required=False,
    )
    cycle_unit_allocation = serializers.PrimaryKeyRelatedField(
        queryset=CycleUnitAllocation.objects.select_related(
            'cycle__farm_profile__user',
            'production_unit__farm_profile',
        ),
        required=False,
        allow_null=True,
    )
    cycle_name = serializers.CharField(source='cycle.cycle_name', read_only=True)
    production_unit = serializers.SerializerMethodField()
    production_unit_name = serializers.SerializerMethodField()
    production_unit_type = serializers.SerializerMethodField()
    production_unit_display_dimension = serializers.SerializerMethodField()
    scope_label = serializers.SerializerMethodField()
    total_week_feed = serializers.SerializerMethodField()
    feed_per_meal_display = serializers.SerializerMethodField()

    class Meta:
        model = FeedingPlan
        fields = [
            'id', 'cycle', 'cycle_unit_allocation', 'cycle_name',
            'production_unit', 'production_unit_name', 'production_unit_type',
            'production_unit_display_dimension', 'scope_label',
            'week_number', 'estimated_fish_count', 'average_weight', 'biomass',
            'daily_feed_amount', 'feeding_rate', 'meals_per_day', 'feed_per_meal',
            'total_week_feed', 'recommended_feed_type', 'feed_size_mm', 'protein_percentage',
            'start_date', 'end_date', 'is_active', 'feed_per_meal_display',
            'temperature_used_c', 'used_default_temperature', 'data_source',
            'created_at'
        ]
        validators = []
        read_only_fields = [
            'id',
            'cycle_name',
            'production_unit',
            'production_unit_name',
            'production_unit_type',
            'production_unit_display_dimension',
            'scope_label',
            'created_at',
        ]

    def get_production_unit(self, obj):
        allocation = getattr(obj, 'cycle_unit_allocation', None)
        return str(allocation.production_unit_id) if allocation else None

    def get_production_unit_name(self, obj):
        allocation = getattr(obj, 'cycle_unit_allocation', None)
        if allocation and allocation.production_unit:
            return allocation.production_unit.name
        return None

    def get_production_unit_type(self, obj):
        allocation = getattr(obj, 'cycle_unit_allocation', None)
        if allocation and allocation.production_unit:
            return allocation.production_unit.unit_type
        return None

    def get_production_unit_display_dimension(self, obj):
        allocation = getattr(obj, 'cycle_unit_allocation', None)
        if allocation and allocation.production_unit and allocation.production_unit.display_dimension:
            return str(allocation.production_unit.display_dimension)
        return None

    def get_scope_label(self, obj):
        unit_name = self.get_production_unit_name(obj)
        if unit_name:
            return _("Plan d'alimentation de %(unit_name)s") % {'unit_name': unit_name}
        return _("Plan d'alimentation de l'unité")

    def get_total_week_feed(self, obj):
        """Calcule l'aliment total pour la semaine."""
        return float(obj.daily_feed_amount * 7)

    def get_feed_per_meal_display(self, obj):
        """Formate l'aliment par repas pour l'affichage."""
        if obj.feed_per_meal < 0.1:
            return f"{int(obj.feed_per_meal * 1000)}g"
        return f"{float(obj.feed_per_meal):.1f}kg"

    def validate(self, attrs):
        """Valide les données du plan d'alimentation."""
        from aquaculture.domain.validators import validate_cycle_unit_allocation_context

        allocation = attrs.get('cycle_unit_allocation') or getattr(self.instance, 'cycle_unit_allocation', None)
        cycle = attrs.get('cycle') or getattr(self.instance, 'cycle', None)
        request = self.context.get('request')
        request_user = getattr(request, 'user', None)

        if allocation and not cycle:
            attrs['cycle'] = allocation.cycle
            cycle = attrs['cycle']

        if allocation and cycle and allocation.cycle_id != cycle.id:
            raise serializers.ValidationError({
                'cycle_unit_allocation': _("L'allocation doit appartenir au même cycle que le plan")
            })

        if allocation:
            try:
                validate_cycle_unit_allocation_context(
                    cycle=cycle,
                    cycle_unit_allocation=allocation,
                    user=request_user if getattr(request_user, 'is_authenticated', False) else None,
                )
            except DjangoValidationError as exc:
                raise serializers.ValidationError(exc.message_dict or exc.messages)

        if not cycle and not allocation and self.instance is None:
            raise serializers.ValidationError({
                'cycle': _("Le cycle ou l'allocation de cycle par unité est requis")
            })

        # Ensure week dates are consistent
        if attrs.get('start_date') and attrs.get('end_date'):
            if (attrs['end_date'] - attrs['start_date']).days != FEEDING_WEEK_DURATION_DAYS:
                raise serializers.ValidationError({
                    'end_date': _("La période doit être exactement 7 jours")
                })

        return attrs


class FeedingPlanGenerationRequestSerializer(serializers.Serializer):
    """Payload DRF de generation automatique de plans d'alimentation."""

    cycle_id = serializers.UUIDField(required=False, allow_null=True)
    cycle_unit_allocation_id = serializers.UUIDField(required=False, allow_null=True)
    weeks_ahead = serializers.IntegerField(min_value=1, max_value=MAX_GENERATION_WEEKS, default=1)


class SanitaryLogSerializer(serializers.ModelSerializer):
    """
    Sérialiseur pour les logs sanitaires avec support photo.
    """
    MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024
    ALLOWED_PHOTO_CONTENT_TYPES = {'image/jpeg', 'image/png', 'image/webp'}

    cycle_name = serializers.CharField(source='cycle.cycle_name', read_only=True)
    event_type_display = serializers.CharField(source='get_event_type_display', read_only=True)
    photo_url = serializers.SerializerMethodField()
    days_since_event = serializers.SerializerMethodField()
    production_unit = serializers.SerializerMethodField()
    production_unit_name = serializers.SerializerMethodField()
    production_unit_type = serializers.SerializerMethodField()
    production_unit_display_dimension = serializers.SerializerMethodField()
    cycle_unit_allocation = serializers.PrimaryKeyRelatedField(
        queryset=CycleUnitAllocation.objects.select_related(
            'cycle__farm_profile__user',
            'production_unit__farm_profile',
        ),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = SanitaryLog
        fields = [
            'id', 'client_uuid', 'cycle', 'cycle_name', 'cycle_unit_allocation',
            'production_unit', 'production_unit_name', 'production_unit_type',
            'production_unit_display_dimension', 'event_date', 'event_type',
            'event_type_display', 'symptoms', 'affected_count',
            'treatment_applied', 'medication_used', 'dosage',
            'treatment_duration_days', 'photo', 'photo_url',
            'resolved', 'resolution_date', 'notes', 'created_offline',
            'synced_at', 'days_since_event', 'created_at'
        ]
        read_only_fields = [
            'id',
            'synced_at',
            'created_at',
            'production_unit',
            'production_unit_name',
            'production_unit_type',
            'production_unit_display_dimension',
        ]
        extra_kwargs = {
            'client_uuid': {'validators': []},
        }

    def get_photo_url(self, obj):
        """Retourne l'URL complète de la photo si disponible."""
        if obj.photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.photo.url)
        return None

    def get_days_since_event(self, obj):
        """Calcule les jours depuis que l'événement s'est produit."""
        return (timezone.localdate() - obj.event_date).days

    def get_production_unit(self, obj):
        allocation = getattr(obj, 'cycle_unit_allocation', None)
        return str(allocation.production_unit_id) if allocation else None

    def get_production_unit_name(self, obj):
        allocation = getattr(obj, 'cycle_unit_allocation', None)
        if allocation and allocation.production_unit:
            return allocation.production_unit.name
        return None

    def get_production_unit_type(self, obj):
        allocation = getattr(obj, 'cycle_unit_allocation', None)
        if allocation and allocation.production_unit:
            return allocation.production_unit.unit_type
        return None

    def get_production_unit_display_dimension(self, obj):
        allocation = getattr(obj, 'cycle_unit_allocation', None)
        if allocation and allocation.production_unit and allocation.production_unit.display_dimension:
            return str(allocation.production_unit.display_dimension)
        return None

    def validate_photo(self, value):
        """Valide le type et la taille de la photo uploadée."""
        if not value:
            return value

        content_type = getattr(value, 'content_type', None)
        if content_type and content_type not in self.ALLOWED_PHOTO_CONTENT_TYPES:
            raise serializers.ValidationError(
                _("Format photo non supporté. Utilisez JPEG, PNG ou WEBP.")
            )

        if value.size > self.MAX_PHOTO_SIZE_BYTES:
            raise serializers.ValidationError(
                _("La photo dépasse la taille maximale de 5MB.")
            )

        return value

    def validate(self, attrs):
        """Valide les données du log sanitaire."""
        from django.core.exceptions import ValidationError as DjangoValidationError

        cycle = attrs.get('cycle') or getattr(self.instance, 'cycle', None)
        event_date = attrs.get('event_date') or getattr(self.instance, 'event_date', None)
        request = self.context.get('request')
        request_user = getattr(request, 'user', None)
        cycle_unit_allocation = attrs.get('cycle_unit_allocation') or getattr(
            self.instance,
            'cycle_unit_allocation',
            None,
        )

        if cycle and request_user and getattr(request_user, 'is_authenticated', False):
            if cycle.farm_profile.user_id != request_user.id:
                raise serializers.ValidationError({
                    'cycle': _("Cycle non autorisé")
                })

        from aquaculture.domain.validators import validate_cycle_unit_allocation_context

        try:
            validate_cycle_unit_allocation_context(
                cycle=cycle,
                cycle_unit_allocation=cycle_unit_allocation,
                user=request_user if getattr(request_user, 'is_authenticated', False) else None,
            )
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.message_dict or e.messages)

        if cycle and event_date:
            if event_date < cycle.start_date:
                raise serializers.ValidationError({
                    'event_date': _("La date de l'événement ne peut pas être avant le début du cycle")
                })
            if event_date > timezone.localdate():
                raise serializers.ValidationError({
                    'event_date': _("La date de l'événement ne peut pas être dans le futur")
                })

        # Validate resolution date
        if attrs.get('resolved') and not attrs.get('resolution_date'):
            attrs['resolution_date'] = timezone.localdate()
        
        if attrs.get('resolution_date') and event_date:
            if attrs['resolution_date'] < event_date:
                raise serializers.ValidationError({
                    'resolution_date': _("La date de résolution ne peut être avant l'événement")
                })

        return attrs


class NutritionalGuideSerializer(serializers.ModelSerializer):
    """
    Sérialiseur pour les guides nutritionnels (données de référence).
    """
    species_display = serializers.CharField(source='get_species_display', read_only=True)
    growth_stage_display = serializers.CharField(source='get_growth_stage_display', read_only=True)
    weight_range_display = serializers.SerializerMethodField()

    class Meta:
        model = NutritionalGuide
        fields = [
            'id', 'species', 'species_display', 'growth_stage', 'growth_stage_display',
            'min_weight', 'max_weight', 'weight_range_display',
            'feeding_rate_percentage', 'protein_requirement', 'meals_per_day',
            'feed_size_mm', 'recommended_products', 'expected_fcr',
            'feeding_notes', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_weight_range_display(self, obj):
        """Formate la plage de poids pour l'affichage."""
        return f"{obj.min_weight}-{obj.max_weight}g"


class NutritionalGuideSpeciesQuerySerializer(serializers.Serializer):
    """Validation des query params du filtre nutritionnel par espece."""

    species = serializers.ChoiceField(choices=SPECIES_CHOICES)


class CycleMetricsSerializer(serializers.ModelSerializer):
    """
    Sérialiseur pour les métriques de cycle et données analytiques.
    """
    cycle_name = serializers.CharField(source='cycle.cycle_name', read_only=True)

    class Meta:
        model = CycleMetrics
        fields = [
            'cycle', 'cycle_name', 'growth_curve_data', 'daily_growth_rate',
            'specific_growth_rate', 'survival_curve_data', 'weekly_mortality_rate',
            'cumulative_feed_data', 'average_daily_feed', 'performance_score',
            'last_calculated'
        ]


class HarvestSerializer(serializers.Serializer):
    """
    Sérialiseur pour les données de récolte d'un cycle.
    """
    harvest_date = serializers.DateField(
        required=False,
        help_text="Date de récolte du cycle, compatible avec les anciens clients",
    )
    final_harvested_at = serializers.DateTimeField(
        required=False,
        help_text="Datetime métier avec timezone de la récolte finale",
    )
    final_count = serializers.IntegerField(min_value=0, help_text="Nombre final de poissons récoltés")
    final_average_weight = serializers.DecimalField(
        max_digits=6,
        decimal_places=2,
        min_value=Decimal('0.1'),
        help_text="Poids moyen final en grammes"
    )
    total_harvested_weight = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal('0.1'),
        help_text="Poids total récolté en kilogrammes",
        required=False
    )
    harvest_notes = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
        help_text="Notes sur la récolte"
    )
    client_uuid = serializers.UUIDField(default=uuid.uuid4)
    created_offline = serializers.BooleanField(default=False)
    allow_pending_reconciliation = serializers.BooleanField(default=False)

    def validate_harvest_date(self, value):
        """Valide que la date de récolte est raisonnable."""
        from datetime import timedelta
        today = timezone.localdate()
        if value < today - timedelta(days=30):
            raise serializers.ValidationError(_("Date de récolte trop ancienne"))
        if value > today:
            raise serializers.ValidationError(_("Date de récolte ne peut être dans le futur"))
        return value

    def validate(self, attrs):
        harvest_date = attrs.get('harvest_date')
        final_harvested_at = attrs.get('final_harvested_at')
        if final_harvested_at is None:
            if harvest_date is None:
                raise serializers.ValidationError({
                    'final_harvested_at': _("La date et l'heure métier de récolte sont requises."),
                })
            # Legacy clients remain usable only for a harvest recorded today.  A
            # server timestamp must never fabricate the time of a backdated event.
            if harvest_date != timezone.localdate():
                raise serializers.ValidationError({
                    'final_harvested_at': _(
                        "La date et l'heure métier sont requises pour une récolte antidatée."
                    ),
                })
            final_harvested_at = timezone.now()
            attrs['final_harvested_at'] = final_harvested_at
        if timezone.is_naive(final_harvested_at):
            raise serializers.ValidationError({
                'final_harvested_at': _("Le datetime de récolte doit inclure un fuseau horaire."),
            })
        local_harvest_date = timezone.localtime(final_harvested_at).date()
        if harvest_date is not None and harvest_date != local_harvest_date:
            raise serializers.ValidationError({
                'harvest_date': _("La date de récolte doit correspondre au datetime métier."),
            })
        attrs['harvest_date'] = local_harvest_date
        return attrs


class PartialHarvestSerializer(serializers.Serializer):
    """Sérialiseur pour la création d'une récolte partielle."""

    harvest_date = serializers.DateField(help_text="Date de la récolte partielle")
    count_harvested = serializers.IntegerField(
        min_value=1,
        help_text="Nombre de poissons à récolter"
    )
    average_weight_g = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        min_value=Decimal('0.1'),
        help_text="Poids moyen des poissons récoltés (grammes)"
    )
    sale_price_fcfa_per_kg = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal('1'),
        required=False,
        allow_null=True,
        help_text="Prix de vente FCFA/kg (optionnel)"
    )
    notes = serializers.CharField(
        max_length=500,
        required=False,
        allow_blank=True,
        default='',
        help_text="Notes sur la récolte"
    )
    client_uuid = serializers.UUIDField(
        required=False,
        allow_null=True,
        help_text="UUID généré côté mobile pour déduplication"
    )
    created_offline = serializers.BooleanField(
        required=False,
        default=False,
        help_text="True si créé sans connexion"
    )

    def validate_harvest_date(self, value):
        today = timezone.localdate()
        if value < today - timedelta(days=30):
            raise serializers.ValidationError(_("Date de récolte trop ancienne"))
        if value > today + timedelta(days=7):
            raise serializers.ValidationError(_("Date de récolte trop éloignée dans le futur"))
        return value


class PartialHarvestReadSerializer(serializers.ModelSerializer):
    """Sérialiseur lecture pour une récolte partielle."""

    estimated_revenue_fcfa = serializers.SerializerMethodField()
    cycle_unit_allocation = serializers.SerializerMethodField()
    production_unit = serializers.SerializerMethodField()
    production_unit_name = serializers.SerializerMethodField()

    class Meta:
        model = PartialHarvest
        fields = [
            'id', 'harvest_date', 'count_harvested', 'average_weight_g',
            'total_weight_kg', 'sale_price_fcfa_per_kg', 'estimated_revenue_fcfa',
            'notes', 'client_uuid', 'created_offline', 'synced_at', 'created_at',
            'cycle_unit_allocation', 'production_unit', 'production_unit_name',
        ]
        read_only_fields = fields

    def get_estimated_revenue_fcfa(self, obj):
        if obj.sale_price_fcfa_per_kg:
            return round(float(obj.total_weight_kg) * float(obj.sale_price_fcfa_per_kg), 2)
        return None

    def get_cycle_unit_allocation(self, obj):
        return str(obj.cycle_unit_allocation_id) if obj.cycle_unit_allocation_id else None

    def get_production_unit(self, obj):
        allocation = getattr(obj, 'cycle_unit_allocation', None)
        return str(allocation.production_unit_id) if allocation and allocation.production_unit_id else None

    def get_production_unit_name(self, obj):
        allocation = getattr(obj, 'cycle_unit_allocation', None)
        if allocation and allocation.production_unit:
            return allocation.production_unit.name
        return None


class PartialHarvestResponseSerializer(serializers.Serializer):
    """Réponse d'une récolte partielle."""

    message = serializers.CharField()
    cycle = ProductionCycleSerializer()
    partial_harvest = PartialHarvestReadSerializer()


class CycleUnitAllocationHarvestResponseSerializer(serializers.Serializer):
    """Réponse d'une récolte complète d'une unité de production."""

    message = serializers.CharField()
    cycle = ProductionCycleSerializer()
    cycle_unit_allocation = CycleUnitAllocationSerializer()
    final_harvest = serializers.DictField()
    idempotent_replay = serializers.BooleanField()


class FinalHarvestOperationSerializer(serializers.ModelSerializer):
    """Contrat de lecture et de delta-sync d'une récolte finale."""

    cycle_id = serializers.UUIDField(source='allocation.cycle_id', read_only=True)
    allocation_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = FinalHarvestOperation
        fields = [
            'id', 'client_uuid', 'allocation_id', 'cycle_id', 'harvested_at',
            'declared_fish_count', 'declared_average_weight_g',
            'declared_biomass_kg', 'notes', 'reconciliation_status',
            'computed_count_before_harvest',
            'computed_biomass_before_harvest_kg', 'created_offline',
            'synced_at', 'created_at', 'updated_at',
        ]
        read_only_fields = fields


class CycleHarvestResponseSerializer(serializers.Serializer):
    """Réponse structurée d'une récolte globale de cycle."""

    message = serializers.CharField()
    cycle = ProductionCycleSerializer()
    final_harvest = FinalHarvestOperationSerializer(allow_null=True)
    final_harvests = FinalHarvestOperationSerializer(many=True)
    reconciliation_status = serializers.ChoiceField(choices=['pending', 'reconciled'])
    idempotent_replay = serializers.BooleanField()


class CycleUnitAllocationPartialHarvestResponseSerializer(serializers.Serializer):
    """Réponse d'une récolte partielle d'une unité de production."""

    message = serializers.CharField()
    cycle = ProductionCycleSerializer()
    cycle_unit_allocation = CycleUnitAllocationSerializer()
    partial_harvest = PartialHarvestReadSerializer()


class CycleStatisticsSerializer(serializers.Serializer):
    """
    Sérialiseur pour les statistiques détaillées d'un cycle.
    """
    cycle_id = serializers.UUIDField()
    cycle_name = serializers.CharField()
    days_active = serializers.IntegerField()
    current_metrics = serializers.DictField(help_text="Métriques actuelles du cycle")
    feed_metrics = serializers.DictField(help_text="Métriques d'alimentation")
    mortality_analysis = serializers.DictField(help_text="Analyse de la mortalité")
    growth_performance = serializers.ListField(help_text="Données de performance de croissance")
    environmental_summary = serializers.DictField(help_text="Analyse des conditions environnementales")
    estimated_costs = serializers.DictField(help_text="Coûts estimés")


class CycleComparisonSerializer(serializers.Serializer):
    """
    Sérialiseur pour la comparaison de cycles.
    """
    current_cycle = serializers.DictField(help_text="Résumé du cycle actuel")
    previous_cycles = serializers.ListField(help_text="Cycles précédents pour comparaison")
    historical_averages = serializers.DictField(help_text="Moyennes historiques")
    performance_ranking = serializers.CharField(help_text="Classement de performance")
    improvement_suggestions = serializers.ListField(help_text="Suggestions d'amélioration")


class DashboardSerializer(serializers.Serializer):
    """
    Sérialiseur pour les données du dashboard aquaculture.
    """
    active_cycles_count = serializers.IntegerField()
    total_biomass = serializers.FloatField()
    total_fish_count = serializers.IntegerField()
    average_fcr = serializers.FloatField()
    average_survival_rate = serializers.FloatField()
    
    active_cycles = ProductionCycleSerializer(many=True)
    recent_logs = CycleLogSerializer(many=True)
    current_feeding_plans = FeedingPlanSerializer(many=True)
    pending_notifications = GlobalNotificationSerializer(many=True)
    active_sanitary_issues = SanitaryLogSerializer(many=True)
    
    growth_chart_data = serializers.ListField()
    mortality_chart_data = serializers.ListField()
    feed_consumption_chart_data = serializers.ListField()
    
    environmental_alerts = serializers.ListField()
    feeding_recommendations = serializers.DictField()


class ProductionUnitDashboardSummarySerializer(serializers.Serializer):
    """Indicateurs opérationnels d'une allocation de cycle par unité."""

    estimated_current_fish_count = serializers.IntegerField()
    final_harvest_reconciliation_status = serializers.ChoiceField(
        choices=['pending', 'reconciled'],
        required=False,
        allow_null=True,
    )
    final_harvest_computed_count = serializers.IntegerField(required=False, allow_null=True)
    total_mortality_count = serializers.IntegerField()
    mortality_rate_pct = serializers.DecimalField(max_digits=6, decimal_places=2)
    total_feed_consumed_kg = serializers.DecimalField(max_digits=12, decimal_places=2)
    latest_average_weight_g = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    estimated_current_biomass_kg = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    biomass_data_available = serializers.BooleanField()
    biomass_source = serializers.ChoiceField(
        choices=['latest_weighing', 'allocation_current', 'initial_stocking', 'harvested'],
        required=False,
        allow_null=True,
    )
    estimated_market_value_fcfa = serializers.DecimalField(
        max_digits=16,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    last_daily_log_date = serializers.DateField(required=False, allow_null=True)
    days_since_last_log = serializers.IntegerField(required=False, allow_null=True)
    has_today_daily_log = serializers.BooleanField()
    active_sanitary_issues_count = serializers.IntegerField()
    last_sanitary_event_date = serializers.DateField(required=False, allow_null=True)
    has_unresolved_sanitary_issue = serializers.BooleanField()


class ProductionUnitDashboardSerializer(serializers.Serializer):
    """Payload du mini-dashboard d'une allocation de cycle par unité."""

    allocation = CycleUnitAllocationSerializer()
    summary = ProductionUnitDashboardSummarySerializer()
    recent_daily_logs = CycleLogSerializer(many=True)
    recent_sanitary_logs = SanitaryLogSerializer(many=True)


class CycleDashboardSummarySerializer(serializers.Serializer):
    """Indicateurs agrégés du dashboard global d'un cycle."""

    days_active = serializers.IntegerField()
    days_tracked = serializers.IntegerField()
    historical_count_gap = serializers.IntegerField()
    history_scope = serializers.ChoiceField(
        choices=[
            ProductionCycle.HISTORY_SCOPE_FULL_CYCLE,
            ProductionCycle.HISTORY_SCOPE_SINCE_TRACKING_START,
        ],
    )
    total_allocations = serializers.IntegerField()
    total_initial_fish_count = serializers.IntegerField()
    total_estimated_current_fish_count = serializers.IntegerField()
    total_mortality_count = serializers.IntegerField()
    mortality_rate_pct = serializers.DecimalField(max_digits=6, decimal_places=2)
    total_feed_consumed_kg = serializers.DecimalField(max_digits=12, decimal_places=2)
    estimated_current_biomass_kg = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    biomass_data_available = serializers.BooleanField()
    estimated_market_value_fcfa = serializers.DecimalField(
        max_digits=16,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    direct_production_cost_fcfa = serializers.DecimalField(max_digits=16, decimal_places=2)
    cycle_progress_pct = serializers.IntegerField(required=False, allow_null=True)
    days_remaining = serializers.IntegerField(required=False, allow_null=True)
    units_with_today_log_count = serializers.IntegerField()
    units_with_sanitary_issue_count = serializers.IntegerField()
    units_with_active_sanitary_issue_count = serializers.IntegerField()
    units_missing_today_log_count = serializers.IntegerField()
    units_missing_biomass_data_count = serializers.IntegerField()
    last_daily_log_date = serializers.DateField(required=False, allow_null=True)
    last_sanitary_event_date = serializers.DateField(required=False, allow_null=True)
    has_allocations = serializers.BooleanField()
    data_source = serializers.CharField()


class CycleDashboardSerializer(serializers.Serializer):
    """Payload du dashboard global d'un cycle de production."""

    cycle = ProductionCycleSerializer()
    summary = CycleDashboardSummarySerializer()
    allocations = ProductionUnitDashboardSerializer(many=True)


class CycleStorePendingOrderSerializer(serializers.Serializer):
    """Résumé d'une commande en cours affichée dans le Magasin."""

    id = serializers.UUIDField()
    order_number = serializers.CharField()
    status = serializers.CharField()
    delivery_method = serializers.CharField()
    total_bags = serializers.IntegerField()
    total_fcfa = serializers.CharField()
    estimated_feed_kg = serializers.CharField()
    created_at = serializers.DateTimeField()


class CycleStoreSummarySerializer(serializers.Serializer):
    """Indicateurs agrégés du Magasin de cycle."""

    manual_feed_kg = serializers.CharField()
    received_order_feed_kg = serializers.CharField()
    total_feed_added_kg = serializers.CharField()
    feed_consumed_kg = serializers.CharField()
    estimated_feed_remaining_kg = serializers.CharField()
    feed_expenses_fcfa = serializers.CharField()
    pending_orders_count = serializers.IntegerField()
    pending_order_amount_fcfa = serializers.CharField()
    pending_order_feed_kg = serializers.CharField()
    total_feed_needed_kg = serializers.CharField(allow_null=True)
    feed_need_remaining_kg = serializers.CharField(allow_null=True)
    secured_feed_kg = serializers.CharField(allow_null=True)
    feed_to_secure_kg = serializers.CharField(allow_null=True)
    stock_tracking_started_at = serializers.DateField(required=False, allow_null=True)
    unclassified_stock_kg = serializers.CharField()


class CycleStoreStockItemSerializer(serializers.Serializer):
    """Stock disponible regroupé par aliment et granulométrie."""

    feed_reference_id = serializers.UUIDField(required=False, allow_null=True)
    source = serializers.CharField(required=False, allow_null=True)
    species = serializers.CharField(required=False, allow_null=True)
    label = serializers.CharField()
    feed_size_mm = serializers.CharField(required=False, allow_null=True)
    quantity_added_kg = serializers.CharField()
    quantity_consumed_kg = serializers.CharField()
    quantity_available_kg = serializers.CharField()


class CycleStoreStockBySizeSerializer(serializers.Serializer):
    """Stock utilisable regroupé sans exposer son origine à l'utilisateur."""

    feed_size_mm = serializers.CharField()
    quantity_added_kg = serializers.CharField()
    quantity_consumed_kg = serializers.CharField()
    quantity_available_kg = serializers.CharField()


class CycleStoreUnclassifiedEntrySerializer(serializers.Serializer):
    """Ancienne entrée de stock nécessitant une classification humaine."""

    id = serializers.UUIDField()
    label = serializers.CharField()
    quantity_kg = serializers.CharField()
    quantity_added_kg = serializers.CharField()
    historical_consumption_kg = serializers.CharField()
    quantity_available_kg = serializers.CharField()
    source = serializers.CharField(required=False, allow_null=True)
    classification_reason = serializers.CharField(required=False, allow_null=True)
    catalog_product_id = serializers.UUIDField(required=False, allow_null=True)
    catalog_product_species = serializers.CharField(required=False, allow_null=True)
    catalog_product_pellet_size_mm = serializers.CharField(required=False, allow_null=True)


class CycleFeedRecommendationProductSerializer(serializers.Serializer):
    """Produit Commerce exact proposé pour le déficit d'une phase."""

    product_id = serializers.UUIDField()
    product_name = serializers.CharField()
    package_weight_kg = serializers.CharField()
    quantity_bags = serializers.IntegerField()
    total_kg = serializers.CharField()
    unit_price = serializers.CharField()
    total_price = serializers.CharField()
    brand = serializers.CharField()
    species = serializers.CharField()
    pellet_size_mm = serializers.CharField()


class CycleFeedRecommendationPhaseSerializer(serializers.Serializer):
    """Couverture et déficit calculés pour une phase future."""

    phase_name = serializers.CharField()
    phase_id = serializers.CharField()
    sequence = serializers.IntegerField()
    phase_status = serializers.ChoiceField(choices=['past', 'current', 'future', 'unknown'])
    planned_days_range = serializers.ListField(child=serializers.IntegerField())
    planned_weight_range_g = serializers.ListField(child=serializers.CharField())
    planned_consumption_kg = serializers.CharField()
    planned_duration_days = serializers.IntegerField()
    days_range = serializers.ListField(child=serializers.IntegerField())
    weight_range_g = serializers.ListField(child=serializers.CharField())
    pellet_size_mm = serializers.CharField()
    duration_days = serializers.IntegerField()
    actual_consumed_kg = serializers.CharField(allow_null=True)
    estimated_remaining_need_kg = serializers.CharField(allow_null=True)
    remaining_need_kg = serializers.CharField(allow_null=True)
    consumed_kg = serializers.CharField(allow_null=True)
    allocated_stock_kg = serializers.CharField(allow_null=True)
    allocated_pending_kg = serializers.CharField(allow_null=True)
    shortfall_kg = serializers.CharField(allow_null=True)
    surplus_kg = serializers.CharField(allow_null=True)
    products = CycleFeedRecommendationProductSerializer(many=True)
    total_bags = serializers.IntegerField(allow_null=True)
    total_price = serializers.CharField(allow_null=True)
    product_available = serializers.BooleanField()


class CycleFeedRecommendationSummarySerializer(serializers.Serializer):
    """Totaux du recalcul alimentaire courant."""

    planned_total_feed_kg = serializers.CharField(required=False, allow_null=True)
    estimated_remaining_need_kg = serializers.CharField(required=False, allow_null=True)
    compatible_stock_kg = serializers.CharField(required=False, allow_null=True)
    pending_order_kg = serializers.CharField(required=False, allow_null=True)
    feed_to_order_kg = serializers.CharField(required=False, allow_null=True)
    unclassified_stock_kg = serializers.CharField(required=False, allow_null=True)
    unclassified_consumption_kg = serializers.CharField(required=False, allow_null=True)


class CycleFeedRecommendationSerializer(serializers.Serializer):
    """Contrat public de recommandation alimentaire par phase."""

    cycle_id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=['available', 'incomplete', 'unavailable'])
    source = serializers.CharField()
    calculated_at = serializers.DateTimeField()
    summary = CycleFeedRecommendationSummarySerializer()
    feeding_phases = CycleFeedRecommendationPhaseSerializer(many=True)
    warnings = serializers.ListField(child=serializers.CharField())


class FarmFeedReferenceSerializer(serializers.ModelSerializer):
    catalog_product_id = serializers.UUIDField(source='catalog_product.id', read_only=True, allow_null=True)

    class Meta:
        model = FarmFeedReference
        fields = [
            'id', 'client_uuid', 'farm_profile', 'source', 'catalog_product_id', 'name',
            'species', 'pellet_size_mm', 'brand', 'protein_percentage', 'lipid_percentage',
            'package_weight_kg', 'created_offline', 'synced_at', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'client_uuid', 'farm_profile', 'source', 'catalog_product_id',
            'synced_at', 'created_at', 'updated_at',
        ]


class FarmFeedReferenceCreateSerializer(serializers.Serializer):
    farm_profile = serializers.UUIDField()
    source = serializers.ChoiceField(choices=FarmFeedReference.SOURCE_CHOICES)
    catalog_product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(),
        required=False,
        allow_null=True,
    )
    name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    species = serializers.ChoiceField(choices=SPECIES_CHOICES, required=False)
    pellet_size_mm = serializers.DecimalField(
        max_digits=4, decimal_places=2, min_value=Decimal('0.1'), max_value=Decimal('20'), required=False,
    )
    brand = serializers.CharField(max_length=100, required=False, allow_blank=True)
    protein_percentage = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0'), max_value=Decimal('100'),
        required=False, allow_null=True,
    )
    lipid_percentage = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0'), max_value=Decimal('100'),
        required=False, allow_null=True,
    )
    package_weight_kg = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=Decimal('0.01'), required=False, allow_null=True,
    )
    client_uuid = serializers.UUIDField(required=False, allow_null=True)
    created_offline = serializers.BooleanField(required=False, default=False)


class CycleStoreSerializer(serializers.Serializer):
    """Payload du Magasin du cycle."""

    cycle_id = serializers.UUIDField()
    calculation_status = serializers.ChoiceField(choices=['available', 'incomplete', 'unavailable'])
    calculation_source = serializers.CharField()
    calculated_at = serializers.DateTimeField()
    calculation_warnings = serializers.ListField(child=serializers.CharField())
    summary = CycleStoreSummarySerializer()
    status = serializers.CharField()
    stock_items = CycleStoreStockItemSerializer(many=True)
    stock_by_size = CycleStoreStockBySizeSerializer(many=True, required=False)
    available_pellet_sizes = serializers.ListField(child=serializers.CharField(), required=False)
    recommended_pellet_size_mm = serializers.CharField(required=False, allow_null=True)
    pending_orders = CycleStorePendingOrderSerializer(many=True)
    stock_tracking_started_at = serializers.DateField(required=False, allow_null=True)
    unclassified_entries = CycleStoreUnclassifiedEntrySerializer(many=True, required=False)


class CycleStoreManualStockSerializer(serializers.Serializer):
    """Sérialiseur de création manuelle du stock du Magasin."""

    class ExternalFeedSerializer(serializers.Serializer):
        name = serializers.CharField(max_length=200)
        species = serializers.ChoiceField(choices=SPECIES_CHOICES)
        pellet_size_mm = serializers.DecimalField(
            max_digits=4, decimal_places=2, min_value=Decimal('0.1'), max_value=Decimal('20'),
        )
        brand = serializers.CharField(max_length=100, required=False, allow_blank=True)
        protein_percentage = serializers.DecimalField(
            max_digits=5, decimal_places=2, min_value=Decimal('0'), max_value=Decimal('100'),
            required=False, allow_null=True,
        )
        lipid_percentage = serializers.DecimalField(
            max_digits=5, decimal_places=2, min_value=Decimal('0'), max_value=Decimal('100'),
            required=False, allow_null=True,
        )
        package_weight_kg = serializers.DecimalField(
            max_digits=8, decimal_places=2, min_value=Decimal('0.01'), required=False, allow_null=True,
        )
        client_uuid = serializers.UUIDField(required=False, allow_null=True)
        created_offline = serializers.BooleanField(required=False, default=False)

    feed_reference_id = serializers.UUIDField(required=False, allow_null=True)
    feed_reference_client_uuid = serializers.UUIDField(required=False, allow_null=True)
    external_feed = ExternalFeedSerializer(required=False, allow_null=True)
    label = serializers.CharField(max_length=200, required=False, allow_blank=True, write_only=True)
    feed_size_mm = serializers.DecimalField(
        max_digits=4, decimal_places=2, min_value=Decimal('0.1'), max_value=Decimal('20'),
        required=False, allow_null=True, write_only=True,
    )
    quantity_kg = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    total_cost_fcfa = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'))
    entry_date = serializers.DateField()
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True, default='')
    client_uuid = serializers.UUIDField(required=False, allow_null=True)
    created_offline = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        legacy_external = bool(attrs.get('label')) and attrs.get('feed_size_mm') is not None
        supplied_modes = sum(bool(value) for value in (
            attrs.get('feed_reference_id') or attrs.get('feed_reference_client_uuid'),
            attrs.get('external_feed'),
            legacy_external,
        ))
        if supplied_modes != 1:
            raise serializers.ValidationError(
                _('Fournissez soit une référence aliment, soit un nouvel aliment externe.')
            )
        return attrs


class CycleStoreClassificationSerializer(serializers.Serializer):
    entry_id = serializers.UUIDField()
    feed_reference_id = serializers.UUIDField()


class DashboardQuerySerializer(serializers.Serializer):
    """Validation des query params du dashboard aquaculture."""

    cycle_id = serializers.UUIDField(required=False)
    lightweight = serializers.BooleanField(required=False, default=False)


class ReportDispatchLogSerializer(serializers.ModelSerializer):
    """
    Serializer pour les journaux d'envoi des rapports.
    """

    channel_display = serializers.CharField(source='get_channel_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    dispatched_by_name = serializers.CharField(source='dispatched_by.display_name', read_only=True)

    class Meta:
        model = ReportDispatchLog
        fields = [
            'id',
            'channel',
            'channel_display',
            'status',
            'status_display',
            'recipient',
            'error_code',
            'error_message',
            'metadata',
            'dispatched_by',
            'dispatched_by_name',
            'created_at',
        ]
        read_only_fields = fields


class ProductionReportListSerializer(serializers.ModelSerializer):
    """
    Serializer léger pour listing des rapports.
    """

    report_type_display = serializers.CharField(source='get_report_type_display', read_only=True)
    scope_type_display = serializers.CharField(source='get_scope_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    farm_name = serializers.CharField(source='farm_profile.farm_name', read_only=True)
    cycle_scope_id = serializers.SerializerMethodField()
    cycle_scope_name = serializers.SerializerMethodField()
    scope_name = serializers.SerializerMethodField()
    scope_label = serializers.SerializerMethodField()

    class Meta:
        model = ProductionReport
        fields = [
            'id',
            'farm_profile',
            'farm_name',
            'report_type',
            'report_type_display',
            'scope_type',
            'scope_type_display',
            'scope_object_id',
            'scope_name',
            'scope_label',
            'period_start',
            'period_end',
            'status',
            'status_display',
            'cycle_scope_id',
            'cycle_scope_name',
            'generated_at',
            'validated_at',
            'email_status',
            'email_sent_at',
            'whatsapp_status',
            'whatsapp_shared_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields

    def get_cycle_scope_id(self, obj: ProductionReport) -> str | None:
        if not isinstance(obj.payload, dict):
            return str(obj.scope_object_id) if obj.scope_type == 'cycle' and obj.scope_object_id else None
        report_meta = obj.payload.get('report_meta')
        if isinstance(report_meta, dict):
            cycle_scope_id = report_meta.get('cycle_scope_id')
            if cycle_scope_id:
                return cycle_scope_id
        return str(obj.scope_object_id) if obj.scope_type == 'cycle' and obj.scope_object_id else None

    def get_scope_name(self, obj: ProductionReport) -> str | None:
        if not isinstance(obj.payload, dict):
            return None
        report_meta = obj.payload.get('report_meta')
        if not isinstance(report_meta, dict):
            return None
        return report_meta.get('scope_name') or report_meta.get('cycle_scope_name')

    def get_cycle_scope_name(self, obj: ProductionReport) -> str | None:
        if not isinstance(obj.payload, dict):
            return None
        report_meta = obj.payload.get('report_meta')
        if not isinstance(report_meta, dict):
            return None
        return report_meta.get('cycle_scope_name')

    def get_scope_label(self, obj: ProductionReport) -> str | None:
        if not isinstance(obj.payload, dict):
            return None
        report_meta = obj.payload.get('report_meta')
        if not isinstance(report_meta, dict):
            return None
        return report_meta.get('scope_label')


class ProductionReportDetailSerializer(ProductionReportListSerializer):
    """
    Serializer détaillé d'un rapport incluant payload et audit d'envoi.
    """

    validated_by_name = serializers.CharField(source='validated_by.display_name', read_only=True)
    dispatch_logs = ReportDispatchLogSerializer(many=True, read_only=True)
    pdf_url = serializers.SerializerMethodField()

    class Meta(ProductionReportListSerializer.Meta):
        model = ProductionReport
        fields = ProductionReportListSerializer.Meta.fields + [
            'payload',
            'pdf_file',
            'pdf_url',
            'validated_by',
            'validated_by_name',
            'dispatch_logs',
        ]

    def get_pdf_url(self, obj: ProductionReport) -> str | None:
        request = cast(Request | None, self.context.get('request'))
        if not obj.pdf_file:
            return None
        if request is None:
            return obj.pdf_file.url
        return request.build_absolute_uri(obj.pdf_file.url)


class MarkWhatsAppSharedSerializer(serializers.Serializer):
    """
    Payload pour marquage partage WhatsApp (audit).
    """

    recipient = serializers.CharField(required=False, allow_blank=True, max_length=255)
    metadata = serializers.DictField(required=False)


class GenerateReportSerializer(serializers.Serializer):
    """
    Payload de génération manuelle d'un rapport.
    """

    report_type = serializers.ChoiceField(choices=['daily', 'weekly', 'monthly'])
    reference_date = serializers.DateField(required=False)
    scope_type = serializers.ChoiceField(
        choices=['cycle', 'unit'],
        required=False,
        help_text="Portée canonique du rapport: cycle ou unit.",
    )
    scope = serializers.ChoiceField(
        choices=['cycle', 'unit'],
        required=False,
        write_only=True,
        help_text="Alias rétrocompatible de scope_type.",
    )
    cycle_id = serializers.UUIDField(required=False)
    cycle_unit_allocation_id = serializers.UUIDField(required=False)

    def validate(self, attrs):
        scope_type = attrs.get('scope_type')
        legacy_scope = attrs.get('scope')
        if scope_type and legacy_scope and scope_type != legacy_scope:
            raise serializers.ValidationError({
                'scope_type': _("scope_type et scope doivent désigner la même portée."),
            })
        scope = scope_type or legacy_scope or 'cycle'
        cycle_id = attrs.get('cycle_id')
        cycle_unit_allocation_id = attrs.get('cycle_unit_allocation_id')

        if scope == 'unit':
            if not cycle_unit_allocation_id:
                raise serializers.ValidationError(
                    {'cycle_unit_allocation_id': _("L'allocation de cycle est requise pour un rapport d'unité.")}
                )
            attrs.pop('scope', None)
            attrs['scope_type'] = 'unit'
            return attrs

        if scope == 'cycle':
            if not cycle_id:
                raise serializers.ValidationError(
                    {'cycle_id': _("Le cycle est obligatoire pour générer ce rapport.")}
                )
            if cycle_unit_allocation_id:
                raise serializers.ValidationError({
                    'cycle_unit_allocation_id': _(
                        "Une allocation ne peut pas être fournie pour un rapport de cycle."
                    ),
                })
            attrs.pop('scope', None)
            attrs['scope_type'] = 'cycle'
            return attrs

        raise serializers.ValidationError({'scope_type': _("Portée de rapport inconnue.")})


class SanitaryResolutionSerializer(serializers.Serializer):
    """Payload de resolution d'un incident sanitaire."""

    resolution_date = serializers.DateField(required=False)
    resolution_notes = serializers.CharField(required=False, allow_blank=True, max_length=500)


class ActiveSanitaryIssueGroupSerializer(serializers.Serializer):
    """Groupe de problemes sanitaires actifs pour un cycle."""

    cycle_name = serializers.CharField()
    cycle_id = serializers.UUIDField()
    issues = SanitaryLogSerializer(many=True)


class SyncRequestSerializer(serializers.Serializer):
    """
    Sérialiseur pour les requêtes de synchronisation.
    """
    cycle_logs = CycleLogSyncSerializer(many=True, required=False)
    sanitary_logs = SanitaryLogSerializer(many=True, required=False)
    new_cycles = ProductionCycleSerializer(many=True, required=False)
    calibration_tanks = CalibrationTankSerializer(many=True, required=False)
    calibration_operations = CalibrationRequestSerializer(many=True, required=False)
    final_harvests = serializers.ListField(
        child=serializers.DictField(),
        required=False,
    )
    last_sync = serializers.DateTimeField(required=False)
    device_id = serializers.CharField(max_length=100, required=False)
    client_id = serializers.CharField(max_length=100, required=False, write_only=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        client_id = attrs.pop('client_id', None)
        if client_id and 'device_id' not in attrs:
            attrs['device_id'] = client_id
        return attrs


class SyncAcceptedSerializer(serializers.Serializer):
    """UUID clients explicitement confirmés par collection."""

    cycles = serializers.ListField(child=serializers.UUIDField())
    cycle_logs = serializers.ListField(child=serializers.UUIDField())
    sanitary_logs = serializers.ListField(child=serializers.UUIDField())
    calibration_tanks = serializers.ListField(child=serializers.UUIDField())
    calibration_operations = serializers.ListField(child=serializers.UUIDField())
    final_harvests = serializers.ListField(child=serializers.UUIDField())


class SyncAcceptedItemSerializer(serializers.Serializer):
    """Résultat accepté par item pour les réponses partielles."""

    type = serializers.ChoiceField(choices=[
        'cycle',
        'cycle_log',
        'sanitary_log',
        'calibration_tank',
        'calibration_operation',
        'final_harvest',
    ])
    client_uuid = serializers.UUIDField()
    status = serializers.ChoiceField(choices=['accepted'])
    server_id = serializers.UUIDField(required=False)
    operation_id = serializers.UUIDField(required=False)
    operation_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
    )
    operation_client_uuids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
    )
    reconciliation_status = serializers.ChoiceField(
        choices=['pending', 'reconciled'],
        required=False,
    )


class SyncResponseSerializer(serializers.Serializer):
    """
    Sérialiseur pour les réponses de synchronisation.
    """
    status = serializers.CharField()
    timestamp = serializers.DateTimeField()
    processed = serializers.DictField()
    errors = serializers.ListField()
    accepted = SyncAcceptedSerializer()
    items = SyncAcceptedItemSerializer(many=True)
    server_updates = serializers.DictField()


class SyncValidationErrorResponseSerializer(serializers.Serializer):
    """Reponse d'erreur de validation pour la synchronisation."""

    status = serializers.CharField()
    errors = serializers.ListField()
    feed_reference_id = serializers.UUIDField(required=False, allow_null=True)
    source = serializers.CharField(required=False, allow_null=True)
    species = serializers.CharField(required=False, allow_null=True)
