"""Tests des flux de cycle de vie du mot de passe (Direction prod 2026-09):
- Changement de mot de passe authentifie
- Demande de reinitialisation par email (erreurs explicites)
- Confirmation de reinitialisation (API + page web serveur)
"""
import re
from datetime import timedelta
from unittest.mock import patch
from urllib.parse import urlparse

import pytest
from accounts.models import User
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status

from tests.fixtures.factories import UserFactory

pytestmark = pytest.mark.django_db

PASSWORD = "motdepasse123"
NEW_PASSWORD = "NouveauMotDePasse2026"


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    """Isole les compteurs de throttle DRF entre tests (budgets horaires)."""
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


def _reset_target(user: User) -> dict[str, str]:
    uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return {"uid": uidb64, "token": token}


@pytest.fixture
def user():
    return UserFactory(password=PASSWORD)


class TestPasswordChangeEndpoint:
    url = "/api/accounts/password/change/"

    def test_change_password_success(self, api_client, user):
        api_client.force_authenticate(user=user)
        response = api_client.post(
            self.url,
            {
                "current_password": PASSWORD,
                "password": NEW_PASSWORD,
                "password_confirm": NEW_PASSWORD,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.check_password(NEW_PASSWORD)
        assert not user.check_password(PASSWORD)

    def test_wrong_current_password_is_rejected(self, api_client, user):
        api_client.force_authenticate(user=user)
        response = api_client.post(
            self.url,
            {
                "current_password": "mauvais-mot-de-passe",
                "password": NEW_PASSWORD,
                "password_confirm": NEW_PASSWORD,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        user.refresh_from_db()
        assert user.check_password(PASSWORD)

    def test_mismatched_confirmation_is_rejected(self, api_client, user):
        api_client.force_authenticate(user=user)
        response = api_client.post(
            self.url,
            {
                "current_password": PASSWORD,
                "password": NEW_PASSWORD,
                "password_confirm": "AutreMotDePasse2026",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        user.refresh_from_db()
        assert user.check_password(PASSWORD)

    def test_same_as_current_password_is_rejected(self, api_client, user):
        api_client.force_authenticate(user=user)
        response = api_client.post(
            self.url,
            {
                "current_password": PASSWORD,
                "password": PASSWORD,
                "password_confirm": PASSWORD,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_weak_new_password_is_rejected(self, api_client, user):
        api_client.force_authenticate(user=user)
        response = api_client.post(
            self.url,
            {
                "current_password": PASSWORD,
                "password": "123",
                "password_confirm": "123",
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        user.refresh_from_db()
        assert user.check_password(PASSWORD)

    def test_requires_authentication(self, api_client):
        response = api_client.post(
            self.url,
            {
                "current_password": PASSWORD,
                "password": NEW_PASSWORD,
                "password_confirm": NEW_PASSWORD,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestPasswordForgotEndpoint:
    url = "/api/accounts/password/forgot/"

    def test_sends_reset_email_for_existing_account(self, api_client, user):
        response = api_client.post(
            self.url, {"phone_number": user.phone_number}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert len(mail.outbox) == 1
        assert user.email in mail.outbox[0].to
        assert "/accounts/password/reset/" in mail.outbox[0].body

    def test_french_email_for_french_account(self, api_client, user):
        api_client.post(self.url, {"phone_number": user.phone_number}, format="json")
        assert "Réinitialisation" in mail.outbox[0].subject

    def test_english_email_for_english_account(self, api_client):
        user = UserFactory(language_preference="en", password=PASSWORD)
        api_client.post(self.url, {"phone_number": user.phone_number}, format="json")
        assert "Reset your password" in mail.outbox[0].subject

    def test_success_returns_masked_email_hint(self, api_client, user):
        user.email = "djoko@example.com"
        user.save(update_fields=["email"])
        response = api_client.post(
            self.url, {"phone_number": user.phone_number}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["email_hint"] == "d***@example.com"
        assert "djoko@" not in response.data["message"]

    def test_unknown_phone_is_reported(self, api_client):
        response = api_client.post(
            self.url, {"phone_number": "+237690999888"}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "phone_number" in response.data
        assert len(mail.outbox) == 0

    def test_inactive_account_is_reported_as_unknown(self, api_client, user):
        user.is_active = False
        user.save(update_fields=["is_active"])
        response = api_client.post(
            self.url, {"phone_number": user.phone_number}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "phone_number" in response.data
        assert len(mail.outbox) == 0

    def test_account_without_email_is_reported(self, api_client, user):
        user.email = ""
        user.save(update_fields=["email"])
        response = api_client.post(
            self.url, {"phone_number": user.phone_number}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "support" in str(response.data["phone_number"]).lower()
        assert len(mail.outbox) == 0

    def test_delivery_failure_returns_503(self, api_client, user):
        with patch(
            "accounts.services.password_service.EmailMultiAlternatives.send",
            side_effect=OSError("smtp down"),
        ):
            response = api_client.post(
                self.url, {"phone_number": user.phone_number}, format="json"
            )
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert "detail" in response.data

    def test_invalid_phone_format_is_rejected(self, api_client):
        response = api_client.post(
            self.url, {"phone_number": "pas-un-telephone"}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert len(mail.outbox) == 0

    def test_email_contains_reset_link_with_token(self, api_client, user):
        api_client.post(self.url, {"phone_number": user.phone_number}, format="json")
        body = mail.outbox[0].body
        match = re.search(r"https?://\S+/accounts/password/reset/\S+", body)
        assert match is not None
        reset_path = urlparse(match.group(0)).path
        assert reset_path.startswith("/accounts/password/reset/")
        assert reset_path.count("/") >= 4  # uidb64 + token segments

    def test_email_has_branded_html_alternative(self, api_client, user):
        api_client.post(
            self.url, {"phone_number": user.phone_number}, format="json"
        )
        message = mail.outbox[0]
        html_parts = [
            content
            for content, mimetype in getattr(message, "alternatives", [])
            if mimetype == "text/html"
        ]
        assert html_parts, "l'email doit contenir une alternative HTML"
        html = html_parts[0]
        assert 'src="https://api.aquacare.tech/static/brand/aquacare-logo.png"' in html
        assert "#059669" in html
        assert "/accounts/password/reset/" in html


class TestPasswordResetEndpoint:
    url = "/api/accounts/password/reset/"

    def test_reset_with_valid_token_succeeds(self, api_client, user):
        response = api_client.post(
            self.url,
            {**_reset_target(user), "password": NEW_PASSWORD, "password_confirm": NEW_PASSWORD},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        user.refresh_from_db()
        assert user.check_password(NEW_PASSWORD)

    def test_old_password_rejected_after_reset(self, api_client, user):
        api_client.post(
            self.url,
            {**_reset_target(user), "password": NEW_PASSWORD, "password_confirm": NEW_PASSWORD},
            format="json",
        )
        login = api_client.post(
            "/api/accounts/login/",
            {"phone_number": user.phone_number, "password": NEW_PASSWORD},
            format="json",
        )
        assert login.status_code == status.HTTP_200_OK

    def test_token_invalidated_after_use(self, api_client, user):
        target = _reset_target(user)
        response = api_client.post(
            self.url,
            {**target, "password": NEW_PASSWORD, "password_confirm": NEW_PASSWORD},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        replay = api_client.post(
            self.url,
            {**target, "password": "AutreMotDePasse2026", "password_confirm": "AutreMotDePasse2026"},
            format="json",
        )
        assert replay.status_code == status.HTTP_400_BAD_REQUEST

    def test_invalid_token_is_rejected(self, api_client, user):
        response = api_client.post(
            self.url,
            {
                **_reset_target(user),
                "token": "token-false",
                "password": NEW_PASSWORD,
                "password_confirm": NEW_PASSWORD,
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        user.refresh_from_db()
        assert user.check_password(PASSWORD)

    def test_expired_token_is_rejected(self, api_client, user):
        target = _reset_target(user)
        # L'horloge utilisee par les tokens avance de 2 heures: le lien (1 h)
        # est expire. On pilote l'horloge du generateur de tokens directement.
        naive_future = timezone.localtime(timezone.now() + timedelta(hours=2)).replace(tzinfo=None)
        with patch.object(
            type(default_token_generator), "_now", return_value=naive_future
        ):
            response = api_client.post(
                "/api/accounts/password/reset/",
                {**target, "password": NEW_PASSWORD, "password_confirm": NEW_PASSWORD},
                format="json",
            )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        user.refresh_from_db()
        assert user.check_password(PASSWORD)

    def test_mismatched_confirmation_is_rejected(self, api_client, user):
        response = api_client.post(
            self.url,
            {**_reset_target(user), "password": NEW_PASSWORD, "password_confirm": "autre"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        user.refresh_from_db()
        assert user.check_password(PASSWORD)

    def test_weak_new_password_is_rejected(self, api_client, user):
        response = api_client.post(
            self.url,
            {**_reset_target(user), "password": "123", "password_confirm": "123"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        user.refresh_from_db()
        assert user.check_password(PASSWORD)

    def test_deleted_account_uid_is_rejected(self, api_client, user):
        target = _reset_target(user)
        user.is_active = False
        user.save(update_fields=["is_active"])
        response = api_client.post(
            self.url,
            {**target, "password": NEW_PASSWORD, "password_confirm": NEW_PASSWORD},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_reset_revokes_existing_refresh_tokens(self, api_client, user):
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
        from rest_framework_simplejwt.tokens import RefreshToken

        refresh = str(RefreshToken.for_user(user))
        response = api_client.post(
            self.url,
            {**_reset_target(user), "password": NEW_PASSWORD, "password_confirm": NEW_PASSWORD},
            format="json",
        )
        assert response.status_code == status.HTTP_200_OK
        assert BlacklistedToken.objects.filter(token__user=user).count() == 1
        refreshed = api_client.post(
            "/api/accounts/token/refresh/", {"refresh": refresh}, format="json"
        )
        assert refreshed.status_code != status.HTTP_200_OK

    def test_failed_reset_keeps_refresh_tokens_valid(self, api_client, user):
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
        from rest_framework_simplejwt.tokens import RefreshToken

        RefreshToken.for_user(user)
        response = api_client.post(
            self.url,
            {**_reset_target(user), "password": "123", "password_confirm": "123"},
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not BlacklistedToken.objects.filter(token__user=user).exists()


class TestResetLinkBaseUrl:
    url = "/api/accounts/password/forgot/"

    def test_reset_link_uses_public_base_url_not_host_header(self, api_client, user, settings):
        settings.PUBLIC_API_BASE_URL = "https://api.aquacare.tech"
        settings.ALLOWED_HOSTS = ["*"]
        api_client.post(
            self.url,
            {"phone_number": user.phone_number},
            format="json",
            HTTP_HOST="77.237.241.223",
        )
        body = mail.outbox[0].body
        assert "https://api.aquacare.tech/accounts/password/reset/" in body
        assert "77.237.241.223" not in body
