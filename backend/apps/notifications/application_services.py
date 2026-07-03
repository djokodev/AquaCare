"""Use cases applicatifs exposes par les APIs notifications."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, TypedDict

from django.db.models import Count, Q
from django.utils import timezone

from .models import Notification, NotificationPreference, PushToken
from .services import NotificationService

if TYPE_CHECKING:
    from accounts.models import User as AccountUser


class NotificationStatsPayload(TypedDict):
    total_count: int
    unread_count: int
    read_count: int
    by_type: dict[str, int]


class NotificationOwnershipError(ValueError):
    """Erreur levee lorsqu'un utilisateur agit sur une notification qui ne lui appartient pas."""


@dataclass(frozen=True)
class NotificationQueryFilters:
    """Filtres applicatifs de la boite de reception notifications."""

    is_read: bool | None = None
    notification_type: str | None = None
    cycle_id: str | None = None


@dataclass(frozen=True)
class PushTokenRegistrationCommand:
    """Commande applicative d'enregistrement d'un token push."""

    expo_push_token: str
    device_id: str
    device_name: str | None = None
    platform: str | None = None


class NotificationInboxApplicationService:
    """Use cases applicatifs de lecture et mutation de la boite de notifications."""

    @staticmethod
    def _build_queryset(
        user: AccountUser,
        filters: NotificationQueryFilters,
        *,
        include_display_context: bool = False,
        now: timezone.datetime | None = None,
    ):
        queryset = Notification.objects.visible_for_user(user, now=now)

        if include_display_context:
            queryset = queryset.with_display_context()

        if filters.is_read is not None:
            queryset = queryset.filter(is_read=filters.is_read)

        if filters.notification_type:
            queryset = queryset.filter(notification_type=filters.notification_type)

        if filters.cycle_id:
            queryset = queryset.scoped_to_cycle(filters.cycle_id)

        return queryset

    @staticmethod
    def get_user_notifications(
        user: AccountUser,
        filters: NotificationQueryFilters,
    ):
        """Retourne les notifications visibles pour un utilisateur avec filtres."""
        queryset = NotificationInboxApplicationService._build_queryset(
            user,
            filters,
            include_display_context=True,
        )

        return queryset.order_by("-scheduled_for")

    @staticmethod
    def mark_notification_as_read(
        notification: Notification,
        actor: AccountUser,
    ) -> Notification:
        """Marque comme lue une notification possedee par l'acteur."""
        if notification.user_id != actor.id:
            raise NotificationOwnershipError("Vous ne pouvez pas modifier cette notification")

        notification.mark_as_read()
        return notification

    @staticmethod
    def delete_notification(notification: Notification, actor: AccountUser) -> None:
        """Supprime une notification si elle appartient a l'acteur."""
        if notification.user_id != actor.id:
            raise NotificationOwnershipError("Vous ne pouvez pas supprimer cette notification")

        notification.delete()

    @staticmethod
    def mark_all_notifications_as_read(user: AccountUser) -> int:
        """Marque toutes les notifications visibles comme lues."""
        return NotificationInboxApplicationService.mark_all_notifications_as_read_with_filters(
            user,
            NotificationQueryFilters(),
        )

    @staticmethod
    def mark_all_notifications_as_read_with_filters(
        user: AccountUser,
        filters: NotificationQueryFilters,
    ) -> int:
        """Marque comme lues toutes les notifications du scope demandé."""
        return NotificationInboxApplicationService._build_queryset(
            user,
            filters,
        ).filter(is_read=False).update(
            is_read=True,
            read_at=timezone.now(),
        )

    @staticmethod
    def delete_all_read_notifications(user: AccountUser) -> int:
        """Supprime toutes les notifications lues."""
        return NotificationInboxApplicationService.delete_all_read_notifications_with_filters(
            user,
            NotificationQueryFilters(),
        )

    @staticmethod
    def delete_all_read_notifications_with_filters(
        user: AccountUser,
        filters: NotificationQueryFilters,
    ) -> int:
        """Supprime toutes les notifications lues du scope demandé."""
        count, _ = NotificationInboxApplicationService._build_queryset(
            user,
            filters,
        ).filter(is_read=True).delete()
        return count

    @staticmethod
    def get_notification_stats(
        user: AccountUser,
        filters: NotificationQueryFilters | None = None,
    ) -> NotificationStatsPayload:
        """Retourne les statistiques agregees de la boite de notifications."""
        base_queryset = NotificationInboxApplicationService._build_queryset(
            user,
            filters or NotificationQueryFilters(),
            now=timezone.now(),
        )
        aggregate = base_queryset.aggregate(
            total_count=Count("id"),
            unread_count=Count("id", filter=Q(is_read=False)),
        )
        total_count = aggregate["total_count"] or 0
        unread_count = aggregate["unread_count"] or 0
        by_type = base_queryset.values("notification_type").annotate(
            count=Count("id"),
        ).order_by("-count")

        return {
            "total_count": total_count,
            "unread_count": unread_count,
            "read_count": total_count - unread_count,
            "by_type": {item["notification_type"]: item["count"] for item in by_type},
        }

    @staticmethod
    def register_push_token(
        user: AccountUser,
        command: PushTokenRegistrationCommand,
    ) -> tuple[PushToken, bool]:
        """Cree ou met a jour un token push actif pour un device."""
        return PushToken.objects.update_or_create(
            user=user,
            device_id=command.device_id,
            defaults={
                "expo_push_token": command.expo_push_token,
                "device_name": command.device_name,
                "platform": command.platform,
                "is_active": True,
            },
        )


class NotificationPreferenceApplicationService:
    """Use cases applicatifs de lecture/mise a jour des preferences notifications."""

    @staticmethod
    def get_or_create_preferences(user: AccountUser) -> NotificationPreference:
        """Retourne les preferences de l'utilisateur, creees si necessaire."""
        preferences, _ = NotificationPreference.objects.get_or_create(user=user)
        return preferences

    @staticmethod
    def update_preferences(
        preferences: NotificationPreference,
        values: dict[str, Any],
    ) -> NotificationPreference:
        """Applique une mise a jour partielle ou complete des preferences."""
        for field_name, field_value in values.items():
            setattr(preferences, field_name, field_value)

        preferences.save()
        return preferences
