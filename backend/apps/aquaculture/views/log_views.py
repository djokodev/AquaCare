"""
Log Views pour le module aquaculture.
"""
import logging

from django.db import IntegrityError, transaction
from django.utils.translation import gettext_lazy as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response

from ..constants import MAX_BULK_LOGS
from ..models import CycleLog
from ..serializers import (
    BulkCycleLogRequestSerializer,
    BulkCycleLogResponseSerializer,
    CycleLogSerializer,
)
from ..services import (
    CycleLogApplicationService,
    UnauthorizedCycleAccessError,
)

logger = logging.getLogger(__name__)


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

    def get_serializer_class(self):
        if self.action == 'bulk_create':
            return BulkCycleLogRequestSerializer
        return super().get_serializer_class()

    def get_queryset(self):
        """Filtre les logs par les cycles de l'utilisateur."""
        queryset = CycleLog.objects.for_api().filter(
            cycle__farm_profile__user=self.request.user
        ).order_by('-log_date')
        
        # Filter by cycle if specified
        cycle_id = self.request.query_params.get('cycle_id')
        if cycle_id:
            queryset = queryset.filter(cycle_id=cycle_id)
        
        return queryset
    
    def create(self, request, *args, **kwargs):
        """
        Crée ou met à jour le log quotidien (upsert par cycle/log_date).

        - Si un log existe déjà pour (cycle, log_date) du même utilisateur,
          on le met à jour pour éviter une erreur 400 côté mobile.
        - Sinon on crée un nouveau log.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            mutation_result = CycleLogApplicationService.create_or_update_log(
                user=request.user,
                validated_data=serializer.validated_data,
            )
        except IntegrityError as exc:
            logger.warning(
                "Conflit concurrent detecte sur upsert cycle-log, user=%s, payload_cycle=%s, payload_date=%s",
                request.user.id,
                serializer.validated_data.get("cycle"),
                serializer.validated_data.get("log_date"),
            )
            raise DRFValidationError(
                {
                    "detail": _(
                        "Conflit de synchronisation detecte pendant l'enregistrement du journal."
                        " Veuillez reessayer."
                    )
                }
            ) from exc
        except UnauthorizedCycleAccessError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_403_FORBIDDEN,
            )

        output_serializer = self.get_serializer(mutation_result.log)
        response_status = status.HTTP_201_CREATED if mutation_result.created else status.HTTP_200_OK
        headers = self.get_success_headers(output_serializer.data) if mutation_result.created else {}
        return Response(output_serializer.data, status=response_status, headers=headers)

    def perform_update(self, serializer):
        """
        Met a jour un log via la couche applicative.

        Ce hook s'applique a PUT/PATCH et garantit le recalcul des metriques
        de cycle apres modification d'un log existant.
        """
        try:
            updated_log = CycleLogApplicationService.update_log(
                user=self.request.user,
                log=serializer.instance,
                validated_data=serializer.validated_data,
            )
        except UnauthorizedCycleAccessError as exc:
            raise PermissionDenied(str(exc)) from exc

        serializer.instance = updated_log
    
    @extend_schema(
        summary="Création en bulk de logs (sync offline)",
        description="""
        Crée plusieurs logs quotidiens simultanément pour synchronisation mobile.
        Utilise la déduplication par client_uuid pour éviter les doublons.
        Recalcule automatiquement les métriques de tous les cycles affectés.
        """,
        request=BulkCycleLogRequestSerializer,
        responses={
            201: BulkCycleLogResponseSerializer,
            400: OpenApiExample(
                'Erreur de validation',
                value={'logs': ['Données invalides pour le log']}
            )
        },
        examples=[
            OpenApiExample(
                'Logs offline à synchroniser',
                value={
                    'logs': [
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
                }
            )
        ]
    )
    @action(detail=False, methods=['post'])
    def bulk_create(self, request):
        """
        Crée plusieurs logs pour synchronisation offline.
        """
        logs_data = request.data.get('logs', [])

        if not isinstance(logs_data, list):
            raise DRFValidationError({'logs': _("Le champ 'logs' doit être une liste.")})

        if len(logs_data) > MAX_BULK_LOGS:
            raise DRFValidationError({
                'logs': _(
                    "Trop d'éléments dans 'logs' (maximum %(max)s par requête)."
                ) % {'max': MAX_BULK_LOGS}
            })

        serializer = self.get_serializer(data={'logs': logs_data})
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            result = CycleLogApplicationService.create_bulk_logs(
                logs_data=serializer.validated_data['logs'],
                user=request.user
            )
            logs = result['logs']

        response_serializer = BulkCycleLogResponseSerializer(
            {
                'created': result['created'],
                'updated': result['updated'],
                'errors': result['errors'],
                'logs': logs,
            },
            context={'request': request},
        )
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)
