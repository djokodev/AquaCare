"""
Nutritional Views pour le module aquaculture.
"""
import logging

from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils.decorators import method_decorator
from django.utils.translation import gettext_lazy as _
from django.views.decorators.cache import cache_page
from drf_spectacular.utils import extend_schema, extend_schema_view, OpenApiParameter, OpenApiExample
from drf_spectacular.types import OpenApiTypes

from ..models import NutritionalGuide
from ..serializers import NutritionalGuideSerializer

logger = logging.getLogger(__name__)


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

    @method_decorator(cache_page(3600))
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

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
    @method_decorator(cache_page(3600))
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
