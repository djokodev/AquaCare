"""
ViewSets DRF et vues API pour le module aquaculture de MAVECAM AquaCare.

Fournit une API REST complète pour la gestion de la pisciculture avec architecture offline-first.
Tous les endpoints supportent l'authentification JWT et les permissions basées sur les fermes.

Fonctionnalités principales :
- CRUD complet pour tous les modèles aquacoles
- Endpoints spécialisés (récolte, statistiques, comparaison cycles)
- Synchronisation bulk pour app mobile offline
- Dashboard agrégé pour interface mobile
- Gestion uploads photos pour logs sanitaires
- Analytics avancés et métriques de performance

Architecture offline-first avec déduplication UUID et gestion conflits.
Permissions strictes : utilisateurs accèdent uniquement aux données de leur ferme.
"""
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django.db.models import Avg, Sum, Q, F, Min, Max
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from datetime import date, timedelta
from decimal import Decimal
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter, OpenApiExample
from drf_spectacular.types import OpenApiTypes

from .models import (
    ProductionCycle, CycleLog, FeedingPlan, SanitaryLog,
    NutritionalGuide, CycleMetrics, Notification
)
from .serializers import (
    ProductionCycleSerializer, CycleLogSerializer, CycleLogSyncSerializer,
    FeedingPlanSerializer, SanitaryLogSerializer, NutritionalGuideSerializer,
    CycleMetricsSerializer, NotificationSerializer, DashboardSerializer,
    HarvestSerializer, CycleStatisticsSerializer, CycleComparisonSerializer,
    SyncRequestSerializer, SyncResponseSerializer
)
from .calculators import AquacultureCalculator


@extend_schema_view(
    list=extend_schema(
        summary="Lister les cycles de production",
        description="""
        Retourne la liste de tous les cycles de production de la ferme de l'utilisateur authentifié.
        Supporte le filtrage par espèce, statut et période.
        """,
        parameters=[
            OpenApiParameter(
                name='species',
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description='Filtrer par espèce (clarias, tilapia)',
                enum=['clarias', 'tilapia']
            ),
            OpenApiParameter(
                name='status',
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description='Filtrer par statut du cycle',
                enum=['active', 'harvested', 'terminated']
            ),
            OpenApiParameter(
                name='start_date_after',
                type=OpenApiTypes.DATE,
                location=OpenApiParameter.QUERY,
                description='Cycles commencés après cette date (YYYY-MM-DD)'
            ),
        ],
        examples=[
            OpenApiExample(
                'Cycles actifs de Clarias',
                value={
                    'count': 2,
                    'results': [
                        {
                            'id': '123e4567-e89b-12d3-a456-426614174000',
                            'cycle_name': 'Cycle Clarias P1-2025',
                            'species': 'clarias',
                            'status': 'active',
                            'days_active': 45,
                            'current_biomass': '245.60'
                        }
                    ]
                }
            )
        ]
    ),
    create=extend_schema(
        summary="Créer un nouveau cycle de production",
        description="""
        Crée un nouveau cycle de production aquacole.
        Calcule automatiquement la biomasse initiale et initialise les métriques.
        """,
        examples=[
            OpenApiExample(
                'Nouveau cycle Clarias',
                value={
                    'cycle_name': 'Cycle Clarias P1-2025',
                    'species': 'clarias',
                    'pond_identifier': 'Bassin A1',
                    'pond_surface_m2': 500.00,
                    'pond_volume_m3': 600.00,
                    'start_date': '2025-08-20',
                    'initial_count': 5000,
                    'initial_average_weight': 15.50
                }
            )
        ]
    ),
    retrieve=extend_schema(
        summary="Détails d'un cycle de production",
        description="Retourne les détails complets d'un cycle avec métriques calculées."
    ),
    update=extend_schema(
        summary="Mettre à jour un cycle de production",
        description="Met à jour les paramètres d'un cycle actif (pond, objectifs, etc.)."
    ),
    partial_update=extend_schema(
        summary="Mise à jour partielle d'un cycle",
        description="Met à jour partiellement un cycle de production."
    ),
    destroy=extend_schema(
        summary="Supprimer un cycle de production",
        description="Supprime définitivement un cycle et toutes ses données associées."
    )
)
class ProductionCycleViewSet(viewsets.ModelViewSet):
    """
    Gestion complète des cycles de production aquacole.
    
    Un cycle représente l'élevage de poissons depuis l'empoissonnement jusqu'à la récolte.
    Inclut le suivi quotidien de la croissance, mortalité, alimentation et paramètres environnementaux.
    """
    serializer_class = ProductionCycleSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Retourne les cycles uniquement pour la ferme de l'utilisateur authentifié."""
        queryset = ProductionCycle.objects.filter(
            farm_profile__user=self.request.user
        ).select_related('farm_profile').prefetch_related(
            'logs', 'feeding_plans', 'sanitary_logs', 'metrics'
        )

        # Filtrage par status si spécifié dans les query parameters
        status_filter = self.request.query_params.get('status', None)
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        return queryset
    
    def perform_create(self, serializer):
        """Assure que le cycle est créé pour le profil de ferme de l'utilisateur."""
        serializer.save(farm_profile=self.request.user.farm_profile)
    
    @extend_schema(
        summary="Finaliser un cycle (récolte)",
        description="""
        Marque un cycle comme récolté et calcule les métriques finales de performance.
        Calcule automatiquement le taux de survie, FCR et autres indicateurs clés.
        """,
        request=HarvestSerializer,
        responses={
            200: ProductionCycleSerializer,
            400: OpenApiExample(
                'Cycle déjà récolté',
                value={'error': 'Ce cycle a déjà été récolté'}
            )
        },
        examples=[
            OpenApiExample(
                'Données de récolte',
                value={
                    'harvest_date': '2025-12-15',
                    'final_count': 4850,
                    'final_average_weight': 285.00,
                    'total_harvested_weight': 1382.25,
                    'harvest_notes': 'Excellente croissance, mortalité faible'
                }
            )
        ]
    )
    @action(detail=True, methods=['post'])
    def harvest(self, request, pk=None):
        """
        Finalise un cycle de production (récolte).
        """
        cycle = self.get_object()
        
        if cycle.status == 'harvested':
            return Response(
                {'error': _('Ce cycle a déjà été récolté')},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate harvest data
        serializer = HarvestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        harvest_data = serializer.validated_data
        
        # Update cycle with harvest data
        cycle.end_date = harvest_data['harvest_date']
        cycle.final_count = harvest_data['final_count']
        cycle.final_average_weight = harvest_data['final_average_weight']
        cycle.final_biomass = AquacultureCalculator.calculate_biomass(
            cycle.final_count,
            cycle.final_average_weight
        )
        cycle.status = 'harvested'
        
        # Calculate final metrics
        cycle.survival_rate = AquacultureCalculator.calculate_survival_rate(
            cycle.initial_count,
            cycle.final_count
        )
        
        total_weight_gain = cycle.final_biomass - cycle.initial_biomass
        if total_weight_gain > 0 and cycle.total_feed_consumed > 0:
            cycle.fcr = AquacultureCalculator.calculate_fcr(
                cycle.total_feed_consumed,
                total_weight_gain
            )
        
        cycle.save()
        
        return Response(
            {
                'message': _('Cycle récolté avec succès'),
                'cycle': ProductionCycleSerializer(cycle).data
            },
            status=status.HTTP_200_OK
        )
    
    @extend_schema(
        summary="Statistiques détaillées d'un cycle",
        description="""
        Retourne une analyse complète des performances d'un cycle de production.
        Inclut métriques de croissance, mortalité, alimentation, coûts et comparaisons.
        """,
        responses={
            200: CycleStatisticsSerializer,
            404: OpenApiExample(
                'Cycle non trouvé',
                value={'detail': 'Cycle non trouvé'}
            )
        },
        examples=[
            OpenApiExample(
                'Statistiques complètes',
                value={
                    'current_metrics': {
                        'survival_rate': 97.5,
                        'biomass': 245.60,
                        'average_weight': 52.5,
                        'fcr': 1.25,
                        'daily_growth_rate': 0.85,
                        'specific_growth_rate': 2.1,
                        'stocking_density': 12.8
                    },
                    'feed_metrics': {
                        'total_consumed': 315.75,
                        'average_daily': 7.89,
                        'cost_estimate': 473625,
                        'feed_efficiency': 1.25
                    }
                }
            )
        ]
    )
    @action(detail=True, methods=['get'])
    def statistics(self, request, pk=None):
        """
        Obtient les statistiques détaillées pour un cycle de production.
        """
        cycle = self.get_object()
        
        # Calculate cycle duration
        end_date = cycle.end_date or date.today()
        days_active = (end_date - cycle.start_date).days
        
        # Current metrics
        current_metrics = {
            'survival_rate': float(cycle.survival_rate or AquacultureCalculator.calculate_survival_rate(
                cycle.initial_count, cycle.current_count
            )),
            'biomass': float(cycle.current_biomass),
            'average_weight': float(cycle.current_average_weight),
            'fcr': float(cycle.fcr or 0),
            'daily_growth_rate': float(AquacultureCalculator.calculate_daily_growth_rate(
                cycle.initial_average_weight,
                cycle.current_average_weight,
                days_active
            )),
            'specific_growth_rate': float(AquacultureCalculator.calculate_specific_growth_rate(
                cycle.initial_average_weight,
                cycle.current_average_weight,
                days_active
            )),
            'stocking_density': float(cycle.current_density_kg_m3() or 0)
        }
        
        # Feed metrics
        feed_metrics = {
            'total_consumed': float(cycle.total_feed_consumed),
            'average_daily': float(cycle.total_feed_consumed / days_active) if days_active > 0 else 0,
            'cost_estimate': float(cycle.total_feed_consumed) * 1500,  # 1500 FCFA/kg estimate
            'feed_efficiency': float(cycle.fcr) if cycle.fcr else None
        }
        
        # Mortality analysis
        mortality_analysis = self._analyze_mortality(cycle)
        
        # Growth performance
        growth_performance = self._analyze_growth(cycle)
        
        # Environmental summary
        environmental_summary = self._analyze_environment(cycle)
        
        statistics = {
            'cycle_id': cycle.id,
            'cycle_name': cycle.cycle_name,
            'days_active': days_active,
            'current_metrics': current_metrics,
            'feed_metrics': feed_metrics,
            'mortality_analysis': mortality_analysis,
            'growth_performance': growth_performance,
            'environmental_summary': environmental_summary,
            'estimated_costs': {
                'feed_cost': feed_metrics['cost_estimate'],
                'cost_per_kg': feed_metrics['cost_estimate'] / float(cycle.current_biomass) if cycle.current_biomass > 0 else 0
            }
        }
        
        return Response(statistics)
    
    @extend_schema(
        summary="Comparaison avec cycles précédents",
        description="""
        Compare les performances du cycle actuel avec les 3 derniers cycles récoltés de la même espèce.
        Inclut moyennes historiques, classement de performance et suggestions d'amélioration.
        """,
        responses={
            200: CycleComparisonSerializer,
            404: OpenApiExample(
                'Cycle non trouvé',
                value={'detail': 'Cycle non trouvé'}
            )
        },
        examples=[
            OpenApiExample(
                'Comparaison complète',
                value={
                    'current_cycle': {
                        'id': '456e7890-e89b-12d3-a456-426614174001',
                        'cycle_name': 'Cycle Clarias P1-2025',
                        'survival_rate': 97.5,
                        'fcr': 1.25,
                        'days_active': 85
                    },
                    'previous_cycles': [
                        {
                            'cycle_name': 'Cycle Clarias Q4-2024',
                            'survival_rate': 95.2,
                            'fcr': 1.35,
                            'duration_days': 90
                        }
                    ],
                    'historical_averages': {
                        'survival_rate': 96.1,
                        'fcr': 1.31,
                        'final_weight': 275.0,
                        'duration_days': 87
                    },
                    'performance_ranking': 'excellent',
                    'improvement_suggestions': [
                        'Maintenir la stratégie d\'alimentation actuelle',
                        'Surveiller la densité en fin de cycle'
                    ]
                }
            )
        ]
    )
    @action(detail=True, methods=['get'])
    def comparison(self, request, pk=None):
        """
        Compare le cycle avec les cycles précédents de la même espèce.
        """
        current_cycle = self.get_object()
        
        # Get previous cycles of same species
        previous_cycles = ProductionCycle.objects.filter(
            farm_profile=current_cycle.farm_profile,
            species=current_cycle.species,
            status='harvested'
        ).exclude(id=current_cycle.id).order_by('-end_date')[:3]
        
        # Calculate historical averages
        historical_avg = ProductionCycle.objects.filter(
            farm_profile=current_cycle.farm_profile,
            species=current_cycle.species,
            status='harvested'
        ).aggregate(
            avg_survival_rate=Avg('survival_rate'),
            avg_fcr=Avg('fcr'),
            avg_final_weight=Avg('final_average_weight'),
            avg_duration=Avg(F('end_date') - F('start_date'))
        )
        
        comparison_data = {
            'current_cycle': self._get_cycle_summary(current_cycle),
            'previous_cycles': [
                self._get_cycle_summary(cycle) for cycle in previous_cycles
            ],
            'historical_averages': {
                'survival_rate': float(historical_avg['avg_survival_rate'] or 0),
                'fcr': float(historical_avg['avg_fcr'] or 0),
                'final_weight': float(historical_avg['avg_final_weight'] or 0),
                'duration_days': historical_avg['avg_duration'].days if historical_avg['avg_duration'] else 0
            },
            'performance_ranking': self._calculate_performance_ranking(current_cycle, previous_cycles),
            'improvement_suggestions': self._generate_improvement_suggestions(current_cycle, historical_avg)
        }
        
        return Response(comparison_data)
    
    def _analyze_mortality(self, cycle):
        """Analyse les schémas de mortalité pour le cycle."""
        logs = cycle.logs.filter(mortality_count__gt=0)
        
        total_mortality = logs.aggregate(Sum('mortality_count'))['mortality_count__sum'] or 0
        
        # Weekly mortality breakdown
        weekly_mortality = {}
        for log in logs:
            week = (log.log_date - cycle.start_date).days // 7 + 1
            if week not in weekly_mortality:
                weekly_mortality[week] = 0
            weekly_mortality[week] += log.mortality_count
        
        # Main causes
        main_causes = logs.values('mortality_reason').annotate(
            count=Sum('mortality_count')
        ).order_by('-count')[:5]
        
        return {
            'total': total_mortality,
            'percentage': (total_mortality / cycle.initial_count * 100) if cycle.initial_count > 0 else 0,
            'by_week': weekly_mortality,
            'main_causes': list(main_causes),
            'daily_average': total_mortality / cycle.days_active() if cycle.days_active() > 0 else 0
        }
    
    def _analyze_growth(self, cycle):
        """Analyse les schémas de croissance pour le cycle."""
        logs = cycle.logs.filter(average_weight__isnull=False).order_by('log_date')
        
        growth_data = []
        for log in logs:
            days_elapsed = (log.log_date - cycle.start_date).days
            daily_gain = float(log.average_weight - cycle.initial_average_weight) / days_elapsed if days_elapsed > 0 else 0
            
            growth_data.append({
                'day': days_elapsed,
                'date': log.log_date.isoformat(),
                'weight': float(log.average_weight),
                'daily_gain': daily_gain
            })
        
        return growth_data
    
    def _analyze_environment(self, cycle):
        """Analyse les conditions environnementales pour le cycle."""
        logs = cycle.logs.exclude(
            water_temperature__isnull=True,
            ph_level__isnull=True,
            dissolved_oxygen__isnull=True
        )
        
        if not logs:
            return {'message': _('Aucune donnée environnementale disponible')}
        
        env_data = logs.aggregate(
            avg_temperature=Avg('water_temperature'),
            min_temperature=Min('water_temperature'),
            max_temperature=Max('water_temperature'),
            avg_ph=Avg('ph_level'),
            min_ph=Min('ph_level'),
            max_ph=Max('ph_level'),
            avg_oxygen=Avg('dissolved_oxygen'),
            min_oxygen=Min('dissolved_oxygen')
        )
        
        # Generate alerts for out-of-range values
        alerts = AquacultureCalculator.check_environmental_alerts(
            cycle.species,
            temperature_c=env_data['avg_temperature'],
            ph=env_data['avg_ph'],
            oxygen_mg_l=env_data['avg_oxygen']
        )
        
        return {
            'averages': env_data,
            'alerts': alerts,
            'measurements_count': logs.count()
        }
    
    def _get_cycle_summary(self, cycle):
        """Obtient le résumé de cycle pour comparaison."""
        return {
            'id': str(cycle.id),
            'name': cycle.cycle_name,
            'duration_days': (cycle.end_date - cycle.start_date).days if cycle.end_date else None,
            'survival_rate': float(cycle.survival_rate) if cycle.survival_rate else None,
            'fcr': float(cycle.fcr) if cycle.fcr else None,
            'final_average_weight': float(cycle.final_average_weight) if cycle.final_average_weight else None,
            'total_biomass': float(cycle.final_biomass) if cycle.final_biomass else None
        }
    
    def _calculate_performance_ranking(self, current_cycle, previous_cycles):
        """Calcule le classement de performance comparé aux cycles précédents."""
        if not previous_cycles or not current_cycle.survival_rate:
            return _('Données insuffisantes')
        
        # Simple ranking based on survival rate
        better_cycles = sum(1 for c in previous_cycles 
                          if c.survival_rate and c.survival_rate > current_cycle.survival_rate)
        
        total_cycles = len(previous_cycles)
        percentile = ((total_cycles - better_cycles) / total_cycles) * 100
        
        if percentile >= 80:
            return _('Excellent')
        elif percentile >= 60:
            return _('Bon')
        elif percentile >= 40:
            return _('Moyen')
        else:
            return _('À améliorer')
    
    def _generate_improvement_suggestions(self, cycle, historical_avg):
        """Génère des suggestions d'amélioration basées sur la performance."""
        suggestions = []
        
        if cycle.survival_rate and historical_avg['avg_survival_rate']:
            if cycle.survival_rate < historical_avg['avg_survival_rate'] - 5:
                suggestions.append(_("Améliorer le suivi sanitaire et la qualité de l'eau"))
        
        if cycle.fcr and historical_avg['avg_fcr']:
            if cycle.fcr > historical_avg['avg_fcr'] + 0.2:
                suggestions.append(_("Optimiser l'alimentation et réduire le gaspillage"))
        
        if not suggestions:
            suggestions.append(_("Performance conforme aux cycles précédents"))
        
        return suggestions


@extend_schema_view(
    list=extend_schema(
        summary="Lister les logs quotidiens",
        description="""
        Retourne la liste des logs quotidiens des cycles de production.
        Supporte le filtrage par cycle, date et type d'activité.
        """,
        parameters=[
            OpenApiParameter(
                name='cycle_id',
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                description='UUID du cycle pour filtrer les logs'
            ),
            OpenApiParameter(
                name='log_date_after',
                type=OpenApiTypes.DATE,
                location=OpenApiParameter.QUERY,
                description='Logs après cette date (YYYY-MM-DD)'
            ),
            OpenApiParameter(
                name='log_date_before',
                type=OpenApiTypes.DATE,
                location=OpenApiParameter.QUERY,
                description='Logs avant cette date (YYYY-MM-DD)'
            ),
        ],
        examples=[
            OpenApiExample(
                'Logs récents d\'un cycle',
                value={
                    'count': 15,
                    'results': [
                        {
                            'id': '789e0123-e89b-12d3-a456-426614174002',
                            'log_date': '2025-08-19',
                            'feed_quantity': '48.50',
                            'mortality_count': 2,
                            'water_temperature': '26.50',
                            'observations': 'Température stable, poissons actifs'
                        }
                    ]
                }
            )
        ]
    ),
    create=extend_schema(
        summary="Créer un log quotidien",
        description="""
        Enregistre les données quotidiennes d'un cycle : alimentation, mortalité, 
        échantillonnage de poids et paramètres environnementaux.
        Met automatiquement à jour les métriques du cycle.
        """,
        examples=[
            OpenApiExample(
                'Log quotidien complet',
                value={
                    'cycle': '456e7890-e89b-12d3-a456-426614174001',
                    'log_date': '2025-08-19',
                    'mortality_count': 2,
                    'sample_count': 20,
                    'sample_total_weight': 520.00,
                    'feed_quantity': 48.50,
                    'water_temperature': 26.5,
                    'dissolved_oxygen': 7.2,
                    'ph_level': 7.8,
                    'observations': 'Croissance normale, bonne appétence'
                }
            )
        ]
    ),
    retrieve=extend_schema(
        summary="Détails d'un log quotidien",
        description="Retourne les détails complets d'un log avec calculs dérivés."
    ),
    update=extend_schema(
        summary="Mettre à jour un log quotidien",
        description="Modifie un log existant et recalcule les métriques de cycle."
    ),
    destroy=extend_schema(
        summary="Supprimer un log quotidien",
        description="Supprime un log et recalcule les métriques de cycle."
    )
)
class CycleLogViewSet(viewsets.ModelViewSet):
    """
    Gestion des logs quotidiens de cycle avec synchronisation offline.
    
    Enregistre toutes les données journalières : mortalité, croissance, alimentation,
    paramètres environnementaux. Supporte la création en bulk pour app mobile.
    """
    serializer_class = CycleLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Filtre les logs par les cycles de l'utilisateur."""
        queryset = CycleLog.objects.filter(
            cycle__farm_profile__user=self.request.user
        ).select_related('cycle').order_by('-log_date')
        
        # Filter by cycle if specified
        cycle_id = self.request.query_params.get('cycle_id')
        if cycle_id:
            queryset = queryset.filter(cycle_id=cycle_id)
        
        return queryset
    
    def perform_create(self, serializer):
        """Après création du log, met à jour les métriques de cycle."""
        log = serializer.save()
        self._update_cycle_metrics(log)
    
    @extend_schema(
        summary="Création en bulk de logs (sync offline)",
        description="""
        Crée plusieurs logs quotidiens simultanément pour synchronisation mobile.
        Utilise la déduplication par client_uuid pour éviter les doublons.
        Recalcule automatiquement les métriques de tous les cycles affectés.
        """,
        request=CycleLogSyncSerializer,
        responses={
            201: OpenApiExample(
                'Logs créés avec succès',
                value={
                    'created': 5,
                    'logs': [
                        {
                            'id': '789e0123-e89b-12d3-a456-426614174002',
                            'client_uuid': 'offline-log-001',
                            'log_date': '2025-08-18',
                            'created_offline': True
                        }
                    ]
                }
            ),
            400: OpenApiExample(
                'Erreur de validation',
                value={'logs': ['Données invalides pour le log']}
            )
        },
        examples=[
            OpenApiExample(
                'Logs offline à synchroniser',
                value=[
                    {
                        'client_uuid': 'offline-log-001',
                        'cycle': '456e7890-e89b-12d3-a456-426614174001',
                        'log_date': '2025-08-18',
                        'feed_quantity': 47.00,
                        'mortality_count': 1,
                        'created_offline': True
                    },
                    {
                        'client_uuid': 'offline-log-002',
                        'cycle': '456e7890-e89b-12d3-a456-426614174001',
                        'log_date': '2025-08-17',
                        'feed_quantity': 46.50,
                        'created_offline': True
                    }
                ]
            )
        ]
    )
    @action(detail=False, methods=['post'])
    def bulk_create(self, request):
        """
        Crée plusieurs logs pour synchronisation offline.
        """
        logs_data = request.data.get('logs', [])
        
        with transaction.atomic():
            serializer = CycleLogSyncSerializer(data=logs_data, many=True)
            serializer.is_valid(raise_exception=True)
            logs = serializer.save()
            
            # Update affected cycles
            cycles_to_update = set(log.cycle_id for log in logs)
            for cycle_id in cycles_to_update:
                try:
                    cycle = ProductionCycle.objects.get(id=cycle_id)
                    self._recalculate_cycle_metrics(cycle)
                except ProductionCycle.DoesNotExist:
                    pass
        
        return Response({
            'created': len(logs),
            'logs': CycleLogSerializer(logs, many=True).data
        }, status=status.HTTP_201_CREATED)
    
    def _update_cycle_metrics(self, log):
        """Met à jour les métriques de cycle après nouvelle entrée de log."""
        cycle = log.cycle
        
        # Update current fish count if mortality
        if log.mortality_count:
            cycle.current_count = max(0, cycle.current_count - log.mortality_count)
        
        # Update average weight if sampling data
        if log.average_weight:
            cycle.current_average_weight = log.average_weight
        
        # Recalculate biomass
        cycle.current_biomass = AquacultureCalculator.calculate_biomass(
            cycle.current_count,
            cycle.current_average_weight
        )
        
        # Update total feed consumed
        if log.feed_quantity:
            cycle.total_feed_consumed += log.feed_quantity
        
        # Recalculate survival rate
        cycle.survival_rate = AquacultureCalculator.calculate_survival_rate(
            cycle.initial_count,
            cycle.current_count
        )
        
        # Calculate FCR if possible
        weight_gain = cycle.current_biomass - cycle.initial_biomass
        if weight_gain > 0 and cycle.total_feed_consumed > 0:
            cycle.fcr = AquacultureCalculator.calculate_fcr(
                cycle.total_feed_consumed,
                weight_gain
            )
        
        cycle.save()
    
    def _recalculate_cycle_metrics(self, cycle):
        """Recalcule toutes les métriques de cycle à partir des logs."""
        # Reset to initial values
        cycle.current_count = cycle.initial_count
        cycle.current_average_weight = cycle.initial_average_weight
        cycle.total_feed_consumed = Decimal('0')
        
        # Process all logs in chronological order
        for log in cycle.logs.order_by('log_date'):
            if log.mortality_count:
                cycle.current_count = max(0, cycle.current_count - log.mortality_count)
            
            if log.average_weight:
                cycle.current_average_weight = log.average_weight
            
            if log.feed_quantity:
                cycle.total_feed_consumed += log.feed_quantity
        
        # Recalculate derived metrics
        cycle.current_biomass = AquacultureCalculator.calculate_biomass(
            cycle.current_count,
            cycle.current_average_weight
        )
        
        cycle.survival_rate = AquacultureCalculator.calculate_survival_rate(
            cycle.initial_count,
            cycle.current_count
        )
        
        weight_gain = cycle.current_biomass - cycle.initial_biomass
        if weight_gain > 0 and cycle.total_feed_consumed > 0:
            cycle.fcr = AquacultureCalculator.calculate_fcr(
                cycle.total_feed_consumed,
                weight_gain
            )
        
        cycle.save()


@extend_schema_view(
    list=extend_schema(
        summary="Lister les plans d'alimentation",
        description="""
        Retourne les plans d'alimentation actifs pour les cycles de l'utilisateur.
        Plans générés automatiquement basés sur les guides nutritionnels et l'état actuel des cycles.
        """,
        parameters=[
            OpenApiParameter(
                name='cycle_id',
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                description='Filtrer par cycle de production'
            ),
            OpenApiParameter(
                name='week_number',
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                description='Filtrer par numéro de semaine'
            ),
        ],
        examples=[
            OpenApiExample(
                'Plans d\'alimentation',
                value={
                    'count': 3,
                    'results': [
                        {
                            'id': 'plan-001',
                            'cycle': '456e7890-e89b-12d3-a456-426614174001',
                            'week_number': 1,
                            'daily_feed_amount': '5.70',
                            'feeding_rate': '4.50',
                            'meals_per_day': 2,
                            'recommended_feed_type': 'MAVECAM Superior 2-3mm'
                        }
                    ]
                }
            )
        ]
    ),
    create=extend_schema(
        summary="Créer un plan d'alimentation",
        description="""
        Crée un plan d'alimentation personnalisé pour une semaine spécifique d'un cycle.
        Calcule automatiquement les quantités en fonction de la biomasse actuelle.
        """,
        examples=[
            OpenApiExample(
                'Nouveau plan hebdomadaire',
                value={
                    'cycle': '456e7890-e89b-12d3-a456-426614174001',
                    'week_number': 1,
                    'estimated_fish_count': 4980,
                    'average_weight': 25.50,
                    'biomass': 127.00,
                    'feeding_rate': 4.5,
                    'meals_per_day': 2,
                    'recommended_feed_type': 'MAVECAM Superior 2-3mm'
                }
            )
        ]
    )
)
class FeedingPlanViewSet(viewsets.ModelViewSet):
    """
    Gestion des plans d'alimentation avec génération automatique.
    
    Génère des recommandations d'alimentation basées sur les guides nutritionnels,
    l'état actuel des cycles et les performances historiques.
    """
    serializer_class = FeedingPlanSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Retourne les plans d'alimentation actifs pour les cycles de l'utilisateur."""
        queryset = FeedingPlan.objects.filter(
            cycle__farm_profile__user=self.request.user,
            is_active=True
        ).select_related('cycle').order_by('cycle', 'week_number')

        # Filtrer par cycle si spécifié dans les paramètres URL
        cycle_id = self.request.query_params.get('cycle')
        if cycle_id:
            queryset = queryset.filter(cycle_id=cycle_id)

        return queryset
    
    @extend_schema(
        summary="Générer plans d'alimentation automatiques",
        description="""
        Génère automatiquement des plans d'alimentation pour les semaines à venir d'un cycle.
        Calcule les quantités optimales basées sur la croissance prévue et les guides nutritionnels.
        """,
        request=OpenApiExample(
            'Paramètres de génération',
            value={
                'cycle_id': '456e7890-e89b-12d3-a456-426614174001',
                'weeks_ahead': 4,
                'auto_adjust': True
            }
        ),
        responses={
            201: OpenApiExample(
                'Plans générés',
                value={
                    'generated': 4,
                    'plans': [
                        {
                            'week_number': 1,
                            'daily_feed_amount': '5.70',
                            'feeding_rate': '4.50',
                            'meals_per_day': 2
                        }
                    ]
                }
            ),
            404: OpenApiExample(
                'Cycle non trouvé',
                value={'error': 'Cycle non trouvé'}
            )
        }
    )
    @action(detail=False, methods=['post'])
    def generate(self, request):
        """
        Génère un plan d'alimentation pour un cycle et des semaines spécifiés.
        """
        cycle_id = request.data.get('cycle_id')
        weeks_ahead = request.data.get('weeks_ahead', 1)
        
        try:
            cycle = ProductionCycle.objects.get(
                id=cycle_id,
                farm_profile__user=request.user
            )
        except ProductionCycle.DoesNotExist:
            return Response(
                {'error': _('Cycle non trouvé')},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Calculate current week number
        days_elapsed = (date.today() - cycle.start_date).days
        current_week = max(1, days_elapsed // 7 + 1)
        
        plans = []
        for week_offset in range(weeks_ahead):
            week_number = current_week + week_offset
            
            # Check if plan already exists
            existing_plan = FeedingPlan.objects.filter(
                cycle=cycle,
                week_number=week_number
            ).first()
            
            if existing_plan:
                # Régénérer les notifications même pour un plan existant
                self._create_feeding_notifications(existing_plan)
                plans.append(existing_plan)
                continue
            
            # Generate new plan
            plan_data = AquacultureCalculator.calculate_weekly_feeding_plan(
                current_biomass_kg=cycle.current_biomass,
                current_weight_g=cycle.current_average_weight,
                current_count=cycle.current_count,
                species=cycle.species,
                week_number=week_number
            )
            
            # Calculate dates
            start_date = cycle.start_date + timedelta(weeks=week_number-1)
            end_date = start_date + timedelta(days=6)
            
            # Remove fields that don't exist in FeedingPlan model
            plan_data.pop('week_number', None)
            plan_data.pop('projected_weight_g', None)
            plan_data.pop('projected_biomass_kg', None)
            plan_data.pop('total_week_feed', None)
            
            # Create feeding plan
            plan = FeedingPlan.objects.create(
                cycle=cycle,
                week_number=week_number,
                start_date=start_date,
                end_date=end_date,
                **plan_data
            )
            
            # Create feeding reminders
            self._create_feeding_notifications(plan)
            plans.append(plan)
        
        return Response(
            FeedingPlanSerializer(plans, many=True).data,
            status=status.HTTP_201_CREATED
        )
    
    def _create_feeding_notifications(self, plan):
        """Crée des notifications de rappel d'alimentation intelligentes avec double rappel."""
        from datetime import datetime, time

        # Supprimer TOUTES les anciennes notifications de feeding pour ce cycle (futures ET passées)
        Notification.objects.filter(
            cycle=plan.cycle,
            notification_type='feeding_reminder'
        ).delete()

        # Définir les heures de repas selon le nombre de repas par jour
        feeding_times = self._get_feeding_times(plan.meals_per_day)

        for day in range(7):
            notification_date = plan.start_date + timedelta(days=day)

            # Skip past dates
            if notification_date < date.today():
                continue

            # Skip if today and meal time already passed
            daily_feeding_times = feeding_times
            if notification_date == date.today():
                current_time = timezone.now().time()
                daily_feeding_times = [ft for ft in feeding_times if ft >= current_time.replace(second=0, microsecond=0)]

            # Skip this day if no meals remaining
            if not daily_feeding_times:
                continue

            # Créer les notifications pour chaque repas
            for meal_index, meal_time in enumerate(daily_feeding_times):
                meal_names = ['matin', 'midi', 'soir', 'nuit']
                meal_name = meal_names[meal_index] if meal_index < len(meal_names) else f'repas {meal_index + 1}'

                # Notification 30 minutes avant
                notification_30min = timezone.make_aware(
                    datetime.combine(notification_date, meal_time)
                ) - timedelta(minutes=30)

                if notification_30min > timezone.now():
                    Notification.objects.create(
                        user=plan.cycle.farm_profile.user,
                        cycle=plan.cycle,
                        notification_type='feeding_reminder',
                        title=_('Nourrissage dans 30min - %(cycle_name)s') % {'cycle_name': plan.cycle.cycle_name},
                        message=_('Préparez %(amount).1f kg d\'aliment pour le %(meal)s') % {
                            'amount': plan.feed_per_meal,
                            'meal': meal_name
                        },
                        scheduled_for=notification_30min
                    )
                # Notification 15 minutes avant
                notification_15min = timezone.make_aware(
                    datetime.combine(notification_date, meal_time)
                ) - timedelta(minutes=15)

                if notification_15min > timezone.now():
                    Notification.objects.create(
                        user=plan.cycle.farm_profile.user,
                        cycle=plan.cycle,
                        notification_type='feeding_reminder',
                        title=_('Nourrissage dans 15min - %(cycle_name)s') % {'cycle_name': plan.cycle.cycle_name},
                        message=_('Donnez %(amount).1f kg d\'aliment maintenant (%(meal)s)') % {
                            'amount': plan.feed_per_meal,
                            'meal': meal_name
                        },
                        scheduled_for=notification_15min
                    )

    def _get_feeding_times(self, meals_per_day):
        """Retourne les heures de repas optimales selon le nombre de repas par jour."""
        from datetime import time

        feeding_schedules = {
            1: [time(13, 0)],  # 13h
            2: [time(8, 0), time(17, 0)],  # 8h, 17h
            3: [time(8, 0), time(13, 0), time(18, 0)],  # 8h, 13h, 18h
            4: [time(7, 0), time(11, 0), time(15, 0), time(18, 0)]  # 7h, 11h, 15h, 18h
        }

        return feeding_schedules.get(meals_per_day, feeding_schedules[2])  # Default à 2 repas


@extend_schema_view(
    list=extend_schema(
        summary="Lister les logs sanitaires",
        description="""
        Retourne l'historique des événements sanitaires avec photos.
        Supporte le filtrage par cycle, type d'événement et statut de résolution.
        """,
        parameters=[
            OpenApiParameter(
                name='cycle_id',
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                description='Filtrer par cycle de production'
            ),
            OpenApiParameter(
                name='event_type',
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description='Type d\'événement sanitaire',
                enum=['disease', 'treatment', 'vaccination', 'routine_check']
            ),
            OpenApiParameter(
                name='resolved',
                type=OpenApiTypes.BOOL,
                location=OpenApiParameter.QUERY,
                description='Statut de résolution (true/false)'
            ),
        ],
        examples=[
            OpenApiExample(
                'Logs sanitaires',
                value={
                    'count': 5,
                    'results': [
                        {
                            'id': 'sanitary-001',
                            'event_date': '2025-08-19',
                            'event_type': 'disease',
                            'symptoms': 'Points blancs sur la peau',
                            'affected_count': 15,
                            'treatment_applied': 'Traitement au sel',
                            'resolved': False
                        }
                    ]
                }
            )
        ]
    ),
    create=extend_schema(
        summary="Créer un log sanitaire",
        description="""
        Enregistre un événement sanitaire avec possibilité d'upload de photos.
        Supporte multipart/form-data pour les images (compressées côté client).
        """,
        examples=[
            OpenApiExample(
                'Nouveau problème sanitaire',
                value={
                    'cycle': '456e7890-e89b-12d3-a456-426614174001',
                    'event_date': '2025-08-19',
                    'event_type': 'disease',
                    'symptoms': 'Poissons léthargiques avec points blancs',
                    'affected_count': 15,
                    'treatment_applied': 'Traitement au sel à 3g/L',
                    'medication_used': 'Sel de cuisine non iodé',
                    'notes': 'Surveiller évolution des symptômes'
                }
            )
        ]
    )
)
class SanitaryLogViewSet(viewsets.ModelViewSet):
    """
    Gestion des logs sanitaires avec support photo.
    
    Enregistre tous les événements sanitaires : maladies, traitements, vaccinations.
    Supporte l'upload de photos pour documentation visuelle des problèmes.
    """
    serializer_class = SanitaryLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    
    def get_queryset(self):
        """Retourne les logs sanitaires pour les cycles de l'utilisateur."""
        return SanitaryLog.objects.filter(
            cycle__farm_profile__user=self.request.user
        ).select_related('cycle').order_by('-event_date')
    
    @extend_schema(
        summary="Résoudre un problème sanitaire",
        description="""
        Marque un problème sanitaire comme résolu avec date de résolution.
        Peut inclure des notes sur le traitement et l'évolution.
        """,
        request=OpenApiExample(
            'Résolution avec notes',
            value={
                'resolution_date': '2025-08-22',
                'resolution_notes': 'Traitement efficace, poissons retrouvent leur vitalité'
            }
        ),
        responses={
            200: SanitaryLogSerializer,
            404: OpenApiExample(
                'Log non trouvé',
                value={'detail': 'Log sanitaire non trouvé'}
            )
        }
    )
    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """
        Marque un problème sanitaire comme résolu.
        """
        log = self.get_object()
        log.resolved = True
        log.resolution_date = date.today()
        log.save()
        
        return Response(
            SanitaryLogSerializer(log, context={'request': request}).data,
            status=status.HTTP_200_OK
        )
    
    @extend_schema(
        summary="Problèmes sanitaires actifs",
        description="""
        Retourne tous les problèmes sanitaires non résolus groupés par cycle.
        Utile pour dashboard et alertes de suivi sanitaire.
        """,
        responses={
            200: OpenApiExample(
                'Problèmes actifs groupés',
                value=[
                    {
                        'cycle_name': 'Cycle Clarias P1-2025',
                        'cycle_id': '456e7890-e89b-12d3-a456-426614174001',
                        'issues': [
                            {
                                'id': 'sanitary-001',
                                'event_date': '2025-08-19',
                                'event_type': 'disease',
                                'symptoms': 'Points blancs sur la peau',
                                'affected_count': 15,
                                'days_since_reported': 3
                            }
                        ]
                    }
                ]
            )
        }
    )
    @action(detail=False, methods=['get'])
    def active_issues(self, request):
        """
        Obtient tous les problèmes sanitaires non résolus groupés par cycle.
        """
        active_logs = self.get_queryset().filter(resolved=False)
        
        # Group by cycle
        by_cycle = {}
        for log in active_logs:
            cycle_id = str(log.cycle.id)
            if cycle_id not in by_cycle:
                by_cycle[cycle_id] = {
                    'cycle_name': log.cycle.cycle_name,
                    'cycle_id': cycle_id,
                    'issues': []
                }
            by_cycle[cycle_id]['issues'].append(
                SanitaryLogSerializer(log, context={'request': request}).data
            )
        
        return Response(list(by_cycle.values()))


@extend_schema_view(
    list=extend_schema(
        summary="Lister les guides nutritionnels",
        description="""
        Retourne la liste des guides nutritionnels pour toutes les espèces.
        Données de référence MAVECAM pour optimiser l'alimentation selon le poids des poissons.
        """,
        parameters=[
            OpenApiParameter(
                name='species',
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description='Filtrer par espèce (clarias, tilapia)',
                enum=['clarias', 'tilapia']
            ),
            OpenApiParameter(
                name='min_weight',
                type=OpenApiTypes.FLOAT,
                location=OpenApiParameter.QUERY,
                description='Poids minimum pour le guide'
            ),
        ],
        examples=[
            OpenApiExample(
                'Guides nutritionnels',
                value={
                    'count': 12,
                    'results': [
                        {
                            'id': 'guide-001',
                            'species': 'clarias',
                            'species_display': 'Silure africain (Clarias)',
                            'growth_stage': 'juvenile',
                            'min_weight': 10.0,
                            'max_weight': 50.0,
                            'feeding_rate_percentage': 4.5,
                            'protein_requirement': 42.0,
                            'meals_per_day': 3,
                            'recommended_products': ['MAVECAM Superior 2-3mm']
                        }
                    ]
                }
            )
        ]
    ),
    retrieve=extend_schema(
        summary="Détails d'un guide nutritionnel",
        description="Retourne les détails complets d'un guide nutritionnel spécifique."
    )
)
class NutritionalGuideViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Guides nutritionnels MAVECAM (données de référence).
    
    Fournit les recommandations d'alimentation optimales selon l'espèce,
    le poids des poissons et le stade de croissance.
    """
    queryset = NutritionalGuide.objects.all()
    serializer_class = NutritionalGuideSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    @extend_schema(
        summary="Guides nutritionnels par espèce",
        description="""
        Retourne les guides nutritionnels triés par poids pour une espèce donnée.
        Utilisé pour obtenir les recommandations d'alimentation progressives selon la croissance.
        """,
        parameters=[
            OpenApiParameter(
                name='species',
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description='Espèce de poisson (obligatoire)',
                required=True,
                enum=['clarias', 'tilapia']
            ),
        ],
        responses={
            200: NutritionalGuideSerializer(many=True),
            400: OpenApiExample(
                'Paramètre manquant',
                value={'error': 'Paramètre species requis'}
            )
        },
        examples=[
            OpenApiExample(
                'Guides pour Clarias',
                value=[
                    {
                        'id': 'guide-clarias-1',
                        'species': 'clarias',
                        'growth_stage': 'alevin',
                        'min_weight': 1.0,
                        'max_weight': 10.0,
                        'feeding_rate_percentage': 8.0,
                        'protein_requirement': 45.0,
                        'meals_per_day': 4
                    },
                    {
                        'id': 'guide-clarias-2',
                        'species': 'clarias',
                        'growth_stage': 'juvenile',
                        'min_weight': 10.0,
                        'max_weight': 50.0,
                        'feeding_rate_percentage': 4.5,
                        'protein_requirement': 42.0,
                        'meals_per_day': 3
                    }
                ]
            )
        ]
    )
    @action(detail=False, methods=['get'])
    def for_species(self, request):
        """
        Obtient les guides nutritionnels pour une espèce spécifique.
        """
        species = request.query_params.get('species')
        if not species:
            return Response(
                {'error': _('Paramètre species requis')},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        guides = self.queryset.filter(species=species).order_by('min_weight')
        serializer = self.get_serializer(guides, many=True)
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(
        summary="Lister les notifications",
        description="""
        Retourne les notifications de l'utilisateur triées par date.
        Inclut rappels d'alimentation, alertes sanitaires et recommandations.
        """,
        parameters=[
            OpenApiParameter(
                name='is_read',
                type=OpenApiTypes.BOOL,
                location=OpenApiParameter.QUERY,
                description='Filtrer par statut de lecture'
            ),
            OpenApiParameter(
                name='notification_type',
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description='Type de notification',
                enum=['feeding_reminder', 'sanitary_alert', 'growth_alert', 'system_update']
            ),
        ],
        examples=[
            OpenApiExample(
                'Notifications récentes',
                value={
                    'count': 8,
                    'results': [
                        {
                            'id': 'notif-001',
                            'notification_type': 'feeding_reminder',
                            'title': 'Rappel alimentation',
                            'message': 'Donnez 2.85 kg d\'aliment ce matin - Bassin A1',
                            'is_read': False,
                            'scheduled_for': '2025-08-20T07:00:00Z'
                        }
                    ]
                }
            )
        ]
    ),
    create=extend_schema(
        summary="Créer une notification",
        description="Crée une notification personnalisée ou programmée.",
        examples=[
            OpenApiExample(
                'Nouvelle notification',
                value={
                    'notification_type': 'feeding_reminder',
                    'title': 'Rappel alimentation',
                    'message': 'Il est temps de nourrir les poissons',
                    'cycle': '456e7890-e89b-12d3-a456-426614174001',
                    'scheduled_for': '2025-08-20T07:00:00Z'
                }
            )
        ]
    )
)
class NotificationViewSet(viewsets.ModelViewSet):
    """
    Gestion des notifications et rappels.
    
    Gère les notifications automatiques (alimentation, santé) et personnalisées.
    Supporte la programmation et le marquage comme lu/non lu.
    """
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        """Retourne les notifications pour l'utilisateur authentifié (seulement celles qui doivent être affichées)."""
        return Notification.objects.filter(
            user=self.request.user,
            scheduled_for__lte=timezone.now()  # Seulement les notifications dont l'heure est arrivée
        ).order_by('-scheduled_for')
    
    @extend_schema(
        summary="Marquer notification comme lue",
        description="""
        Marque une notification spécifique comme lue et enregistre l'horodatage.
        Utile pour le suivi de l'engagement utilisateur avec les notifications.
        """,
        responses={
            200: NotificationSerializer,
            404: OpenApiExample(
                'Notification non trouvée',
                value={'detail': 'Notification non trouvée'}
            )
        }
    )
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """
        Marque une notification comme lue.
        """
        notification = self.get_object()
        notification.is_read = True
        notification.read_at = timezone.now()
        notification.save()
        
        return Response(
            NotificationSerializer(notification).data,
            status=status.HTTP_200_OK
        )
    
    @extend_schema(
        summary="Marquer toutes notifications comme lues",
        description="""
        Marque toutes les notifications non lues de l'utilisateur comme lues en une seule opération.
        Optimisé pour les actions en bulk depuis l'interface mobile.
        """,
        responses={
            200: OpenApiExample(
                'Notifications marquées',
                value={
                    'message': '5 notifications marquées comme lues'
                }
            )
        }
    )
    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """
        Marque toutes les notifications comme lues.
        """
        count = self.get_queryset().filter(is_read=False).update(
            is_read=True,
            read_at=timezone.now()
        )
        
        return Response({
            'message': f'{count} notifications marquées comme lues'
        })


@extend_schema(
    summary="Dashboard aquaculture complet",
    description="""
    Retourne une vue d'ensemble complète de l'activité aquacole de la ferme.
    Optimisé pour l'interface mobile avec données agrégées et indicateurs clés.
    """,
    responses={
        200: DashboardSerializer,
        401: OpenApiExample(
            'Non authentifié',
            value={'detail': 'Les informations d\'authentification n\'ont pas été fournies.'}
        )
    },
    examples=[
        OpenApiExample(
            'Dashboard complet',
            value={
                'active_cycles': [
                    {
                        'id': '456e7890-e89b-12d3-a456-426614174001',
                        'cycle_name': 'Cycle Clarias P1-2025',
                        'species': 'clarias',
                        'days_active': 45,
                        'current_biomass': '245.60',
                        'survival_rate': '97.5'
                    }
                ],
                'quick_stats': {
                    'total_active_cycles': 2,
                    'total_fish': 9850,
                    'total_biomass': '485.30',
                    'pending_notifications': 5,
                    'active_sanitary_issues': 1
                },
                'today_tasks': [
                    {
                        'task_type': 'feeding',
                        'cycle_name': 'Cycle Clarias P1-2025',
                        'scheduled_time': '07:00',
                        'feed_amount': '2.85'
                    }
                ]
            }
        )
    ]
)
class DashboardView(APIView):
    """
    Vue principale de tableau de bord agrégeant toutes les données aquacoles.
    
    Fournit une synthèse complète pour l'interface mobile : cycles actifs,
    tâches du jour, alertes, statistiques et indicateurs de performance.
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request):
        """
        Obtient les données complètes du tableau de bord pour l'app mobile.
        GET /api/aquaculture/dashboard/
        """
        user = request.user
        farm_profile = user.farm_profile
        
        # Active cycles
        active_cycles = ProductionCycle.objects.filter(
            farm_profile=farm_profile,
            status='active'
        ).select_related('farm_profile').prefetch_related('logs')
        
        # Recent logs (last 7 days)
        recent_date = date.today() - timedelta(days=7)
        recent_logs = CycleLog.objects.filter(
            cycle__farm_profile=farm_profile,
            log_date__gte=recent_date
        ).select_related('cycle').order_by('-log_date')[:20]
        
        # Current feeding plans
        current_plans = FeedingPlan.objects.filter(
            cycle__farm_profile=farm_profile,
            is_active=True,
            start_date__lte=date.today(),
            end_date__gte=date.today()
        ).select_related('cycle')
        
        # Pending notifications
        pending_notifications = Notification.objects.filter(
            user=user,
            is_read=False,
            scheduled_for__lte=timezone.now()
        ).order_by('scheduled_for')[:10]
        
        # Active sanitary issues
        active_issues = SanitaryLog.objects.filter(
            cycle__farm_profile=farm_profile,
            resolved=False
        ).select_related('cycle')[:5]
        
        # Calculate summary statistics
        total_biomass = active_cycles.aggregate(
            Sum('current_biomass')
        )['current_biomass__sum'] or 0
        
        total_fish_count = sum(c.current_count for c in active_cycles)
        
        avg_fcr = active_cycles.filter(fcr__isnull=False).aggregate(
            Avg('fcr')
        )['fcr__avg'] or 0
        
        avg_survival = active_cycles.filter(survival_rate__isnull=False).aggregate(
            Avg('survival_rate')
        )['survival_rate__avg'] or 0
        
        # Prepare chart data
        growth_data = self._prepare_growth_chart_data(active_cycles)
        mortality_data = self._prepare_mortality_chart_data(active_cycles)
        feed_data = self._prepare_feed_chart_data(active_cycles)
        
        # Environmental alerts
        environmental_alerts = []
        for cycle in active_cycles:
            latest_log = cycle.logs.filter(
                Q(water_temperature__isnull=False) |
                Q(ph_level__isnull=False) |
                Q(dissolved_oxygen__isnull=False)
            ).first()
            
            if latest_log:
                alerts = AquacultureCalculator.check_environmental_alerts(
                    cycle.species,
                    temperature_c=latest_log.water_temperature,
                    ph=latest_log.ph_level,
                    oxygen_mg_l=latest_log.dissolved_oxygen,
                    density_kg_m3=cycle.current_density_kg_m3()
                )
                environmental_alerts.extend(alerts)
        
        dashboard_data = {
            # Summary statistics
            'active_cycles_count': active_cycles.count(),
            'total_biomass': float(total_biomass),
            'total_fish_count': total_fish_count,
            'average_fcr': float(avg_fcr),
            'average_survival_rate': float(avg_survival),
            
            # Current data
            'active_cycles': ProductionCycleSerializer(active_cycles, many=True).data,
            'recent_logs': CycleLogSerializer(recent_logs, many=True).data,
            'current_feeding_plans': FeedingPlanSerializer(current_plans, many=True).data,
            'pending_notifications': NotificationSerializer(pending_notifications, many=True).data,
            'active_sanitary_issues': SanitaryLogSerializer(
                active_issues, many=True, context={'request': request}
            ).data,
            
            # Analytics
            'growth_chart_data': growth_data,
            'mortality_chart_data': mortality_data,
            'feed_consumption_chart_data': feed_data,
            
            # Alerts and recommendations
            'environmental_alerts': environmental_alerts,
            'feeding_recommendations': self._get_feeding_recommendations(active_cycles)
        }
        
        return Response(dashboard_data)
    
    def _prepare_growth_chart_data(self, cycles):
        """Prépare les données de graphique de croissance pour le tableau de bord."""
        chart_data = []
        
        for cycle in cycles:
            logs = cycle.logs.filter(
                average_weight__isnull=False
            ).order_by('log_date')[:30]  # Last 30 measurements
            
            if logs:
                chart_data.append({
                    'cycle_name': cycle.cycle_name,
                    'cycle_id': str(cycle.id),
                    'data': [
                        {
                            'date': log.log_date.isoformat(),
                            'weight': float(log.average_weight),
                            'day': (log.log_date - cycle.start_date).days
                        } for log in logs
                    ]
                })
        
        return chart_data
    
    def _prepare_mortality_chart_data(self, cycles):
        """Prépare les données de graphique de mortalité pour le tableau de bord."""
        chart_data = []
        
        for cycle in cycles:
            logs = cycle.logs.filter(mortality_count__gt=0).order_by('log_date')
            
            if logs:
                cumulative_mortality = 0
                mortality_series = []
                
                for log in logs:
                    cumulative_mortality += log.mortality_count
                    mortality_series.append({
                        'date': log.log_date.isoformat(),
                        'daily': log.mortality_count,
                        'cumulative': cumulative_mortality,
                        'percentage': (cumulative_mortality / cycle.initial_count * 100)
                    })
                
                chart_data.append({
                    'cycle_name': cycle.cycle_name,
                    'cycle_id': str(cycle.id),
                    'data': mortality_series
                })
        
        return chart_data
    
    def _prepare_feed_chart_data(self, cycles):
        """Prépare les données de graphique de consommation d'aliment pour le tableau de bord."""
        chart_data = []
        
        for cycle in cycles:
            logs = cycle.logs.filter(
                feed_quantity__isnull=False
            ).order_by('log_date')
            
            if logs:
                cumulative_feed = 0
                feed_series = []
                
                for log in logs:
                    cumulative_feed += float(log.feed_quantity)
                    feed_series.append({
                        'date': log.log_date.isoformat(),
                        'daily': float(log.feed_quantity),
                        'cumulative': cumulative_feed
                    })
                
                chart_data.append({
                    'cycle_name': cycle.cycle_name,
                    'cycle_id': str(cycle.id),
                    'data': feed_series
                })
        
        return chart_data
    
    def _get_feeding_recommendations(self, cycles):
        """Génère des recommandations d'alimentation pour les cycles actifs."""
        recommendations = {}
        
        for cycle in cycles:
            latest_log = cycle.logs.first()
            if latest_log and latest_log.average_weight:
                feeding_rec = AquacultureCalculator.get_feeding_recommendations(
                    latest_log.average_weight
                )
                recommendations[str(cycle.id)] = {
                    'cycle_name': cycle.cycle_name,
                    'current_weight': float(latest_log.average_weight),
                    'recommended_rate': feeding_rec['feeding_rate_pct'],
                    'recommended_size': feeding_rec['size_mm'],
                    'recommended_protein': feeding_rec['protein_pct'],
                    'meals_per_day': AquacultureCalculator.get_meals_per_day(latest_log.average_weight)
                }
        
        return recommendations


@extend_schema(
    summary="Synchronisation offline complète",
    description="""
    Endpoint principal pour synchroniser les données entre mobile et serveur.
    Gère l'upload bulk, déduplication UUID, résolution de conflits et retour des mises à jour serveur.
    Architecture offline-first optimisée pour connexions limitées.
    """,
    request=SyncRequestSerializer,
    responses={
        200: SyncResponseSerializer,
        400: OpenApiExample(
            'Erreurs de validation',
            value={
                'status': 'partial_success',
                'processed': {'cycle_logs': 3, 'sanitary_logs': 1},
                'errors': [
                    {
                        'type': 'cycle_log',
                        'client_uuid': 'offline-log-001',
                        'errors': {'cycle': ['Ce champ est requis']}
                    }
                ]
            }
        ),
        401: OpenApiExample(
            'Non authentifié',
            value={'detail': 'Les informations d\'authentification n\'ont pas été fournies.'}
        )
    },
    examples=[
        OpenApiExample(
            'Synchronisation mobile complète',
            value={
                'cycle_logs': [
                    {
                        'client_uuid': 'offline-log-001',
                        'cycle': '456e7890-e89b-12d3-a456-426614174001',
                        'log_date': '2025-08-18',
                        'feed_quantity': 47.00,
                        'mortality_count': 1,
                        'created_offline': True
                    }
                ],
                'sanitary_logs': [
                    {
                        'client_uuid': 'offline-sanitary-001',
                        'cycle': '456e7890-e89b-12d3-a456-426614174001',
                        'event_date': '2025-08-18',
                        'event_type': 'routine_check',
                        'symptoms': 'Aucun problème détecté',
                        'created_offline': True
                    }
                ],
                'last_sync': '2025-08-18T10:00:00Z',
                'device_id': 'mobile-device-uuid-12345'
            }
        )
    ]
)
class SyncView(APIView):
    """
    Endpoint principal de synchronisation pour l'app mobile offline-first.
    
    Gère la synchronisation bidirectionnelle avec déduplication UUID,
    résolution automatique des conflits et optimisation pour connexions limitées.
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    
    def post(self, request):
        """
        Gère les requêtes de synchronisation offline.
        POST /api/aquaculture/sync/
        """
        sync_result = {
            'status': 'success',
            'timestamp': timezone.now(),
            'processed': {
                'cycle_logs': 0,
                'sanitary_logs': 0,
                'new_cycles': 0
            },
            'errors': [],
            'server_updates': {}
        }
        
        try:
            with transaction.atomic():
                # Process new cycles
                new_cycles = request.data.get('new_cycles', [])
                for cycle_data in new_cycles:
                    try:
                        cycle_data['farm_profile'] = request.user.farm_profile.id
                        serializer = ProductionCycleSerializer(data=cycle_data)
                        if serializer.is_valid():
                            serializer.save(farm_profile=request.user.farm_profile)
                            sync_result['processed']['new_cycles'] += 1
                        else:
                            sync_result['errors'].append({
                                'type': 'cycle',
                                'data': cycle_data,
                                'errors': serializer.errors
                            })
                    except Exception as e:
                        sync_result['errors'].append({
                            'type': 'cycle',
                            'error': str(e)
                        })
                
                # Process cycle logs
                cycle_logs = request.data.get('cycle_logs', [])
                for log_data in cycle_logs:
                    try:
                        client_uuid = log_data.get('client_uuid')
                        
                        # Deduplication check
                        if client_uuid:
                            existing = CycleLog.objects.filter(
                                client_uuid=client_uuid
                            ).first()
                            if existing:
                                # Update existing log
                                for key, value in log_data.items():
                                    if key not in ['id', 'created_at']:
                                        setattr(existing, key, value)
                                existing.synced_at = timezone.now()
                                existing.save()
                                sync_result['processed']['cycle_logs'] += 1
                                continue
                        
                        # Create new log
                        serializer = CycleLogSerializer(data=log_data)
                        if serializer.is_valid():
                            log = serializer.save(
                                created_offline=True,
                                synced_at=timezone.now()
                            )
                            sync_result['processed']['cycle_logs'] += 1
                        else:
                            sync_result['errors'].append({
                                'type': 'cycle_log',
                                'data': log_data,
                                'errors': serializer.errors
                            })
                    except Exception as e:
                        sync_result['errors'].append({
                            'type': 'cycle_log',
                            'error': str(e)
                        })
                
                # Process sanitary logs
                sanitary_logs = request.data.get('sanitary_logs', [])
                for log_data in sanitary_logs:
                    try:
                        serializer = SanitaryLogSerializer(data=log_data)
                        if serializer.is_valid():
                            serializer.save(created_offline=True)
                            sync_result['processed']['sanitary_logs'] += 1
                        else:
                            sync_result['errors'].append({
                                'type': 'sanitary_log',
                                'data': log_data,
                                'errors': serializer.errors
                            })
                    except Exception as e:
                        sync_result['errors'].append({
                            'type': 'sanitary_log',
                            'error': str(e)
                        })
                
                # Prepare server updates for client
                last_sync = request.data.get('last_sync')
                if last_sync:
                    last_sync_dt = timezone.datetime.fromisoformat(last_sync.replace('Z', '+00:00'))
                    
                    # Get updated cycles
                    updated_cycles = ProductionCycle.objects.filter(
                        farm_profile__user=request.user,
                        updated_at__gt=last_sync_dt
                    )
                    
                    # Get new server-side logs
                    new_server_logs = CycleLog.objects.filter(
                        cycle__farm_profile__user=request.user,
                        created_at__gt=last_sync_dt,
                        created_offline=False
                    )
                    
                    # Get new feeding plans
                    new_plans = FeedingPlan.objects.filter(
                        cycle__farm_profile__user=request.user,
                        created_at__gt=last_sync_dt
                    )
                    
                    sync_result['server_updates'] = {
                        'cycles': ProductionCycleSerializer(
                            updated_cycles, many=True
                        ).data,
                        'logs': CycleLogSerializer(
                            new_server_logs, many=True
                        ).data,
                        'feeding_plans': FeedingPlanSerializer(
                            new_plans, many=True
                        ).data
                    }
        
        except Exception as e:
            sync_result['status'] = 'error'
            sync_result['errors'].append({
                'type': 'general',
                'error': str(e)
            })
            return Response(sync_result, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        return Response(sync_result, status=status.HTTP_200_OK)

