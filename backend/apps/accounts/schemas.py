"""Elements OpenAPI reutilisables pour les endpoints accounts."""

from __future__ import annotations

from drf_spectacular.utils import OpenApiExample, OpenApiResponse

from .serializers import (
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
            value={"phone_number": ["Format de numéro invalide."]},
            response_only=True,
            status_codes=["400"],
        ),
        OpenApiExample(
            "Erreur globale",
            value={"non_field_errors": ["Identifiants invalides."]},
            response_only=True,
            status_codes=["400"],
        ),
    ],
)
AUTH_REQUIRED_RESPONSE = OpenApiResponse(
    response=DetailErrorResponseSerializer,
    description="Authentification JWT requise ou token invalide.",
    examples=[
        OpenApiExample(
            "Authentification requise",
            value={"detail": "Informations d'authentification non fournies."},
            response_only=True,
            status_codes=["401"],
        ),
    ],
)
FORBIDDEN_RESPONSE = OpenApiResponse(
    response=DetailErrorResponseSerializer,
    description="Action interdite pour l'utilisateur authentifié.",
)
NOT_FOUND_RESPONSE = OpenApiResponse(
    response=DetailErrorResponseSerializer,
    description="Ressource introuvable pour l'utilisateur authentifié.",
)
THROTTLED_RESPONSE = OpenApiResponse(
    response=DetailErrorResponseSerializer,
    description="Trop de requêtes. Le client mobile doit attendre avant de réessayer.",
    examples=[
        OpenApiExample(
            "Rate limit",
            value={"detail": "Requête ralentie. Réessayez plus tard."},
            response_only=True,
            status_codes=["429"],
        ),
    ],
)
TOKEN_ERROR_RESPONSE = OpenApiResponse(
    response=DetailErrorResponseSerializer,
    description="Token absent, invalide, expiré ou associé à un compte désactivé.",
    examples=[
        OpenApiExample(
            "Token invalide",
            value={"detail": "Token is invalid or expired", "code": "token_not_valid"},
            response_only=True,
            status_codes=["401"],
        ),
    ],
)
