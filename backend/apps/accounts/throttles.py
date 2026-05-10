from __future__ import annotations

from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle, UserRateThrottle


class AccountLoginGlobalThrottle(SimpleRateThrottle):
    """Global throttle for login CPU protection across all clients."""

    scope = "accounts_login_global"

    def get_cache_key(self, request, view) -> str:
        return self.cache_format % {
            "scope": self.scope,
            "ident": "global",
        }


class AccountLoginThrottle(AnonRateThrottle):
    """Throttle for public login attempts."""

    scope = "accounts_login"


class AccountRegisterThrottle(AnonRateThrottle):
    """Throttle for public registration attempts."""

    scope = "accounts_register"


class SensitiveAccountActionThrottle(UserRateThrottle):
    """Throttle for authenticated account security actions."""

    scope = "accounts_sensitive_action"


class AccountTokenThrottle(AnonRateThrottle):
    """Throttle for public JWT refresh and verify endpoints."""

    scope = "accounts_token"


class AccountFarmSetupThrottle(UserRateThrottle):
    """Throttle for authenticated farm setup mutations."""

    scope = "accounts_farm_setup"


class AccountSimulationThrottle(UserRateThrottle):
    """Throttle for authenticated annual simulation requests."""

    scope = "accounts_simulation"
