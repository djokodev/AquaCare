"""API adapters for aquaculture production plan setup and simulation."""

from __future__ import annotations

import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response

from accounts.models import FarmProfile
from accounts.schemas import (
    AUTH_REQUIRED_RESPONSE,
    NOT_FOUND_RESPONSE,
    THROTTLED_RESPONSE,
    VALIDATION_ERROR_RESPONSE,
)
from accounts.serializers import (
    AnnualSimulationInputSerializer,
    AnnualSimulationResponseSerializer,
    FarmProfileSerializer,
    FarmSetupSerializer,
)
from accounts.services.profile_query_service import ProfileQueryService
from accounts.throttles import AccountFarmSetupThrottle, AccountSimulationThrottle
from aquaculture.services.annual_simulation_service import AnnualSimulationService
from aquaculture.services.farm_production_plan_service import FarmProductionPlanService

logger = logging.getLogger(__name__)


def _user_id(user) -> str:
    return str(user.pk)


def _raise_drf_validation_error(error: DjangoValidationError) -> None:
    if hasattr(error, "message_dict"):
        raise DRFValidationError(error.message_dict) from error
    if hasattr(error, "messages"):
        raise DRFValidationError(error.messages) from error
    raise DRFValidationError(str(error)) from error


class ProductionPlanSetupView(generics.UpdateAPIView):
    """
    POST/PATCH - Configure le plan de production initial d'une ferme.

    Cet endpoint aquaculture est le contrat canonique pour le flux
    "Creer mon elevage". Les anciens endpoints accounts restent disponibles
    comme aliases de compatibilite.
    """

    serializer_class = FarmSetupSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AccountFarmSetupThrottle]
    http_method_names = ["patch", "post"]

    def get_object(self):
        try:
            return ProfileQueryService.get_farm_profile(self.request.user.pk)
        except FarmProfile.DoesNotExist:
            raise Http404

    @extend_schema(
        summary="Mettre a jour la configuration initiale de production",
        description=(
            "Met a jour partiellement le plan de production aquacole. Une ferme "
            "incomplete ne peut pas etre marquee comme configuree sans tous les "
            "champs requis."
        ),
        request=FarmSetupSerializer,
        responses={
            200: OpenApiResponse(
                response=FarmProfileSerializer,
                description="Profil ferme complet apres sauvegarde du setup.",
            ),
            400: VALIDATION_ERROR_RESPONSE,
            401: AUTH_REQUIRED_RESPONSE,
            404: NOT_FOUND_RESPONSE,
            429: THROTTLED_RESPONSE,
        },
    )
    def patch(self, request, *args, **kwargs):
        farm = self.get_object()
        serializer = self.get_serializer(farm, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            updated = FarmProductionPlanService.complete_setup(
                farm,
                serializer.validated_data,
            )
        except DjangoValidationError as err:
            _raise_drf_validation_error(err)
        logger.info(
            "Aquaculture production plan setup completed",
            extra={
                "event": "aquaculture.production_plan.setup.completed",
                "endpoint": request.path,
                "user_id": _user_id(request.user),
                "farm_id": str(updated.pk),
                "status_code": status.HTTP_200_OK,
            },
        )
        return Response(
            FarmProfileSerializer(updated).data,
            status=status.HTTP_200_OK,
        )

    @extend_schema(
        summary="Completer la configuration initiale de production",
        description=(
            "Sauvegarde le formulaire Creer mon elevage et retourne le profil "
            "ferme complet, incluant farm_setup_completed et les champs setup "
            "readonly."
        ),
        request=FarmSetupSerializer,
        responses={
            200: OpenApiResponse(
                response=FarmProfileSerializer,
                description="Profil ferme complet apres completion du setup.",
            ),
            400: VALIDATION_ERROR_RESPONSE,
            401: AUTH_REQUIRED_RESPONSE,
            404: NOT_FOUND_RESPONSE,
            429: THROTTLED_RESPONSE,
        },
    )
    def post(self, request, *args, **kwargs):
        return self.patch(request, *args, **kwargs)


class ProductionPlanSimulationView(generics.GenericAPIView):
    """
    POST - Calcule une simulation annuelle de production sans persistance.
    """

    serializer_class = AnnualSimulationInputSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AccountSimulationThrottle]

    @extend_schema(
        summary="Simulation annuelle de production aquacole",
        description=(
            "Calcule la rentabilite previsionnelle sur l'annee entiere. "
            "Inclut les frais d'accompagnement AquaCare (20 FCFA/kg produit). "
            "Ne persiste aucune donnee, utilisez /production-plan/setup/ pour "
            "sauvegarder le setup."
        ),
        request=AnnualSimulationInputSerializer,
        responses={
            200: OpenApiResponse(
                response=AnnualSimulationResponseSerializer,
                description="Simulation annuelle calculee sans persistance.",
            ),
            400: VALIDATION_ERROR_RESPONSE,
            401: AUTH_REQUIRED_RESPONSE,
            429: THROTTLED_RESPONSE,
        },
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        result = AnnualSimulationService.simulate(
            species=data["species"],
            annual_production_target_kg=float(data["annual_production_target_kg"]),
            num_cycles=data["num_cycles"],
            start_date=data.get("start_date"),
            selling_price_per_kg_fcfa=(
                float(data["selling_price_per_kg_fcfa"])
                if data.get("selling_price_per_kg_fcfa") else None
            ),
            fingerlings_cost_per_unit_fcfa=(
                float(data["fingerlings_cost_per_unit_fcfa"])
                if data.get("fingerlings_cost_per_unit_fcfa") else None
            ),
            other_costs_fcfa_per_year=float(data.get("other_costs_fcfa_per_year") or 0),
            target_harvest_weight_g=(
                float(data["target_harvest_weight_g"])
                if data.get("target_harvest_weight_g") else None
            ),
            expected_survival_rate_pct=(
                float(data["expected_survival_rate_pct"])
                if data.get("expected_survival_rate_pct") else None
            ),
            total_fingerlings_count=data.get("total_fingerlings_count"),
        )
        logger.info(
            "Aquaculture annual production simulation completed",
            extra={
                "event": "aquaculture.production_plan.simulation.completed",
                "endpoint": request.path,
                "user_id": _user_id(request.user),
                "status_code": status.HTTP_200_OK,
            },
        )
        return Response(result, status=status.HTTP_200_OK)
