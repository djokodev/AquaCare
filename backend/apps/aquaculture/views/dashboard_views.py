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
from ..services import DashboardApplicationService, InvalidDashboardCycleScopeError


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
        query_serializer = self.get_query_serializer(data=request.query_params)
        query_serializer.is_valid(raise_exception=True)
        try:
            data = DashboardApplicationService.build_dashboard_payload(
                user=request.user,
                cycle_id=query_serializer.validated_data.get('cycle_id'),
            )
        except InvalidDashboardCycleScopeError as exc:
            return Response(
                {'detail': str(exc) or _("Cycle de session introuvable ou inactif.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data, context={'request': request})
        return Response(serializer.data)
