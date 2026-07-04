"""
Feeding Views pour le module aquaculture.
"""
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from ..models import FeedingPlan
from ..serializers import FeedingPlanGenerationRequestSerializer, FeedingPlanSerializer
from ..services import (
    FeedingPlanApplicationService,
    GenerateFeedingPlansCommand,
)


@extend_schema_view(
    list=extend_schema(
        summary="Lister les plans d'alimentation",
        description="""
        Retourne les plans d'alimentation actifs pour les unités de production de l'utilisateur.
        Plans générés automatiquement basés sur les guides nutritionnels et l'état actuel des allocations.
        """,
        parameters=[
            OpenApiParameter(
                name='cycle',
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                description='Filtrer par cycle de production'
            ),
            OpenApiParameter(
                name='cycle_id',
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                description='Alias rétrocompatible de cycle'
            ),
            OpenApiParameter(
                name='cycle_unit_allocation',
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                description="Filtrer par allocation de cycle par unité",
            ),
            OpenApiParameter(
                name='cycle_unit_allocation_id',
                type=OpenApiTypes.UUID,
                location=OpenApiParameter.QUERY,
                description="Alias de filtre pour l'allocation de cycle par unité",
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
                            'recommended_feed_type': 'AquaCare Superior 2-3mm'
                        }
                    ]
                }
            )
        ]
    ),
    create=extend_schema(
        summary="Créer un plan d'alimentation",
        description="""
        Crée un plan d'alimentation personnalisé pour une semaine spécifique d'une unité.
        Calcule automatiquement les quantités en fonction de la biomasse actuelle de l'allocation.
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
                    'recommended_feed_type': 'AquaCare Superior 2-3mm'
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

    def get_serializer_class(self):
        if self.action == 'generate':
            return FeedingPlanGenerationRequestSerializer
        return super().get_serializer_class()

    def get_queryset(self):
        """Retourne les plans d'alimentation actifs pour les cycles de l'utilisateur."""
        queryset = FeedingPlan.objects.for_api().filter(
            cycle__farm_profile__user=self.request.user,
            is_active=True
        ).order_by('cycle_unit_allocation__production_unit__name', 'week_number')

        # Filtrer par allocation si spécifié dans les paramètres URL
        allocation_id = (
            self.request.query_params.get('cycle_unit_allocation')
            or self.request.query_params.get('cycle_unit_allocation_id')
        )
        if allocation_id:
            queryset = queryset.filter(cycle_unit_allocation_id=allocation_id)

        # Filtrer par cycle si spécifié dans les paramètres URL
        cycle_id = self.request.query_params.get('cycle') or self.request.query_params.get('cycle_id')
        if cycle_id and not allocation_id:
            queryset = queryset.filter(cycle_id=cycle_id)

        return queryset
    
    @extend_schema(
        summary="Générer plans d'alimentation automatiques",
        description="""
        Génère automatiquement des plans d'alimentation pour les semaines à venir d'une allocation d'unité.
        Calcule les quantités optimales basées sur la croissance prévue et les guides nutritionnels.
        """,
        request=FeedingPlanGenerationRequestSerializer,
        responses={
            201: FeedingPlanSerializer(many=True),
            404: OpenApiExample(
                'Cycle non trouvé',
                value={'error': 'Cycle non trouvé'}
            )
        }
    )
    @action(detail=False, methods=['post'])
    def generate(self, request):
        """
        Génère un plan d'alimentation pour une allocation d'unité et des semaines spécifiées.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        cycle_unit_allocation_id = serializer.validated_data.get('cycle_unit_allocation_id')
        if not cycle_unit_allocation_id:
            raise ValidationError({
                'cycle_unit_allocation_id': "Le plan d'alimentation doit être généré depuis une unité de production."
            })

        plans = FeedingPlanApplicationService.generate_feeding_plans(
            user=request.user,
            command=GenerateFeedingPlansCommand(
                cycle_unit_allocation_id=cycle_unit_allocation_id,
                weeks_ahead=serializer.validated_data['weeks_ahead'],
                cycle_id=serializer.validated_data.get('cycle_id'),
            ),
        )

        response_serializer = FeedingPlanSerializer(plans, many=True, context={'request': request})
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)
