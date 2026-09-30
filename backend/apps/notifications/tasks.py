"""
Celery tasks pour l'envoi asynchrone des notifications push.
"""
from __future__ import annotations

import logging
from typing import Any, TypedDict

import requests
from celery import shared_task
from django.conf import settings
from django.utils import timezone

from .models import Notification, PushToken

logger = logging.getLogger(__name__)

PUSH_ERROR_NO_VALID_TOKENS = "PUSH_NO_VALID_TOKENS"
PUSH_ERROR_SEND_FAILED = "PUSH_SEND_FAILED"


def _expo_headers() -> dict[str, str]:
    """En-têtes de l'API Expo, avec l'access token s'il est configuré."""
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
    access_token = getattr(settings, 'EXPO_ACCESS_TOKEN', '')
    if access_token:
        headers['Authorization'] = f'Bearer {access_token}'
    return headers


class ExpoPayloadData(TypedDict):
    notification_id: str
    notification_type: str
    metadata: dict[str, Any]
    priority: str


class ExpoPushMessage(TypedDict, total=False):
    to: str
    sound: str
    title: str
    body: str
    data: ExpoPayloadData
    priority: str
    badge: int
    channelId: str


def _get_notification_with_user(notification_id: str) -> Notification:
    """Charge une notification avec son utilisateur en une seule requete."""
    return Notification.objects.select_related("user").get(id=notification_id)


def _save_push_error(notification_id: str, error_code: str) -> None:
    Notification.objects.filter(id=notification_id).update(push_error=error_code)


def _build_expo_messages(notification: Notification, tokens: list[PushToken]) -> list[ExpoPushMessage]:
    unread_badge = notification.user.notifications.filter(is_read=False).count()
    messages: list[ExpoPushMessage] = []

    for token in tokens:
        message: ExpoPushMessage = {
            "to": token.expo_push_token,
            "sound": "default",
            "title": notification.title,
            "body": notification.message,
            "data": {
                "notification_id": str(notification.id),
                "notification_type": notification.notification_type,
                "metadata": notification.metadata,
                "priority": notification.priority,
            },
            "priority": "high" if notification.priority in ["high", "urgent"] else "default",
            "badge": unread_badge,
        }

        if token.platform == "android":
            message["channelId"] = "default"

        messages.append(message)

    return messages


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def send_push_notification_task(self, notification_id: str):
    """
    Envoie une notification push via Expo Push Notifications API.

    Retry automatique 3x avec 30s de délai entre tentatives.
    Désactive automatiquement les tokens invalides.

    Args:
        notification_id: UUID de la notification

    Raises:
        Exception: Si échec après 3 tentatives
    """
    try:
        notification = _get_notification_with_user(notification_id)
        user = notification.user

        # Récupérer les push tokens actifs de l'utilisateur
        push_tokens = PushToken.objects.filter(
            user=user,
            is_active=True
        ).only('id', 'expo_push_token', 'platform', 'is_active').order_by('created_at', 'id')
        tokens = list(push_tokens)

        if not tokens:
            logger.info("No active push token for notification %s", notification_id)
            return

        # Construire une map token_value → PushToken pour lookup O(1)
        token_map = {t.expo_push_token: t for t in tokens}
        token_order = []  # Liste ordonnée pour correspondre aux résultats Expo

        # Préparer les messages Expo Push
        expo_messages = _build_expo_messages(notification, tokens)
        for token in tokens:
            token_order.append(token.expo_push_token)

        # Envoyer à l'API Expo Push Notifications
        response = requests.post(
            'https://exp.host/--/api/v2/push/send',
            json=expo_messages,
            headers=_expo_headers(),
            timeout=10
        )
        response.raise_for_status()

        # Parser la réponse
        results = response.json()
        data = results.get('data', [])

        # Traiter les erreurs en matchant par valeur de token (pas par index brut)
        non_device_error_count = 0
        device_not_registered_count = 0
        for index, result in enumerate(data):
            if result.get('status') != 'error':
                continue

            error_details = result.get('details', {}) or {}
            error_type = error_details.get('error')

            if error_type == 'DeviceNotRegistered' and index < len(token_order):
                token = token_map.get(token_order[index])
                if token:
                    token.deactivate()
                device_not_registered_count += 1
            else:
                non_device_error_count += 1

        if device_not_registered_count or non_device_error_count:
            logger.warning(
                "Push delivery had %s device token errors and %s non-device errors for notification %s",
                device_not_registered_count,
                non_device_error_count,
                notification_id,
            )

            # Tous les messages ont échoué uniquement car tokens invalides
            if (
                non_device_error_count == 0
                and device_not_registered_count == len(expo_messages)
            ):
                notification.push_error = PUSH_ERROR_NO_VALID_TOKENS
                notification.save(update_fields=['push_error'])
                return

            # Tous les messages ont échoué pour une autre raison
            if non_device_error_count == len(expo_messages):
                raise Exception("All push notifications failed")

        # Mettre à jour la notification
        notification.push_sent_at = timezone.now()
        notification.push_error = None  # Réinitialiser erreur si succès
        notification.save(update_fields=['push_sent_at', 'push_error'])

        logger.info(
            "Push notification sent for notification %s to %s devices",
            notification_id,
            len(tokens),
        )

    except Notification.DoesNotExist:
        logger.warning(
            "Push notification %s is not visible yet; retrying delivery",
            notification_id,
        )
        raise self.retry(exc=Notification.DoesNotExist(notification_id))

    except Exception as exc:
        logger.exception("Push delivery failed for notification %s", notification_id)

        # Enregistrer une erreur neutre (pas de détails techniques en base)
        _save_push_error(notification_id, PUSH_ERROR_SEND_FAILED)

        # Retry avec exponential backoff
        raise self.retry(exc=exc)


@shared_task
def cleanup_old_notifications():
    """
    Celery periodic task pour nettoyer les vieilles notifications lues.

    À programmer dans Celery Beat (ex: quotidien à 3h du matin).
    Supprime les notifications lues de plus de 90 jours.

    Returns:
        str: Message de résultat
    """
    from .services import NotificationService

    try:
        count = NotificationService.delete_old_notifications(days=90)
        logger.info("Cleanup task deleted %s old notifications", count)
        return f"Deleted {count} old notifications"
    except Exception:
        logger.exception("Cleanup task failed")
        return "Cleanup failed"


@shared_task
def send_scheduled_notifications():
    """
    Celery periodic task pour envoyer les notifications programmées.

    À programmer dans Celery Beat (ex: toutes les 5 minutes).
    Envoie les notifications dont scheduled_for <= maintenant et pas encore envoyées.

    Returns:
        str: Message de résultat
    """
    try:
        now = timezone.now()
        pending_notifications = Notification.objects.filter(
            scheduled_for__lte=now,
            is_sent=False
        ).only('id', 'channels').order_by('scheduled_for', 'id')

        dispatched_ids = []
        for notification in pending_notifications[:500]:
            if 'push' in notification.channels:
                send_push_notification_task.delay(str(notification.id))
            dispatched_ids.append(notification.id)

        # Batch UPDATE au lieu d'un UPDATE individuel par notification
        if dispatched_ids:
            Notification.objects.filter(id__in=dispatched_ids).update(
                is_sent=True,
                sent_at=timezone.now(),
            )
        count = len(dispatched_ids)

        logger.info("Scheduled notifications task enqueued %s notifications", count)
        return f"Sent {count} scheduled notifications"

    except Exception:
        logger.exception("Send scheduled notifications task failed")
        return "Send scheduled failed"
