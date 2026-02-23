"""
Tests unitaires pour les ViewSets du module notifications.

Couvre :
- NotificationViewSet (list, mark_read, mark_all_read, delete_read)
- NotificationPreferenceViewSet (get, update)
- PushTokenViewSet (register, deactivate)
"""
import pytest
from rest_framework.test import APIClient
from rest_framework import status
from django.urls import reverse
from django.utils import timezone

from notifications.models import Notification, NotificationPreference, PushToken


@pytest.fixture
def api_client():
    """Client API DRF."""
    return APIClient()


@pytest.fixture
def authenticated_client(api_client, user):
    """Client API authentifi�."""
    api_client.force_authenticate(user=user)
    return api_client


@pytest.mark.django_db
class TestNotificationViewSet:
    """Tests du NotificationViewSet."""

    def test_list_notifications(self, authenticated_client, user):
        """Test r�cup�ration liste des notifications."""
        # Cr�er quelques notifications
        for i in range(3):
            Notification.objects.create(
                user=user,
                notification_type='alert',
                title=f'Alert {i}',
                message='Test message',
                scheduled_for=timezone.now()
            )

        url = reverse('notifications:notification-list')
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 3

    def test_list_notifications_masks_delivery_errors(self, authenticated_client, user):
        """Les erreurs techniques d'envoi sont masquées pour un utilisateur standard."""
        notification = Notification.objects.create(
            user=user,
            notification_type='alert',
            title='Alert with delivery errors',
            message='Test message',
            scheduled_for=timezone.now(),
            email_error='SMTP hard failure details',
            push_error='Expo push error details',
        )

        url = reverse('notifications:notification-list')
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        result = next(item for item in response.data['results'] if item['id'] == str(notification.id))
        assert 'email_error' in result
        assert 'push_error' in result
        assert result['email_error'] is None
        assert result['push_error'] is None

    def test_retrieve_notification_masks_delivery_errors(self, authenticated_client, notification):
        """Le détail d'une notification masque aussi les erreurs techniques."""
        notification.email_error = 'SMTP detailed failure'
        notification.push_error = 'Expo detailed failure'
        notification.save(update_fields=['email_error', 'push_error'])

        url = reverse('notifications:notification-detail', kwargs={'pk': notification.id})
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['email_error'] is None
        assert response.data['push_error'] is None

    def test_list_notifications_unauthorized(self, api_client):
        """Test acc�s non authentifi� retourne 401."""
        url = reverse('notifications:notification-list')
        response = api_client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_mark_notification_as_read(self, authenticated_client, notification):
        """Test marquage d'une notification comme lue."""
        url = reverse('notifications:notification-mark-read', kwargs={'pk': notification.id})
        response = authenticated_client.post(url)

        assert response.status_code == status.HTTP_200_OK
        notification.refresh_from_db()
        assert notification.is_read

    def test_mark_all_notifications_as_read(self, authenticated_client, user):
        """Test marquage de toutes les notifications comme lues."""
        for i in range(3):
            Notification.objects.create(
                user=user,
                notification_type='alert',
                title=f'Alert {i}',
                message='Test',
                scheduled_for=timezone.now()
            )

        url = reverse('notifications:notification-mark-all-read')
        response = authenticated_client.post(url)

        assert response.status_code == status.HTTP_200_OK
        assert Notification.objects.filter(user=user, is_read=False).count() == 0

    def test_delete_read_notifications(self, authenticated_client, user):
        """Test suppression des notifications lues."""
        # Notifications lues
        for i in range(2):
            Notification.objects.create(
                user=user,
                notification_type='alert',
                title=f'Read {i}',
                message='Test',
                is_read=True,
                scheduled_for=timezone.now()
            )

        # Notification non lue
        Notification.objects.create(
            user=user,
            notification_type='alert',
            title='Unread',
            message='Test',
            is_read=False,
            scheduled_for=timezone.now()
        )

        url = reverse('notifications:notification-delete-all-read')
        response = authenticated_client.post(url)

        assert response.status_code == status.HTTP_200_OK
        assert Notification.objects.filter(user=user).count() == 1


@pytest.mark.django_db
class TestNotificationPreferenceViewSet:
    """Tests du NotificationPreferenceViewSet."""

    def test_get_preferences(self, authenticated_client, notification_preference):
        """Test r�cup�ration des pr�f�rences."""
        url = '/api/notification-preferences/'
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['in_app_enabled'] is True

    def test_update_preferences(self, authenticated_client, notification_preference):
        """Test modification des pr�f�rences."""
        url = '/api/notification-preferences/'
        data = {
            'email_enabled': False,
            'push_enabled': False,
            'email_frequency': 'never'
        }
        response = authenticated_client.patch(url, data, format='json')

        assert response.status_code == status.HTTP_200_OK
        notification_preference.refresh_from_db()
        assert notification_preference.email_enabled is False
        assert notification_preference.push_enabled is False


@pytest.mark.django_db
class TestPushTokenViewSet:
    """Tests du PushTokenViewSet."""

    def test_register_push_token(self, authenticated_client, user):
        """Test enregistrement d'un token Expo Push."""
        url = reverse('notifications:notification-register-push-token')
        data = {
            'expo_push_token': 'ExponentPushToken[xxxxxxxxxxxxx]',
            'device_id': 'device-123',
            'device_name': 'Pixel 7',
            'platform': 'android'
        }
        response = authenticated_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert PushToken.objects.filter(user=user).exists()


@pytest.mark.django_db
class TestNotificationStatsEndpoint:
    """Tests de l'endpoint stats (P8)."""

    def test_stats_returns_correct_totals(self, authenticated_client, user):
        """[P8] stats endpoint retourne total, unread et by_type corrects."""
        # 2 non lues
        for i in range(2):
            Notification.objects.create(
                user=user,
                notification_type='alert',
                title=f'Unread {i}',
                message='Test',
                is_read=False,
                scheduled_for=timezone.now(),
            )
        # 1 lue
        Notification.objects.create(
            user=user,
            notification_type='order_confirmed',
            title='Read',
            message='Test',
            is_read=True,
            scheduled_for=timezone.now(),
        )

        url = reverse('notifications:notification-stats')
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['total_count'] == 3
        assert response.data['unread_count'] == 2
        assert response.data['read_count'] == 1
        assert response.data['by_type']['alert'] == 2
        assert response.data['by_type']['order_confirmed'] == 1

    def test_stats_empty_for_new_user(self, authenticated_client, user):
        """[P8] Nouveau user : toutes les stats à 0."""
        url = reverse('notifications:notification-stats')
        response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['total_count'] == 0
        assert response.data['unread_count'] == 0
        assert response.data['read_count'] == 0

    def test_stats_uses_two_queries(self, authenticated_client, user, django_assert_num_queries):
        """[P8] stats endpoint effectue 2 requêtes DB (aggregate + by_type), pas 3."""
        Notification.objects.create(
            user=user,
            notification_type='alert',
            title='Test',
            message='Test',
            scheduled_for=timezone.now(),
        )

        url = reverse('notifications:notification-stats')
        # force_authenticate bypasse la requête JWT → 2 requêtes DB uniquement :
        # 1 aggregate (total + unread) + 1 by_type
        # Le point clé est qu'on n'a PAS de requête séparée pour get_unread_count
        with django_assert_num_queries(2):
            response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK
