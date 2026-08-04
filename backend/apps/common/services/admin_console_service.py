"""Lectures agrégées du tableau de bord Admin, sans mutation métier."""

from __future__ import annotations

from datetime import timedelta

from common.admin_capabilities import AdminCapability, has_capability_and_permission
from django.db.models import Count, Q, Sum
from django.urls import reverse
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class AdminConsoleService:
    """Assemble des blocs indépendants protégés par capacité et permission."""

    PREVIEW_LIMIT = 10

    @classmethod
    def dashboard_context(cls, user) -> dict:
        cards: list[dict] = []
        activities: list[dict] = []
        attention: list[dict] = []
        shortcuts: list[dict] = []
        support_conversations: list[dict] = []

        if has_capability_and_permission(
            user,
            AdminCapability.VIEW_AQUACULTURE_SUPERVISION,
            "aquaculture.view_productioncycle",
        ):
            manager_context = cls._manager_context(user)
            cards.extend(manager_context["cards"])
            activities.extend(manager_context["activities"])
            attention.extend(manager_context["attention"])

        if has_capability_and_permission(user, AdminCapability.MANAGE_COMMERCE, "commerce.view_order"):
            commerce_context = cls._commerce_context()
            cards.extend(commerce_context["cards"])
            activities.extend(commerce_context["activities"])
            shortcuts.extend(commerce_context["shortcuts"])

        if has_capability_and_permission(
            user,
            AdminCapability.MANAGE_SUPPORT,
            "chat.view_conversation",
        ):
            support_context = cls._support_context()
            cards.extend(support_context["cards"])
            activities.extend(support_context["activities"])
            support_conversations.extend(support_context["conversations"])
            shortcuts.extend(support_context["shortcuts"])

        activities.sort(key=lambda item: item["occurred_at"], reverse=True)
        return {
            "dashboard_cards": cls._deduplicate(cards),
            "dashboard_activities": activities[: cls.PREVIEW_LIMIT],
            "dashboard_attention": attention[: cls.PREVIEW_LIMIT],
            "dashboard_shortcuts": cls._deduplicate(shortcuts),
            "dashboard_support_conversations": support_conversations,
        }

    @classmethod
    def dashboard_cards(cls, user) -> list[dict]:
        """Compatibilité avec les appels existants du lot 1."""
        return cls.dashboard_context(user)["dashboard_cards"]

    @staticmethod
    def _deduplicate(items: list[dict]) -> list[dict]:
        seen: set[str] = set()
        result: list[dict] = []
        for item in items:
            if item["key"] not in seen:
                result.append(item)
                seen.add(item["key"])
        return result

    @classmethod
    def _manager_context(cls, user) -> dict:
        from accounts.models import FarmProfile
        from aquaculture.models import (
            CycleLog,
            ProductionCycle,
            ProductionReport,
            ProductionUnit,
            SanitaryLog,
        )

        active_farms = FarmProfile.objects.filter(is_deleted=False)
        cards = [
            cls._card(
                "active_farms",
                _("Fermes actives suivies"),
                active_farms.count(),
                "admin:accounts_farmprofile_changelist",
                "fas fa-warehouse",
            ),
            cls._card(
                "active_units",
                _("Unités actives"),
                ProductionUnit.objects.filter(
                    farm_profile__is_deleted=False,
                    status="active",
                ).count(),
                "admin:aquaculture_productionunit_changelist",
                "fas fa-water",
            ),
            cls._card(
                "active_cycles",
                _("Cycles actifs"),
                ProductionCycle.objects.filter(
                    farm_profile__is_deleted=False,
                    status="active",
                ).count(),
                "admin:aquaculture_productioncycle_changelist",
                "fas fa-fish",
            ),
            cls._card(
                "unresolved_sanitary",
                _("Incidents sanitaires non résolus"),
                SanitaryLog.objects.filter(
                    cycle__farm_profile__is_deleted=False,
                    resolved=False,
                ).count(),
                "admin:aquaculture_sanitarylog_changelist",
                "fas fa-notes-medical",
            ),
            cls._card(
                "recent_reports",
                _("Rapports récents"),
                ProductionReport.objects.filter(
                    farm_profile__is_deleted=False,
                    is_deleted=False,
                    created_at__gte=timezone.now() - timedelta(days=30),
                ).count(),
                "admin:aquaculture_productionreport_changelist",
                "fas fa-chart-line",
            ),
        ]

        attention_farms = (
            active_farms.annotate(
                incident_count=Count(
                    "production_cycles__sanitary_logs",
                    filter=Q(production_cycles__sanitary_logs__resolved=False),
                    distinct=True,
                )
            )
            .filter(incident_count__gt=0)
            .order_by("-incident_count", "farm_name")[: cls.PREVIEW_LIMIT]
        )
        attention = [
            {
                "key": f"farm-{farm.pk}",
                "label": farm.farm_name,
                "detail": _("%(count)s incident(s) non résolu(s)")
                % {"count": farm.incident_count},
                "url": reverse("admin:accounts_farmprofile_supervision", args=[farm.pk]),
            }
            for farm in attention_farms
        ]

        activities: list[dict] = []
        if user.has_perm("aquaculture.view_cyclelog"):
            for item in CycleLog.objects.filter(
                cycle__farm_profile__is_deleted=False
            ).select_related("cycle__farm_profile").order_by("-created_at")[
                : cls.PREVIEW_LIMIT
            ]:
                activities.append(
                    cls._activity(
                        f"cycle-log-{item.pk}",
                        _("Journal de cycle — %(farm)s") % {"farm": item.cycle.farm_profile.farm_name},
                        item.created_at,
                        reverse("admin:aquaculture_cyclelog_change", args=[item.pk]),
                    )
                )
        if user.has_perm("aquaculture.view_sanitarylog"):
            for item in SanitaryLog.objects.filter(
                cycle__farm_profile__is_deleted=False
            ).select_related("cycle__farm_profile").order_by("-created_at")[
                : cls.PREVIEW_LIMIT
            ]:
                activities.append(
                    cls._activity(
                        f"sanitary-{item.pk}",
                        _("Evenement sanitaire — %(farm)s")
                        % {"farm": item.cycle.farm_profile.farm_name},
                        item.created_at,
                        reverse("admin:aquaculture_sanitarylog_change", args=[item.pk]),
                    )
                )
        return {"cards": cards, "activities": activities, "attention": attention}

    @classmethod
    def _commerce_context(cls) -> dict:
        from commerce.models import Order, Product

        status_labels = {
            "confirmed": _("Commandes confirmées"),
            "delivered": _("Commandes livrées"),
            "ready_for_pickup": _("Commandes prêtes au retrait"),
            "received": _("Commandes reçues"),
        }
        status_counts = {
            row["status"]: row["count"]
            for row in Order.objects.values("status").annotate(count=Count("id"))
        }
        cards = [
            cls._card(
                f"orders_{status}",
                label,
                status_counts.get(status, 0),
                "admin:commerce_order_changelist",
                "fas fa-receipt",
                query=f"?status__exact={status}",
            )
            for status, label in status_labels.items()
        ]
        cards.extend(
            [
                cls._card(
                    "orders_action_required",
                    _("Commandes nécessitant une action"),
                    status_counts.get("confirmed", 0),
                    "admin:commerce_order_changelist",
                    "fas fa-tasks",
                    query="?status__exact=confirmed",
                ),
                cls._card(
                    "products_available",
                    _("Produits disponibles"),
                    Product.objects.filter(is_available=True).count(),
                    "admin:commerce_product_changelist",
                    "fas fa-box-open",
                    query="?is_available__exact=1",
                ),
                cls._card(
                    "products_unavailable",
                    _("Produits indisponibles"),
                    Product.objects.filter(is_available=False).count(),
                    "admin:commerce_product_changelist",
                    "fas fa-box",
                    query="?is_available__exact=0",
                ),
            ]
        )
        activities = [
            cls._activity(
                f"order-{order.pk}",
                _("Commande %(number)s — %(status)s")
                % {"number": order.order_number, "status": order.get_status_display()},
                order.updated_at,
                reverse("admin:commerce_order_change", args=[order.pk]),
            )
            for order in Order.objects.order_by("-updated_at")[: cls.PREVIEW_LIMIT]
        ]
        shortcuts = [
            cls._shortcut("orders", _("Ouvrir les commandes"), "admin:commerce_order_changelist"),
            cls._shortcut("products", _("Gerer les produits"), "admin:commerce_product_changelist"),
        ]
        return {"cards": cards, "activities": activities, "shortcuts": shortcuts}

    @classmethod
    def _support_context(cls) -> dict:
        from chat.models import Conversation

        unread = Conversation.objects.aggregate(total=Sum("unread_count_admin"))["total"] or 0
        conversations = Conversation.objects.order_by("-last_message_at")[: cls.PREVIEW_LIMIT]
        recent_items = [
            cls._activity(
                f"conversation-{conversation.pk}",
                _("Conversation récente"),
                conversation.last_message_at,
                f'{reverse("admin:chat_support_inbox")}?conversation={conversation.pk}',
            )
            for conversation in conversations
        ]
        return {
            "cards": [
                cls._card(
                    "support_unread",
                    _("Messages Support non lus"),
                    unread,
                    "admin:chat_support_inbox",
                    "fas fa-inbox",
                )
            ],
            "activities": recent_items,
            "conversations": recent_items,
            "shortcuts": [
                cls._shortcut("support_inbox", _("Ouvrir la boite de reception"), "admin:chat_support_inbox")
            ],
        }

    @staticmethod
    def _card(key, label, value, url_name, icon, *, query="") -> dict:
        return {
            "key": key,
            "label": label,
            "value": value,
            "url": f"{reverse(url_name)}{query}",
            "icon": icon,
        }

    @staticmethod
    def _activity(key, label, occurred_at, url) -> dict:
        return {"key": key, "label": label, "occurred_at": occurred_at, "url": url}

    @staticmethod
    def _shortcut(key, label, url_name) -> dict:
        return {"key": key, "label": label, "url": reverse(url_name)}
