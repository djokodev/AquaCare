from __future__ import annotations

from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class AccountLoginThrottle(AnonRateThrottle):
    """Throttle for public login attempts."""

    scope = "accounts_login"


class AccountRegisterThrottle(AnonRateThrottle):
    """Throttle for public registration attempts."""

    scope = "accounts_register"


class SensitiveAccountActionThrottle(UserRateThrottle):
    """Throttle for authenticated account security actions."""

    scope = "accounts_sensitive_action"
