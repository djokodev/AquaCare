from __future__ import annotations

import logging

import pytest
from django.urls import reverse
from rest_framework import status


@pytest.mark.django_db
class TestAccountsObservability:
    def test_register_response_contains_request_id_and_logs_success(self, api_client, caplog) -> None:
        caplog.set_level(logging.INFO, logger="accounts.views")
        data = {
            "phone_number": "+237690123456",
            "email": "jean.observability@example.com",
            "first_name": "Jean",
            "last_name": "Observability",
            "password": "motdepasse123",
            "password_confirm": "motdepasse123",
            "account_type": "individual",
            "age_group": "26_35",
        }

        response = api_client.post(
            reverse("accounts:register"),
            data,
            format="json",
            HTTP_X_REQUEST_ID="test-request-id",
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response["X-Request-ID"] == "test-request-id"
        assert any(
            record.name == "accounts.views"
            and getattr(record, "event", None) == "accounts.register.succeeded"
            and getattr(record, "user_id", None)
            and getattr(record, "account_type", None) == "individual"
            for record in caplog.records
        )

    def test_invalid_login_logs_rejection_without_sensitive_payload(self, api_client, caplog) -> None:
        caplog.set_level(logging.WARNING, logger="accounts.services.auth_application_service")

        response = api_client.post(
            reverse("accounts:login"),
            {"login_name": "Utilisateur Inexistant", "password": "secret-password"},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        rejection_logs = [
            record for record in caplog.records
            if getattr(record, "event", None) == "accounts.login.rejected"
        ]
        assert rejection_logs
        assert rejection_logs[0].reason_code == "invalid_credentials"
        assert "secret-password" not in rejection_logs[0].getMessage()
