"""
Service centralisé pour la gestion des notifications.
Utilisable par tous les modules (aquaculture, commerce, chat, support).
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Literal
from uuid import UUID

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import Model, QuerySet
from django.utils import timezone

from .constants import DEFAULT_CHANNELS_BY_TYPE, DEFAULT_PRIORITY_BY_TYPE
from .models import Notification, NotificationPreference

if TYPE_CHECKING:
    from accounts.models import User as AccountUser
logger = logging.getLogger(__name__)

type NotificationChannel = Literal["in_app", "email", "push"]
type NotificationPriority = Literal["low", "medium", "high", "urgent"]
type NotificationMetadataValue = (
    str
    | int
    | float
    | bool
    | None
    | list[NotificationMetadataValue]
    | dict[str, NotificationMetadataValue]
)
type NotificationMetadata = dict[str, NotificationMetadataValue]


class NotificationService:
    """
    Service centralisé pour créer et envoyer des notifications.
    Utilisable par TOUS les modules (aquaculture, commerce, chat, support).
    """

    @staticmethod
    def _resolve_channels(
        notification_type: str,
        channels: list[NotificationChannel] | None,
    ) -> list[NotificationChannel]:
        if channels is None:
            default_channels = DEFAULT_CHANNELS_BY_TYPE.get(notification_type, ["in_app"])
            return [channel for channel in default_channels if channel in {"in_app", "email", "push"}]

        return list(channels)

    @staticmethod
    def _get_or_create_preferences(user: AccountUser) -> NotificationPreference:
        prefs, _ = NotificationPreference.objects.get_or_create(user=user)
        return prefs

    @staticmethod
    def _filter_channels_by_preferences(
        prefs: NotificationPreference,
        channels: list[NotificationChannel],
    ) -> list[NotificationChannel]:
        filtered_channels = list(channels)
        if not prefs.in_app_enabled and "in_app" in filtered_channels:
            filtered_channels.remove("in_app")
        if not prefs.email_enabled and "email" in filtered_channels:
            filtered_channels.remove("email")
        if not prefs.push_enabled and "push" in filtered_channels:
            filtered_channels.remove("push")
        return filtered_channels

    @staticmethod
    def _resolve_priority(
        notification_type: str,
        priority: NotificationPriority | None,
    ) -> NotificationPriority:
        if priority is not None:
            return priority
        return DEFAULT_PRIORITY_BY_TYPE.get(notification_type, "medium")

    @staticmethod
    def _apply_feeding_reminder_push_policy(
        notification_type: str,
        channels: list[NotificationChannel],
    ) -> list[NotificationChannel]:
        if (
            notification_type == 'feeding_reminder'
            and getattr(settings, 'FEEDING_REMINDER_LOCAL_ALARM_ONLY', True)
            and 'push' in channels
        ):
            return [channel for channel in channels if channel != 'push']
        return channels

    @staticmethod
    def _apply_quiet_hours_policy(
        prefs: NotificationPreference,
        channels: list[NotificationChannel],
    ) -> list[NotificationChannel]:
        if 'push' in channels and prefs.is_in_quiet_hours():
            return [channel for channel in channels if channel != 'push']
        return channels

    @staticmethod
    def _resolve_user_channels(
        *,
        notification_type: str,
        prefs: NotificationPreference,
        channels: list[NotificationChannel] | None,
        apply_quiet_hours: bool,
    ) -> list[NotificationChannel]:
        resolved_channels = NotificationService._resolve_channels(notification_type, channels)
        resolved_channels = NotificationService._filter_channels_by_preferences(prefs, resolved_channels)
        resolved_channels = NotificationService._apply_feeding_reminder_push_policy(
            notification_type,
            resolved_channels,
        )
        if apply_quiet_hours:
            resolved_channels = NotificationService._apply_quiet_hours_policy(prefs, resolved_channels)
        return resolved_channels

    @staticmethod
    def _dispatch_immediate_notifications(
        notification: Notification,
        channels: list[NotificationChannel],
    ) -> None:
        try:
            from .tasks import send_email_notification_task, send_push_notification_task

            if "email" in channels:
                send_email_notification_task.delay(str(notification.id))
            if "push" in channels:
                send_push_notification_task.delay(str(notification.id))
        except Exception:
            logger.exception(
                "Immediate notification dispatch failed for %s",
                notification.id,
            )

    @staticmethod
    @transaction.atomic
    def create_notification(
        user: AccountUser,
        notification_type: str,
        title: str,
        message: str,
        content_object: Model | None = None,
        metadata: NotificationMetadata | None = None,
        channels: list[NotificationChannel] | None = None,
        priority: NotificationPriority | None = None,
        scheduled_for: timezone.datetime | None = None,
        send_immediately: bool = False,
    ) -> Notification | None:
        """
        Crée une notification générique.

        Args:
            user: Utilisateur destinataire
            notification_type: Type notification (voir NOTIFICATION_TYPES)
            title: Titre court (max 200 car)
            message: Message complet
            content_object: Objet Django lié (optionnel) - Order, Cycle, Message, etc.
            metadata: Dict JSON pour contexte (optionnel)
            channels: Liste canaux ['in_app', 'email', 'push'] (défaut: auto selon type)
            priority: Priorité ('low', 'medium', 'high', 'urgent') (défaut: auto selon type)
            scheduled_for: Date/heure affichage (défaut: maintenant)
            send_immediately: Envoyer email/push immédiatement via Celery (défaut: False)

        Returns:
            Notification créée, ou None si toutes préférences désactivées

        Examples:
            # Commerce : Commande confirmée
            NotificationService.create_notification(
                user=order.user,
                notification_type='order_confirmed',
                title=f"Commande {order.order_number} confirmée",
                message=f"Montant : {order.total_amount} FCFA",
                content_object=order,
                metadata={'order_number': order.order_number, 'amount': float(order.total_amount)},
                channels=['in_app', 'email'],
                send_immediately=True
            )

            # Chat : Nouveau message
            NotificationService.create_notification(
                user=recipient,
                notification_type='new_message',
                title=f"Nouveau message de {sender.first_name}",
                message=message_preview,
                content_object=chat_message,
                channels=['in_app', 'push'],
                send_immediately=True
            )

            # Support : Ticket résolu
            NotificationService.create_notification(
                user=ticket.user,
                notification_type='ticket_resolved',
                title=f"Ticket #{ticket.number} résolu",
                message="Votre problème a été résolu par notre équipe.",
                content_object=ticket,
                channels=['in_app', 'email']
            )
        """
        prefs = NotificationService._get_or_create_preferences(user)
        channels = NotificationService._resolve_user_channels(
            notification_type=notification_type,
            prefs=prefs,
            channels=channels,
            apply_quiet_hours=True,
        )

        if not channels:
            return None

        if not prefs.is_type_enabled(notification_type):
            return None

        priority = NotificationService._resolve_priority(notification_type, priority)
        notification = Notification.objects.create(
            user=user,
            notification_type=notification_type,
            title=title,
            message=message,
            content_type=ContentType.objects.get_for_model(content_object) if content_object else None,
            object_id=content_object.pk if content_object else None,
            metadata=metadata or {},
            channels=channels,
            priority=priority,
            scheduled_for=scheduled_for or timezone.now()
        )

        if send_immediately:
            NotificationService._dispatch_immediate_notifications(notification, channels)

        return notification

    @staticmethod
    def _ensure_bulk_preferences(
        users: list[AccountUser],
    ) -> dict[UUID, NotificationPreference]:
        user_ids = [u.pk for u in users]
        existing_prefs = NotificationPreference.objects.in_bulk(user_ids, field_name='user_id')

        missing_user_ids = [uid for uid in user_ids if uid not in existing_prefs]
        if missing_user_ids:
            new_prefs = NotificationPreference.objects.bulk_create(
                [NotificationPreference(user_id=uid) for uid in missing_user_ids],
                ignore_conflicts=True,
            )
            for pref in new_prefs:
                existing_prefs[pref.user_id] = pref

            still_missing_ids = [uid for uid in missing_user_ids if uid not in existing_prefs]
            if still_missing_ids:
                existing_prefs.update(
                    NotificationPreference.objects.in_bulk(still_missing_ids, field_name='user_id')
                )

        return existing_prefs

    @staticmethod
    def create_bulk_notifications(
        users: list[AccountUser],
        notification_type: str,
        title: str,
        message: str,
        metadata: NotificationMetadata | None = None,
        channels: list[NotificationChannel] | None = None,
        priority: NotificationPriority | None = None,
        scheduled_for: timezone.datetime | None = None,
    ) -> int:
        """
        Crée des notifications pour plusieurs utilisateurs en masse.
        Optimisé pour performances (bulk_create).

        Utile pour :
        - Annonces système à tous les users
        - Alertes régionales
        - Promotions ciblées

        Args:
            users: Liste d'utilisateurs destinataires
            notification_type: Type de notification
            title: Titre
            message: Message
            metadata: Métadonnées optionnelles
            channels: Canaux de diffusion
            priority: Priorité
            scheduled_for: Date/heure d'affichage

        Returns:
            Nombre de notifications créées
        """
        channels = NotificationService._apply_feeding_reminder_push_policy(
            notification_type,
            NotificationService._resolve_channels(notification_type, channels),
        )
        priority = NotificationService._resolve_priority(notification_type, priority)
        if scheduled_for is None:
            scheduled_for = timezone.now()

        existing_prefs = NotificationService._ensure_bulk_preferences(users)
        notifications: list[Notification] = []
        for user in users:
            prefs = existing_prefs.get(user.pk)
            if prefs and prefs.is_type_enabled(notification_type):
                user_channels = NotificationService._resolve_user_channels(
                    notification_type=notification_type,
                    prefs=prefs,
                    channels=channels,
                    apply_quiet_hours=False,
                )
                if not user_channels:
                    continue
                notifications.append(Notification(
                    user=user,
                    notification_type=notification_type,
                    title=title,
                    message=message,
                    metadata=metadata or {},
                    channels=user_channels,
                    priority=priority,
                    scheduled_for=scheduled_for,
                ))

        Notification.objects.bulk_create(notifications, batch_size=500)
        return len(notifications)

    @staticmethod
    def mark_as_read(notification_id: str | UUID) -> Notification:
        """
        Marque une notification comme lue.

        Args:
            notification_id: UUID de la notification

        Returns:
            Notification mise à jour
        """
        notification = Notification.objects.get(id=notification_id)
        notification.mark_as_read()
        return notification

    @staticmethod
    def mark_all_as_read(user: AccountUser) -> int:
        """
        Marque toutes les notifications d'un user comme lues.

        Args:
            user: Utilisateur

        Returns:
            Nombre de notifications mises à jour
        """
        count = Notification.objects.filter(user=user, is_read=False).update(
            is_read=True,
            read_at=timezone.now()
        )
        return count

    @staticmethod
    def delete_notification(notification_id: str | UUID) -> bool:
        """
        Supprime une notification.

        Args:
            notification_id: UUID de la notification

        Returns:
            True si supprimée, False sinon
        """
        try:
            notification = Notification.objects.get(id=notification_id)
            notification.delete()
            return True
        except Notification.DoesNotExist:
            return False

    @staticmethod
    def delete_all_read_notifications(user: AccountUser) -> int:
        """
        Supprime toutes les notifications lues d'un user.

        Args:
            user: Utilisateur

        Returns:
            Nombre de notifications supprimées
        """
        count, _ = Notification.objects.filter(user=user, is_read=True).delete()
        return count

    @staticmethod
    def delete_old_notifications(days: int = 90) -> int:
        """
        Supprime les notifications lues de plus de X jours.
        À appeler via Celery periodic task.

        Args:
            days: Nombre de jours (défaut: 90)

        Returns:
            Nombre de notifications supprimées
        """
        cutoff_date = timezone.now() - timezone.timedelta(days=days)
        count, _ = Notification.objects.filter(
            is_read=True,
            scheduled_for__lt=cutoff_date
        ).delete()
        return count

    @staticmethod
    def get_unread_count(user: AccountUser) -> int:
        """
        Compte les notifications non lues d'un user.

        Args:
            user: Utilisateur

        Returns:
            Nombre de notifications non lues
        """
        return Notification.objects.visible_for_user(user).filter(is_read=False).count()

    @staticmethod
    def get_user_notifications(
        user: AccountUser,
        is_read: bool | None = None,
        notification_type: str | None = None,
        limit: int = 50,
    ) -> QuerySet[Notification]:
        """
        Récupère les notifications d'un user avec filtres.

        Args:
            user: Utilisateur
            is_read: Filtre lu/non-lu (optionnel)
            notification_type: Filtre par type (optionnel)
            limit: Nombre max de résultats

        Returns:
            Liste de notifications
        """
        queryset = Notification.objects.visible_for_user(user).with_display_context()

        if is_read is not None:
            queryset = queryset.filter(is_read=is_read)

        if notification_type:
            queryset = queryset.filter(notification_type=notification_type)

        return queryset[:limit]
