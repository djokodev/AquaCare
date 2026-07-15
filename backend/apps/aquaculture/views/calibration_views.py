from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils.translation import gettext_lazy as _
from rest_framework import permissions, serializers, viewsets

from ..domain.exceptions import BusinessRuleViolation
from ..models import CalibrationOperation, ProductionUnit
from ..serializers import CalibrationOperationSerializer, CalibrationTankSerializer
from ..services.production_unit_service import ProductionUnitLifecycleService


class CalibrationTankViewSet(viewsets.ModelViewSet):
    serializer_class = CalibrationTankSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ProductionUnitLifecycleService.calibration_tanks_for_api().filter(
            farm_profile__user=self.request.user,
        )

    def perform_create(self, serializer):
        farm_profile = self.request.user.farm_profile
        client_uuid = serializer.validated_data.get("client_uuid")
        if client_uuid:
            existing = ProductionUnit.objects.filter(client_uuid=client_uuid).first()
            if existing:
                try:
                    ProductionUnitLifecycleService.validate_idempotent_payload(
                        existing,
                        {
                            **serializer.validated_data,
                            'status': 'active',
                            'purpose': ProductionUnit.PURPOSE_CALIBRATION,
                            'unit_type': 'tank',
                        },
                        farm_profile,
                    )
                except BusinessRuleViolation as exc:
                    raise serializers.ValidationError({'detail': str(exc)}) from exc
                serializer.instance = existing
                return
        try:
            with transaction.atomic():
                serializer.save(
                    farm_profile=farm_profile,
                    unit_type='tank',
                    purpose=ProductionUnit.PURPOSE_CALIBRATION,
                    surface_m2=None,
                    status='active',
                )
        except IntegrityError as exc:
            existing = ProductionUnit.objects.filter(client_uuid=client_uuid).first() if client_uuid else None
            if existing is None:
                conflicting_name = ProductionUnit.objects.filter(
                    farm_profile=farm_profile,
                    name__iexact=serializer.validated_data['name'].strip(),
                ).exists()
                if conflicting_name:
                    raise serializers.ValidationError(
                        {'name': _("Une unité portant ce nom existe déjà dans cette ferme.")}
                    ) from exc
                raise serializers.ValidationError(
                    {'detail': _("Le bac n'a pas pu être créé à cause d'un conflit concurrent.")}
                ) from exc
            try:
                ProductionUnitLifecycleService.validate_idempotent_payload(
                    existing,
                    {
                        **serializer.validated_data,
                        'status': 'active',
                        'purpose': ProductionUnit.PURPOSE_CALIBRATION,
                        'unit_type': 'tank',
                    },
                    farm_profile,
                )
            except BusinessRuleViolation as conflict:
                raise serializers.ValidationError({'detail': str(conflict)}) from exc
            serializer.instance = existing

    @transaction.atomic
    def perform_update(self, serializer):
        instance = ProductionUnit.objects.select_for_update().get(pk=serializer.instance.pk)
        changes = dict(serializer.validated_data)
        requested_active = changes.pop('is_active', instance.status == 'active')
        changes['status'] = 'active' if requested_active else 'inactive'
        try:
            ProductionUnitLifecycleService.validate_update(instance, changes)
        except BusinessRuleViolation as exc:
            raise serializers.ValidationError({'detail': str(exc)}) from exc
        serializer.instance = instance
        serializer.save(status=changes['status'])

    def perform_destroy(self, instance):
        try:
            ProductionUnitLifecycleService.delete(instance)
        except BusinessRuleViolation as exc:
            raise serializers.ValidationError({'detail': str(exc)}) from exc


class CalibrationOperationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CalibrationOperationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = CalibrationOperation.objects.select_related(
            'source_allocation__cycle',
            'source_allocation__production_unit',
            'destination_allocation__cycle',
            'destination_allocation__production_unit',
        ).filter(
            source_allocation__cycle__farm_profile__user=self.request.user
        )
        tank_id = self.request.query_params.get("tank_id")
        unit_id = self.request.query_params.get('unit_id')
        cycle_id = self.request.query_params.get('cycle_id')
        allocation_id = self.request.query_params.get('allocation_id')
        direction = self.request.query_params.get('direction')
        if tank_id:
            queryset = queryset.filter(destination_allocation__production_unit_id=tank_id)
        if unit_id:
            queryset = queryset.filter(
                Q(source_allocation__production_unit_id=unit_id)
                | Q(destination_allocation__production_unit_id=unit_id)
            )
        if cycle_id:
            if direction == 'out':
                queryset = queryset.filter(source_allocation__cycle_id=cycle_id)
            elif direction == 'in':
                queryset = queryset.filter(destination_allocation__cycle_id=cycle_id)
            else:
                queryset = queryset.filter(
                    Q(source_allocation__cycle_id=cycle_id)
                    | Q(destination_allocation__cycle_id=cycle_id)
                )
        if allocation_id:
            if direction == 'out':
                queryset = queryset.filter(source_allocation_id=allocation_id)
            elif direction == 'in':
                queryset = queryset.filter(destination_allocation_id=allocation_id)
            else:
                queryset = queryset.filter(
                    Q(source_allocation_id=allocation_id)
                    | Q(destination_allocation_id=allocation_id)
                )
        return queryset
