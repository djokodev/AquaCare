from django.db.models import Prefetch, Q
from django.utils.translation import gettext_lazy as _
from rest_framework import permissions, serializers, viewsets

from ..models import CalibrationOperation, CycleUnitAllocation, ProductionUnit
from ..serializers import CalibrationOperationSerializer, CalibrationTankSerializer


class CalibrationTankViewSet(viewsets.ModelViewSet):
    serializer_class = CalibrationTankSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ProductionUnit.objects.filter(
            farm_profile__user=self.request.user,
            purpose=ProductionUnit.PURPOSE_CALIBRATION,
            unit_type='tank',
        ).prefetch_related(
            Prefetch(
                'cycle_allocations',
                queryset=CycleUnitAllocation.objects.select_related('cycle').order_by('-created_at'),
            )
        )

    def perform_create(self, serializer):
        client_uuid = serializer.validated_data.get("client_uuid")
        if client_uuid:
            existing = self.get_queryset().filter(client_uuid=client_uuid).first()
            if existing:
                serializer.instance = existing
                return
        serializer.save(
            farm_profile=self.request.user.farm_profile,
            unit_type='tank',
            purpose=ProductionUnit.PURPOSE_CALIBRATION,
            surface_m2=None,
            status='active',
        )

    def perform_update(self, serializer):
        instance = serializer.instance
        occupied = instance.cycle_allocations.filter(status=CycleUnitAllocation.STATUS_ACTIVE).exists()
        requested_volume = serializer.validated_data.get('volume_m3', instance.volume_m3)
        requested_active = serializer.validated_data.get('is_active', instance.status == 'active')
        if occupied and requested_volume != instance.volume_m3:
            raise serializers.ValidationError({'volume_m3': _("Le volume d'un bac occupé ne peut pas être modifié.")})
        if occupied and requested_active is False:
            raise serializers.ValidationError({'is_active': _("Un bac occupé ne peut pas être désactivé.")})
        serializer.save(status='active' if requested_active else 'inactive')

    def perform_destroy(self, instance):
        if instance.cycle_allocations.filter(status=CycleUnitAllocation.STATUS_ACTIVE).exists():
            raise serializers.ValidationError({'detail': _("Un bac occupé ne peut pas être supprimé.")})
        if instance.cycle_allocations.exists():
            raise serializers.ValidationError({'detail': _("Un bac ayant un historique doit être archivé.")})
        instance.delete()


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
        if allocation_id:
            if direction == 'out':
                queryset = queryset.filter(source_allocation_id=allocation_id)
            elif direction == 'in':
                queryset = queryset.filter(destination_allocation_id=allocation_id)
        return queryset
