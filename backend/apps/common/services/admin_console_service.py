"""Lectures agregees du tableau de bord Admin, sans mutation metier."""

from __future__ import annotations

from common.admin_capabilities import AdminCapability, has_capability_and_permission
from django.db.models import Sum
from django.urls import reverse
from django.utils.translation import gettext_lazy as _


class AdminConsoleService:
    """Assemble uniquement les blocs autorises pour l'utilisateur courant."""

    @staticmethod
    def dashboard_cards(user) -> list[dict]:
        cards: list[dict] = []

        if has_capability_and_permission(
            user, AdminCapability.VIEW_FARM_DIRECTORY, "accounts.view_farmprofile"
        ):
            from accounts.models import FarmProfile

            cards.append(
                {
                    "key": "farms",
                    "label": _("Fermes"),
                    "value": FarmProfile.objects.filter(is_deleted=False).count(),
                    "url": reverse("admin:accounts_farmprofile_changelist"),
                    "icon": "fas fa-warehouse",
                }
            )
        if has_capability_and_permission(user, AdminCapability.VIEW_USERS, "accounts.view_user"):
            from accounts.models import User

            cards.append(
                {
                    "key": "users",
                    "label": _("Utilisateurs actifs"),
                    "value": User.objects.filter(is_active=True, is_staff=False).count(),
                    "url": reverse("admin:accounts_user_changelist"),
                    "icon": "fas fa-users",
                }
            )
        if has_capability_and_permission(
            user, AdminCapability.VIEW_AQUACULTURE_SUPERVISION, "aquaculture.view_sanitarylog"
        ):
            from aquaculture.models import SanitaryLog

            cards.append(
                {
                    "key": "sanitary_logs",
                    "label": _("Incidents sanitaires actifs"),
                    "value": SanitaryLog.objects.filter(resolved=False).count(),
                    "url": reverse("admin:aquaculture_sanitarylog_changelist"),
                    "icon": "fas fa-notes-medical",
                }
            )
        if has_capability_and_permission(user, AdminCapability.VIEW_COMMERCE, "commerce.view_order"):
            from commerce.models import Order

            cards.append(
                {
                    "key": "orders",
                    "label": _("Commandes"),
                    "value": Order.objects.count(),
                    "url": reverse("admin:commerce_order_changelist"),
                    "icon": "fas fa-receipt",
                }
            )
        if has_capability_and_permission(
            user, AdminCapability.MANAGE_SUPPORT, "chat.view_conversation"
        ):
            from chat.models import Conversation

            unread = Conversation.objects.aggregate(total=Sum("unread_count_admin"))["total"] or 0
            cards.append(
                {
                    "key": "support",
                    "label": _("Messages Support non lus"),
                    "value": unread,
                    "url": reverse("admin:chat_support_inbox"),
                    "icon": "fas fa-inbox",
                }
            )

        return cards
