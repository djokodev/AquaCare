"""Adapters infrastructure pour le nettoyage lie a la suppression de compte."""

from __future__ import annotations

from typing import Protocol


class AccountCleanupPort(Protocol):
    """Port de nettoyage externe declenche apres anonymisation compte."""

    def cleanup_for_user(self, user_id: object) -> None:
        """Nettoie les donnees externes rattachees a un utilisateur."""


class JwtTokenCleanupAdapter:
    """Nettoie les refresh tokens SimpleJWT persistants."""

    batch_size = 1000

    def cleanup_for_user(self, user_id: object) -> None:
        try:
            from rest_framework_simplejwt.token_blacklist.models import (
                BlacklistedToken,
                OutstandingToken,
            )
        except ImportError:
            return

        batch = []
        token_ids = OutstandingToken.objects.filter(user_id=user_id).values_list(
            "id",
            flat=True,
        )
        for token_id in token_ids.iterator(chunk_size=self.batch_size):
            batch.append(BlacklistedToken(token_id=token_id))
            if len(batch) >= self.batch_size:
                BlacklistedToken.objects.bulk_create(
                    batch,
                    ignore_conflicts=True,
                    batch_size=self.batch_size,
                )
                batch = []

        if batch:
            BlacklistedToken.objects.bulk_create(
                batch,
                ignore_conflicts=True,
                batch_size=self.batch_size,
            )


class PushTokenCleanupAdapter:
    """Nettoie les tokens push du bounded context notifications."""

    def cleanup_for_user(self, user_id: object) -> None:
        try:
            from notifications.models import PushToken
        except ImportError:
            return

        PushToken.objects.filter(user_id=user_id).delete()


def get_default_account_cleanup_ports() -> tuple[AccountCleanupPort, ...]:
    """Composition par defaut des adapters de nettoyage accounts."""
    return (
        JwtTokenCleanupAdapter(),
        PushTokenCleanupAdapter(),
    )
