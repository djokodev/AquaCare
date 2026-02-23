"""
Tests unitaires pour les modèles du module notifications.

Couvre :
- Notification (création, GenericForeignKey, validation)
- NotificationPreference (préférences utilisateur)
- PushToken (tokens Expo, désactivation)
"""
import pytest
from django.utils import timezone
from django.contrib.contenttypes.models import ContentType
from datetime import timedelta
from unittest.mock import patch

from notifications.models import Notification, NotificationPreference, PushToken


@pytest.mark.django_db
class TestNotificationModel:
    """Tests du modèle Notification."""

    def test_create_notification_minimal(self, user):
        """Test création notification avec champs minimaux."""
        notif = Notification.objects.create(
            user=user,
            notification_type='system_update',
            title='System Update',
            message='New version available',
            scheduled_for=timezone.now()
        )

        assert notif.id is not None
        assert notif.user == user
        assert notif.notification_type == 'system_update'
        assert notif.priority == 'medium'
        assert notif.channels == []
        assert not notif.is_sent
        assert not notif.is_read

    def test_create_notification_with_generic_fk(self, user, production_cycle):
        """Test notification liée à un objet via GenericForeignKey."""
        notif = Notification.objects.create(
            user=user,
            content_object=production_cycle,
            notification_type='feeding_reminder',
            title='Feeding Time',
            message='Time to feed fish',
            scheduled_for=timezone.now()
        )

        assert notif.content_object == production_cycle
        assert notif.content_type == ContentType.objects.get_for_model(production_cycle)
        assert notif.object_id == production_cycle.id

    def test_notification_string_representation(self, notification):
        """Test représentation string du modèle."""
        assert notification.user.phone_number in str(notification)


@pytest.mark.django_db
class TestNotificationPreferenceModel:
    """Tests du modèle NotificationPreference."""

    def test_create_preference_defaults(self, user):
        """Test création avec valeurs par défaut."""
        pref = NotificationPreference.objects.create(user=user)

        assert pref.in_app_enabled is True
        assert pref.email_enabled is True
        assert pref.push_enabled is True
        assert pref.email_frequency == 'instant'

    def test_one_preference_per_user(self, user):
        """Test unicité : une seule préférence par utilisateur."""
        NotificationPreference.objects.create(user=user)

        with pytest.raises(Exception):
            NotificationPreference.objects.create(user=user)


@pytest.mark.django_db
class TestPushTokenModel:
    """Tests du modèle PushToken."""

    def test_create_push_token(self, user):
        """Test création d'un token Expo Push."""
        token = PushToken.objects.create(
            user=user,
            expo_push_token='ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
            device_id='device-1',
            platform='android'
        )

        assert token.user == user
        assert token.expo_push_token.startswith('ExponentPushToken[')
        assert token.platform == 'android'
        assert token.is_active is True

    def test_multiple_tokens_per_user(self, user):
        """Test : un utilisateur peut avoir plusieurs tokens (multi-device)."""
        token1 = PushToken.objects.create(
            user=user,
            expo_push_token='ExponentPushToken[device1]',
            device_id='device-1',
            platform='ios'
        )
        token2 = PushToken.objects.create(
            user=user,
            expo_push_token='ExponentPushToken[device2]',
            device_id='device-2',
            platform='android'
        )

        user_tokens = PushToken.objects.filter(user=user)
        assert user_tokens.count() == 2

    def test_deactivate_sets_is_active_false(self, user):
        """[P2] PushToken.deactivate() passe is_active à False et sauvegarde."""
        token = PushToken.objects.create(
            user=user,
            expo_push_token='ExponentPushToken[deactivate_test]',
            device_id='device-deactivate',
            platform='ios',
            is_active=True,
        )
        token.deactivate()
        token.refresh_from_db()
        assert token.is_active is False


@pytest.mark.django_db
class TestNotificationPreferenceQuietHours:
    """Tests de is_in_quiet_hours() et is_type_enabled()."""

    def test_quiet_hours_simple_range_inside(self, user):
        """Plage simple (08:00→22:00) : heure dans la plage → True."""
        from datetime import time
        pref = NotificationPreference.objects.create(
            user=user,
            quiet_hours_start=time(8, 0),
            quiet_hours_end=time(22, 0),
        )
        with patch('django.utils.timezone.localtime') as mock_local:
            from datetime import datetime
            mock_local.return_value = timezone.now().replace(hour=12, minute=0)
            assert pref.is_in_quiet_hours() is True

    def test_quiet_hours_simple_range_outside(self, user):
        """Plage simple (08:00→22:00) : heure hors de la plage → False."""
        from datetime import time
        pref = NotificationPreference.objects.create(
            user=user,
            quiet_hours_start=time(8, 0),
            quiet_hours_end=time(22, 0),
        )
        with patch('django.utils.timezone.localtime') as mock_local:
            mock_local.return_value = timezone.now().replace(hour=23, minute=0)
            assert pref.is_in_quiet_hours() is False

    def test_quiet_hours_midnight_crossing_inside(self, user):
        """Plage traversant minuit (22:00→07:00) : heure dans la plage → True."""
        from datetime import time
        pref = NotificationPreference.objects.create(
            user=user,
            quiet_hours_start=time(22, 0),
            quiet_hours_end=time(7, 0),
        )
        with patch('django.utils.timezone.localtime') as mock_local:
            mock_local.return_value = timezone.now().replace(hour=23, minute=30)
            assert pref.is_in_quiet_hours() is True

    def test_quiet_hours_midnight_crossing_outside(self, user):
        """Plage traversant minuit (22:00→07:00) : heure hors de la plage → False."""
        from datetime import time
        pref = NotificationPreference.objects.create(
            user=user,
            quiet_hours_start=time(22, 0),
            quiet_hours_end=time(7, 0),
        )
        with patch('django.utils.timezone.localtime') as mock_local:
            mock_local.return_value = timezone.now().replace(hour=12, minute=0)
            assert pref.is_in_quiet_hours() is False

    def test_quiet_hours_not_configured(self, user):
        """Pas d'heures silencieuses configurées → False."""
        pref = NotificationPreference.objects.create(user=user)
        assert pref.is_in_quiet_hours() is False

    def test_is_type_enabled_known_type(self, user):
        """Type connu et activé → True."""
        pref = NotificationPreference.objects.create(user=user, feeding_reminders=True)
        assert pref.is_type_enabled('feeding_reminder') is True

    def test_is_type_enabled_disabled_type(self, user):
        """Type connu mais désactivé → False."""
        pref = NotificationPreference.objects.create(user=user, feeding_reminders=False)
        assert pref.is_type_enabled('feeding_reminder') is False

    def test_is_type_enabled_unknown_type(self, user):
        """Type inconnu → True par défaut."""
        pref = NotificationPreference.objects.create(user=user)
        assert pref.is_type_enabled('unknown_type_xyz') is True
