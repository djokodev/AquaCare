"""Lectures de l'espace de supervision d'une ferme."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

from common.admin_capabilities import AdminCapability, has_capability_and_permission
from django.urls import reverse
from django.utils.translation import gettext_lazy as _


@dataclass(frozen=True)
class FarmActivity:
    source: str
    label: object
    occurred_at: datetime
    business_date: date | datetime | None
    url: str


class FarmSupervisionService:
    """Construit des blocs independants, chacun protege par capacite + permission."""

    PREVIEW_LIMIT = 10

    @classmethod
    def build(cls, *, user, farm) -> dict:
        sections: list[dict] = [cls._overview_section(user, farm)]

        if has_capability_and_permission(
            user,
            AdminCapability.VIEW_AQUACULTURE_SUPERVISION,
            "aquaculture.view_productionunit",
        ):
            sections.extend(cls._aquaculture_sections(user, farm))
        if has_capability_and_permission(user, AdminCapability.VIEW_COMMERCE, "commerce.view_order"):
            orders = farm.orders.select_related("production_cycle").order_by("-created_at")
            sections.append(
                {
                    "key": "orders",
                    "label": _("Commandes"),
                    "count": orders.count(),
                    "url": f'{reverse("admin:commerce_order_changelist")}?farm_profile__id__exact={farm.pk}',
                    "items": [
                        {
                            "label": order.order_number,
                            "status": order.get_status_display(),
                            "url": reverse("admin:commerce_order_change", args=[order.pk]),
                        }
                        for order in orders[: cls.PREVIEW_LIMIT]
                    ],
                }
            )
        if has_capability_and_permission(
            user, AdminCapability.MANAGE_SUPPORT, "chat.view_conversation"
        ):
            conversation = getattr(farm.user, "support_conversation", None)
            sections.append(
                {
                    "key": "support",
                    "label": _("Support"),
                    "count": conversation.messages.count() if conversation else 0,
                    "url": (
                        f'{reverse("admin:chat_support_inbox")}?conversation={conversation.pk}'
                        if conversation
                        else reverse("admin:chat_support_inbox")
                    ),
                    "items": (
                        [
                            {
                                "label": _("Message Support"),
                                "status": message.created_at,
                                "url": f'{reverse("admin:chat_support_inbox")}?conversation={conversation.pk}',
                            }
                            for message in conversation.messages.order_by("-created_at")[
                                : cls.PREVIEW_LIMIT
                            ]
                        ]
                        if conversation
                        else []
                    ),
                }
            )

        return {
            "sections": sections,
            "activities": cls.latest_activities(user=user, farm=farm),
        }

    @classmethod
    def _overview_section(cls, user, farm) -> dict:
        """Résumé limité aux données que le rôle peut réellement consulter."""
        items: list[dict] = []
        if has_capability_and_permission(
            user,
            AdminCapability.VIEW_AQUACULTURE_SUPERVISION,
            "aquaculture.view_productioncycle",
        ):
            active_cycles = farm.production_cycles.filter(status="active").count()
            items.append(
                {"label": _("Cycles actifs"), "status": active_cycles, "url": ""}
            )
        if has_capability_and_permission(user, AdminCapability.VIEW_COMMERCE, "commerce.view_order"):
            items.append(
                {"label": _("Commandes"), "status": farm.orders.count(), "url": ""}
            )
        if has_capability_and_permission(
            user,
            AdminCapability.MANAGE_SUPPORT,
            "chat.view_conversation",
        ):
            conversation = getattr(farm.user, "support_conversation", None)
            items.append(
                {
                    "label": _("Messages non lus"),
                    "status": conversation.unread_count_admin if conversation else 0,
                    "url": reverse("admin:chat_support_inbox"),
                }
            )
        return {
            "key": "overview",
            "label": _("Vue d'ensemble"),
            "count": None,
            "url": "#farm-overview",
            "items": items[: cls.PREVIEW_LIMIT],
        }

    @classmethod
    def _aquaculture_sections(cls, user, farm) -> list[dict]:
        from aquaculture.models import (
            CycleLog,
            FeedingPlan,
            ProductionCycle,
            ProductionReport,
            ProductionUnit,
            SanitaryLog,
        )

        definitions = [
            (
                "units",
                _("Unites"),
                ProductionUnit.objects.filter(farm_profile=farm).order_by("-created_at"),
                "admin:aquaculture_productionunit_changelist",
                "admin:aquaculture_productionunit_change",
                "aquaculture.view_productionunit",
            ),
            (
                "cycles",
                _("Cycles"),
                ProductionCycle.objects.filter(farm_profile=farm).order_by("-created_at"),
                "admin:aquaculture_productioncycle_changelist",
                "admin:aquaculture_productioncycle_change",
                "aquaculture.view_productioncycle",
            ),
            (
                "activity",
                _("Activite"),
                CycleLog.objects.filter(cycle__farm_profile=farm).order_by("-created_at"),
                "admin:aquaculture_cyclelog_changelist",
                "admin:aquaculture_cyclelog_change",
                "aquaculture.view_cyclelog",
            ),
            (
                "sanitary",
                _("Sanitaire"),
                SanitaryLog.objects.filter(cycle__farm_profile=farm).order_by("-created_at"),
                "admin:aquaculture_sanitarylog_changelist",
                "admin:aquaculture_sanitarylog_change",
                "aquaculture.view_sanitarylog",
            ),
            (
                "feeding",
                _("Alimentation"),
                FeedingPlan.objects.filter(cycle__farm_profile=farm).order_by("-created_at"),
                "admin:aquaculture_feedingplan_changelist",
                "admin:aquaculture_feedingplan_change",
                "aquaculture.view_feedingplan",
            ),
            (
                "reports",
                _("Rapports"),
                ProductionReport.objects.filter(farm_profile=farm, is_deleted=False).order_by("-created_at"),
                "admin:aquaculture_productionreport_changelist",
                "admin:aquaculture_productionreport_change",
                "aquaculture.view_productionreport",
            ),
        ]
        sections = []
        for key, label, queryset, url_name, detail_url_name, permission in definitions:
            if user.has_perm(permission):
                filter_name = "farm_profile__id__exact"
                if key in {"activity", "sanitary", "feeding"}:
                    filter_name = "cycle__farm_profile__id__exact"
                sections.append(
                    {
                        "key": key,
                        "label": label,
                        "count": queryset.count(),
                        "url": f'{reverse(url_name)}?{filter_name}={farm.pk}',
                        "items": [
                            {
                                "label": cls._object_label(item),
                                "status": cls._object_status(item),
                                "url": reverse(detail_url_name, args=[item.pk]),
                            }
                            for item in queryset[: cls.PREVIEW_LIMIT]
                        ],
                    }
                )
        return sections

    @staticmethod
    def _object_label(item):
        for attribute in ("name", "cycle_name", "log_date", "event_date", "period_start"):
            value = getattr(item, attribute, None)
            if value is not None:
                return value
        return str(item)

    @staticmethod
    def _object_status(item):
        if hasattr(item, "get_status_display"):
            return item.get_status_display()
        if hasattr(item, "resolved"):
            return _("Resolu") if item.resolved else _("Non resolu")
        if hasattr(item, "is_active"):
            return _("Actif") if item.is_active else _("Termine")
        return _("Inconnu")

    @classmethod
    def latest_activities(cls, *, user, farm) -> list[FarmActivity]:
        activities: list[FarmActivity] = []
        if has_capability_and_permission(
            user,
            AdminCapability.VIEW_AQUACULTURE_SUPERVISION,
            "aquaculture.view_productioncycle",
        ):
            activities.extend(cls._aquaculture_activities(user, farm))
        if has_capability_and_permission(user, AdminCapability.VIEW_COMMERCE, "commerce.view_order"):
            activities.extend(cls._order_activities(farm))
        if has_capability_and_permission(
            user, AdminCapability.MANAGE_SUPPORT, "chat.view_conversation"
        ):
            activities.extend(cls._support_activities(farm))
        return sorted(activities, key=lambda item: item.occurred_at, reverse=True)[
            : cls.PREVIEW_LIMIT
        ]

    @classmethod
    def _aquaculture_activities(cls, user, farm) -> list[FarmActivity]:
        from aquaculture.models import (
            CalibrationOperation,
            CycleLog,
            FinalHarvestOperation,
            ProductionCycle,
            ProductionReport,
            ProductionUnit,
            SanitaryLog,
        )

        activities: list[FarmActivity] = []
        if user.has_perm("aquaculture.view_productionunit"):
            for item in ProductionUnit.objects.filter(farm_profile=farm).order_by("-created_at")[:10]:
                activities.append(
                    FarmActivity(
                        "production_unit",
                        _("Unite creee"),
                        item.created_at,
                        item.created_at,
                        reverse("admin:aquaculture_productionunit_change", args=[item.pk]),
                    )
                )
        for cycle in ProductionCycle.objects.filter(farm_profile=farm).order_by("-created_at")[:10]:
            activities.append(
                FarmActivity(
                    "production_cycle",
                    _("Cycle cree ou lance"),
                    cycle.created_at,
                    cycle.start_date,
                    reverse("admin:aquaculture_productioncycle_change", args=[cycle.pk]),
                )
            )
        if user.has_perm("aquaculture.view_cyclelog"):
            for item in CycleLog.objects.filter(cycle__farm_profile=farm).order_by("-created_at")[:10]:
                activities.append(
                    FarmActivity(
                        "cycle_log",
                        _("Journal de cycle"),
                        item.created_at,
                        item.log_date,
                        reverse("admin:aquaculture_cyclelog_change", args=[item.pk]),
                    )
                )
        if user.has_perm("aquaculture.view_sanitarylog"):
            for item in SanitaryLog.objects.filter(cycle__farm_profile=farm).order_by("-created_at")[:10]:
                activities.append(
                    FarmActivity(
                        "sanitary_log",
                        _("Evenement sanitaire"),
                        item.created_at,
                        item.event_date,
                        reverse("admin:aquaculture_sanitarylog_change", args=[item.pk]),
                    )
                )
        if user.has_perm("aquaculture.view_calibrationoperation"):
            calibration_query = CalibrationOperation.objects.filter(
                source_allocation__cycle__farm_profile=farm
            ).order_by("-created_at")[:10]
            for item in calibration_query:
                activities.append(
                    FarmActivity(
                        "calibration",
                        _("Operation de calibrage"),
                        item.created_at,
                        item.calibrated_at,
                        reverse("admin:aquaculture_calibrationoperation_change", args=[item.pk]),
                    )
                )
        if user.has_perm("aquaculture.view_finalharvestoperation"):
            harvest_query = FinalHarvestOperation.objects.filter(
                allocation__cycle__farm_profile=farm
            ).order_by("-created_at")[:10]
            for item in harvest_query:
                activities.append(
                    FarmActivity(
                        "final_harvest",
                        _("Recolte finale"),
                        item.created_at,
                        item.harvested_at,
                        reverse("admin:aquaculture_finalharvestoperation_change", args=[item.pk]),
                    )
                )
        if user.has_perm("aquaculture.view_productionreport"):
            for item in ProductionReport.objects.filter(
                farm_profile=farm,
                is_deleted=False,
            ).order_by("-created_at")[:10]:
                activities.append(
                    FarmActivity(
                        "production_report",
                        _("Rapport de production"),
                        item.generated_at or item.created_at,
                        item.period_end,
                        reverse("admin:aquaculture_productionreport_change", args=[item.pk]),
                    )
                )
        return activities

    @staticmethod
    def _order_activities(farm) -> list[FarmActivity]:
        return [
            FarmActivity(
                "order",
                _("Commande"),
                order.updated_at,
                order.created_at,
                reverse("admin:commerce_order_change", args=[order.pk]),
            )
            for order in farm.orders.order_by("-updated_at")[:10]
        ]

    @staticmethod
    def _support_activities(farm) -> list[FarmActivity]:
        conversation = getattr(farm.user, "support_conversation", None)
        if not conversation:
            return []
        url = f'{reverse("admin:chat_support_inbox")}?conversation={conversation.pk}'
        return [
            FarmActivity("message", _("Message Support"), message.created_at, None, url)
            for message in conversation.messages.order_by("-created_at")[:10]
        ]
