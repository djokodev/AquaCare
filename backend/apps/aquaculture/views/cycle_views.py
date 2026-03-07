"""
Cycle Views pour le module aquaculture.
"""
import logging

from django.utils.translation import gettext_lazy as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from ..domain.exceptions import CycleAlreadyHarvestedError, InvalidHarvestDataError
from ..models import ProductionCycle
from ..serializers import (
    CycleComparisonSerializer,
    CycleStatisticsSerializer,
    HarvestSerializer,
    ProductionCycleSerializer,
)
from ..services import AnalyticsService, ProductionCycleService

logger = logging.getLogger(__name__)


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
        """
        Crée un nouveau cycle de production via la couche service.

        Délègue la logique métier à ProductionCycleService pour garantir
        la cohérence des validations et calculs (biomasse, densité, etc.).
        """
        # Delegate business logic to service layer
        cycle = ProductionCycleService.create_cycle(
            farm_profile=self.request.user.farm_profile,
            cycle_data=serializer.validated_data
        )

        # Update serializer instance with created cycle
        serializer.instance = cycle
    
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

        Délègue la logique métier au ProductionCycleService pour
        garantir la cohérence et la réutilisabilité des règles métier.
        """
        cycle = self.get_object()

        # Validate harvest data
        serializer = HarvestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        harvest_data = serializer.validated_data

        try:
            # Delegate business logic to service layer
            harvested_cycle = ProductionCycleService.harvest_cycle(
                cycle=cycle,
                harvest_date=harvest_data['harvest_date'],
                final_count=harvest_data['final_count'],
                final_average_weight=harvest_data['final_average_weight'],
                harvest_notes=harvest_data.get('harvest_notes', '')
            )

            return Response(
                {
                    'message': _('Cycle récolté avec succès'),
                    'cycle': ProductionCycleSerializer(harvested_cycle).data
                },
                status=status.HTTP_200_OK
            )
        except (CycleAlreadyHarvestedError, InvalidHarvestDataError) as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
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

        Délègue toute la logique analytique au AnalyticsService pour
        maintenir une séparation claire des responsabilités.
        """
        cycle = self.get_object()

        # Delegate analytics to service layer
        statistics = AnalyticsService.get_cycle_statistics(cycle)

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

        Délègue toute la logique de comparaison au AnalyticsService pour
        maintenir une séparation claire des responsabilités.
        """
        current_cycle = self.get_object()

        # Delegate comparison to service layer
        comparison_data = AnalyticsService.compare_with_previous_cycles(
            current_cycle,
            limit=3
        )

        return Response(comparison_data)
