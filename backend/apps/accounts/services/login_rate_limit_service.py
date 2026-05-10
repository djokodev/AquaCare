"""Services de rate limiting pour les endpoints sensibles accounts."""

from __future__ import annotations

import hashlib
import ipaddress
import json
from dataclasses import dataclass

from django.conf import settings
from django.core.cache import cache
from django.http import HttpRequest
from django.http.request import RawPostDataException


@dataclass
class LoginAttemptTracker:
    """Composant dedie a la persistance et au comptage des tentatives."""

    user_limit: int
    window_seconds: int

    def cache_key_ip(self, ip: str) -> str:
        return f"login-rate-limit:ip:{ip}"

    @staticmethod
    def _normalize_identifier(identifier: str) -> str:
        return identifier.strip().casefold()

    def cache_key_user(self, login_name: str) -> str:
        normalized_identifier = self._normalize_identifier(login_name)
        identifier_hash = hashlib.sha256(
            normalized_identifier.encode('utf-8')
        ).hexdigest()[:16]
        return f"login-rate-limit:user:{identifier_hash}"

    def get_recent_attempts(
        self,
        key: str,
        window_seconds: int | None = None,
    ) -> list[float]:
        """Compatibilite tests: expose le compteur courant sous forme de liste."""
        window = window_seconds if window_seconds is not None else self.window_seconds
        attempts = cache.get(key, 0)
        if isinstance(attempts, list):
            cache.delete(key)
            return []
        try:
            count = int(attempts)
        except (TypeError, ValueError):
            cache.set(key, 0, timeout=window)
            return []
        return [0.0] * max(count, 0)

    def exceeds_limit(self, key: str, limit: int, window_seconds: int) -> bool:
        attempts = cache.get(key, 0)
        if isinstance(attempts, list):
            attempts = len(self.get_recent_attempts(key, window_seconds))
        return int(attempts or 0) >= limit

    def exceeds_user_limit(self, login_name: str) -> bool:
        attempts = self.get_recent_attempts(self.cache_key_user(login_name))
        return len(attempts) >= self.user_limit

    def record_failure(self, ip: str, login_name: str) -> None:
        self._record_attempt(self.cache_key_ip(ip))
        if login_name:
            self._record_attempt(self.cache_key_user(login_name))

    def _record_attempt(self, key: str) -> None:
        cache.add(key, 0, timeout=self.window_seconds)
        try:
            cache.incr(key)
        except ValueError:
            cache.set(key, 1, timeout=self.window_seconds)


class LoginRateLimitService:
    """Use case de protection des tentatives de connexion."""

    def __init__(
        self,
        *,
        ip_limit: int,
        user_limit: int,
        window_seconds: int,
    ) -> None:
        self.ip_limit = ip_limit
        self.user_limit = user_limit
        self.window_seconds = window_seconds
        self.tracker = LoginAttemptTracker(
            user_limit=user_limit,
            window_seconds=window_seconds,
        )

    def should_rate_limit(
        self,
        request: HttpRequest,
        endpoint_limits: dict[str, dict[str, int]],
    ) -> bool:
        """Retourne True si la requete depasse une limite configuree."""
        if request.path not in endpoint_limits or request.method != 'POST':
            return False

        endpoint_config = endpoint_limits[request.path]
        ip_limit = endpoint_config['ip_limit']
        window = endpoint_config['window_seconds']
        ip = self.get_client_ip(request)

        if self.tracker.exceeds_limit(
            self.tracker.cache_key_ip(ip),
            ip_limit,
            window,
        ):
            return True

        if request.path == '/api/accounts/login/':
            login_identifier = self.get_login_identifier(request)
            if login_identifier and self.tracker.exceeds_user_limit(login_identifier):
                return True

        return False

    def record_failed_attempt(self, request: HttpRequest) -> None:
        """Enregistre une tentative echouee pour IP et identifiant utilisateur."""
        ip = self.get_client_ip(request)
        login_identifier = self.get_login_identifier(request)
        self.tracker.record_failure(ip, login_identifier)

    @staticmethod
    def _is_trusted_proxy(ip: str) -> bool:
        trusted_proxies = getattr(settings, 'ACCOUNT_TRUSTED_PROXY_IPS', ())
        if not ip or not trusted_proxies:
            return False

        try:
            remote_ip = ipaddress.ip_address(ip)
        except ValueError:
            return ip in trusted_proxies

        for proxy in trusted_proxies:
            try:
                if remote_ip in ipaddress.ip_network(proxy, strict=False):
                    return True
            except ValueError:
                if ip == proxy:
                    return True

        return False

    @staticmethod
    def get_client_ip(request: HttpRequest) -> str:
        """Recupere l'IP client en tenant compte uniquement des proxies fiables."""
        remote_addr = request.META.get('REMOTE_ADDR') or ''
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for and LoginRateLimitService._is_trusted_proxy(remote_addr):
            return x_forwarded_for.split(',')[0].strip()

        return remote_addr

    @staticmethod
    def get_login_identifier(request: HttpRequest) -> str:
        """Recupere l'identifiant de connexion pertinent."""
        try:
            body = json.loads(request.body.decode('utf-8'))
            if not isinstance(body, dict):
                return ''

            login_name = str(body.get('login_name') or '').strip()
            if login_name:
                return login_name.casefold()

            phone_number = str(body.get('phone_number') or '').strip()
            if phone_number:
                return phone_number

            return ''
        except (json.JSONDecodeError, RawPostDataException, UnicodeDecodeError, AttributeError):
            return ''
