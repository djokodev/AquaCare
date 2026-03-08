"""
Tests unitaires des serializers du module notifications.
"""

import pytest
from accounts.models import User
from notifications.serializers import (
    NotificationListSerializer,
    NotificationSerializer,
    PushTokenSerializer,
)
from rest_framework.test import APIRequestFactory


@pytest.mark.django_db
class TestNotificationSerializers:
    """Tests des serializers de notification."""

    def test_notification_serializer_exposes_delivery_errors_to_staff(self, notification):
        staff_user = User.objects.create_user(
            phone_number="+237611111111",
            password="testpass123",
            first_name="Staff",
            last_name="User",
            age_group="26_35",
            is_staff=True,
        )
        request = APIRequestFactory().get('/api/notifications/')
        request.user = staff_user

        notification.email_error = 'SMTP failure'
        notification.push_error = 'Expo failure'
        serializer = NotificationSerializer(
            notification,
            context={'request': request},
        )

        assert serializer.data['email_error'] == 'SMTP failure'
        assert serializer.data['push_error'] == 'Expo failure'

    def test_notification_list_serializer_exposes_delivery_errors_to_superuser(
        self,
        notification,
    ):
        superuser = User.objects.create_superuser(
            phone_number="+237622222222",
            password="testpass123",
            first_name="Super",
            last_name="User",
            age_group="26_35",
        )
        request = APIRequestFactory().get('/api/notifications/')
        request.user = superuser

        notification.email_error = 'SMTP failure'
        notification.push_error = 'Expo failure'

        serializer = NotificationListSerializer(
            notification,
            context={'request': request},
        )

        assert serializer.data['email_error'] == 'SMTP failure'
        assert serializer.data['push_error'] == 'Expo failure'


@pytest.mark.django_db
class TestPushTokenSerializer:
    """Tests de validation du serializer de token push."""

    def test_device_id_whitespace_is_rejected(self):
        serializer = PushTokenSerializer()

        with pytest.raises(Exception) as exc_info:
            serializer.validate_device_id('   ')

        assert 'device_id ne peut pas être vide.' in str(exc_info.value)

    def test_invalid_platform_is_rejected(self):
        serializer = PushTokenSerializer()

        with pytest.raises(Exception) as exc_info:
            serializer.validate_platform('web')

        assert "Plateforme doit être 'ios' ou 'android'" in str(exc_info.value)
