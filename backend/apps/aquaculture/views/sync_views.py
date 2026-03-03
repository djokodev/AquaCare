"""
Sync Views pour le module aquaculture.
"""
import logging

from rest_framework import status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiExample
from drf_spectacular.types import OpenApiTypes

from ..serializers import SyncRequestSerializer, SyncResponseSerializer
from ..services import SyncService

logger = logging.getLogger(__name__)


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

        Délègue toute la logique de synchronisation au SyncService
        pour maintenir une séparation claire des responsabilités.

        POST /api/aquaculture/sync/
        """
        # Validate sync data structure
        validation_errors = SyncService.validate_sync_data(request.data)
        if validation_errors:
            return Response(
                {
                    'status': 'error',
                    'errors': [{'type': 'validation', 'error': err} for err in validation_errors]
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Delegate full sync to service layer
        sync_result = SyncService.perform_full_sync(
            user=request.user,
            sync_data=request.data
        )

        # Determine HTTP status code based on sync result
        if sync_result['status'] == 'error':
            http_status = status.HTTP_500_INTERNAL_SERVER_ERROR
        elif sync_result['status'] == 'partial_success':
            http_status = status.HTTP_207_MULTI_STATUS
        else:
            http_status = status.HTTP_200_OK

        return Response(sync_result, status=http_status)
