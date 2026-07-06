"""
ViewSets DRF pour les unités de production et leurs allocations de cycle.
"""
from drf_spectacular.utils import extend_schema
from django.utils.translation import gettext_lazy as _
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status

from ..domain.production_units import normalize_production_unit_type
from ..models import CycleUnitAllocation, ProductionUnit
from ..serializers import (
    CycleUnitAllocationSerializer,
    CycleUnitAllocationHarvestResponseSerializer,
    CycleUnitAllocationPartialHarvestResponseSerializer,
    HarvestSerializer,
    PartialHarvestSerializer,
    ProductionUnitDashboardSerializer,
    ProductionUnitSerializer,
)
from ..services import ProductionUnitDashboardService
from ..services import (
    HarvestCycleCommand,
    PartialHarvestCommand,
    ProductionCycleApplicationService,
)


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

    def get_serializer_class(self):
        if self.action == 'harvest':
            return HarvestSerializer
        if self.action == 'partial_harvest':
            return PartialHarvestSerializer
        return super().get_serializer_class()

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

    @extend_schema(
        summary="Récolter une allocation de cycle par unité",
        request=HarvestSerializer,
        responses=CycleUnitAllocationHarvestResponseSerializer,
    )
    @action(detail=True, methods=['post'], url_path='harvest')
    def harvest(self, request, pk=None):
        allocation = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        harvested_cycle, harvested_allocation = ProductionCycleApplicationService.harvest_cycle_unit_allocation(
            allocation=allocation,
            command=HarvestCycleCommand(
                harvest_date=serializer.validated_data['harvest_date'],
                final_count=serializer.validated_data['final_count'],
                final_average_weight=serializer.validated_data['final_average_weight'],
                harvest_notes=serializer.validated_data.get('harvest_notes', ''),
            ),
        )

        response_serializer = CycleUnitAllocationHarvestResponseSerializer(
            {
                'message': _('Unité récoltée avec succès'),
                'cycle': harvested_cycle,
                'cycle_unit_allocation': harvested_allocation,
            },
            context={'request': request},
        )
        return Response(response_serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        summary="Récolte partielle d'une allocation de cycle par unité",
        request=PartialHarvestSerializer,
        responses=CycleUnitAllocationPartialHarvestResponseSerializer,
    )
    @action(detail=True, methods=['post'], url_path='partial-harvest')
    def partial_harvest(self, request, pk=None):
        allocation = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        updated_cycle, updated_allocation, partial = ProductionCycleApplicationService.partial_harvest_cycle_unit_allocation(
            allocation=allocation,
            command=PartialHarvestCommand(
                harvest_date=serializer.validated_data['harvest_date'],
                count_harvested=serializer.validated_data['count_harvested'],
                average_weight_g=serializer.validated_data['average_weight_g'],
                sale_price_fcfa_per_kg=serializer.validated_data.get('sale_price_fcfa_per_kg'),
                notes=serializer.validated_data.get('notes', ''),
                client_uuid=serializer.validated_data.get('client_uuid'),
                created_offline=serializer.validated_data.get('created_offline', False),
            ),
        )

        response_serializer = CycleUnitAllocationPartialHarvestResponseSerializer(
            {
                'message': _('Récolte partielle enregistrée avec succès'),
                'cycle': updated_cycle,
                'cycle_unit_allocation': updated_allocation,
                'partial_harvest': partial,
            },
            context={'request': request},
        )
        return Response(response_serializer.data, status=status.HTTP_200_OK)
