"""Navigation metier, dedupliquee et adaptee aux capacites admin."""

from __future__ import annotations

from dataclasses import dataclass

from django.urls import NoReverseMatch, reverse
from django.utils.translation import gettext_lazy as _

from .admin_capabilities import AdminCapability, has_capability_and_permission


@dataclass(frozen=True)
class AdminNavigationItem:
    key: str
    label: object
    icon: str
    url: str
    badge_key: str | None = None


def _item(key: str, label, icon: str, url_name: str, badge_key: str | None = None):
    try:
        url = reverse(url_name)
    except NoReverseMatch:
        return None
    return AdminNavigationItem(key, label, icon, url, badge_key)


def navigation_for_user(user) -> list[AdminNavigationItem]:
    """Construit l'union des menus sans exposer un ecran non autorise."""
    items: list[AdminNavigationItem | None] = [
        _item("dashboard", _("Tableau de bord"), "fas fa-home", "admin:index"),
    ]

    if has_capability_and_permission(
        user, AdminCapability.VIEW_FARM_DIRECTORY, "accounts.view_farmprofile"
    ):
        items.append(
            _item("farms", _("Fermes"), "fas fa-warehouse", "admin:accounts_farmprofile_changelist")
        )
    if has_capability_and_permission(user, AdminCapability.VIEW_USERS, "accounts.view_user"):
        items.append(_item("users", _("Utilisateurs"), "fas fa-users", "admin:accounts_user_changelist"))
    if has_capability_and_permission(
        user,
        AdminCapability.VIEW_AQUACULTURE_SUPERVISION,
        "aquaculture.view_cyclelog",
    ):
        items.append(
            _item(
                "activity",
                _("Activites et alertes"),
                "fas fa-bell",
                "admin:index",
                "cycle_logs",
            )
        )
    if has_capability_and_permission(
        user, AdminCapability.VIEW_REPORTS, "aquaculture.view_productionreport"
    ):
        items.append(
            _item(
                "reports",
                _("Rapports"),
                "fas fa-chart-line",
                "admin:aquaculture_productionreport_changelist",
                "production_reports",
            )
        )
    if has_capability_and_permission(user, AdminCapability.VIEW_COMMERCE, "commerce.view_order"):
        items.append(
            _item(
                "orders",
                _("Commandes"),
                "fas fa-receipt",
                "admin:commerce_order_changelist",
                "orders",
            )
        )
    if has_capability_and_permission(user, AdminCapability.MANAGE_COMMERCE, "commerce.view_product"):
        items.append(
            _item("products", _("Produits"), "fas fa-box", "admin:commerce_product_changelist")
        )
    if has_capability_and_permission(
        user, AdminCapability.MANAGE_SUPPORT, "chat.view_conversation"
    ):
        items.append(
            _item(
                "support",
                _("Boite Support"),
                "fas fa-inbox",
                "admin:chat_support_inbox",
                "chat",
            )
        )
    if user.is_superuser:
        items.append(_item("system", _("Outils systeme"), "fas fa-cogs", "admin:auth_group_changelist"))

    return [item for item in items if item is not None]
