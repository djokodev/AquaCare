"""
ViewSets DRF pour les unités de production et leurs allocations de cycle.
"""
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from ..domain.production_units import normalize_production_unit_type
from ..models import CycleUnitAllocation, ProductionUnit
from ..serializers import (
    CycleUnitAllocationSerializer,
    ProductionUnitDashboardSerializer,
    ProductionUnitSerializer,
)
from ..services import ProductionUnitDashboardService


class ProductionUnitViewSet(viewsets.ModelViewSet):
    """CRUD des unités de production d'une ferme."""

    serializer_class = ProductionUnitSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = ProductionUnit.objects.for_api().filter(farm_profile__user=self.request.user)

        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        else:
            queryset = queryset.exclude(status='archived')

        unit_type_filter = self.request.query_params.get('unit_type')
        if unit_type_filter:
            normalized_unit_type = normalize_production_unit_type(unit_type_filter) or unit_type_filter
            queryset = queryset.filter(unit_type=normalized_unit_type)

        return queryset

    def perform_create(self, serializer):
        serializer.save(farm_profile=self.request.user.farm_profile)

    def perform_destroy(self, instance):
        instance.status = 'archived'
        instance.save(update_fields=['status', 'updated_at'])


class CycleUnitAllocationViewSet(viewsets.ModelViewSet):
    """CRUD des allocations de cycle par unité de production."""

    serializer_class = CycleUnitAllocationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = CycleUnitAllocation.objects.for_api().filter(cycle__farm_profile__user=self.request.user)

        cycle_id = self.request.query_params.get('cycle_id')
        if cycle_id:
            queryset = queryset.filter(cycle_id=cycle_id)

        return queryset

    @extend_schema(
        summary="Dashboard opérationnel d'une allocation de cycle",
        responses=ProductionUnitDashboardSerializer,
    )
    @action(detail=True, methods=['get'], url_path='dashboard')
    def dashboard(self, request, pk=None):
        allocation = self.get_object()
        payload = ProductionUnitDashboardService.build_dashboard_payload(allocation)
        serializer = ProductionUnitDashboardSerializer(payload, context={'request': request})
        return Response(serializer.data)
