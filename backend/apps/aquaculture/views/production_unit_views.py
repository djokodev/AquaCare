"""
ViewSets DRF pour les unités de production et leurs allocations de cycle.
"""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils.translation import gettext_lazy as _
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from ..domain.exceptions import BusinessRuleViolation
from ..domain.production_units import normalize_production_unit_type
from ..models import (
    CalibrationOperation,
    CycleUnitAllocation,
    ProductionCycle,
    ProductionUnit,
)
from ..serializers import (
    CalibrationOperationSerializer,
    CalibrationRequestSerializer,
    CalibrationResponseSerializer,
    CalibrationTankSerializer,
    CycleUnitAllocationHarvestResponseSerializer,
    CycleUnitAllocationPartialHarvestResponseSerializer,
    CycleUnitAllocationSerializer,
    FinalHarvestOperationSerializer,
    HarvestSerializer,
    PartialHarvestSerializer,
    ProductionCycleSerializer,
    ProductionUnitDashboardSerializer,
    ProductionUnitSerializer,
)
from ..services import (
    HarvestCycleCommand,
    PartialHarvestCommand,
    ProductionCycleApplicationService,
    ProductionUnitDashboardService,
)
from ..services.calibration_service import CalibrationService
from ..services.integrity_error_service import translate_production_unit_integrity_error
from ..services.production_unit_service import ProductionUnitLifecycleService


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

        purpose_filter = self.request.query_params.get('purpose')
        if purpose_filter:
            queryset = queryset.filter(purpose=purpose_filter)

        return queryset

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                serializer.save(farm_profile=self.request.user.farm_profile)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict or exc.messages) from exc
        except IntegrityError as exc:
            raise serializers.ValidationError(translate_production_unit_integrity_error(exc)) from exc

    @transaction.atomic
    def perform_update(self, serializer):
        locked = ProductionUnit.objects.select_for_update().get(pk=serializer.instance.pk)
        try:
            ProductionUnitLifecycleService.validate_update(locked, serializer.validated_data)
        except BusinessRuleViolation as exc:
            raise serializers.ValidationError({'detail': str(exc)}) from exc
        serializer.instance = locked
        try:
            serializer.save()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict or exc.messages) from exc
        except IntegrityError as exc:
            raise serializers.ValidationError(translate_production_unit_integrity_error(exc)) from exc

    def perform_destroy(self, instance):
        try:
            ProductionUnitLifecycleService.delete(instance)
        except BusinessRuleViolation as exc:
            raise serializers.ValidationError({'detail': str(exc)}) from exc


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
        summary="Calibrer depuis une allocation précise",
        request=CalibrationRequestSerializer,
        responses={200: CalibrationResponseSerializer, 201: CalibrationResponseSerializer},
    )
    @action(detail=True, methods=['post'], url_path='calibrate')
    def calibrate(self, request, pk=None):
        source_allocation = self.get_object()
        serializer = CalibrationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        destination_query = ProductionUnit.objects.filter(
            farm_profile__user=request.user,
            purpose=ProductionUnit.PURPOSE_CALIBRATION,
        )
        destination = (
            destination_query.filter(pk=data['destination_production_unit_id']).first()
            if data.get('destination_production_unit_id')
            else destination_query.filter(client_uuid=data['destination_production_unit_client_uuid']).first()
        )
        if destination is None:
            return Response(
                {'code': 'destination_production_unit_not_found', 'detail': _('Bac de calibrage introuvable.')},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            operation, warnings, created = CalibrationService.calibrate(
                source_allocation=source_allocation,
                destination_production_unit=destination,
                user=request.user,
                **{
                    key: value
                    for key, value in data.items()
                    if key not in {
                        'source_allocation_id',
                        'source_allocation_client_uuid',
                        'destination_production_unit_id',
                        'destination_production_unit_client_uuid',
                    }
                },
            )
        except BusinessRuleViolation as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        operation = CalibrationOperation.objects.select_related(
            'source_allocation__cycle',
            'source_allocation__production_unit',
            'destination_allocation__cycle',
            'destination_allocation__production_unit',
        ).get(pk=operation.pk)
        source_cycle = ProductionCycle.objects.for_api().get(pk=operation.source_allocation.cycle_id)
        destination_cycle = ProductionCycle.objects.for_api().get(pk=operation.destination_allocation.cycle_id)
        destination = ProductionUnitLifecycleService.calibration_tanks_for_api().get(pk=destination.pk)
        payload = {
            'operation': CalibrationOperationSerializer(operation).data,
            'source_allocation': CycleUnitAllocationSerializer(operation.source_allocation).data,
            'destination_allocation': CycleUnitAllocationSerializer(operation.destination_allocation).data,
            'source_cycle': ProductionCycleSerializer(source_cycle, context={'request': request}).data,
            'destination_cycle': ProductionCycleSerializer(destination_cycle, context={'request': request}).data,
            'destination_tank': CalibrationTankSerializer(destination, context={'request': request}).data,
            'warnings': warnings,
            'idempotent_replay': not created,
        }
        return Response(payload, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

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

        harvested_cycle, harvested_allocation, final_harvest, created = (
            ProductionCycleApplicationService.harvest_cycle_unit_allocation(
            allocation=allocation,
            command=HarvestCycleCommand(
                harvest_date=serializer.validated_data['harvest_date'],
                final_harvested_at=serializer.validated_data['final_harvested_at'],
                final_count=serializer.validated_data['final_count'],
                final_average_weight=serializer.validated_data['final_average_weight'],
                client_uuid=serializer.validated_data['client_uuid'],
                harvest_notes=serializer.validated_data.get('harvest_notes', ''),
                total_harvested_weight=serializer.validated_data.get(
                    'total_harvested_weight'
                ),
                created_offline=serializer.validated_data['created_offline'],
                allow_pending_reconciliation=serializer.validated_data[
                    'allow_pending_reconciliation'
                ],
            ),
            )
        )

        response_serializer = CycleUnitAllocationHarvestResponseSerializer(
            {
                'message': _('Unité récoltée avec succès'),
                'cycle': harvested_cycle,
                'cycle_unit_allocation': harvested_allocation,
                'final_harvest': FinalHarvestOperationSerializer(final_harvest).data,
                'idempotent_replay': not created,
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

        updated_cycle, updated_allocation, partial = (
            ProductionCycleApplicationService.partial_harvest_cycle_unit_allocation(
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
