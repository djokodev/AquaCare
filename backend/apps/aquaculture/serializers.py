"""
Sérialiseurs DRF pour le module aquaculture de MAVECAM AquaCare.

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
from rest_framework import serializers
from decimal import Decimal
from datetime import date
from django.utils.translation import gettext_lazy as _
from django.utils import timezone

from .models import (
    ProductionCycle, CycleLog, FeedingPlan, SanitaryLog,
    NutritionalGuide, CycleMetrics
)
# Notification model moved to apps/notifications/models.py
from .domain.calculators import AquacultureCalculator
from apps.notifications.serializers import NotificationSerializer as GlobalNotificationSerializer


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
    current_density_kg_m3 = serializers.SerializerMethodField()

    # Champs calculés depuis CycleMetrics (métriques avancées)
    daily_growth_rate = serializers.SerializerMethodField()
    specific_growth_rate = serializers.SerializerMethodField()
    average_daily_feed = serializers.SerializerMethodField()
    performance_score = serializers.SerializerMethodField()

    # Champs calculés pour coûts
    total_feed_cost = serializers.SerializerMethodField()

    # Champs display
    species_display = serializers.CharField(source='get_species_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    farm_name = serializers.CharField(source='farm_profile.farm_name', read_only=True)

    class Meta:
        model = ProductionCycle
        fields = [
            'id', 'farm_profile', 'cycle_name', 'species', 'species_display',
            'pond_identifier', 'pond_surface_m2', 'pond_volume_m3',
            'start_date', 'initial_count', 'initial_average_weight', 'initial_biomass',
            'current_count', 'current_average_weight', 'current_biomass',
            'total_feed_consumed', 'end_date', 'final_count', 'final_average_weight',
            'final_biomass', 'survival_rate', 'fcr', 'status', 'status_display',
            'days_active', 'current_density_kg_m3', 'farm_name',
            # Métriques CycleMetrics exposées
            'daily_growth_rate', 'specific_growth_rate', 'average_daily_feed', 'performance_score',
            # Coûts calculés
            'total_feed_cost',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'farm_profile', 'initial_biomass', 'current_count', 'current_average_weight',
            'current_biomass', 'total_feed_consumed', 'survival_rate', 'fcr',
            'created_at', 'updated_at'
        ]

    def get_days_active(self, obj):
        """Calcule les jours depuis le début du cycle."""
        return obj.days_active()

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

    def get_total_feed_cost(self, obj):
        """
        Calcule le coût total de l'aliment consommé (FCFA).
        Utilise prix configurable depuis FarmProfile ou défaut 500 FCFA/kg.
        Évite hardcoding frontend - Backend gère prix configurable.
        """
        if not obj.total_feed_consumed or obj.total_feed_consumed <= 0:
            return None

        # Récupère prix depuis FarmProfile ou défaut
        price_per_kg = Decimal('500')  # Défaut FCFA/kg
        if hasattr(obj.farm_profile, 'default_feed_price_per_kg') and obj.farm_profile.default_feed_price_per_kg:
            price_per_kg = obj.farm_profile.default_feed_price_per_kg

        # Calcul via domain calculator
        total_cost = AquacultureCalculator.calculate_feed_cost(
            obj.total_feed_consumed,
            price_per_kg
        )
        return float(total_cost)

    def validate(self, attrs):
        if attrs.get('end_date') and attrs.get('start_date'):
            if attrs['end_date'] < attrs['start_date']:
                raise serializers.ValidationError({
                    'end_date': _("La date de fin doit être après la date de début")
                })

        # Validate reasonable fish count
        if attrs.get('initial_count', 0) > 100000:
            raise serializers.ValidationError({
                'initial_count': _("Le nombre initial de poissons semble trop élevé")
            })

        # Validate pond capacity
        if attrs.get('pond_surface_m2') and attrs.get('initial_count'):
            density_per_m2 = attrs['initial_count'] / float(attrs['pond_surface_m2'])
            if density_per_m2 > 500:  # Max 500 fish per m2 initially
                raise serializers.ValidationError({
                    'initial_count': _("Densité initiale trop élevée (max 500 poissons/m²)")
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


class CycleLogSerializer(serializers.ModelSerializer):
    """
    Sérialiseur pour les logs quotidiens de cycle avec validation pour synchronisation offline.
    """
    # Calculated fields
    calculated_average_weight = serializers.SerializerMethodField()
    
    class Meta:
        model = CycleLog
        fields = [
            'id', 'client_uuid', 'cycle', 'log_date', 'log_time',
            'mortality_count', 'mortality_reason', 'sample_count',
            'sample_total_weight', 'average_weight', 'calculated_average_weight',
            'feed_quantity', 'feed_type', 'feeding_times',
            'water_temperature', 'dissolved_oxygen', 'ph_level', 'ammonia_level',
            'observations', 'created_offline', 'synced_at', 'created_at'
        ]
        read_only_fields = ['id', 'log_time', 'synced_at', 'created_at']

    def get_calculated_average_weight(self, obj):
        """Calcule le poids moyen à partir des données d'échantillonnage."""
        if obj.sample_count and obj.sample_total_weight:
            return float(obj.sample_total_weight / obj.sample_count)
        return None

    def validate(self, attrs):
        """Valide la cohérence des données de log et les règles métier."""
        cycle = attrs.get('cycle')
        log_date = attrs.get('log_date')

        # Validate log date within cycle period
        if cycle and log_date:
            if log_date < cycle.start_date:
                raise serializers.ValidationError({
                    'log_date': _("La date du log ne peut être avant le début du cycle")
                })
            if cycle.end_date and log_date > cycle.end_date:
                raise serializers.ValidationError({
                    'log_date': _("La date du log ne peut être après la fin du cycle")
                })

        # Validate sampling data consistency
        if attrs.get('sample_count') and attrs.get('sample_total_weight'):
            calculated_avg = attrs['sample_total_weight'] / attrs['sample_count']
            if attrs.get('average_weight'):
                # Allow 10% tolerance for manual entry errors
                tolerance = abs(calculated_avg - attrs['average_weight']) / calculated_avg
                if tolerance > 0.1:
                    raise serializers.ValidationError({
                        'average_weight': _("Le poids moyen ne correspond pas à l'échantillon (écart > 10%)")
                    })
            else:
                # Auto-calculate if not provided
                attrs['average_weight'] = calculated_avg

        # Validate mortality doesn't exceed current fish count
        if attrs.get('mortality_count') and cycle:
            if attrs['mortality_count'] > cycle.current_count:
                raise serializers.ValidationError({
                    'mortality_count': _("Le nombre de morts ne peut dépasser l'effectif actuel")
                })

        # Validate environmental parameters
        if attrs.get('water_temperature'):
            temp = attrs['water_temperature']
            if temp < 15 or temp > 40:
                raise serializers.ValidationError({
                    'water_temperature': _("Température hors plage normale (15-40°C)")
                })

        return attrs


class BulkCycleLogSerializer(serializers.ListSerializer):
    """
    Sérialiseur bulk pour synchronisation offline de multiples logs.
    Gère la déduplication basée sur client_uuid.
    """
    def create(self, validated_data):
        """Crée plusieurs logs avec déduplication."""
        logs = []
        processed_uuids = {}  # Track UUIDs processed in this batch
        
        for item in validated_data:
            client_uuid = item.get('client_uuid')
            
            # Deduplication based on client_uuid
            if client_uuid:
                # First check if we already processed this UUID in this batch
                if client_uuid in processed_uuids:
                    # Update the already processed log
                    existing_log = processed_uuids[client_uuid]
                    for attr, value in item.items():
                        if attr not in ['id', 'created_at']:
                            setattr(existing_log, attr, value)
                    existing_log.synced_at = timezone.now()
                    existing_log.save()
                    continue
                
                # Then check database for existing log
                existing = CycleLog.objects.filter(client_uuid=client_uuid).first()
                if existing:
                    # Update existing log instead of creating duplicate
                    for attr, value in item.items():
                        if attr not in ['id', 'created_at']:
                            setattr(existing, attr, value)
                    existing.synced_at = timezone.now()
                    existing.save()
                    logs.append(existing)
                    processed_uuids[client_uuid] = existing
                    continue
            
            # Create new log
            item['synced_at'] = timezone.now()
            log = CycleLog.objects.create(**item)
            logs.append(log)
            if client_uuid:
                processed_uuids[client_uuid] = log
        
        return logs


class CycleLogSyncSerializer(CycleLogSerializer):
    """
    Sérialiseur spécialisé pour les endpoints de synchronisation.
    Utilise un sérialiseur de liste bulk pour les opérations par lot.
    """
    class Meta(CycleLogSerializer.Meta):
        list_serializer_class = BulkCycleLogSerializer


class FeedingPlanSerializer(serializers.ModelSerializer):
    """
    Sérialiseur pour les plans d'alimentation avec calculs automatiques.
    """
    cycle_name = serializers.CharField(source='cycle.cycle_name', read_only=True)
    total_week_feed = serializers.SerializerMethodField()
    feed_per_meal_display = serializers.SerializerMethodField()

    class Meta:
        model = FeedingPlan
        fields = [
            'id', 'cycle', 'cycle_name', 'week_number', 'estimated_fish_count',
            'average_weight', 'biomass', 'daily_feed_amount', 'feeding_rate',
            'meals_per_day', 'feed_per_meal', 'total_week_feed',
            'recommended_feed_type', 'feed_size_mm', 'protein_percentage',
            'start_date', 'end_date', 'is_active', 'feed_per_meal_display',
            'created_at'
        ]
        read_only_fields = ['id', 'created_at']

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
        # Ensure week dates are consistent
        if attrs.get('start_date') and attrs.get('end_date'):
            if (attrs['end_date'] - attrs['start_date']).days != 6:
                raise serializers.ValidationError({
                    'end_date': _("La période doit être exactement 7 jours")
                })

        return attrs


class SanitaryLogSerializer(serializers.ModelSerializer):
    """
    Sérialiseur pour les logs sanitaires avec support photo.
    """
    cycle_name = serializers.CharField(source='cycle.cycle_name', read_only=True)
    event_type_display = serializers.CharField(source='get_event_type_display', read_only=True)
    photo_url = serializers.SerializerMethodField()
    days_since_event = serializers.SerializerMethodField()

    class Meta:
        model = SanitaryLog
        fields = [
            'id', 'cycle', 'cycle_name', 'event_date', 'event_type',
            'event_type_display', 'symptoms', 'affected_count',
            'treatment_applied', 'medication_used', 'dosage',
            'treatment_duration_days', 'photo', 'photo_url',
            'resolved', 'resolution_date', 'notes', 'created_offline',
            'days_since_event', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_photo_url(self, obj):
        """Retourne l'URL complète de la photo si disponible."""
        if obj.photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.photo.url)
        return None

    def get_days_since_event(self, obj):
        """Calcule les jours depuis que l'événement s'est produit."""
        return (date.today() - obj.event_date).days

    def validate(self, attrs):
        """Valide les données du log sanitaire."""
        # Validate resolution date
        if attrs.get('resolved') and not attrs.get('resolution_date'):
            attrs['resolution_date'] = date.today()
        
        if attrs.get('resolution_date') and attrs.get('event_date'):
            if attrs['resolution_date'] < attrs['event_date']:
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
        help_text="Date de récolte du cycle"
    )
    final_count = serializers.IntegerField(
        min_value=0,
        help_text="Nombre final de poissons récoltés"
    )
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
        help_text="Poids total récolté en kilogrammes"
    )
    harvest_notes = serializers.CharField(
        max_length=500,
        required=False,
        help_text="Notes sur la récolte"
    )


class CycleStatisticsSerializer(serializers.Serializer):
    """
    Sérialiseur pour les statistiques détaillées d'un cycle.
    """
    current_metrics = serializers.DictField(
        help_text="Métriques actuelles du cycle"
    )
    feed_metrics = serializers.DictField(
        help_text="Métriques d'alimentation"
    )
    mortality_analysis = serializers.DictField(
        help_text="Analyse de la mortalité"
    )
    growth_performance = serializers.ListField(
        help_text="Données de performance de croissance"
    )
    environmental_analysis = serializers.DictField(
        help_text="Analyse des conditions environnementales"
    )


class CycleComparisonSerializer(serializers.Serializer):
    """
    Sérialiseur pour la comparaison de cycles.
    """
    current_cycle = serializers.DictField(
        help_text="Résumé du cycle actuel"
    )
    previous_cycles = serializers.ListField(
        help_text="Cycles précédents pour comparaison"
    )
    historical_averages = serializers.DictField(
        help_text="Moyennes historiques"
    )
    performance_ranking = serializers.DictField(
        help_text="Classement de performance"
    )
    improvement_suggestions = serializers.ListField(
        help_text="Suggestions d'amélioration"
    )


# =============================================================================
# NOTIFICATION SERIALIZER REMOVED
# =============================================================================
# NotificationSerializer a été déplacé vers apps/notifications/serializers.py
# Utilisez apps.notifications.serializers.NotificationSerializer à la place
# =============================================================================

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


class SyncRequestSerializer(serializers.Serializer):
    """
    Sérialiseur pour les requêtes de synchronisation.
    """
    cycle_logs = CycleLogSyncSerializer(many=True, required=False)
    sanitary_logs = SanitaryLogSerializer(many=True, required=False)
    new_cycles = ProductionCycleSerializer(many=True, required=False)
    last_sync = serializers.DateTimeField(required=False)
    device_id = serializers.CharField(max_length=100, required=False)


class SyncResponseSerializer(serializers.Serializer):
    """
    Sérialiseur pour les réponses de synchronisation.
    """
    status = serializers.CharField()
    timestamp = serializers.DateTimeField()
    processed = serializers.DictField()
    errors = serializers.ListField()
    server_updates = serializers.DictField()


class HarvestSerializer(serializers.Serializer):
    """
    Sérialiseur pour les données de récolte/finalisation de cycle.
    """
    harvest_date = serializers.DateField()
    final_count = serializers.IntegerField(min_value=0)
    final_average_weight = serializers.DecimalField(
        max_digits=6, 
        decimal_places=2, 
        min_value=Decimal('0.1')
    )
    harvest_notes = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate_harvest_date(self, value):
        """Valide que la date de récolte est raisonnable."""
        from datetime import timedelta
        if value < date.today() - timedelta(days=30):
            raise serializers.ValidationError(_("Date de récolte trop ancienne"))
        if value > date.today():
            raise serializers.ValidationError(_("Date de récolte ne peut être dans le futur"))
        return value


class CycleStatisticsSerializer(serializers.Serializer):
    """
    Sérialiseur pour les statistiques détaillées et analytics de cycle.
    """
    cycle_id = serializers.UUIDField()
    cycle_name = serializers.CharField()
    days_active = serializers.IntegerField()
    
    # Current metrics
    current_metrics = serializers.DictField()
    
    # Performance analysis
    feed_metrics = serializers.DictField()
    mortality_analysis = serializers.DictField()
    growth_performance = serializers.ListField()
    
    # Environmental analysis
    environmental_summary = serializers.DictField()
    
    # Cost analysis
    estimated_costs = serializers.DictField()


class CycleComparisonSerializer(serializers.Serializer):
    """
    Sérialiseur pour comparer les performances de cycles.
    """
    current_cycle = serializers.DictField()
    previous_cycles = serializers.ListField()
    historical_averages = serializers.DictField()
    performance_ranking = serializers.CharField()
    improvement_suggestions = serializers.ListField()
