"""
Tests unitaires pour NotificationService.

Couvre :
- Création de notifications (simple, bulk, avec content_object)
- Marquage lu/non-lu
- Suppression (unitaire, bulk, anciennes)
- Compteurs (non lues)
- Récupération filtrée
"""
from datetime import time, timedelta
from unittest.mock import patch

import pytest
from django.test import override_settings
from django.utils import timezone
from notifications.models import Notification, NotificationPreference
from notifications.services import NotificationService


@pytest.mark.django_db
class TestNotificationServiceCreate:
    """Tests de création de notifications."""

    def test_create_notification_basic(self, user):
        """Test création notification basique."""
        notif = NotificationService.create_notification(
            user=user,
            notification_type='system_update',
            title='System Update',
            message='New version available'
        )

        assert notif is not None
        assert notif.user == user
        assert notif.notification_type == 'system_update'
        assert notif.title == 'System Update'
        assert not notif.is_sent

    def test_create_notification_with_content_object(self, user, production_cycle):
        """Test création avec objet lié (GenericForeignKey)."""
        notif = NotificationService.create_notification(
            user=user,
            notification_type='feeding_reminder',
            title='Feeding Time',
            message='Time to feed fish',
            content_object=production_cycle
        )

        assert notif.content_object == production_cycle

    def test_create_notification_with_metadata(self, user):
        """Test création avec métadonnées."""
        metadata = {'order_id': '12345', 'amount': 150000}

        notif = NotificationService.create_notification(
            user=user,
            notification_type='order_confirmed',
            title='Order Confirmed',
            message='Your order is confirmed',
            metadata=metadata
        )

        assert notif.metadata == metadata

    @override_settings(FEEDING_REMINDER_LOCAL_ALARM_ONLY=True)
    def test_feeding_reminder_strips_push_when_local_alarm_policy_enabled(self, user):
        notif = NotificationService.create_notification(
            user=user,
            notification_type='feeding_reminder',
            title='Feeding time',
            message='Local reminder',
            channels=['in_app', 'push'],
        )

        assert notif is not None
        assert notif.channels == ['in_app']

    @override_settings(FEEDING_REMINDER_LOCAL_ALARM_ONLY=False)
    def test_feeding_reminder_keeps_push_when_policy_disabled(self, user):
        notif = NotificationService.create_notification(
            user=user,
            notification_type='feeding_reminder',
            title='Feeding time',
            message='Push reminder',
            channels=['in_app', 'push'],
        )

        assert notif is not None
        assert notif.channels == ['in_app', 'push']

    def test_create_notification_returns_none_when_channels_all_disabled(self, user):
        prefs, _ = NotificationPreference.objects.get_or_create(user=user)
        prefs.in_app_enabled = False
        prefs.email_enabled = False
        prefs.push_enabled = False
        prefs.save(
            update_fields=['in_app_enabled', 'email_enabled', 'push_enabled']
        )

        notif = NotificationService.create_notification(
            user=user,
            notification_type='system_update',
            title='System Update',
            message='No channel should remain',
            channels=['in_app', 'email', 'push'],
        )

        assert notif is None

    def test_create_notification_returns_none_when_type_is_opted_out(self, user):
        prefs, _ = NotificationPreference.objects.get_or_create(user=user)
        prefs.system_alerts = False
        prefs.save(update_fields=['system_alerts'])

        notif = NotificationService.create_notification(
            user=user,
            notification_type='system_update',
            title='System Update',
            message='Type disabled',
            channels=['in_app'],
        )

        assert notif is None

    def test_create_notification_strips_push_during_quiet_hours(self, user):
        prefs, _ = NotificationPreference.objects.get_or_create(user=user)
        prefs.quiet_hours_start = time(22, 0)
        prefs.quiet_hours_end = time(7, 0)
        prefs.save(update_fields=['quiet_hours_start', 'quiet_hours_end'])

        with patch.object(
            NotificationPreference,
            'is_in_quiet_hours',
            return_value=True,
        ):
            notif = NotificationService.create_notification(
                user=user,
                notification_type='new_message',
                title='Late message',
                message='Push should be removed',
                channels=['in_app', 'push'],
            )

        assert notif is not None
        assert notif.channels == ['in_app']

    def test_create_notification_logs_dispatch_failure_without_aborting(self, user):
        with patch(
            'notifications.tasks.send_email_notification_task.delay',
            side_effect=RuntimeError('queue unavailable'),
        ), patch('notifications.services.logger.exception') as mock_logger:
            notif = NotificationService.create_notification(
                user=user,
                notification_type='system_update',
                title='Dispatch',
                message='Still persisted',
                channels=['email'],
                send_immediately=True,
            )

        assert notif is not None
        assert Notification.objects.filter(id=notif.id).exists()
        mock_logger.assert_called_once()


@pytest.mark.django_db
class TestNotificationServiceRead:
    """Tests de marquage lu/non-lu."""

    def test_mark_as_read(self, notification):
        """Test marquage d'une notification comme lue."""
        assert not notification.is_read

        NotificationService.mark_as_read(notification.id)

        notification.refresh_from_db()
        assert notification.is_read
        assert notification.read_at is not None

    def test_mark_all_as_read(self, user):
        """Test marquage de toutes les notifications comme lues."""
        # Créer plusieurs notifications non lues
        for i in range(3):
            Notification.objects.create(
                user=user,
                notification_type='alert',
                title=f'Alert {i}',
                message='Test',
                scheduled_for=timezone.now()
            )

        count = NotificationService.mark_all_as_read(user)

        assert count == 3
        assert Notification.objects.filter(user=user, is_read=False).count() == 0


@pytest.mark.django_db
class TestNotificationServiceDelete:
    """Tests de suppression."""

    def test_delete_notification(self, notification):
        """Test suppression d'une notification."""
        notif_id = notification.id

        result = NotificationService.delete_notification(notif_id)

        assert result is True
        assert not Notification.objects.filter(id=notif_id).exists()

    def test_delete_old_notifications(self, user):
        """Test suppression des notifications anciennes (> 90 jours)."""
        # Notification récente
        Notification.objects.create(
            user=user,
            notification_type='alert',
            title='Recent',
            message='Recent notification',
            scheduled_for=timezone.now()
        )

        # Notification ancienne
        old_notif = Notification.objects.create(
            user=user,
            notification_type='alert',
            title='Old',
            message='Old notification',
            is_read=True,
            scheduled_for=timezone.now() - timedelta(days=95)
        )

        # Notification ancienne non lue (doit être conservée)
        old_unread = Notification.objects.create(
            user=user,
            notification_type='alert',
            title='Old unread',
            message='Old unread notification',
            is_read=False,
            scheduled_for=timezone.now() - timedelta(days=95)
        )

        count = NotificationService.delete_old_notifications()

        assert count == 1
        assert not Notification.objects.filter(id=old_notif.id).exists()
        assert Notification.objects.filter(id=old_unread.id).exists()


@pytest.mark.django_db
class TestNotificationServiceQuery:
    """Tests de récupération et compteurs."""

    def test_get_unread_count(self, user):
        """Test compteur de notifications non lues."""
        for i in range(5):
            Notification.objects.create(
                user=user,
                notification_type='alert',
                title=f'Alert {i}',
                message='Test',
                is_read=False,
                scheduled_for=timezone.now()
            )

        count = NotificationService.get_unread_count(user)
        assert count == 5

    def test_get_user_notifications_all(self, user):
        """Test récupération de toutes les notifications."""
        for i in range(3):
            Notification.objects.create(
                user=user,
                notification_type='alert',
                title=f'Alert {i}',
                message='Test',
                scheduled_for=timezone.now()
            )

        notifications = NotificationService.get_user_notifications(user)
        assert len(notifications) == 3


@pytest.mark.django_db
class TestCreateBulkNotificationsN1:
    """Tests de l'optimisation N+1 dans create_bulk_notifications."""

    def test_no_n1_queries_for_preferences(self, django_assert_num_queries):
        """create_bulk_notifications() ne doit pas faire N requêtes pour N users."""
        from accounts.models import User

        users = []
        for i in range(5):
            u = User.objects.create_user(
                phone_number=f"+23765000000{i}",
                password="testpass123",
                first_name="Bulk",
                last_name=f"User{i}",
                age_group="26_35",
            )
            users.append(u)

        # Nombre de requêtes attendu : 1 SELECT prefs + 1 bulk_create prefs + 1 bulk_create notifs
        # (pas N requêtes pour N users)
        with django_assert_num_queries(3):
            count = NotificationService.create_bulk_notifications(
                users=users,
                notification_type='system_update',
                title='Bulk Test',
                message='Test message',
            )

        assert count == 5

    def test_bulk_with_existing_preferences(self, django_assert_num_queries):
        """Si toutes les préférences existent déjà, pas de bulk_create de prefs."""
        from accounts.models import User
        from notifications.models import NotificationPreference

        users = []
        for i in range(3):
            u = User.objects.create_user(
                phone_number=f"+23766000000{i}",
                password="testpass123",
                first_name="Existing",
                last_name=f"Pref{i}",
                age_group="26_35",
            )
            NotificationPreference.objects.create(user=u)
            users.append(u)

        # 1 SELECT prefs + 1 bulk_create notifs (pas de bulk_create prefs)
        with django_assert_num_queries(2):
            count = NotificationService.create_bulk_notifications(
                users=users,
                notification_type='system_update',
                title='Existing Pref Test',
                message='Test',
            )

        assert count == 3

    def test_bulk_notifications_skip_users_who_opted_out(self, user, user2):
        prefs, _ = NotificationPreference.objects.get_or_create(user=user)
        prefs.system_alerts = False
        prefs.save(update_fields=['system_alerts'])

        count = NotificationService.create_bulk_notifications(
            users=[user, user2],
            notification_type='system_update',
            title='Bulk Test',
            message='Only one user should receive it',
        )

        assert count == 1
        assert Notification.objects.filter(user=user).count() == 0
        assert Notification.objects.filter(user=user2).count() == 1
