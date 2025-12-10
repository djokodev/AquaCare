"""
Celery tasks pour l'envoi asynchrone de notifications email et push.
"""

import logging
import requests
from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from django.template.loader import render_to_string
from django.utils.html import strip_tags
from django.utils import timezone

from .models import Notification, PushToken

logger = logging.getLogger(__name__)


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
            logger.warning(f"User {user.phone_number} has no email, skipping notification {notification_id}")
            notification.email_error = "Utilisateur sans email"
            notification.save(update_fields=['email_error'])
            return

        # Préparer le contexte pour le template
        context = {
            'user': user,
            'notification': notification,
            'title': notification.title,
            'message': notification.message,
            'metadata': notification.metadata,
            'notification_type': notification.get_notification_type_display(),
            'created_at': notification.created_at,
            'site_url': settings.FRONTEND_URL if hasattr(settings, 'FRONTEND_URL') else 'https://aquacare.mavecam.com',
        }

        # Render email template
        try:
            html_message = render_to_string('notifications/email_notification.html', context)
        except Exception:
            # Fallback si template n'existe pas encore
            html_message = f"""
            <html>
            <body>
                <h2>{notification.title}</h2>
                <p>{notification.message}</p>
                <hr>
                <p style="color: gray; font-size: 12px;">
                    MAVECAM AquaCare - Système de notifications
                </p>
            </body>
            </html>
            """

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

        logger.info(f"Email sent successfully for notification {notification_id} to {user.email}")

    except Notification.DoesNotExist:
        logger.error(f"Notification {notification_id} does not exist")
        return

    except Exception as exc:
        # Logger l'erreur
        logger.error(f"Failed to send email for notification {notification_id}: {str(exc)}")

        # Enregistrer l'erreur dans la notification
        try:
            notification = Notification.objects.get(id=notification_id)
            notification.email_error = str(exc)[:500]  # Limiter taille erreur
            notification.save(update_fields=['email_error'])
        except Exception:
            pass

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
        push_tokens = PushToken.objects.filter(user=user, is_active=True)

        if not push_tokens.exists():
            logger.info(f"No active push tokens for user {user.phone_number}, skipping notification {notification_id}")
            return

        # Préparer les messages Expo Push
        expo_messages = []
        for token in push_tokens:
            message = {
                'to': token.expo_push_token,
                'sound': 'default',
                'title': notification.title,
                'body': notification.message,
                'data': {
                    'notification_id': str(notification.id),
                    'notification_type': notification.notification_type,
                    'metadata': notification.metadata,
                    'priority': notification.priority,
                },
                'priority': 'high' if notification.priority in ['high', 'urgent'] else 'default',
                'badge': user.notifications.filter(is_read=False).count(),  # Update app badge
            }

            # Ajouter channelId pour Android
            if token.platform == 'android':
                message['channelId'] = 'default'

            expo_messages.append(message)

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

        # Traiter les erreurs
        errors = [r for r in data if r.get('status') == 'error']

        if errors:
            logger.warning(f"Push notification errors for notification {notification_id}: {errors}")

            # Désactiver les tokens invalides et isoler les erreurs critiques
            non_device_errors = []
            for i, error_data in enumerate(errors):
                error_details = error_data.get('details', {})
                error_type = error_details.get('error')

                if error_type == 'DeviceNotRegistered':
                    # Token invalide, désactiver
                    if i < len(push_tokens):
                        token = list(push_tokens)[i]
                        token.deactivate()
                        logger.info(f"Deactivated invalid push token {token.id} for user {user.phone_number}")
                else:
                    non_device_errors.append(error_data)

            # Si tous les messages ont échoué mais uniquement pour tokens invalides, on arrête sans retry
            if not non_device_errors and len(errors) == len(expo_messages):
                notification.push_error = "No valid push tokens"
                notification.save(update_fields=['push_error'])
                return

            # Si les échecs proviennent d'autres erreurs, laisser Celery remonter
            if non_device_errors and len(non_device_errors) == len(expo_messages):
                raise Exception(f"All push notifications failed: {non_device_errors}")

        # Mettre à jour la notification
        notification.push_sent_at = timezone.now()
        notification.push_error = None  # Réinitialiser erreur si succès
        notification.save(update_fields=['push_sent_at', 'push_error'])

        logger.info(f"Push notification sent successfully for notification {notification_id} to {len(push_tokens)} devices")

    except Notification.DoesNotExist:
        logger.error(f"Notification {notification_id} does not exist")
        return

    except Exception as exc:
        # Logger l'erreur
        logger.error(f"Failed to send push notification for notification {notification_id}: {str(exc)}")

        # Enregistrer l'erreur dans la notification
        try:
            notification = Notification.objects.get(id=notification_id)
            notification.push_error = str(exc)[:500]  # Limiter taille erreur
            notification.save(update_fields=['push_error'])
        except Exception:
            pass

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
        logger.info(f"Cleanup task: Deleted {count} old notifications")
        return f"Deleted {count} old notifications"
    except Exception as exc:
        logger.error(f"Cleanup task failed: {str(exc)}")
        return f"Cleanup failed: {str(exc)}"


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

        count = 0
        for notification in pending_notifications:
            # Envoyer via les canaux appropriés
            if 'email' in notification.channels:
                send_email_notification_task.delay(str(notification.id))
            if 'push' in notification.channels:
                send_push_notification_task.delay(str(notification.id))

            # Marquer comme envoyée
            notification.mark_as_sent()
            count += 1

        logger.info(f"Sent {count} scheduled notifications")
        return f"Sent {count} scheduled notifications"

    except Exception as exc:
        logger.error(f"Send scheduled notifications task failed: {str(exc)}")
        return f"Send scheduled failed: {str(exc)}"
