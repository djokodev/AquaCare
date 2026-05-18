"""Reusable OpenAPI responses for aquaculture production-plan endpoints."""

from __future__ import annotations

from drf_spectacular.utils import OpenApiExample, OpenApiResponse

from .production_plan_serializers import (
    DetailErrorResponseSerializer,
    ValidationErrorResponseSerializer,
)


VALIDATION_ERROR_RESPONSE = OpenApiResponse(
    response=ValidationErrorResponseSerializer,
    description=(
        "Erreur de validation DRF. Le payload contient un dictionnaire par champ "
        "et/ou non_field_errors."
    ),
    examples=[
        OpenApiExample(
            "Erreur de validation",
            value={"setup_unit_count": ["Le nombre d'unités doit être supérieur à 0."]},
            response_only=True,
            status_codes=["400"],
        ),
        OpenApiExample(
            "Erreur globale",
            value={"non_field_errors": ["Données invalides."]},
            response_only=True,
            status_codes=["400"],
        ),
    ],
)

AUTH_REQUIRED_RESPONSE = OpenApiResponse(
    response=DetailErrorResponseSerializer,
    description='Authentification JWT requise ou token invalide.',
    examples=[
        OpenApiExample(
            "Authentification requise",
            value={"detail": "Informations d'authentification non fournies."},
            response_only=True,
            status_codes=["401"],
        ),
    ],
)

NOT_FOUND_RESPONSE = OpenApiResponse(
    response=DetailErrorResponseSerializer,
    description="Ressource introuvable pour l'utilisateur authentifié.",
)

THROTTLED_RESPONSE = OpenApiResponse(
    response=DetailErrorResponseSerializer,
    description='Trop de requêtes. Réessayez plus tard.',
    examples=[
        OpenApiExample(
            'Rate limit',
            value={"detail": "Requête ralentie. Réessayez plus tard."},
            response_only=True,
            status_codes=["429"],
        ),
    ],
)
