"""
Tests pour les taches Celery du module notifications.

Teste l'envoi asynchrone de notifications par email et push,
ainsi que les taches de nettoyage et de scheduling.
"""
import pytest
import requests
from unittest.mock import patch, MagicMock, call
from django.utils import timezone
from datetime import timedelta

from notifications.tasks import (
    send_email_notification_task,
    send_push_notification_task,
    cleanup_old_notifications,
    send_scheduled_notifications
)
from notifications.models import Notification, PushToken


# =================== TESTS EMAIL NOTIFICATIONS ===================

@pytest.mark.django_db
class TestEmailNotificationTask:
    """Tests pour l'envoi de notifications par email."""

    def test_send_email_notification_task_success(self, notification, user):
        """Email envoye avec succes -> email_sent_at defini."""
        # Setup: User avec email valide
        user.email = "farmer@example.com"
        user.save()

        # Mock send_mail (patcher sur le module tache pour pointer la rĂŠfĂŠrence importĂŠe)
        with patch('apps.notifications.tasks.send_mail') as mock_send:
            mock_send.return_value = 1  # Success

            # Execute
            send_email_notification_task(str(notification.id))

            # Assertions
            notification.refresh_from_db()
            assert notification.email_sent_at is not None
            assert notification.email_error is None
            mock_send.assert_called_once()

            # Verifier les arguments de send_mail
            call_args = mock_send.call_args
            assert "[AquaCare]" in call_args.kwargs['subject']
            assert user.email in call_args.kwargs['recipient_list']

    def test_send_email_notification_task_no_email(self, notification, user):
        """User sans email -> Pas d'erreur, email_error defini."""
        # Setup: User sans email
        user.email = ""
        user.save()

        # Mock send_mail
        with patch('apps.notifications.tasks.send_mail') as mock_send:
            # Execute
            send_email_notification_task(str(notification.id))

            # Assertions
            notification.refresh_from_db()
            assert notification.email_sent_at is None
            assert notification.email_error is not None
            assert "sans email" in notification.email_error.lower()
            mock_send.assert_not_called()

    def test_send_email_notification_task_retry_on_failure(self, notification, user):
        """Echec reseau -> Exception raised (Celery retry declenche)."""
        # Setup: User avec email
        user.email = "test@example.com"
        user.save()

        # Mock send_mail avec exception
        with patch('apps.notifications.tasks.send_mail') as mock_send:
            mock_send.side_effect = Exception("Network error")

            # Execute & Assert: Exception raised pour trigger Celery retry
            with pytest.raises(Exception) as exc_info:
                send_email_notification_task(str(notification.id))

            assert "Network error" in str(exc_info.value)


# =================== TESTS PUSH NOTIFICATIONS ===================

@pytest.mark.django_db
class TestPushNotificationTask:
    """Tests pour l'envoi de notifications push via Expo."""

    def test_send_push_notification_task_success(self, notification, push_token):
        """Push envoye via Expo API -> push_sent_at defini."""
        # Mock requests.post
        with patch('requests.post') as mock_post:
            # Setup mock response
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {'data': [{'status': 'ok'}]}
            mock_post.return_value = mock_response

            # Execute
            send_push_notification_task(str(notification.id))

            # Assertions
            notification.refresh_from_db()
            assert notification.push_sent_at is not None
            assert notification.push_error is None
            mock_post.assert_called_once()

            # Verifier URL Expo
            call_args = mock_post.call_args
            assert 'exp.host/--/api/v2/push/send' in str(call_args)

    def test_send_push_notification_task_no_active_tokens(self, notification, user):
        """User sans tokens actifs -> Aucune erreur, push_sent_at reste None."""
        # Setup: Desactiver tous les tokens
        PushToken.objects.filter(user=user).update(is_active=False)

        # Execute
        send_push_notification_task(str(notification.id))

        # Assertions
        notification.refresh_from_db()
        assert notification.push_sent_at is None

    def test_send_push_notification_task_invalid_token_deactivation(self, notification, push_token):
        """Token invalide (DeviceNotRegistered) -> Desactivation automatique."""
        # Mock requests.post avec reponse d'erreur Expo
        with patch('requests.post') as mock_post:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                'data': [{
                    'status': 'error',
                    'details': {'error': 'DeviceNotRegistered'}
                }]
            }
            mock_post.return_value = mock_response

            # Execute
            send_push_notification_task(str(notification.id))

            # Assertions: Token desactive
            push_token.refresh_from_db()
            assert push_token.is_active is False

    def test_send_push_notification_task_expo_api_failure(self, notification, push_token):
        """Expo API down -> Exception raised (retry Celery)."""
        # Mock requests.post avec exception reseau
        with patch('requests.post') as mock_post:
            mock_post.side_effect = requests.exceptions.RequestException("API unreachable")

            # Execute & Assert: Exception raised pour trigger retry
            with pytest.raises(requests.exceptions.RequestException) as exc_info:
                send_push_notification_task(str(notification.id))

            assert "API unreachable" in str(exc_info.value)


# =================== TESTS CLEANUP & SCHEDULED ===================

@pytest.mark.django_db
class TestNotificationMaintenance:
    """Tests pour les taches de maintenance (cleanup, scheduling)."""

    def test_cleanup_old_notifications(self, user):
        """Suppression notifications > 90 jours, retention recentes."""
        # Setup: Creer notifications anciennes et recentes
        old_date = timezone.now() - timedelta(days=95)
        recent_date = timezone.now() - timedelta(days=30)

        # Notification ancienne (95 jours)
        old_notif = Notification.objects.create(
            user=user,
            notification_type='harvest_reminder',
            title='Old Notification',
            message='Should be deleted',
            is_read=True,
            created_at=old_date,
            scheduled_for=old_date
        )

        # Notification recente (30 jours)
        recent_notif = Notification.objects.create(
            user=user,
            notification_type='harvest_reminder',
            title='Recent Notification',
            message='Should be kept',
            is_read=False,
            created_at=recent_date,
            scheduled_for=recent_date
        )

        # Execute
        cleanup_old_notifications()

        # Assertions: Ancienne supprimee, recente conservee
        assert not Notification.objects.filter(id=old_notif.id).exists()
        assert Notification.objects.filter(id=recent_notif.id).exists()

    def test_send_scheduled_notifications(self, user):
        """Envoi notifications programmees (scheduled_for <= now)."""
        # Setup: Notifications programmees passee et future
        past_time = timezone.now() - timedelta(hours=1)
        future_time = timezone.now() + timedelta(hours=1)

        # Notification programmee passee (doit etre envoyee)
        scheduled_past = Notification.objects.create(
            user=user,
            notification_type='feeding_reminder',
            title='Past Scheduled',
            message='Should be sent',
            scheduled_for=past_time,
            channels=['email', 'push'],
            is_sent=False
        )

        # Notification programmee future (ne doit PAS etre envoyee)
        scheduled_future = Notification.objects.create(
            user=user,
            notification_type='feeding_reminder',
            title='Future Scheduled',
            message='Should not be sent yet',
            scheduled_for=future_time,
            channels=['email', 'push'],
            is_sent=False
        )

        # Mock les taches d'envoi pour eviter vraie execution
        with patch('apps.notifications.tasks.send_email_notification_task.delay') as mock_email:
            with patch('apps.notifications.tasks.send_push_notification_task.delay') as mock_push:
                # Execute
                send_scheduled_notifications()

                # Assertions
                scheduled_past.refresh_from_db()
                scheduled_future.refresh_from_db()

                # Past notification marquee comme envoyee
                assert scheduled_past.is_sent is True

                # Future notification toujours non envoyee
                assert scheduled_future.is_sent is False

                # Verifier que les taches d'envoi ont ete appelees pour past
                # (au moins une des deux selon channels configures)
                assert mock_email.called or mock_push.called
