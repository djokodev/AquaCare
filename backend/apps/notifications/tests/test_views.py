"""
Tests unitaires pour les ViewSets du module notifications.

Couvre :
- NotificationViewSet (list, mark_read, mark_all_read, delete_read)
- NotificationPreferenceViewSet (get, update)
- PushTokenViewSet (register, deactivate)
"""
import pytest
from django.core.cache import cache
from django.urls import reverse
from django.utils import timezone
from notifications.models import Notification, PushToken
from notifications.views import NotificationViewSet
from rest_framework import status
from rest_framework.test import APIClient, APIRequestFactory


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

    def test_list_notifications_uses_two_queries(self, authenticated_client, user, django_assert_num_queries):
        """La liste doit faire 2 requêtes: count pagination + select principal."""
        for index in range(3):
            Notification.objects.create(
                user=user,
                notification_type='alert',
                title=f'Alert {index}',
                message='Test message',
                scheduled_for=timezone.now(),
            )

        url = reverse('notifications:notification-list')
        with django_assert_num_queries(2):
            response = authenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK

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

    def test_mark_read_returns_forbidden_response_when_owner_check_fails(self, user, notification, user2):
        """Le helper de vue doit renvoyer une erreur 403 coherente."""
        request = APIRequestFactory().post('/api/notifications/')
        request.user = user

        view = NotificationViewSet()
        view.get_object = lambda: notification
        notification.user = user2

        response = view.mark_read(request)

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data['error'] == "Vous ne pouvez pas modifier cette notification"

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

    def test_destroy_returns_forbidden_response_when_owner_check_fails(self, user, notification, user2):
        """La branche 403 de destroy doit renvoyer un payload d'erreur simple."""
        request = APIRequestFactory().delete('/api/notifications/')
        request.user = user

        view = NotificationViewSet()
        view.get_object = lambda: notification
        notification.user = user2

        response = view.destroy(request)

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert response.data['error'] == "Vous ne pouvez pas supprimer cette notification"
        assert Notification.objects.filter(id=notification.id).exists()

    def test_list_notifications_supports_read_and_type_filters(self, authenticated_client, user):
        Notification.objects.create(
            user=user,
            notification_type='alert',
            title='Unread alert',
            message='Visible',
            is_read=False,
            scheduled_for=timezone.now(),
        )
        Notification.objects.create(
            user=user,
            notification_type='order_confirmed',
            title='Read order',
            message='Visible',
            is_read=True,
            scheduled_for=timezone.now(),
        )

        url = reverse('notifications:notification-list')
        response = authenticated_client.get(url, {'is_read': 'true', 'type': 'order_confirmed'})

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 1
        assert response.data['results'][0]['notification_type'] == 'order_confirmed'


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

    def test_replace_preferences_with_put(self, authenticated_client, notification_preference):
        """Le PUT complet doit reutiliser le meme endpoint DRF."""
        url = '/api/notification-preferences/'
        response = authenticated_client.put(
            url,
            {
                'in_app_enabled': True,
                'email_enabled': True,
                'push_enabled': False,
                'feeding_reminders': True,
                'sampling_reminders': True,
                'sanitary_alerts': True,
                'cycle_milestones': True,
                'mortality_alerts': True,
                'water_quality_alerts': True,
                'order_confirmations': True,
                'order_status_updates': True,
                'delivery_notifications': True,
                'product_recommendations': False,
                'price_alerts': False,
                'ticket_updates': True,
                'support_messages': True,
                'chat_messages': True,
                'chat_mentions': True,
                'system_alerts': True,
                'account_security': True,
                'email_frequency': 'daily',
                'quiet_hours_start': None,
                'quiet_hours_end': None,
            },
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        notification_preference.refresh_from_db()
        assert notification_preference.push_enabled is False
        assert notification_preference.email_frequency == 'daily'


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

    def test_register_push_token_updates_existing_device(self, authenticated_client, user):
        """Le meme device doit etre mis a jour et renvoyer 200."""
        PushToken.objects.create(
            user=user,
            expo_push_token='ExponentPushToken[oldoldoldold]',
            device_id='device-123',
            device_name='Old Device',
            platform='android',
            is_active=False,
        )

        url = reverse('notifications:notification-register-push-token')
        response = authenticated_client.post(
            url,
            {
                'expo_push_token': 'ExponentPushToken[newnewnewnew]',
                'device_id': 'device-123',
                'device_name': 'Pixel 8',
                'platform': 'ios',
            },
            format='json',
        )

        assert response.status_code == status.HTTP_200_OK
        token = PushToken.objects.get(user=user, device_id='device-123')
        assert token.expo_push_token == 'ExponentPushToken[newnewnewnew]'
        assert token.device_name == 'Pixel 8'
        assert token.platform == 'ios'
        assert token.is_active is True

    def test_register_push_token_rejects_malformed_token(self, authenticated_client):
        """Un token Expo partiel ou mal formé doit être refusé."""
        url = reverse('notifications:notification-register-push-token')
        response = authenticated_client.post(
            url,
            {
                'expo_push_token': 'ExponentPushToken[broken',
                'device_id': 'device-123',
                'platform': 'android',
            },
            format='json'
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'expo_push_token' in response.data

    def test_register_push_token_rate_limit_enforced(self, authenticated_client, settings):
        """L'enregistrement de tokens push doit être throttle en cas d'abus."""
        settings.CACHES = {
            'default': {
                'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
                'LOCATION': f'notifications-push-token-throttle-{id(self)}',
            }
        }
        cache.clear()
        url = reverse('notifications:notification-register-push-token')

        for index in range(30):
            response = authenticated_client.post(
                url,
                {
                    'expo_push_token': f'ExponentPushToken[token{index:04d}]',
                    'device_id': f'device-{index}',
                    'device_name': 'Pixel 7',
                    'platform': 'android',
                },
                format='json'
            )
            assert response.status_code == status.HTTP_201_CREATED

        response = authenticated_client.post(
            url,
            {
                'expo_push_token': 'ExponentPushToken[token9999]',
                'device_id': 'device-9999',
                'device_name': 'Pixel 7',
                'platform': 'android',
            },
            format='json'
        )

        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS


@pytest.mark.django_db
class TestNotificationRateLimiting:
    """Tests des throttles sur actions bulk notifications."""

    def test_mark_all_read_rate_limit_enforced(self, authenticated_client, settings):
        """Le bulk mark-all-read doit etre throttle."""
        settings.CACHES = {
            'default': {
                'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
                'LOCATION': f'notifications-bulk-throttle-{id(self)}',
            }
        }
        cache.clear()
        url = reverse('notifications:notification-mark-all-read')

        for _ in range(20):
            response = authenticated_client.post(url)
            assert response.status_code == status.HTTP_200_OK

        response = authenticated_client.post(url)
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS


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
