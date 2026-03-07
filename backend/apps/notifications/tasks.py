"""
Celery tasks pour l'envoi asynchrone de notifications email et push.
"""
from __future__ import annotations

import logging
from typing import Any, TypedDict

import requests
from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.template import TemplateDoesNotExist
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.html import strip_tags

from .models import Notification, PushToken

logger = logging.getLogger(__name__)

EMAIL_ERROR_RECIPIENT_MISSING = "EMAIL_RECIPIENT_MISSING"
EMAIL_ERROR_SEND_FAILED = "EMAIL_SEND_FAILED"
PUSH_ERROR_NO_VALID_TOKENS = "PUSH_NO_VALID_TOKENS"
PUSH_ERROR_SEND_FAILED = "PUSH_SEND_FAILED"


class EmailTemplateContext(TypedDict):
    user: Any
    notification: Notification
    title: str
    message: str
    metadata: dict[str, Any]
    notification_type: str
    created_at: timezone.datetime
    site_url: str


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


def _build_email_context(notification: Notification) -> EmailTemplateContext:
    user = notification.user
    return {
        "user": user,
        "notification": notification,
        "title": notification.title,
        "message": notification.message,
        "metadata": notification.metadata,
        "notification_type": notification.get_notification_type_display(),
        "created_at": notification.created_at,
        "site_url": settings.FRONTEND_URL if hasattr(settings, "FRONTEND_URL") else "https://aquacare.mavecam.com",
    }


def _render_fallback_email_html(notification: Notification) -> str:
    return f"""
            <html>
            <body>
                <h2>{notification.title}</h2>
                <p>{notification.message}</p>
                <hr>
                <p style="color: gray; font-size: 12px;">
                    AquaCare - Notifications
                </p>
            </body>
            </html>
            """


def _save_email_error(notification_id: str, error_code: str) -> None:
    try:
        notification = Notification.objects.get(id=notification_id)
    except Notification.DoesNotExist:
        return

    notification.email_error = error_code
    notification.save(update_fields=["email_error"])


def _save_push_error(notification_id: str, error_code: str) -> None:
    try:
        notification = Notification.objects.get(id=notification_id)
    except Notification.DoesNotExist:
        return

    notification.push_error = error_code
    notification.save(update_fields=["push_error"])


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


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_email_notification_task(self, notification_id: str):
    """
    Envoie une notification par email.

    Retry automatique 3x avec 60s de délai entre tentatives.
    Utilise les templates HTML pour emails.

    Args:
        notification_id: UUID de la notification

    Raises:
        Exception: Si échec après 3 tentatives
    """
    try:
        notification = Notification.objects.get(id=notification_id)
        user = notification.user

        # Vérifier que l'utilisateur a un email
        if not user.email:
            logger.warning(
                "Skipping email notification %s: recipient email missing",
                notification_id,
            )
            notification.email_error = EMAIL_ERROR_RECIPIENT_MISSING
            notification.save(update_fields=['email_error'])
            return

        # Préparer le contexte pour le template
        context = _build_email_context(notification)

        # Render email template
        try:
            html_message = render_to_string('notifications/email_notification.html', context)
        except TemplateDoesNotExist:
            # Fallback si template n'existe pas encore
            html_message = _render_fallback_email_html(notification)

        plain_message = strip_tags(html_message)

        # Envoyer l'email
        send_mail(
            subject=f"[AquaCare] {notification.title}",
            message=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            html_message=html_message,
            fail_silently=False,
        )

        # Mettre à jour la notification
        notification.email_sent_at = timezone.now()
        notification.email_error = None  # Réinitialiser erreur si succès
        notification.save(update_fields=['email_sent_at', 'email_error'])

        logger.info("Email sent successfully for notification %s", notification_id)

    except Notification.DoesNotExist:
        logger.warning("Email notification %s skipped: notification does not exist", notification_id)
        return

    except Exception as exc:
        logger.exception("Email delivery failed for notification %s", notification_id)

        # Enregistrer une erreur neutre (pas de détails techniques en base)
        _save_email_error(notification_id, EMAIL_ERROR_SEND_FAILED)

        # Retry avec exponential backoff
        raise self.retry(exc=exc)


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
        notification = Notification.objects.get(id=notification_id)
        user = notification.user

        # Récupérer les push tokens actifs de l'utilisateur
        push_tokens = PushToken.objects.filter(
            user=user,
            is_active=True
        ).order_by('created_at', 'id')
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
            headers={
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
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
        logger.warning("Push notification %s skipped: notification does not exist", notification_id)
        return

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
        )

        dispatched_ids = []
        for notification in pending_notifications[:500]:
            if 'email' in notification.channels:
                send_email_notification_task.delay(str(notification.id))
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
