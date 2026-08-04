"""Capacites metier de la console d'administration AquaCare.

Une capacite donne acces a un ecran ou a un bloc de supervision. Elle ne
remplace jamais les permissions Django du modele affiche par ce bloc.
"""

from __future__ import annotations

from enum import StrEnum

from .admin_policies import RBACConstants


class AdminCapability(StrEnum):
    ACCESS_CONSOLE = "access_console"
    USE_GLOBAL_SEARCH = "use_global_search"
    VIEW_USERS = "view_users"
    VIEW_FARM_DIRECTORY = "view_farm_directory"
    VIEW_FARM_CONTEXT = "view_farm_context"
    MANAGE_ACCOUNTS = "manage_accounts"
    MANAGE_AQUACULTURE_CONFIGURATION = "manage_aquaculture_configuration"
    VIEW_AQUACULTURE_SUPERVISION = "view_aquaculture_supervision"
    RESOLVE_SANITARY_ISSUES = "resolve_sanitary_issues"
    VIEW_REPORTS = "view_reports"
    MANAGE_COMMERCE = "manage_commerce"
    VIEW_COMMERCE = "view_commerce"
    MANAGE_SUPPORT = "manage_support"
    VIEW_NOTIFICATIONS = "view_notifications"
    MANAGE_SYSTEM = "manage_system"


ROLE_CAPABILITIES: dict[str, frozenset[AdminCapability]] = {
    RBACConstants.GROUP_MANAGERS: frozenset(
        {
            AdminCapability.ACCESS_CONSOLE,
            AdminCapability.USE_GLOBAL_SEARCH,
            AdminCapability.VIEW_USERS,
            AdminCapability.VIEW_FARM_DIRECTORY,
            AdminCapability.VIEW_FARM_CONTEXT,
            AdminCapability.MANAGE_ACCOUNTS,
            AdminCapability.MANAGE_AQUACULTURE_CONFIGURATION,
            AdminCapability.VIEW_AQUACULTURE_SUPERVISION,
            AdminCapability.RESOLVE_SANITARY_ISSUES,
            AdminCapability.VIEW_REPORTS,
            AdminCapability.VIEW_COMMERCE,
            AdminCapability.VIEW_NOTIFICATIONS,
        }
    ),
    RBACConstants.GROUP_COMMERCE: frozenset(
        {
            AdminCapability.ACCESS_CONSOLE,
            AdminCapability.USE_GLOBAL_SEARCH,
            AdminCapability.VIEW_FARM_CONTEXT,
            AdminCapability.MANAGE_COMMERCE,
            AdminCapability.VIEW_COMMERCE,
        }
    ),
    RBACConstants.GROUP_SUPPORT: frozenset(
        {
            AdminCapability.ACCESS_CONSOLE,
            AdminCapability.USE_GLOBAL_SEARCH,
            AdminCapability.VIEW_USERS,
            AdminCapability.VIEW_FARM_DIRECTORY,
            AdminCapability.VIEW_FARM_CONTEXT,
            AdminCapability.MANAGE_SUPPORT,
            AdminCapability.VIEW_NOTIFICATIONS,
        }
    ),
}

# Permissions de modele derivees de la meme matrice que les capacites. Les
# ecrans personnalises appliquent les deux niveaux; les ModelAdmin conservent
# en plus leurs garde-fous objet/action.
ROLE_DJANGO_PERMISSIONS: dict[str, tuple[str, ...]] = {
    RBACConstants.GROUP_MANAGERS: (
        "accounts.view_user",
        "accounts.change_user",
        "accounts.view_farmprofile",
        "accounts.add_farmprofile",
        "accounts.change_farmprofile",
        "aquaculture.view_productionunit",
        "aquaculture.add_productionunit",
        "aquaculture.change_productionunit",
        "aquaculture.view_productioncycle",
        "aquaculture.view_cycleunitallocation",
        "aquaculture.view_cyclelog",
        "aquaculture.view_feedingplan",
        "aquaculture.view_sanitarylog",
        "aquaculture.change_sanitarylog",
        "aquaculture.view_calibrationoperation",
        "aquaculture.view_finalharvestoperation",
        "aquaculture.view_nutritionalguide",
        "aquaculture.view_cyclemetrics",
        "aquaculture.view_productionreport",
        "aquaculture.change_productionreport",
        "aquaculture.view_reportdispatchlog",
        "commerce.view_order",
        "commerce.view_orderitem",
        "notifications.view_notification",
        "notifications.view_notificationpreference",
        "notifications.view_pushtoken",
    ),
    RBACConstants.GROUP_COMMERCE: (
        "accounts.view_farmprofile",
        "aquaculture.view_nutritionalguide",
        "commerce.view_product",
        "commerce.add_product",
        "commerce.change_product",
        "commerce.view_order",
        "commerce.change_order",
        "commerce.view_orderitem",
    ),
    RBACConstants.GROUP_SUPPORT: (
        "accounts.view_user",
        "accounts.view_farmprofile",
        "chat.view_conversation",
        "chat.change_conversation",
        "chat.view_message",
        "chat.add_message",
        "notifications.view_notification",
        "notifications.view_notificationpreference",
        "notifications.view_pushtoken",
    ),
}

ALL_CAPABILITIES = frozenset(AdminCapability)


def _role_names(user) -> frozenset[str]:
    if not getattr(user, "is_authenticated", False):
        return frozenset()
    cached = getattr(user, "_aquacare_admin_role_names", None)
    if cached is None:
        cached = frozenset(user.groups.values_list("name", flat=True))
        user._aquacare_admin_role_names = cached
    return cached


def capabilities_for_user(user) -> frozenset[AdminCapability]:
    """Retourne l'union deterministe des capacites des roles d'un utilisateur."""
    if not getattr(user, "is_authenticated", False) or not getattr(user, "is_staff", False):
        return frozenset()
    if getattr(user, "is_superuser", False):
        return ALL_CAPABILITIES

    role_names = _role_names(user)
    return frozenset(
        capability
        for role_name, role_capabilities in ROLE_CAPABILITIES.items()
        if role_name in role_names
        for capability in role_capabilities
    )


def has_capability(user, capability: AdminCapability) -> bool:
    return capability in capabilities_for_user(user)


def has_capability_and_permission(
    user,
    capability: AdminCapability,
    permission: str,
) -> bool:
    """Applique la regle console: capacite d'abord, permission Django ensuite."""
    return has_capability(user, capability) and user.has_perm(permission)


def capability_fingerprint(user) -> str:
    """Cle stable pour isoler les caches selon l'ensemble effectif de capacites."""
    return ".".join(sorted(capability.value for capability in capabilities_for_user(user))) or "none"
