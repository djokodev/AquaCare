"""
Fiche utilisateur de l'admin : identité, compte, localisation, ferme,
commandes et support, sur une seule page lisible. Lecture seule.
"""

from __future__ import annotations

from common.admin_policies import RBACConstants
from django.db.models import Count, Max, Q
from django.urls import reverse


def mask_phone(phone: str) -> str:
    if not phone or len(phone) < 6:
        return "••••"
    return f"{phone[:4]} •• •• {phone[-2:]}"


class UserWorkspaceService:
    ROLE_LABELS = {
        RBACConstants.GROUP_MANAGERS: "manager",
        RBACConstants.GROUP_COMMERCE: "commerce",
        RBACConstants.GROUP_SUPPORT: "support",
    }

    @classmethod
    def build(cls, *, user, target, can_view_phone: bool) -> dict:
        farm = getattr(target, "farm_profile", None)
        context = {
            "target": target,
            "phone": target.phone_number if can_view_phone else mask_phone(target.phone_number),
            "roles": [
                cls.ROLE_LABELS[group.name]
                for group in target.groups.all()
                if group.name in cls.ROLE_LABELS
            ],
            "location": [
                part for part in (
                    target.get_region_display() if target.region else "",
                    target.department,
                    target.district,
                    target.city,
                    target.neighborhood,
                ) if part
            ],
            "farm": None,
            "orders": None,
            "support": None,
        }
        if farm is not None and not farm.is_deleted:
            from aquaculture.models import ProductionCycle, ProductionUnit

            context["farm"] = {
                "name": farm.farm_name,
                "url": reverse("admin:accounts_farmprofile_supervision", args=[farm.pk]),
                "certification": farm.get_certification_status_display(),
                "certification_status": farm.certification_status,
                "active_cycles": ProductionCycle.objects.filter(
                    farm_profile=farm, status="active"
                ).count(),
                "units": ProductionUnit.objects.filter(farm_profile=farm)
                .exclude(status="archived").count(),
                "has_gps": farm.latitude is not None and farm.longitude is not None,
            }
        if user.is_superuser or user.has_perm("commerce.view_order"):
            from commerce.models import Order

            stats = Order.objects.filter(user=target).aggregate(
                total=Count("id"),
                open=Count("id", filter=Q(status__in=("confirmed", "delivered", "ready_for_pickup"))),
                last=Max("created_at"),
            )
            context["orders"] = {
                **stats,
                "url": f'{reverse("admin:commerce_order_changelist")}?user__id__exact={target.pk}',
            }
        if user.is_superuser or user.has_perm("chat.view_conversation"):
            from chat.models import Conversation

            conversation = Conversation.objects.filter(user=target).first()
            if conversation is not None:
                context["support"] = {
                    "unread": conversation.unread_count_admin,
                    "last_message_at": conversation.last_message_at,
                    "url": f'{reverse("admin:chat_support_inbox")}?conversation={conversation.pk}',
                }
        return context
