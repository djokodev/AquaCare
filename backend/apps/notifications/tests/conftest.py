"""
Fixtures pytest pour les tests du module notifications.

Fournit des fixtures réutilisables pour :
- Utilisateurs de test
- Cycles de production
- Commandes (pour tester les notifications commerce)
- Notifications de différents types
"""
import pytest
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from accounts.models import User, FarmProfile
from apps.aquaculture.models import ProductionCycle
from apps.notifications.models import Notification, NotificationPreference, PushToken


@pytest.fixture
def user(db):
    """Utilisateur de test."""
    user = User.objects.create_user(
        phone_number="+237677777777",
        password="testpass123",
        first_name="Test",
        last_name="User",
        age_group="26_35",
    )
    return user


@pytest.fixture
def user2(db):
    """Deuxième utilisateur de test."""
    user = User.objects.create_user(
        phone_number="+237688888888",
        password="testpass123",
        first_name="Test2",
        last_name="User2",
        age_group="26_35",
    )
    return user


@pytest.fixture
def farm_profile(user):
    """Profil de ferme pour l'utilisateur de test."""
    # Le profil est créé automatiquement lors de la création de l'utilisateur
    return user.farm_profile


@pytest.fixture
def production_cycle(farm_profile):
    """Cycle de production actif pour les tests."""
    cycle = ProductionCycle.objects.create(
        farm_profile=farm_profile,
        cycle_name="Cycle Test Tilapia",
        species="tilapia",
        pond_identifier="Bassin A",
        pond_surface_m2=Decimal("100.00"),
        start_date=timezone.now().date() - timedelta(days=30),
        initial_count=1000,
        initial_average_weight=Decimal("5.00"),
        initial_biomass=Decimal("5.00") * 1000 / Decimal("1000"),  # kg
        status="active"
    )
    return cycle


@pytest.fixture
def notification_preference(user):
    """Préférence de notification par défaut."""
    pref = NotificationPreference.objects.create(
        user=user,
        in_app_enabled=True,
        email_enabled=True,
        push_enabled=True,
        email_frequency='instant'
    )
    return pref


@pytest.fixture
def notification(user, production_cycle):
    """Notification de test."""
    notif = Notification.objects.create(
        user=user,
        content_object=production_cycle,
        notification_type='feeding_reminder',
        priority='medium',
        title='Test Notification',
        message='Test notification message',
        channels=['in_app', 'push'],
        scheduled_for=timezone.now()
    )
    return notif


@pytest.fixture
def push_token(user):
    """Token Expo Push pour les tests."""
    token = PushToken.objects.create(
        user=user,
        expo_push_token='ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
        device_id='device-123',
        device_name='Test Device',
        platform='android',
        is_active=True
    )
    return token
