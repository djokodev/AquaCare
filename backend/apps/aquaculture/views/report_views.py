"""
Report Views pour le module aquaculture.
"""
from __future__ import annotations

import logging
from urllib.parse import quote

from django.http import FileResponse
from django.utils.translation import gettext_lazy as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from ..models import ProductionCycle, ProductionReport
from ..serializers import (
    GenerateReportSerializer,
    MarkWhatsAppSharedSerializer,
    ProductionReportDetailSerializer,
    ProductionReportListSerializer,
)
from ..services import ReportService
from ..tasks import generate_report_async_task, send_report_email_task
from ..throttles import AquacultureReportActionThrottle

logger = logging.getLogger(__name__)


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

@extend_schema_view(
    list=extend_schema(
        summary="Lister les rapports de production",
        description="""
        Retourne les rapports (journaliers, hebdomadaires, mensuels) de la ferme
        de l'utilisateur authentifié.
        """,
        parameters=[
            OpenApiParameter(
                name='report_type',
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                enum=['daily', 'weekly', 'monthly'],
                description='Filtrer par type de rapport'
            ),
            OpenApiParameter(
                name='status',
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                enum=['draft', 'validated'],
                description='Filtrer par statut de validation'
            ),
            OpenApiParameter(
                name='cycle_id',
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                description='Filtrer les rapports sur un cycle de session spécifique (UUID)'
            ),
        ],
        responses={200: ProductionReportListSerializer(many=True)},
    ),
    retrieve=extend_schema(
        summary="Détail d'un rapport",
        description="Retourne le détail complet d'un rapport avec payload et historique d'envoi.",
        responses={200: ProductionReportDetailSerializer},
    ),
)
class ProductionReportViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Gestion des rapports de production.

    Flux V1:
    - brouillon auto
    - validation manuelle
    - envoi email
    - marquage partage WhatsApp manuel
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ProductionReportListSerializer

    def get_queryset(self):
        queryset = ProductionReport.objects.filter(
            farm_profile__user=self.request.user
        ).select_related(
            'farm_profile',
            'validated_by',
        ).prefetch_related('dispatch_logs')

        report_type = self.request.query_params.get('report_type')
        if report_type:
            queryset = queryset.filter(report_type=report_type)

        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        cycle_id = self.request.query_params.get('cycle_id')
        if cycle_id:
            queryset = queryset.filter(payload__report_meta__cycle_scope_id=cycle_id)

        return queryset.order_by('-period_start', '-created_at')

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ProductionReportDetailSerializer
        return ProductionReportListSerializer

    @extend_schema(
        summary="Générer un rapport à la demande (asynchrone)",
        description=(
            "Crée un rapport avec status='pending' et lance la génération PDF en arrière-plan. "
            "Retourne 202 Accepted. Poller GET /reports/{id}/ pour vérifier quand status='draft'."
        ),
        request=GenerateReportSerializer,
        responses={202: ProductionReportDetailSerializer},
    )
    @action(detail=False, methods=['post'], throttle_classes=[AquacultureReportActionThrottle])
    def generate(self, request: Request) -> Response:
        serializer = GenerateReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        report_type = serializer.validated_data['report_type']
        reference_date = serializer.validated_data.get('reference_date')
        cycle_id = serializer.validated_data.get('cycle_id')
        period_start, period_end = ReportService.build_period_bounds(report_type, reference_date)

        # Validate cycle_id early (before dispatching async task)
        cycle_id_str = str(cycle_id) if cycle_id else None
        if cycle_id_str:
            cycle_exists = ProductionCycle.objects.filter(
                id=cycle_id_str,
                farm_profile=request.user.farm_profile,
                status='active',
            ).exists()
            if not cycle_exists:
                return Response(
                    {'detail': _("Cycle de session introuvable ou inactif.")},  # noqa: F811
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Create report record with pending status (no PDF yet)
        report, _created = ProductionReport.objects.get_or_create(
            farm_profile=request.user.farm_profile,
            report_type=report_type,
            period_start=period_start,
            period_end=period_end,
            defaults={'status': 'pending'},
        )

        if report.status != 'pending':
            report.status = 'pending'
            report.save(update_fields=['status', 'updated_at'])

        # Dispatch async PDF generation
        generate_report_async_task.delay(str(report.id), cycle_id_str)

        detail = ProductionReportDetailSerializer(report, context={'request': request})
        return Response(detail.data, status=status.HTTP_202_ACCEPTED)

    @extend_schema(
        summary="Régénérer un rapport (asynchrone)",
        description="Lance la régénération PDF en arrière-plan. Retourne 202 Accepted.",
        responses={202: ProductionReportDetailSerializer},
    )
    @action(detail=True, methods=['post'], throttle_classes=[AquacultureReportActionThrottle])
    def regenerate(self, request: Request, pk: str | None = None) -> Response:
        report = self.get_object()

        # Extract cycle_scope_id from existing payload
        cycle_scope_id = None
        if isinstance(report.payload, dict):
            cycle_scope_id = (
                report.payload.get('report_meta', {}) or {}
            ).get('cycle_scope_id')

        report.status = 'pending'
        report.save(update_fields=['status', 'updated_at'])

        generate_report_async_task.delay(
            str(report.id),
            cycle_scope_id,
        )

        serializer = ProductionReportDetailSerializer(report, context={'request': request})
        return Response(serializer.data, status=status.HTTP_202_ACCEPTED)

    @extend_schema(
        summary="Valider un rapport",
        description="Marque un rapport comme validé (relecture humaine).",
        responses={200: ProductionReportDetailSerializer},
    )
    @action(detail=True, methods=['post'])
    def validate(self, request: Request, pk: str | None = None) -> Response:
        report = self.get_object()
        validated = ReportService.validate(report, request.user)
        serializer = ProductionReportDetailSerializer(validated, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        summary="Envoyer un rapport par email",
        description="Envoie le rapport PDF en pièce jointe à l'email du promoteur.",
        responses={
            200: ProductionReportDetailSerializer,
            400: OpenApiExample(
                'Email manquant',
                value={'detail': 'Aucune adresse email renseignée pour ce compte.'}
            )
        },
    )
    @action(
        detail=True,
        methods=['post'],
        url_path='send-email',
        throttle_classes=[AquacultureReportActionThrottle],
    )
    def send_email(self, request: Request, pk: str | None = None) -> Response:
        report = self.get_object()
        if not getattr(request.user, 'email', None):
            return Response(
                {'detail': 'Aucune adresse email renseignée pour ce compte.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        send_report_email_task.delay(str(report.id), str(request.user.id))
        serializer = ProductionReportDetailSerializer(report, context={'request': request})
        return Response(serializer.data, status=status.HTTP_202_ACCEPTED)

    @extend_schema(
        summary="Marquer un partage WhatsApp",
        description="""
        Endpoint d'audit appelé après partage manuel du PDF depuis l'application mobile.
        """,
        request=MarkWhatsAppSharedSerializer,
        responses={200: ProductionReportDetailSerializer},
    )
    @action(
        detail=True,
        methods=['post'],
        url_path='mark-whatsapp-shared',
        throttle_classes=[AquacultureReportActionThrottle],
    )
    def mark_whatsapp_shared(self, request: Request, pk: str | None = None) -> Response:
        report = self.get_object()
        serializer = MarkWhatsAppSharedSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated = ReportService.mark_whatsapp_shared(
            report=report,
            user=request.user,
            recipient=serializer.validated_data.get('recipient', ''),
            metadata=serializer.validated_data.get('metadata', {}),
        )
        detail = ProductionReportDetailSerializer(updated, context={'request': request})
        return Response(detail.data, status=status.HTTP_200_OK)

    @extend_schema(
        summary="Télécharger le PDF d'un rapport",
        description="Retourne le fichier PDF du rapport.",
        responses={200: OpenApiTypes.BINARY},
    )
    @action(detail=True, methods=['get'], throttle_classes=[AquacultureReportActionThrottle])
    def download(self, request: Request, pk: str | None = None):
        report = self.get_object()

        if report.status == 'pending':
            return Response(
                {'detail': _("Le rapport est en cours de génération. Réessayez dans quelques instants.")},
                status=status.HTTP_409_CONFLICT,
            )

        if not report.pdf_file:
            # Dispatch async regeneration instead of blocking
            report.status = 'pending'
            report.save(update_fields=['status', 'updated_at'])
            generate_report_async_task.delay(str(report.id))
            return Response(
                {'detail': _("Le PDF est en cours de génération. Réessayez dans quelques instants.")},
                status=status.HTTP_409_CONFLICT,
            )

        filename = report.pdf_file.name.split('/')[-1] or f"report_{report.id}.pdf"
        response = FileResponse(report.pdf_file.open('rb'), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{quote(filename)}"'
        return response
