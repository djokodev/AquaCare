"""Politiques et constantes RBAC pour l'admin Django."""

from __future__ import annotations

from django.http import HttpRequest


def _user_has_group(request: HttpRequest, group_name: str) -> bool:
    return request.user.groups.filter(name=group_name).exists()


class RBACConstants:
    """Constantes pour le systeme RBAC AquaCare."""

    GROUP_MANAGERS = "mavecam_managers"
    GROUP_COMMERCE = "mavecam_commerce"
    GROUP_SUPPORT = "mavecam_support"

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


class RoleAwareAdminMixin:
    """Helpers compacts pour exprimer les checks de role admin."""

    @staticmethod
    def _is_superuser(request: HttpRequest) -> bool:
        return request.user.is_superuser

    @staticmethod
    def _has_role(request: HttpRequest, group_name: str) -> bool:
        return _user_has_group(request, group_name)
