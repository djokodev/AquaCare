"""IP client fiable derriere Cloudflare/nginx (anti contournement des limites)."""
import pytest
from common.client_ip import TrustedClientIPMiddleware, resolve_client_ip
from django.core.cache import cache
from django.test import RequestFactory
from rest_framework.throttling import AnonRateThrottle

TRUSTED = ("127.0.0.1", "10.0.0.0/8", "172.16.0.0/12")
HEADERS = ("HTTP_CF_CONNECTING_IP", "HTTP_X_REAL_IP")


def test_uses_cloudflare_ip_from_trusted_proxy():
    meta = {"REMOTE_ADDR": "172.18.0.5", "HTTP_CF_CONNECTING_IP": "41.202.219.10",
            "HTTP_X_FORWARDED_FOR": "1.2.3.4, 41.202.219.10, 162.158.1.1"}
    assert resolve_client_ip(meta, TRUSTED, HEADERS) == "41.202.219.10"


def test_ignores_headers_from_untrusted_client():
    meta = {"REMOTE_ADDR": "41.202.219.10", "HTTP_CF_CONNECTING_IP": "9.9.9.9"}
    assert resolve_client_ip(meta, TRUSTED, HEADERS) == "41.202.219.10"


def test_falls_back_to_nginx_real_ip_then_remote_addr():
    assert resolve_client_ip(
        {"REMOTE_ADDR": "172.18.0.5", "HTTP_X_REAL_IP": "41.202.219.11"}, TRUSTED, HEADERS
    ) == "41.202.219.11"
    assert resolve_client_ip(
        {"REMOTE_ADDR": "172.18.0.5", "HTTP_CF_CONNECTING_IP": "pas-une-ip"}, TRUSTED, HEADERS
    ) == "172.18.0.5"


def test_middleware_rewrites_remote_addr_and_drops_forwarded_for(settings):
    settings.ACCOUNT_TRUSTED_PROXY_IPS = TRUSTED
    seen = {}

    def view(request):
        seen.update(request.META)
        return None

    request = RequestFactory().get(
        "/", REMOTE_ADDR="172.18.0.5", HTTP_CF_CONNECTING_IP="41.202.219.10",
        HTTP_X_FORWARDED_FOR="1.2.3.4",
    )
    TrustedClientIPMiddleware(view)(request)
    assert seen["REMOTE_ADDR"] == "41.202.219.10"
    assert "HTTP_X_FORWARDED_FOR" not in seen


@pytest.mark.django_db
def test_forged_forwarded_for_cannot_bypass_login_throttle(api_client, settings):
    """Un attaquant qui change X-Forwarded-For a chaque essai reste limite."""
    settings.ACCOUNT_TRUSTED_PROXY_IPS = TRUSTED
    cache.clear()
    statuses = []
    for attempt in range(8):
        response = api_client.post(
            "/api/accounts/login/",
            {"phone_number": "+237699000001", "password": "mauvais"},
            format="json",
            REMOTE_ADDR="172.18.0.5",
            HTTP_CF_CONNECTING_IP="41.202.219.10",
            HTTP_X_FORWARDED_FOR=f"6.6.6.{attempt}",
        )
        statuses.append(response.status_code)
    cache.clear()
    assert 429 in statuses


def test_drf_throttle_ident_ignores_forwarded_for(settings):
    request = RequestFactory().get("/", REMOTE_ADDR="41.202.219.10", HTTP_X_FORWARDED_FOR="6.6.6.6")
    from rest_framework.request import Request

    assert AnonRateThrottle().get_ident(Request(request)) == "41.202.219.10"
