"""
ViewSets DRF pour les unités de production et leurs allocations de cycle.
"""
from rest_framework import permissions, viewsets

from ..domain.production_units import normalize_production_unit_type
from ..models import CycleUnitAllocation, ProductionUnit
from ..serializers import CycleUnitAllocationSerializer, ProductionUnitSerializer


class ProductionUnitViewSet(viewsets.ModelViewSet):
    """CRUD des unités de production d'une ferme."""

    serializer_class = ProductionUnitSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = ProductionUnit.objects.for_api().filter(farm_profile__user=self.request.user)

        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        unit_type_filter = self.request.query_params.get('unit_type')
        if unit_type_filter:
            normalized_unit_type = normalize_production_unit_type(unit_type_filter) or unit_type_filter
            queryset = queryset.filter(unit_type=normalized_unit_type)

        return queryset

    def perform_create(self, serializer):
        serializer.save(farm_profile=self.request.user.farm_profile)


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
