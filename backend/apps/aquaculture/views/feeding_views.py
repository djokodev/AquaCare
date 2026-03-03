"""
Feeding Views pour le module aquaculture.
"""
from datetime import date

from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter, OpenApiExample
from drf_spectacular.types import OpenApiTypes

from ..models import ProductionCycle, FeedingPlan
from ..serializers import FeedingPlanSerializer
from ..services import FeedingPlanService
from ..constants import MAX_GENERATION_WEEKS


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
        try:
            weeks_ahead = int(request.data.get('weeks_ahead', 1))
        except (TypeError, ValueError):
            return Response(
                {'error': _('Le paramètre weeks_ahead doit être un entier.')},
                status=status.HTTP_400_BAD_REQUEST
            )

        if weeks_ahead < 1 or weeks_ahead > MAX_GENERATION_WEEKS:
            return Response(
                {
                    'error': _(
                        'Le paramètre weeks_ahead doit être compris entre 1 et %(max)s.'
                    ) % {'max': MAX_GENERATION_WEEKS}
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        
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
        
        # Numéro de semaine actuelle dans le cycle
        days_elapsed = (date.today() - cycle.start_date).days
        current_week = max(1, days_elapsed // 7 + 1)

        plans = []
        for week_offset in range(weeks_ahead):
            week_number = current_week + week_offset
            # Déléguer entièrement au service (source DIBAQ + température réelle)
            plan = FeedingPlanService.generate_plan_for_week(cycle, week_number)
            plans.append(plan)

        return Response(
            FeedingPlanSerializer(plans, many=True).data,
            status=status.HTTP_201_CREATED
        )
