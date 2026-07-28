"""HTTP adapter for the transactional cycle launch use case."""

from __future__ import annotations

import logging

from accounts.models import FarmProfile
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.http import Http404
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..cycle_launch_serializers import CycleLaunchRequestSerializer, CycleLaunchResponseSerializer
from ..services.cycle_launch_application_service import (
    CycleLaunchApplicationService,
    CycleLaunchIdempotencyConflict,
)
from ..services.integrity_error_service import translate_production_unit_integrity_error
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
        description=(
            "initial_setup complète le setup et crée les unités source=new ; "
            "additional_cycle exige un setup terminé et réutilise les unités "
            "source=existing sélectionnées. Les deux modes créent le cycle et "
            "ses allocations dans une transaction atomique."
        ),
        request=CycleLaunchRequestSerializer,
        responses={
            201: OpenApiResponse(CycleLaunchResponseSerializer),
            200: OpenApiResponse(CycleLaunchResponseSerializer),
            400: OpenApiResponse(description="Payload ou règle métier invalide"),
            404: OpenApiResponse(description="Ferme introuvable"),
            409: OpenApiResponse(description="Conflit d'idempotence ou unité occupée"),
        },
        examples=[
            OpenApiExample(
                "Initial setup",
                request_only=True,
                value={
                    "launch_uuid": "11111111-1111-4111-8111-111111111111",
                    "launch_kind": "initial_setup",
                    "production_plan": {
                        "annual_production_target_kg": "1520.00",
                        "num_cycles_per_year": 2,
                        "fingerlings_cost_per_unit_fcfa": "50.00",
                    },
                    "cycle": {
                        "species": "clarias",
                        "start_date": "2026-07-12",
                        "initial_count": 2000,
                        "planned_cycle_duration_days": 120,
                        "expected_survival_rate_pct": "95.00",
                        "fingerlings_cost_fcfa": "100000.00",
                        "other_operational_costs_fcfa": "12000.00",
                    },
                    "production_units": [
                        {
                            "local_id": "unit-a",
                            "source": "new",
                            "name": "Bassin A",
                            "unit_type": "tank",
                            "volume_m3": "12",
                        }
                    ],
                    "allocations": [
                        {"production_unit_local_id": "unit-a", "fish_count": 2000}
                    ],
                },
            ),
            OpenApiExample(
                "Additional cycle",
                request_only=True,
                value={
                    "launch_uuid": "22222222-2222-4222-8222-222222222222",
                    "launch_kind": "additional_cycle",
                    "cycle": {
                        "cycle_name": "Cycle Clarias Bassin Nord",
                        "species": "clarias",
                        "start_date": "2026-07-12",
                        "initial_count": 1200,
                        "planned_cycle_duration_days": 120,
                        "expected_survival_rate_pct": "95.00",
                        "fingerlings_cost_fcfa": "60000.00",
                        "other_operational_costs_fcfa": "8000.00",
                    },
                    "production_units": [
                        {
                            "local_id": "existing-unit-a",
                            "source": "existing",
                            "production_unit_id": "33333333-3333-4333-8333-333333333333",
                        }
                    ],
                    "allocations": [
                        {
                            "production_unit_local_id": "existing-unit-a",
                            "fish_count": 1200,
                        }
                    ],
                },
            ),
        ],
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
        except IntegrityError as exc:
            from rest_framework.exceptions import ValidationError

            raise ValidationError(translate_production_unit_integrity_error(exc)) from exc

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
