"""Navigation metier, dedupliquee et adaptee aux capacites admin."""

from __future__ import annotations

from dataclasses import dataclass

from django.urls import NoReverseMatch, reverse
from django.utils.translation import gettext_lazy as _

from .admin_capabilities import (
    AdminCapability,
    can_view_aquaculture_activity_center,
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
        if user.is_superuser or has_capability_and_permission(
            user, AdminCapability.MANAGE_ACCOUNTS, "accounts.view_farmprofile"
        ):
            append(_item("farm_map", _("Carte des fermes"), "fas fa-map-marked-alt", "admin:accounts_farmprofile_map"))
        if has_capability_and_permission(user, AdminCapability.VIEW_USERS, "accounts.view_user"):
            append(_item("users", _("Utilisateurs"), "fas fa-users", "admin:accounts_user_changelist"))
        if can_view_aquaculture_activity_center(user):
            append(
                _item(
                    "activity",
                    _("Saisies et incidents"),
                    "fas fa-clipboard-list",
                    "admin:aquacare_activity_center",
                    "activity_alerts",
                )
            )
        if has_capability_and_permission(
            user, AdminCapability.VIEW_REPORTS, "aquaculture.view_productionreport"
        ):
            append(
                _item(
                    "reports",
                    _("Rapports"),
                    "fas fa-file-alt",
                    "admin:aquaculture_productionreport_changelist",
                    "reports",
                )
            )

    if commerce and has_capability_and_permission(
        user, AdminCapability.VIEW_COMMERCE, "commerce.view_order"
    ):
        append(
            _item(
                "commerce",
                _("Commerce"),
                "fas fa-store",
                "admin:aquacare_commerce",
            )
        )
        if has_capability_and_permission(user, AdminCapability.VIEW_COMMERCE, "commerce.view_order"):
            append(_item("orders", _("Commandes"), "fas fa-receipt", "admin:commerce_order_changelist", "orders"))
        if has_capability_and_permission(user, AdminCapability.MANAGE_COMMERCE, "commerce.view_product"):
            append(_item("products", _("Produits"), "fas fa-box", "admin:commerce_product_changelist"))

    if support:
        if has_capability_and_permission(user, AdminCapability.MANAGE_SUPPORT, "chat.view_conversation"):
            append(_item("support", _("Boite de reception"), "fas fa-inbox", "admin:chat_support_inbox", "chat"))
        if has_capability_and_permission(user, AdminCapability.VIEW_USERS, "accounts.view_user"):
            append(_item("users", _("Utilisateurs"), "fas fa-users", "admin:accounts_user_changelist"))
        if has_capability_and_permission(
            user, AdminCapability.VIEW_FARM_DIRECTORY, "accounts.view_farmprofile"
        ):
            append(_item("farms", _("Fermes"), "fas fa-warehouse", "admin:accounts_farmprofile_changelist"))

    if user.is_superuser:
        append(_item("system", _("Outils systeme"), "fas fa-cogs", "admin:aquacare_system_tools"))

    return items


# Écrans hors menu rattachés à l'entrée qui les contient logiquement.
NAVIGATION_ALIASES = {
    "activity": ("admin:aquaculture_sanitarylog_changelist", "admin:aquaculture_cyclelog_changelist"),
    "farms": (
        "admin:aquaculture_productionunit_changelist",
        "admin:aquaculture_productioncycle_changelist",
        "admin:aquaculture_cycleunitallocation_changelist",
    ),
    "reports": ("admin:aquaculture_reportdispatchlog_changelist",),
    "orders": ("admin:commerce_orderitem_changelist",),
    "support": ("admin:chat_conversation_changelist", "admin:chat_message_changelist"),
}


def _alias_prefixes(key: str) -> list[str]:
    prefixes = []
    for url_name in NAVIGATION_ALIASES.get(key, ()):
        try:
            prefixes.append(reverse(url_name))
        except NoReverseMatch:
            continue
    return prefixes


def active_navigation_key(items: list[AdminNavigationItem], path: str) -> str | None:
    """
    Élément du menu à surligner : celui dont l'adresse est le plus long préfixe
    de la page courante (une fiche ferme surligne « Fermes », la carte surligne
    « Carte des fermes »). Le tableau de bord n'est actif que sur sa propre page.
    Les écrans hors menu surlignent l'entrée qui les contient, sinon « Outils
    système » pour le superadministrateur.
    """
    best_key, best_length = None, -1
    for item in items:
        for base in [item.url.split("#", 1)[0], *_alias_prefixes(item.key)]:
            if base == path or (base.count("/") > 2 and path.startswith(base)):
                if len(base) > best_length:
                    best_key, best_length = item.key, len(base)
    if best_key is None and any(item.key == "system" for item in items):
        index = reverse("admin:index")
        excluded = []
        for url_name in ("admin:aquacare_global_search", "admin:password_change", "admin:logout"):
            try:
                excluded.append(reverse(url_name))
            except NoReverseMatch:
                continue
        if path != index and path.startswith(index) and not any(path.startswith(url) for url in excluded):
            best_key = "system"
    return best_key
