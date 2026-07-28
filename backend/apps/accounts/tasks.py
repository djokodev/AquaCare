"""
Tâches Celery pour le module accounts.
"""
from __future__ import annotations

import logging
import time

from celery import shared_task

logger = logging.getLogger(__name__)


def _delete_queryset_in_batches(queryset, batch_size: int = 1000) -> int:
    """Supprime un queryset par lots pour eviter les grosses transactions."""
    deleted_count = 0
    model = queryset.model

    while True:
        ids = list(queryset.order_by("pk").values_list("pk", flat=True)[:batch_size])
        if not ids:
            return deleted_count

        model.objects.filter(pk__in=ids).delete()
        deleted_count += len(ids)


@shared_task(bind=True, ignore_result=True)
def cleanup_expired_tokens(self):
    """
    Purge expired entries from the JWT token blacklist.

    SimpleJWT's OutstandingToken table grows indefinitely as tokens are rotated
    and blacklisted. This task removes tokens that have expired (based on their
    `expires_at` field), along with their associated BlacklistedToken entries.

    Scheduled daily at 4 AM via Celery Beat.
    """
    from django.utils import timezone
    from rest_framework_simplejwt.token_blacklist.models import (
        BlacklistedToken,
        OutstandingToken,
    )

    task_id = getattr(self.request, "id", None)
    started_at = time.perf_counter()
    logger.info(
        "JWT cleanup started",
        extra={
            "event": "accounts.jwt_cleanup.started",
            "task_id": task_id,
        },
    )

    try:
        now = timezone.now()

        # Delete blacklisted tokens whose outstanding token has expired
        expired_blacklisted = BlacklistedToken.objects.filter(
            token__expires_at__lt=now
        )
        blacklisted_count = _delete_queryset_in_batches(expired_blacklisted)

        # Delete outstanding tokens that have expired (and are not blacklisted)
        expired_outstanding = OutstandingToken.objects.filter(
            expires_at__lt=now
        )
        outstanding_count = _delete_queryset_in_batches(expired_outstanding)
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)

        logger.info(
            "JWT cleanup completed",
            extra={
                "event": "accounts.jwt_cleanup.completed",
                "task_id": task_id,
                "blacklisted_count": blacklisted_count,
                "outstanding_count": outstanding_count,
                "duration_ms": duration_ms,
            },
        )
    except Exception:
        logger.exception(
            "JWT cleanup failed",
            extra={
                "event": "accounts.jwt_cleanup.failed",
                "task_id": task_id,
            },
        )
        raise
