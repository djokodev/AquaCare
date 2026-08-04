"""Politiques et constantes RBAC pour l'admin Django."""

from __future__ import annotations

from django.http import HttpRequest


class RBACConstants:
    """Constantes pour le systeme RBAC AquaCare."""

    GROUP_MANAGERS = "aquacare_managers"
    GROUP_COMMERCE = "aquacare_commerce"
    GROUP_SUPPORT = "aquacare_support"

    LEGACY_GROUP_ALIASES: dict[str, tuple[str, ...]] = {}

    SENSITIVE_FIELDS = [
        "phone_number",
        "password",
        "last_login",
        "expo_push_token",
        "device_id",
    ]

    @classmethod
    def group_names_for(cls, group_name: str) -> tuple[str, ...]:
        """Retourne le nom cible AquaCare et ses aliases historiques acceptes."""
        return (group_name, *cls.LEGACY_GROUP_ALIASES.get(group_name, ()))


class RoleAwareAdminMixin:
    """Helper commun sans décision d'autorisation fondée sur un groupe."""

    @staticmethod
    def _is_superuser(request: HttpRequest) -> bool:
        return request.user.is_superuser
