"""Lectures agrégées du tableau de bord Admin, sans mutation métier."""

from __future__ import annotations

from datetime import timedelta

from common.admin_capabilities import (
    AdminCapability,
    has_capability_and_permission,
)
from django.db.models import Q, Sum
from django.urls import reverse
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class AdminConsoleService:
    """
    Tableau de bord : ce qui attend une action (« À traiter maintenant »),
    quelques chiffres de situation, puis les fermes à relancer. Chaque bloc
    n'apparaît que si le rôle a le droit de voir la donnée.
    """

    PREVIEW_LIMIT = 10

    @classmethod
    def dashboard_context(cls, user) -> dict:
        todo, stale_farms = cls._todo(user)
        return {
            "dashboard_todo": todo,
            "dashboard_stale_farms": stale_farms,
            "dashboard_kpis": cls._kpis(user),
        }

    @classmethod
    def _kpis(cls, user) -> list[dict]:
        from accounts.models import FarmProfile
        from aquaculture.models import CycleUnitAllocation, ProductionCycle, ProductionUnit

        kpis: list[dict] = []
        if has_capability_and_permission(
            user, AdminCapability.VIEW_FARM_DIRECTORY, "accounts.view_farmprofile"
        ):
            kpis.append({
                "key": "farms",
                "label": _("Fermes"),
                "value": FarmProfile.objects.filter(is_deleted=False, user__is_active=True).count(),
                "url": reverse("admin:accounts_farmprofile_changelist"),
            })
        if has_capability_and_permission(
            user, AdminCapability.VIEW_AQUACULTURE_SUPERVISION, "aquaculture.view_productioncycle"
        ):
            active_cycles = ProductionCycle.objects.filter(
                farm_profile__is_deleted=False, status="active"
            )
            kpis.append({
                "key": "active_cycles",
                "label": _("Cycles en cours"),
                "value": active_cycles.count(),
                "url": f'{reverse("admin:aquaculture_productioncycle_changelist")}?status__exact=active',
            })
            fish = CycleUnitAllocation.objects.filter(
                cycle__farm_profile__is_deleted=False, cycle__status="active"
            ).aggregate(total=Sum("current_fish_count"))["total"] or 0
            kpis.append({
                "key": "fish",
                "label": _("Poissons en élevage"),
                "value": fish,
                "url": "",
            })
        if has_capability_and_permission(
            user, AdminCapability.VIEW_AQUACULTURE_SUPERVISION, "aquaculture.view_productionunit"
        ):
            kpis.append({
                "key": "active_units",
                "label": _("Unités actives"),
                "value": ProductionUnit.objects.filter(
                    farm_profile__is_deleted=False, status="active"
                ).count(),
                "url": f'{reverse("admin:aquaculture_productionunit_changelist")}?status__exact=active',
            })
        return kpis

    @classmethod
    def aquaculture_activity_context(cls, user) -> dict:
        """Page « Saisies et incidents » : incidents ouverts, puis dernières saisies."""
        from aquaculture.models import CycleLog, SanitaryLog

        incidents: list[dict] = []
        logs: list[dict] = []
        today = timezone.localdate()
        if has_capability_and_permission(
            user, AdminCapability.VIEW_AQUACULTURE_SUPERVISION, "aquaculture.view_sanitarylog"
        ):
            for item in (
                SanitaryLog.objects.filter(cycle__farm_profile__is_deleted=False, resolved=False)
                .select_related("cycle__farm_profile", "cycle_unit_allocation__production_unit")
                .order_by("event_date")[: cls.PREVIEW_LIMIT]
            ):
                unit = getattr(item.cycle_unit_allocation, "production_unit", None)
                incidents.append({
                    "farm": item.cycle.farm_profile.farm_name,
                    "farm_url": reverse(
                        "admin:accounts_farmprofile_supervision", args=[item.cycle.farm_profile_id]
                    ),
                    "unit": unit.name if unit else "",
                    "unit_url": reverse("admin:aquaculture_productionunit_workspace", args=[unit.pk])
                    if unit else "",
                    "type": item.get_event_type_display(),
                    "serious": item.event_type == "abnormal_mortality",
                    "date": item.event_date,
                    "affected": item.affected_count,
                    "days_open": (today - item.event_date).days,
                    "url": reverse("admin:aquaculture_sanitarylog_change", args=[item.pk]),
                })
        if has_capability_and_permission(
            user, AdminCapability.VIEW_AQUACULTURE_SUPERVISION, "aquaculture.view_cyclelog"
        ):
            for item in (
                CycleLog.objects.filter(cycle__farm_profile__is_deleted=False)
                .select_related("cycle__farm_profile", "cycle_unit_allocation__production_unit")
                .order_by("-log_date", "-created_at")[: cls.PREVIEW_LIMIT]
            ):
                unit = getattr(item.cycle_unit_allocation, "production_unit", None)
                logs.append({
                    "farm": item.cycle.farm_profile.farm_name,
                    "farm_url": reverse(
                        "admin:accounts_farmprofile_supervision", args=[item.cycle.farm_profile_id]
                    ),
                    "unit": unit.name if unit else item.cycle.cycle_name,
                    "unit_url": reverse("admin:aquaculture_productionunit_workspace", args=[unit.pk])
                    if unit else "",
                    "date": item.log_date,
                    "mortality": item.mortality_count,
                    "average_weight": item.average_weight,
                    "feed": item.feed_quantity,
                    "offline": item.created_offline,
                    "url": reverse("admin:aquaculture_cyclelog_change", args=[item.pk]),
                })
        return {
            "activity_center_attention": incidents,
            "activity_center_activities": logs,
        }

    STALE_LOG_DAYS = 2

    @classmethod
    def _todo(cls, user) -> tuple[list[dict], list[dict]]:
        """
        « À traiter maintenant » : les actions qui attendent quelqu'un, du plus
        urgent au moins urgent. Chaque ligne n'apparaît que si le compteur > 0
        et que le rôle a le droit de voir la donnée.
        """
        from django.db.models import Max

        todo: list[dict] = []
        stale_farms: list[dict] = []

        if has_capability_and_permission(
            user, AdminCapability.VIEW_AQUACULTURE_SUPERVISION, "aquaculture.view_sanitarylog"
        ):
            from aquaculture.models import SanitaryLog

            incidents = SanitaryLog.objects.filter(
                cycle__farm_profile__is_deleted=False, resolved=False
            ).count()
            if incidents:
                todo.append({
                    "level": "danger",
                    "label": _("%(count)s incident(s) sanitaire(s) non résolu(s)") % {"count": incidents},
                    "url": f'{reverse("admin:aquaculture_sanitarylog_changelist")}?resolved__exact=0',
                })

        if has_capability_and_permission(user, AdminCapability.VIEW_COMMERCE, "commerce.view_order"):
            from commerce.models import Order

            to_fulfil = Order.objects.filter(status="confirmed").count()
            if to_fulfil:
                todo.append({
                    "level": "warning",
                    "label": _("%(count)s commande(s) à livrer ou préparer") % {"count": to_fulfil},
                    "url": f'{reverse("admin:commerce_order_changelist")}?status__exact=confirmed',
                })
            waiting = Order.objects.filter(status__in=("delivered", "ready_for_pickup")).count()
            if waiting:
                todo.append({
                    "level": "info",
                    "label": _("%(count)s commande(s) en attente de confirmation du client") % {"count": waiting},
                    "url": reverse("admin:commerce_order_changelist"),
                })

        if has_capability_and_permission(user, AdminCapability.MANAGE_SUPPORT, "chat.view_conversation"):
            from chat.models import Conversation

            unread_conversations = Conversation.objects.filter(
                user__is_active=True, unread_count_admin__gt=0
            ).count()
            if unread_conversations:
                todo.append({
                    "level": "warning",
                    "label": _("%(count)s conversation(s) support avec messages non lus")
                    % {"count": unread_conversations},
                    "url": reverse("admin:chat_support_inbox"),
                })

        if has_capability_and_permission(
            user, AdminCapability.VIEW_FARM_DIRECTORY, "accounts.view_farmprofile"
        ) and has_capability_and_permission(
            user, AdminCapability.VIEW_AQUACULTURE_SUPERVISION, "aquaculture.view_cyclelog"
        ):
            from accounts.models import FarmProfile

            limit_date = timezone.localdate() - timedelta(days=cls.STALE_LOG_DAYS)
            farms = (
                FarmProfile.objects.filter(
                    is_deleted=False,
                    user__is_active=True,
                    production_cycles__status="active",
                    production_cycles__cycle_kind="standard",
                )
                .annotate(last_log_date=Max(
                    "production_cycles__logs__log_date",
                    filter=Q(production_cycles__status="active"),
                ))
                .filter(Q(last_log_date__lt=limit_date) | Q(last_log_date__isnull=True))
                .distinct()
                .order_by("last_log_date", "farm_name")
            )
            total = farms.count()
            stale_farms = [
                {
                    "label": farm.farm_name,
                    "last_log_date": farm.last_log_date,
                    "url": reverse("admin:accounts_farmprofile_supervision", args=[farm.pk]),
                }
                for farm in farms[: cls.PREVIEW_LIMIT]
            ]
            if total:
                todo.append({
                    "level": "info",
                    "label": _("%(count)s ferme(s) en cycle sans saisie depuis %(days)s jours ou plus")
                    % {"count": total, "days": cls.STALE_LOG_DAYS},
                    "url": "#stale-farms",
                })
        return todo, stale_farms
