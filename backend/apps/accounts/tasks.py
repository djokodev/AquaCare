"""
Tâches Celery pour le module accounts.
"""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(ignore_result=True)
def cleanup_expired_tokens():
    """
    Purge expired entries from the JWT token blacklist.

    SimpleJWT's OutstandingToken table grows indefinitely as tokens are rotated
    and blacklisted. This task removes tokens that have expired (based on their
    `expires_at` field), along with their associated BlacklistedToken entries.

    Scheduled daily at 4 AM via Celery Beat.
    """
    from django.utils import timezone
    from rest_framework_simplejwt.token_blacklist.models import (
        OutstandingToken,
        BlacklistedToken,
    )

    now = timezone.now()

    # Delete blacklisted tokens whose outstanding token has expired
    expired_blacklisted = BlacklistedToken.objects.filter(
        token__expires_at__lt=now
    )
    blacklisted_count = expired_blacklisted.count()
    expired_blacklisted.delete()

    # Delete outstanding tokens that have expired (and are not blacklisted)
    expired_outstanding = OutstandingToken.objects.filter(
        expires_at__lt=now
    )
    outstanding_count = expired_outstanding.count()
    expired_outstanding.delete()

    logger.info(
        "JWT cleanup: removed %d blacklisted + %d outstanding expired tokens",
        blacklisted_count,
        outstanding_count,
    )
