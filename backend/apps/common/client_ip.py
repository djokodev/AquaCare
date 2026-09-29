"""
Resolution de l'IP client reelle derriere Cloudflare et nginx.

Chaine de production: client -> Cloudflare -> nginx -> Django. L'en-tete
X-Forwarded-For est construit en ajoutant des IP a droite: sa valeur la plus a
gauche est ecrite par le client et donc falsifiable. S'en servir pour les
limites de tentatives permettait de les contourner en changeant d'IP a chaque
essai (OWASP A07).

Ce middleware remplace REMOTE_ADDR par l'IP fournie par un proxy de confiance
(CF-Connecting-IP de Cloudflare, sinon X-Real-IP pose par nginx) et supprime
X-Forwarded-For, pour que les throttles DRF (NUM_PROXIES=0) et le rate limit
du login s'appuient tous sur la meme IP fiable.

Prerequis infra: le serveur n'accepte le trafic HTTP(S) que depuis les plages
Cloudflare, sinon un client pourrait envoyer lui-meme CF-Connecting-IP.
"""
from __future__ import annotations

import ipaddress
from collections.abc import Callable, Iterable

from django.conf import settings
from django.http import HttpRequest, HttpResponse

__all__ = ["TrustedClientIPMiddleware", "is_trusted_proxy", "resolve_client_ip"]

DEFAULT_CLIENT_IP_HEADERS = ("HTTP_CF_CONNECTING_IP", "HTTP_X_REAL_IP")


def _parse_ip(value: str | None) -> str | None:
    if not value:
        return None
    candidate = value.strip()
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None


def is_trusted_proxy(ip: str, trusted_proxies: Iterable[str]) -> bool:
    """IP (ou reseau CIDR) appartenant a la liste des proxies de confiance."""
    try:
        remote_ip = ipaddress.ip_address(ip)
    except ValueError:
        return False
    for proxy in trusted_proxies:
        try:
            if remote_ip in ipaddress.ip_network(proxy, strict=False):
                return True
        except ValueError:
            continue
    return False


def resolve_client_ip(meta: dict, trusted_proxies: Iterable[str], headers: Iterable[str]) -> str:
    """IP client: en-tete de confiance si la requete vient d'un proxy fiable."""
    remote_addr = meta.get("REMOTE_ADDR") or ""
    if not is_trusted_proxy(remote_addr, trusted_proxies):
        return remote_addr
    for header in headers:
        ip = _parse_ip(meta.get(header))
        if ip:
            return ip
    return remote_addr


class TrustedClientIPMiddleware:
    """Normalise REMOTE_ADDR et retire X-Forwarded-For (a placer en tete)."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        trusted_proxies = getattr(settings, "ACCOUNT_TRUSTED_PROXY_IPS", ())
        headers = getattr(settings, "CLIENT_IP_HEADERS", DEFAULT_CLIENT_IP_HEADERS)
        request.META["REMOTE_ADDR"] = resolve_client_ip(request.META, trusted_proxies, headers)
        request.META.pop("HTTP_X_FORWARDED_FOR", None)
        return self.get_response(request)
