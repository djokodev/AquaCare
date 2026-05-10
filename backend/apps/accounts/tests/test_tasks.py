from __future__ import annotations

import logging
from datetime import timedelta

import pytest
from accounts.tasks import cleanup_expired_tokens
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken


@pytest.mark.django_db
class TestCleanupExpiredTokensTask:
    def test_cleanup_expired_tokens_removes_only_expired_jwt_records(self, user_factory, caplog) -> None:
        caplog.set_level(logging.INFO, logger="accounts.tasks")
        user = user_factory()
        now = timezone.now()
        expired_blacklisted = OutstandingToken.objects.create(
            user=user,
            jti="expired-blacklisted",
            token="expired-blacklisted-token",
            created_at=now - timedelta(days=10),
            expires_at=now - timedelta(days=1),
        )
        expired_outstanding = OutstandingToken.objects.create(
            user=user,
            jti="expired-outstanding",
            token="expired-outstanding-token",
            created_at=now - timedelta(days=10),
            expires_at=now - timedelta(hours=1),
        )
        valid_outstanding = OutstandingToken.objects.create(
            user=user,
            jti="valid-outstanding",
            token="valid-outstanding-token",
            created_at=now,
            expires_at=now + timedelta(days=1),
        )
        BlacklistedToken.objects.create(token=expired_blacklisted)

        cleanup_expired_tokens.run()

        assert not OutstandingToken.objects.filter(pk=expired_blacklisted.pk).exists()
        assert not OutstandingToken.objects.filter(pk=expired_outstanding.pk).exists()
        assert OutstandingToken.objects.filter(pk=valid_outstanding.pk).exists()
        assert not BlacklistedToken.objects.filter(token=expired_blacklisted).exists()
        assert any(
            getattr(record, "event", None) == "accounts.jwt_cleanup.completed"
            and getattr(record, "blacklisted_count", None) == 1
            and getattr(record, "outstanding_count", None) == 2
            for record in caplog.records
        )
