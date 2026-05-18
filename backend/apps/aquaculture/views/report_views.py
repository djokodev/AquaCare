"""
Report Views pour le module aquaculture.
"""
from __future__ import annotations

import logging
from urllib.parse import quote

from django.http import FileResponse
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from ..models import ProductionReport
from ..serializers import (
    GenerateReportSerializer,
    MarkWhatsAppSharedSerializer,
    ProductionReportDetailSerializer,
    ProductionReportListSerializer,
)
from ..services import (
    GenerateReportCommand,
    InvalidReportCycleScopeError,
    MissingReportEmailError,
    ReportApplicationService,
    ReportDownloadDecision,
    WhatsAppShareCommand,
)
from ..throttles import AquacultureReportActionThrottle, AquacultureReportDownloadThrottle

logger = logging.getLogger(__name__)


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

    @staticmethod
    def _serialize_report_detail(
        report: ProductionReport,
        request: Request,
        *,
        status_code: int,
    ) -> Response:
        serializer = ProductionReportDetailSerializer(report, context={'request': request})
        return Response(serializer.data, status=status_code)

    @staticmethod
    def _pending_response(message: str) -> Response:
        return Response({'detail': message}, status=status.HTTP_409_CONFLICT)

    def get_queryset(self):
        detail_actions = {
            'retrieve',
            'regenerate',
            'validate',
            'send_email',
            'mark_whatsapp_shared',
            'download',
        }
        base_queryset = (
            ProductionReport.objects.for_detail()
            if self.action in detail_actions
            else ProductionReport.objects.for_list()
        )
        queryset = base_queryset.filter(farm_profile__user=self.request.user, is_deleted=False)

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
        if self.action == 'generate':
            return GenerateReportSerializer
        if self.action == 'mark_whatsapp_shared':
            return MarkWhatsAppSharedSerializer
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
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            report = ReportApplicationService.request_report_generation(
                request.user,
                GenerateReportCommand(
                    report_type=serializer.validated_data['report_type'],
                    reference_date=serializer.validated_data.get('reference_date'),
                    cycle_id=(
                        str(serializer.validated_data['cycle_id'])
                        if serializer.validated_data.get('cycle_id')
                        else None
                    ),
                ),
            )
        except InvalidReportCycleScopeError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return self._serialize_report_detail(report, request, status_code=status.HTTP_202_ACCEPTED)

    @extend_schema(
        summary="Régénérer un rapport (asynchrone)",
        description="Lance la régénération PDF en arrière-plan. Retourne 202 Accepted.",
        responses={202: ProductionReportDetailSerializer},
    )
    @action(detail=True, methods=['post'], throttle_classes=[AquacultureReportActionThrottle])
    def regenerate(self, request: Request, pk: str | None = None) -> Response:
        report = ReportApplicationService.request_report_regeneration(self.get_object())
        return self._serialize_report_detail(report, request, status_code=status.HTTP_202_ACCEPTED)

    @extend_schema(
        summary="Valider un rapport",
        description="Marque un rapport comme validé (relecture humaine).",
        responses={200: ProductionReportDetailSerializer},
    )
    @action(detail=True, methods=['post'])
    def validate(self, request: Request, pk: str | None = None) -> Response:
        validated = ReportApplicationService.validate_report(self.get_object(), request.user)
        return self._serialize_report_detail(validated, request, status_code=status.HTTP_200_OK)

    @extend_schema(
        summary="Supprimer un rapport (soft delete)",
        description="Marque le rapport comme supprimé. Visible uniquement en admin.",
        responses={204: None},
    )
    @action(detail=True, methods=['delete'], url_path='delete')
    def delete_report(self, request: Request, pk: str | None = None) -> Response:
        report = self.get_object()
        report.is_deleted = True
        report.deleted_at = timezone.now()
        report.save(update_fields=['is_deleted', 'deleted_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        summary="Envoyer un rapport par email",
        description="Envoie le rapport PDF en pièce jointe à l'email du promoteur.",
        responses={
            202: ProductionReportDetailSerializer,
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
        try:
            report = ReportApplicationService.request_report_email_dispatch(
                self.get_object(),
                request.user,
            )
        except MissingReportEmailError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return self._serialize_report_detail(report, request, status_code=status.HTTP_202_ACCEPTED)

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
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated = ReportApplicationService.mark_report_whatsapp_shared(
            report=self.get_object(),
            user=request.user,
            command=WhatsAppShareCommand(
                recipient=serializer.validated_data.get('recipient', ''),
                metadata=serializer.validated_data.get('metadata', {}),
            ),
        )
        return self._serialize_report_detail(updated, request, status_code=status.HTTP_200_OK)

    @extend_schema(
        summary="Télécharger le PDF d'un rapport",
        description="Retourne le fichier PDF du rapport.",
        responses={200: OpenApiTypes.BINARY},
    )
    @action(detail=True, methods=['get'], throttle_classes=[AquacultureReportDownloadThrottle])
    def download(self, request: Request, pk: str | None = None):
        report = self.get_object()
        decision: ReportDownloadDecision = ReportApplicationService.prepare_report_download(report)
        if decision.status == 'pending':
            return self._pending_response(
                _("Le rapport est en cours de génération. Réessayez dans quelques instants.")
            )
        if decision.status == 'regenerating':
            return self._pending_response(
                _("Le PDF est en cours de génération. Réessayez dans quelques instants.")
            )

        filename = decision.filename or f"report_{report.id}.pdf"
        try:
            file_handle = report.pdf_file.open('rb')
        except FileNotFoundError:
            report.pdf_file = None
            report.save(update_fields=['pdf_file', 'updated_at'])
            ReportApplicationService.request_report_regeneration(report)
            return self._pending_response(
                _("Le fichier PDF est introuvable. Régénération lancée, réessayez dans quelques instants.")
            )
        response = FileResponse(file_handle, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{quote(filename)}"'
        return response
