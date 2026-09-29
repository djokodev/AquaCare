"""Changements sensibles du compte: mot de passe actuel obligatoire (OWASP A06/A07)."""
import pytest
from rest_framework import status

from tests.fixtures.factories import UserFactory

pytestmark = pytest.mark.django_db

PASSWORD = "MotDePasseActuel2026"
PROFILE_URL = "/api/accounts/profile/"
DELETE_URL = "/api/accounts/delete/"


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def user():
    return UserFactory(password=PASSWORD, email="ancien@example.com")


@pytest.fixture
def client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


class TestEmailChangeRequiresPassword:
    def test_email_change_without_password_is_rejected(self, client, user):
        response = client.patch(PROFILE_URL, {"email": "pirate@example.com"}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "current_password" in response.data
        user.refresh_from_db()
        assert user.email == "ancien@example.com"

    def test_email_change_with_wrong_password_is_rejected(self, client, user):
        response = client.patch(
            PROFILE_URL,
            {"email": "pirate@example.com", "current_password": "mauvais"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "current_password" in response.data
        user.refresh_from_db()
        assert user.email == "ancien@example.com"

    def test_email_change_with_password_succeeds(self, client, user):
        response = client.patch(
            PROFILE_URL,
            {"email": "nouveau@example.com", "current_password": PASSWORD},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert "current_password" not in response.data
        user.refresh_from_db()
        assert user.email == "nouveau@example.com"

    def test_same_email_with_other_case_does_not_require_password(self, client):
        response = client.patch(PROFILE_URL, {"email": "ANCIEN@example.com"}, format="json")
        assert response.status_code == status.HTTP_200_OK

    def test_other_fields_do_not_require_password(self, client, user):
        response = client.patch(PROFILE_URL, {"city": "Douala"}, format="json")
        assert response.status_code == status.HTTP_200_OK

    def test_blank_email_is_rejected(self, client, user):
        response = client.patch(
            PROFILE_URL, {"email": "", "current_password": PASSWORD}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        user.refresh_from_db()
        assert user.email == "ancien@example.com"


class TestAccountDeletionRequiresPassword:
    def test_deletion_without_password_is_rejected(self, client, user):
        response = client.post(DELETE_URL, {"confirm": True}, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "current_password" in response.data
        user.refresh_from_db()
        assert user.is_active is True

    def test_deletion_with_wrong_password_is_rejected(self, client, user):
        response = client.post(
            DELETE_URL, {"confirm": True, "current_password": "mauvais"}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        user.refresh_from_db()
        assert user.is_active is True

    def test_deletion_with_password_succeeds(self, client, user):
        response = client.post(
            DELETE_URL, {"confirm": True, "current_password": PASSWORD}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.is_active is False
