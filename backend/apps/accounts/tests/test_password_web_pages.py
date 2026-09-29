"""Tests des pages web de reinitialisation de mot de passe (hors /api/)."""
from urllib.parse import urlencode

import pytest
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from tests.fixtures.factories import UserFactory

pytestmark = pytest.mark.django_db

PASSWORD = "motdepasse123"
NEW_PASSWORD = "NouveauMotDePasse2026"


def _confirm_url(user) -> str:
    uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return f"/accounts/password/reset/{uidb64}/{token}/"


def _confirm_url_with_invalid_token(user) -> str:
    uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
    return f"/accounts/password/reset/{uidb64}/lien-false/"


class TestPasswordResetConfirmPage:
    def test_form_renders_with_password_fields(self, client):
        user = UserFactory(password=PASSWORD)
        response = client.get(_confirm_url(user))
        assert response.status_code == 200
        assert b"password" in response.content

    def test_form_uses_aquacare_branding(self, client):
        user = UserFactory(password=PASSWORD)
        response = client.get(_confirm_url(user))
        content = response.content.decode()
        assert "brand/aquacare-logo.png" in content
        assert "#059669" in content  # vert de marque, pas le bleu legacy
        assert "#2563eb" not in content

    def test_form_speaks_user_language(self, client):
        user = UserFactory(password=PASSWORD, language_preference="en")
        response = client.get(_confirm_url(user))
        content = response.content.decode()
        assert "New password" in content
        assert "Nouveau mot de passe" not in content

    def test_invalid_token_renders_400_with_message(self, client):
        user = UserFactory(password=PASSWORD)
        response = client.get(_confirm_url_with_invalid_token(user))
        assert response.status_code == 400
        content = response.content.decode()
        assert "invalide ou a expiré" in content
        assert "Lien invalide" in content
        assert "Nouveau mot de passe" not in content

    def test_invalid_token_speaks_user_language(self, client):
        user = UserFactory(password=PASSWORD, language_preference="en")
        response = client.get(_confirm_url_with_invalid_token(user))
        content = response.content.decode()
        assert response.status_code == 400
        assert "Invalid link" in content
        assert "New password" not in content

    def test_successful_submit_changes_password_and_redirects(self, client):
        user = UserFactory(password=PASSWORD)
        response = client.post(
            _confirm_url(user),
            {"password": NEW_PASSWORD, "password_confirm": NEW_PASSWORD},
        )
        assert response.status_code == 302
        assert "/accounts/password/reset/done/" in response["Location"]
        user.refresh_from_db()
        assert user.check_password(NEW_PASSWORD)

    def test_submit_with_mismatch_renders_form_with_error(self, client):
        user = UserFactory(password=PASSWORD)
        response = client.post(
            _confirm_url(user),
            {"password": NEW_PASSWORD, "password_confirm": "autre"},
        )
        assert response.status_code == 400
        assert b"ne correspondent pas" in response.content
        user.refresh_from_db()
        assert user.check_password(PASSWORD)

    def test_submit_with_weak_password_renders_form_with_error(self, client):
        user = UserFactory(password=PASSWORD)
        response = client.post(
            _confirm_url(user),
            {"password": "123", "password_confirm": "123"},
        )
        assert response.status_code == 400
        # Django echappe l'apostrophe dans le HTML: on verifie sans elle.
        assert b"pas valide" in response.content
        user.refresh_from_db()
        assert user.check_password(PASSWORD)

    def test_submit_on_inactive_account_is_rejected(self, client):
        user = UserFactory(password=PASSWORD, is_active=False)
        response = client.post(
            _confirm_url(user),
            {"password": NEW_PASSWORD, "password_confirm": NEW_PASSWORD},
        )
        assert response.status_code == 400
        user.refresh_from_db()
        assert not user.check_password(NEW_PASSWORD)


class TestPasswordResetDonePage:
    def test_done_page_renders_in_french_by_default(self, client):
        response = client.get("/accounts/password/reset/done/")
        assert response.status_code == 200
        assert "Mot de passe modifi" in response.content.decode()

    def test_done_page_renders_in_english_with_lang_param(self, client):
        response = client.get(f"/accounts/password/reset/done/?{urlencode({'lang': 'en'})}")
        assert response.status_code == 200
        assert "Password changed" in response.content.decode()

    def test_done_page_uses_aquacare_branding(self, client):
        response = client.get("/accounts/password/reset/done/")
        content = response.content.decode()
        assert "brand/aquacare-logo.png" in content
        assert "#059669" in content
