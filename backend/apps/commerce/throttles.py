from __future__ import annotations

from rest_framework.throttling import UserRateThrottle


class CommerceSimulationThrottle(UserRateThrottle):
    """Throttle for cycle simulation requests."""

    scope = "commerce_simulation"


class CommerceSuggestionThrottle(UserRateThrottle):
    """Throttle for feeding suggestion requests."""

    scope = "commerce_suggestions"


class CommerceDeliveryPreviewThrottle(UserRateThrottle):
    """Throttle for delivery fee preview requests."""

    scope = "commerce_delivery_preview"
