"""HTTP adapter for the transactional cycle launch use case."""

from __future__ import annotations

import logging

from accounts.models import FarmProfile
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..cycle_launch_serializers import CycleLaunchRequestSerializer, CycleLaunchResponseSerializer
from ..services.cycle_launch_application_service import (
    CycleLaunchApplicationService,
    CycleLaunchIdempotencyConflict,
)
from ..throttles import AquacultureProductionPlanSetupThrottle

logger = logging.getLogger(__name__)


def _raise_drf_validation_error(error: DjangoValidationError) -> None:
    from rest_framework.exceptions import ValidationError

    if hasattr(error, "message_dict"):
        raise ValidationError(error.message_dict) from error
    raise ValidationError(error.messages) from error


class CycleLaunchView(APIView):
    """Create the setup, cycle, units and allocations in one DB transaction."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AquacultureProductionPlanSetupThrottle]

    @extend_schema(
        summary="Lancer un cycle avec ses unités de production",
        request=CycleLaunchRequestSerializer,
        responses={
            201: OpenApiResponse(CycleLaunchResponseSerializer),
            200: OpenApiResponse(CycleLaunchResponseSerializer),
            400: OpenApiResponse(description="Payload ou règle métier invalide"),
            404: OpenApiResponse(description="Ferme introuvable"),
            409: OpenApiResponse(description="Conflit d'idempotence"),
        },
    )
    def post(self, request, *args, **kwargs):
        serializer = CycleLaunchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            result = CycleLaunchApplicationService.launch(
                request.user,
                serializer.validated_data,
            )
        except FarmProfile.DoesNotExist as exc:
            raise Http404 from exc
        except CycleLaunchIdempotencyConflict as exc:
            return Response(
                {
                    "code": exc.default_code,
                    "detail": str(exc.detail),
                },
                status=status.HTTP_409_CONFLICT,
            )
        except DjangoValidationError as exc:
            _raise_drf_validation_error(exc)

        response_serializer = CycleLaunchResponseSerializer(
            {
                "launch_uuid": result.launch_uuid,
                "idempotent_replay": result.idempotent_replay,
                "farm_profile": result.farm_profile,
                "production_cycle": result.production_cycle,
                "production_units": result.production_units,
                "cycle_unit_allocations": result.cycle_unit_allocations,
                "production_unit_id_by_local_id": result.production_unit_id_by_local_id,
            },
            context={"request": request},
        )
        response_status = status.HTTP_200_OK if result.idempotent_replay else status.HTTP_201_CREATED
        logger.info(
            "Aquaculture cycle aggregate launch completed",
            extra={
                "event": "aquaculture.cycle_launch.completed",
                "user_id": str(request.user.pk),
                "farm_id": str(result.farm_profile.pk),
                "launch_uuid": str(result.launch_uuid),
                "cycle_id": str(result.production_cycle.pk),
                "unit_count": len(result.production_units),
                "allocation_count": len(result.cycle_unit_allocations),
                "idempotent_replay": result.idempotent_replay,
                "status_code": response_status,
            },
        )
        return Response(response_serializer.data, status=response_status)
