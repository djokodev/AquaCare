"""
Tests pour les badges de notification de l'admin AquaCare.
"""
import json
from datetime import UTC, datetime

import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import Client

User = get_user_model()


@pytest.fixture
def staff_user(db):
    """Crée un superuser pour les tests admin."""
    return User.objects.create_superuser(
        phone_number='+237690100001',
        password='testpass123',
        first_name='Admin',
        last_name='Test',
    )


@pytest.fixture
def regular_user(db):
    """Crée un utilisateur non-staff."""
    return User.objects.create_user(
        phone_number='+237690100002',
        password='testpass123',
        first_name='User',
        last_name='Normal',
        account_type='individual',
        age_group='26_35',
    )


@pytest.fixture
def admin_client(staff_user):
    """Client Django admin authentifié."""
    c = Client()
    c.force_login(staff_user)
    return c


@pytest.fixture
def support_user(db):
    """Crée un utilisateur du groupe mavecam_support."""
    user = User.objects.create_user(
        phone_number='+237690100003',
        password='testpass123',
        is_staff=True,
        first_name='Support',
        last_name='Operator',
        account_type='individual',
        age_group='26_35',
    )
    group, _ = Group.objects.get_or_create(name='mavecam_support')
    user.groups.add(group)
    return user


# =============================================================================
# Tests du modèle AdminViewState
# =============================================================================

@pytest.mark.django_db
class TestAdminViewState:
    """Tests du modèle AdminViewState."""

    def test_get_last_seen_creates_with_baseline_on_first_call(self, staff_user):
        """La première consultation retourne la baseline 2024-01-01."""
        from common.models import AdminViewState

        last_seen = AdminViewState.get_last_seen(staff_user, AdminViewState.SECTION_CYCLE_LOGS)
        expected_baseline = datetime(2024, 1, 1, tzinfo=UTC)
        assert last_seen == expected_baseline

    def test_get_last_seen_returns_existing_value_on_second_call(self, staff_user):
        """La deuxième consultation retourne la valeur enregistrée."""
        from common.models import AdminViewState

        AdminViewState.get_last_seen(staff_user, AdminViewState.SECTION_CYCLE_LOGS)
        AdminViewState.mark_seen(staff_user, AdminViewState.SECTION_CYCLE_LOGS)
        AdminViewState.objects.filter(user=staff_user, section=AdminViewState.SECTION_CYCLE_LOGS).update(
            last_seen_at=datetime(2025, 6, 1, tzinfo=UTC)
        )

        last_seen = AdminViewState.get_last_seen(staff_user, AdminViewState.SECTION_CYCLE_LOGS)
        assert last_seen == datetime(2025, 6, 1, tzinfo=UTC)

    def test_mark_seen_creates_row_on_first_call(self, staff_user):
        """mark_seen crée une ligne à la première utilisation."""
        from common.models import AdminViewState

        assert not AdminViewState.objects.filter(
            user=staff_user, section=AdminViewState.SECTION_ORDERS
        ).exists()

        AdminViewState.mark_seen(staff_user, AdminViewState.SECTION_ORDERS)

        assert AdminViewState.objects.filter(
            user=staff_user, section=AdminViewState.SECTION_ORDERS
        ).exists()

    def test_mark_seen_updates_existing_row(self, staff_user):
        """mark_seen met à jour le timestamp existant."""
        from common.models import AdminViewState

        AdminViewState.objects.create(
            user=staff_user,
            section=AdminViewState.SECTION_SANITARY_LOGS,
            last_seen_at=datetime(2024, 1, 1, tzinfo=UTC),
        )

        AdminViewState.mark_seen(staff_user, AdminViewState.SECTION_SANITARY_LOGS)
        obj = AdminViewState.objects.get(user=staff_user, section=AdminViewState.SECTION_SANITARY_LOGS)

        assert obj.last_seen_at > datetime(2024, 1, 1, tzinfo=UTC)

    def test_unique_together_user_section(self, staff_user):
        """Impossible d'avoir deux lignes pour le même user+section."""
        from common.models import AdminViewState
        from django.db import IntegrityError

        AdminViewState.objects.create(
            user=staff_user,
            section=AdminViewState.SECTION_CYCLE_LOGS,
        )
        with pytest.raises(IntegrityError):
            AdminViewState.objects.create(
                user=staff_user,
                section=AdminViewState.SECTION_CYCLE_LOGS,
            )


# =============================================================================
# Tests de la vue badge_counts
# =============================================================================

@pytest.mark.django_db
class TestBadgeCountsView:
    """Tests de l'endpoint /admin/api/badge-counts/."""

    def test_requires_authentication(self, regular_user):
        """Un utilisateur non-authentifié est redirigé vers le login."""
        c = Client()
        response = c.get('/admin/api/badge-counts/')
        # admin_view() redirige vers login (302)
        assert response.status_code == 302
        assert '/admin/login/' in response['Location']

    def test_requires_staff(self, regular_user):
        """Un utilisateur non-staff est redirigé même s'il est connecté."""
        c = Client()
        c.force_login(regular_user)
        response = c.get('/admin/api/badge-counts/')
        assert response.status_code == 302

    def test_returns_json_for_staff(self, admin_client):
        """Un superuser reçoit une réponse JSON valide."""
        response = admin_client.get('/admin/api/badge-counts/')
        assert response.status_code == 200
        assert response['Content-Type'] == 'application/json'

    def test_response_shape(self, admin_client):
        """La réponse contient toutes les clés attendues."""
        response = admin_client.get('/admin/api/badge-counts/')
        data = json.loads(response.content)

        assert 'chat' in data
        assert 'cycle_logs' in data
        assert 'sanitary_logs' in data
        assert 'orders' in data
        assert 'total' in data
        assert isinstance(data['total'], int)

    def test_total_is_sum_of_sections(self, admin_client):
        """Le total est la somme des 4 sections."""
        response = admin_client.get('/admin/api/badge-counts/')
        data = json.loads(response.content)

        expected_total = data['chat'] + data['cycle_logs'] + data['sanitary_logs'] + data['orders']
        assert data['total'] == expected_total

    def test_support_user_sees_only_chat(self, support_user):
        """Un utilisateur mavecam_support ne voit que le badge chat."""
        c = Client()
        c.force_login(support_user)
        response = c.get('/admin/api/badge-counts/')
        assert response.status_code == 200

        data = json.loads(response.content)
        assert data['cycle_logs'] == 0
        assert data['sanitary_logs'] == 0
        assert data['orders'] == 0
