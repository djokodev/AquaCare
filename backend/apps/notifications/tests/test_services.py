"""
Tests unitaires pour NotificationService.

Couvre :
- Création de notifications (simple, bulk, avec content_object)
- Marquage lu/non-lu
- Suppression (unitaire, bulk, anciennes)
- Compteurs (non lues)
- Récupération filtrée
"""
import pytest
from django.utils import timezone
from datetime import timedelta
from unittest.mock import patch

from apps.notifications.services import NotificationService
from apps.notifications.models import Notification


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
            scheduled_for=timezone.now() - timedelta(days=95)
        )

        count = NotificationService.delete_old_notifications()

        assert count == 1
        assert not Notification.objects.filter(id=old_notif.id).exists()


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
        assert notifications.count() == 3
