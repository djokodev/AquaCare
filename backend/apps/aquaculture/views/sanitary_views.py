"""
Sanitary Views pour le module aquaculture.
"""

import logging

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from ..domain.exceptions import InvalidSanitaryDataException, SanitaryLogNotFoundException
from ..models import SanitaryLog
from ..serializers import (
    ActiveSanitaryIssueGroupSerializer,
    SanitaryLogSerializer,
    SanitaryResolutionSerializer,
)
from ..services import SanitaryService
from ..throttles import AquacultureSanitaryActionThrottle

logger = logging.getLogger(__name__)


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

    def get_serializer_class(self):
        if self.action == 'resolve':
            return SanitaryResolutionSerializer
        return super().get_serializer_class()

    def get_queryset(self):
        """Retourne les logs sanitaires pour les cycles de l'utilisateur."""
        return SanitaryLog.objects.for_api().filter(
            cycle__farm_profile__user=self.request.user
        ).order_by('-event_date')
    
    @extend_schema(
        summary="Résoudre un problème sanitaire",
        description="""
        Marque un problème sanitaire comme résolu avec date de résolution.
        Peut inclure des notes sur le traitement et l'évolution.
        """,
        request=SanitaryResolutionSerializer,
        responses={
            200: SanitaryLogSerializer,
            400: OpenApiExample(
                'Données invalides',
                value={'resolution_date': ['La date de résolution ne peut être avant l’événement']}
            ),
            404: OpenApiExample(
                'Log non trouvé',
                value={'detail': 'Log sanitaire non trouvé'}
            )
        }
    )
    @action(detail=True, methods=['post'], throttle_classes=[AquacultureSanitaryActionThrottle])
    def resolve(self, request, pk=None):
        """
        Marque un problème sanitaire comme résolu.

        Délègue toute la logique de résolution au SanitaryService
        pour maintenir une séparation claire des responsabilités.
        """
        log = self.get_object()

        # Extract resolution data from request
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        resolution_date = serializer.validated_data.get('resolution_date')
        resolution_notes = serializer.validated_data.get('resolution_notes', '')

        try:
            # Delegate business logic to service layer
            resolved_log = SanitaryService.resolve_sanitary_issue(
                sanitary_log_id=str(log.id),
                resolution_date=resolution_date,
                resolution_notes=resolution_notes
            )

            response_serializer = SanitaryLogSerializer(resolved_log, context={'request': request})
            return Response(response_serializer.data, status=status.HTTP_200_OK)
        except SanitaryLogNotFoundException as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_404_NOT_FOUND
            )
        except InvalidSanitaryDataException as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @extend_schema(
        summary="Problèmes sanitaires actifs",
        description="""
        Retourne tous les problèmes sanitaires non résolus groupés par cycle.
        Utile pour dashboard et alertes de suivi sanitaire.
        """,
        responses={
            200: ActiveSanitaryIssueGroupSerializer(many=True)
        }
    )
    @action(detail=False, methods=['get'])
    def active_issues(self, request):
        """
        Obtient tous les problèmes sanitaires non résolus groupés par cycle.

        Délègue toute la logique de groupement au SanitaryService
        pour maintenir une séparation claire des responsabilités.
        """
        # Delegate business logic to service layer
        active_issues_by_cycle = SanitaryService.get_active_issues_by_cycle(request.user)

        response_serializer = ActiveSanitaryIssueGroupSerializer(
            active_issues_by_cycle,
            many=True,
            context={'request': request},
        )
        return Response(response_serializer.data)
