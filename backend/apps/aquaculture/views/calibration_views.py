from rest_framework import permissions, viewsets

from ..models import CalibrationOperation, CalibrationTank
from ..serializers import CalibrationOperationSerializer, CalibrationTankSerializer


class CalibrationTankViewSet(viewsets.ModelViewSet):
    serializer_class = CalibrationTankSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return CalibrationTank.objects.filter(farm_profile__user=self.request.user).prefetch_related("sessions")

    def perform_create(self, serializer):
        client_uuid = serializer.validated_data.get("client_uuid")
        if client_uuid:
            existing = self.get_queryset().filter(client_uuid=client_uuid).first()
            if existing:
                serializer.instance = existing
                return
        serializer.save(farm_profile=self.request.user.farm_profile)

    def perform_destroy(self, instance):
        if instance.sessions.filter(status="active").exists():
            instance.is_active = False
            instance.save(update_fields=["is_active", "updated_at"])
        else:
            instance.delete()


class CalibrationOperationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CalibrationOperationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = CalibrationOperation.objects.select_related("source_cycle", "destination_cycle").filter(
            source_cycle__farm_profile__user=self.request.user
        )
        tank_id = self.request.query_params.get("tank_id")
        return queryset.filter(destination_cycle__calibration_tank_id=tank_id) if tank_id else queryset
