from __future__ import annotations

from accounts.throttles import (
    AccountFarmSetupThrottle,
    AccountLoginGlobalThrottle,
    AccountLoginThrottle,
    AccountRegisterThrottle,
    AccountSimulationThrottle,
    AccountTokenThrottle,
    SensitiveAccountActionThrottle,
)
from django.core.cache import cache


class TestAccountThrottles:
    def test_login_global_throttle_uses_accounts_login_global_scope(self) -> None:
        assert AccountLoginGlobalThrottle.scope == "accounts_login_global"

    def test_login_global_throttle_uses_single_global_cache_key(self, rf) -> None:
        throttle = AccountLoginGlobalThrottle()
        request = rf.post("/api/accounts/login/")

        cache_key = throttle.get_cache_key(request, view=None)

        assert cache_key == "throttle_accounts_login_global_global"

    def test_login_global_throttle_blocks_after_configured_rate(self, rf) -> None:
        throttle = AccountLoginGlobalThrottle()
        throttle.rate = "2/minute"
        throttle.num_requests, throttle.duration = throttle.parse_rate(throttle.rate)
        request = rf.post("/api/accounts/login/")
        cache.delete(throttle.get_cache_key(request, view=None))

        assert throttle.allow_request(request, view=None) is True
        assert throttle.allow_request(request, view=None) is True
        assert throttle.allow_request(request, view=None) is False

    def test_login_throttle_uses_accounts_login_scope(self) -> None:
        assert AccountLoginThrottle.scope == "accounts_login"

    def test_register_throttle_uses_accounts_register_scope(self) -> None:
        assert AccountRegisterThrottle.scope == "accounts_register"

    def test_sensitive_action_throttle_uses_accounts_sensitive_action_scope(self) -> None:
        assert SensitiveAccountActionThrottle.scope == "accounts_sensitive_action"

    def test_token_throttle_uses_accounts_token_scope(self) -> None:
        assert AccountTokenThrottle.scope == "accounts_token"

    def test_farm_setup_throttle_uses_accounts_farm_setup_scope(self) -> None:
        assert AccountFarmSetupThrottle.scope == "accounts_farm_setup"

    def test_simulation_throttle_uses_accounts_simulation_scope(self) -> None:
        assert AccountSimulationThrottle.scope == "accounts_simulation"
