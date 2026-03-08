"""
Dashboard Views pour le module aquaculture.
"""
from django.utils.translation import gettext_lazy as _
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response

from ..serializers import (
    DashboardQuerySerializer,
    DashboardSerializer,
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
class DashboardView(generics.GenericAPIView):
    """
    Vue principale de tableau de bord agrégeant toutes les données aquacoles.
    Délègue la logique métier au DashboardService.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DashboardSerializer
    query_serializer_class = DashboardQuerySerializer

    def get_query_serializer(self, *args, **kwargs):
        return self.query_serializer_class(*args, **kwargs)

    def get(self, request):
        """GET /api/aquaculture/dashboard/"""
        user = request.user
        query_serializer = self.get_query_serializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        cycle_id = query_serializer.validated_data.get('cycle_id')

        data = DashboardService.build_dashboard_data(user, cycle_id)

        if data is None:
            return Response(
                {'detail': _("Cycle de session introuvable ou inactif.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Let the response serializer handle nested DRF serialization with request context.
        qs = data.pop('_querysets')
        data['active_cycles'] = qs['active_cycles_list']
        data['recent_logs'] = qs['recent_logs']
        data['current_feeding_plans'] = qs['current_plans']
        data['pending_notifications'] = qs['pending_notifications']
        data['active_sanitary_issues'] = qs['active_issues']

        serializer = self.get_serializer(data, context={'request': request})
        return Response(serializer.data)
