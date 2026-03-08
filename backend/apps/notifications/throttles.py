from __future__ import annotations

from rest_framework.throttling import UserRateThrottle


class NotificationBulkMutationThrottle(UserRateThrottle):
    """Throttle for bulk notification mutations."""

    scope = "notifications_bulk_mutation"


class NotificationPushTokenThrottle(UserRateThrottle):
    """Throttle for push token registration/update."""

    scope = "notifications_push_token"
