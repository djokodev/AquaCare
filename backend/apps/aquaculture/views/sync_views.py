"""
Sync Views pour le module aquaculture.
"""
import logging

from drf_spectacular.utils import OpenApiExample, extend_schema
from rest_framework import generics, permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from ..serializers import (
    SyncRequestSerializer,
    SyncResponseSerializer,
    SyncValidationErrorResponseSerializer,
)
from ..services import SyncService
from ..throttles import AquacultureSyncThrottle

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
class SyncView(generics.GenericAPIView):
    """
    Endpoint principal de synchronisation pour l'app mobile offline-first.
    
    Gère la synchronisation bidirectionnelle avec déduplication UUID,
    résolution automatique des conflits et optimisation pour connexions limitées.
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    throttle_classes = [AquacultureSyncThrottle]
    serializer_class = SyncRequestSerializer

    @staticmethod
    def _validation_error_response(validation_errors: list[str]) -> Response:
        serializer = SyncValidationErrorResponseSerializer(
            {
                'status': 'error',
                'errors': [{'type': 'validation', 'error': err} for err in validation_errors],
            }
        )
        return Response(serializer.data, status=status.HTTP_400_BAD_REQUEST)

    @staticmethod
    def _resolve_sync_status_code(sync_status: str) -> int:
        if sync_status == 'error':
            return status.HTTP_500_INTERNAL_SERVER_ERROR
        if sync_status == 'partial_success':
            return status.HTTP_207_MULTI_STATUS
        return status.HTTP_200_OK

    def post(self, request):
        """
        Gère les requêtes de synchronisation offline.

        Délègue toute la logique de synchronisation au SyncService
        pour maintenir une séparation claire des responsabilités.

        POST /api/aquaculture/sync/
        """
        sync_payload = dict(request.data)
        if 'client_id' in sync_payload and 'device_id' not in sync_payload:
            sync_payload['device_id'] = sync_payload['client_id']

        validation_errors = SyncService.validate_sync_data(sync_payload)
        if validation_errors:
            return self._validation_error_response(validation_errors)

        sync_result = SyncService.perform_full_sync(
            user=request.user,
            sync_data=sync_payload
        )
        response_serializer = SyncResponseSerializer(sync_result)
        return Response(response_serializer.data, status=self._resolve_sync_status_code(sync_result['status']))
