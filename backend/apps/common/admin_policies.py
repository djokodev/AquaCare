"""Politiques et constantes RBAC pour l'admin Django."""

from __future__ import annotations

from django.http import HttpRequest


class RBACConstants:
    """Constantes pour le systeme RBAC AquaCare."""

    GROUP_MANAGERS = "aquacare_managers"
    GROUP_COMMERCE = "aquacare_commerce"
    GROUP_SUPPORT = "aquacare_support"

    LEGACY_GROUP_ALIASES: dict[str, tuple[str, ...]] = {}

    ROLE_APPS = {
        GROUP_MANAGERS: ["accounts", "aquaculture", "notifications"],
        GROUP_COMMERCE: ["commerce", "aquaculture"],
        GROUP_SUPPORT: ["chat", "notifications"],
    }

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


def _user_has_group(request: HttpRequest, group_name: str) -> bool:
    return request.user.groups.filter(
        name__in=RBACConstants.group_names_for(group_name),
    ).exists()


class RoleAwareAdminMixin:
    """Helpers compacts pour exprimer les checks de role admin."""

    @staticmethod
    def _is_superuser(request: HttpRequest) -> bool:
        return request.user.is_superuser

    @staticmethod
    def _has_role(request: HttpRequest, group_name: str) -> bool:
        return _user_has_group(request, group_name)
