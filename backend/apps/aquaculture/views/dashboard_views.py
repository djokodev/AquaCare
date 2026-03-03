"""
Dashboard Views pour le module aquaculture.
"""
from rest_framework import status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiExample
from drf_spectacular.types import OpenApiTypes

from notifications.serializers import NotificationSerializer

from ..serializers import (
    ProductionCycleSerializer, CycleLogSerializer,
    FeedingPlanSerializer, SanitaryLogSerializer, DashboardSerializer,
)
from ..services.dashboard_service import DashboardService


@extend_schema(
    summary="Dashboard aquaculture complet",
    description="""
    Retourne une vue d'ensemble complète de l'activité aquacole de la ferme.
    Optimisé pour l'interface mobile avec données agrégées et indicateurs clés.
    """,
    parameters=[
        OpenApiParameter(
            name='cycle_id',
            type=OpenApiTypes.STR,
            location=OpenApiParameter.QUERY,
            description="Limiter le dashboard au cycle actif de session (UUID).",
        ),
    ],
    responses={
        200: DashboardSerializer,
        401: OpenApiExample(
            'Non authentifié',
            value={'detail': 'Les informations d\'authentification n\'ont pas été fournies.'}
        )
    },
)
class DashboardView(APIView):
    """
    Vue principale de tableau de bord agrégeant toutes les données aquacoles.
    Délègue la logique métier au DashboardService.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """GET /api/aquaculture/dashboard/"""
        user = request.user
        cycle_id = request.query_params.get('cycle_id')

        data = DashboardService.build_dashboard_data(user, user.farm_profile, cycle_id)

        if data is None:
            return Response(
                {'detail': _("Cycle de session introuvable ou inactif.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Serialize querysets (kept out of service to maintain request context)
        qs = data.pop('_querysets')
        data['active_cycles'] = ProductionCycleSerializer(qs['active_cycles_list'], many=True).data
        data['recent_logs'] = CycleLogSerializer(qs['recent_logs'], many=True).data
        data['current_feeding_plans'] = FeedingPlanSerializer(qs['current_plans'], many=True).data
        data['pending_notifications'] = NotificationSerializer(qs['pending_notifications'], many=True).data
        data['active_sanitary_issues'] = SanitaryLogSerializer(
            qs['active_issues'], many=True, context={'request': request}
        ).data

        return Response(data)
