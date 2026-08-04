"""Navigation metier, dedupliquee et adaptee aux capacites admin."""

from __future__ import annotations

from dataclasses import dataclass

from django.urls import NoReverseMatch, reverse
from django.utils.translation import gettext_lazy as _

from .admin_capabilities import (
    AdminCapability,
    has_capability_and_permission,
    role_names_for_user,
)
from .admin_policies import RBACConstants


@dataclass(frozen=True)
class AdminNavigationItem:
    key: str
    label: object
    icon: str
    url: str
    badge_key: str | None = None


def _item(
    key: str,
    label,
    icon: str,
    url_name: str,
    badge_key: str | None = None,
    fragment: str = "",
):
    try:
        url = reverse(url_name)
    except NoReverseMatch:
        return None
    return AdminNavigationItem(key, label, icon, f"{url}{fragment}", badge_key)


def navigation_for_user(user) -> list[AdminNavigationItem]:
    """Construit l'union des menus sans exposer un ecran non autorise."""
    items: list[AdminNavigationItem] = []
    seen: set[str] = set()

    def append(item):
        if item is not None and item.key not in seen:
            items.append(item)
            seen.add(item.key)

    roles = role_names_for_user(user)
    manager = user.is_superuser or RBACConstants.GROUP_MANAGERS in roles
    commerce = user.is_superuser or RBACConstants.GROUP_COMMERCE in roles
    support = user.is_superuser or RBACConstants.GROUP_SUPPORT in roles

    if manager:
        append(_item("dashboard", _("Tableau de bord"), "fas fa-home", "admin:index"))
        if has_capability_and_permission(
            user, AdminCapability.VIEW_FARM_DIRECTORY, "accounts.view_farmprofile"
        ):
            append(_item("farms", _("Fermes"), "fas fa-warehouse", "admin:accounts_farmprofile_changelist"))
        if has_capability_and_permission(user, AdminCapability.VIEW_USERS, "accounts.view_user"):
            append(_item("users", _("Utilisateurs"), "fas fa-users", "admin:accounts_user_changelist"))
        if has_capability_and_permission(
            user, AdminCapability.VIEW_AQUACULTURE_SUPERVISION, "aquaculture.view_cyclelog"
        ):
            append(
                _item(
                    "activity",
                    _("Activites et alertes"),
                    "fas fa-bell",
                    "admin:index",
                    "activity_alerts",
                    "#activities-alerts",
                )
            )
        if has_capability_and_permission(
            user, AdminCapability.VIEW_REPORTS, "aquaculture.view_productionreport"
        ):
            append(
                _item(
                    "reports",
                    _("Rapports"),
                    "fas fa-chart-line",
                    "admin:aquaculture_productionreport_changelist",
                    "reports",
                )
            )

    if commerce:
        append(
            _item(
                "commerce_dashboard",
                _("Tableau de bord commerce"),
                "fas fa-chart-pie",
                "admin:index",
            )
        )
        if has_capability_and_permission(user, AdminCapability.VIEW_COMMERCE, "commerce.view_order"):
            append(_item("orders", _("Commandes"), "fas fa-receipt", "admin:commerce_order_changelist", "orders"))
        if has_capability_and_permission(user, AdminCapability.MANAGE_COMMERCE, "commerce.view_product"):
            append(_item("products", _("Produits"), "fas fa-box", "admin:commerce_product_changelist"))

    if support:
        if has_capability_and_permission(user, AdminCapability.MANAGE_SUPPORT, "chat.view_conversation"):
            append(_item("support", _("Boite de reception"), "fas fa-inbox", "admin:chat_support_inbox", "chat"))
            append(_item("conversations", _("Conversations"), "fas fa-comments", "admin:chat_conversation_changelist"))
        if has_capability_and_permission(user, AdminCapability.VIEW_USERS, "accounts.view_user"):
            append(_item("users", _("Utilisateurs"), "fas fa-users", "admin:accounts_user_changelist"))
        if has_capability_and_permission(
            user, AdminCapability.VIEW_FARM_DIRECTORY, "accounts.view_farmprofile"
        ):
            append(_item("farms", _("Fermes"), "fas fa-warehouse", "admin:accounts_farmprofile_changelist"))

    if user.is_superuser:
        append(_item("system", _("Outils systeme"), "fas fa-cogs", "admin:aquacare_system_tools"))

    return items
