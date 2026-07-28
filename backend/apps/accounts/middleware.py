from __future__ import annotations

import logging
from typing import Final, TypedDict

from django.http import HttpRequest, HttpResponse, JsonResponse
from django.utils import translation
from django.utils.translation import gettext as _

from .constants import (
    ACCOUNT_ENDPOINT_RATE_LIMITS,
    ACCOUNT_LOGIN_IP_LIMIT,
    ACCOUNT_LOGIN_USER_LIMIT,
    ACCOUNT_RATE_LIMIT_RETRY_AFTER_SECONDS,
    ACCOUNT_RATE_LIMIT_WINDOW_SECONDS,
)
from .services.language_preference_service import LanguagePreferenceService
from .services.login_rate_limit_service import LoginRateLimitService

logger = logging.getLogger(__name__)


class EndpointRateLimitConfig(TypedDict):
    """Configuration de throttling pour un endpoint protégé."""

    ip_limit: int
    window_seconds: int


class UserLanguageMiddleware:
    """
    Middleware qui détecte et applique automatiquement la langue préférée.

    Logique de détection (ordre de priorité) :
    1. Cookie django_language (défini par le sélecteur de langue admin)
    2. Session django_language
    3. Préférence utilisateur connecté
    4. Header Accept-Language
    5. Par défaut : français (public cible Afrique centrale)
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        # Détecter la langue préférée
        language = self.get_user_language(request)

        # Activer la langue
        translation.activate(language)
        request.LANGUAGE_CODE = language

        try:
            response = self.get_response(request)
        finally:
            translation.deactivate()

        return response

    def get_user_language(self, request: HttpRequest) -> str:
        """
        Détermine la langue à utiliser pour cette requête.

        Ordre de priorité :
        1. Cookie django_language (pour le language switcher admin/Jazzmin)
        2. Session django_language
        3. Préférence utilisateur connecté (pour l'API mobile)
        4. Header Accept-Language
        5. Français par défaut

        Args:
            request: Requête HTTP Django

        Returns:
            str: Code langue ('fr' ou 'en')
        """
        from django.conf import settings

        # 1. Vérifier le cookie django_language (priorité pour l'admin)
        cookie_name = getattr(settings, 'LANGUAGE_COOKIE_NAME', 'django_language')
        cookie_lang = request.COOKIES.get(cookie_name)
        if cookie_lang and cookie_lang in ['fr', 'en']:
            return cookie_lang

        # 2. Vérifier la session
        session_lang = request.session.get('_language') or request.session.get('django_language')
        if session_lang and session_lang in ['fr', 'en']:
            return session_lang

        # 3. Si utilisateur connecté par session, utiliser sa préférence
        if hasattr(request, 'user') and request.user.is_authenticated:
            if hasattr(request.user, 'language_preference'):
                user_lang = request.user.language_preference
                if user_lang in ['fr', 'en']:
                    return user_lang

        # 4. Si API mobile JWT, résoudre la préférence sans attendre DRF.
        jwt_lang = LanguagePreferenceService.get_jwt_user_language(request)
        if jwt_lang:
            return jwt_lang

        # 5. Utiliser l'header Accept-Language
        accept_language = request.META.get('HTTP_ACCEPT_LANGUAGE', '')
        if accept_language:
            # Analyser l'header Accept-Language simplement.
            if accept_language.lower().startswith('en'):
                return 'en'
            elif accept_language.lower().startswith('fr'):
                return 'fr'

        # 6. Par défaut : français (contexte Cameroun)
        return 'fr'

class APIResponseLanguageMiddleware:
    """
    Middleware qui ajoute la langue actuelle aux réponses API.
    
    Ajoute un header X-Content-Language pour informer le client mobile
    de la langue utilisée dans la réponse.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        
        # Ajouter le header de langue pour les API
        if request.path.startswith('/api/'):
            current_language = translation.get_language() or 'fr'
            response['X-Content-Language'] = current_language
        
        return response


class LoginRateLimitMiddleware:
    """
    Middleware de rate limiting pour les tentatives de connexion.
    
    Limite les tentatives de connexion pour prévenir les attaques par force brute.
    Spécialement important pour l'API mobile AquaCare.
    
    Règles :
    - Max 5 tentatives par IP par minute
    - Max 3 tentatives par utilisateur par minute
    """
    
    # Endpoints proteges et leurs limites specifiques
    PROTECTED_ENDPOINTS: Final[dict[str, EndpointRateLimitConfig]] = ACCOUNT_ENDPOINT_RATE_LIMITS

    def __init__(self, get_response):
        self.get_response = get_response
        self.ip_limit = ACCOUNT_LOGIN_IP_LIMIT
        self.user_limit = ACCOUNT_LOGIN_USER_LIMIT
        self.window_seconds = ACCOUNT_RATE_LIMIT_WINDOW_SECONDS
        self.rate_limit_service = LoginRateLimitService(
            ip_limit=self.ip_limit,
            user_limit=self.user_limit,
            window_seconds=self.window_seconds,
        )

    def __call__(self, request: HttpRequest) -> HttpResponse:
        # Vérifier le rate limiting avant traitement
        if self.should_rate_limit(request):
            logger.warning(
                "Accounts endpoint rate limited",
                extra={
                    "event": "accounts.rate_limit.blocked",
                    "endpoint": request.path,
                    "reason_code": "too_many_failed_attempts",
                    "status_code": 429,
                    "retry_after": ACCOUNT_RATE_LIMIT_RETRY_AFTER_SECONDS,
                },
            )
            return JsonResponse({
                'error': _('Trop de tentatives de connexion. Veuillez patienter.'),
                'retry_after': ACCOUNT_RATE_LIMIT_RETRY_AFTER_SECONDS
            }, status=429)
        
        response = self.get_response(request)
        
        # Enregistrer les tentatives après traitement
        if self.is_login_attempt(request, response):
            self.record_attempt(request, response)
        
        return response
    
    def is_login_attempt(self, request: HttpRequest, response: HttpResponse) -> bool:
        """Vérifie si c'est une tentative sur un endpoint protégé."""
        return (
            request.path in self.PROTECTED_ENDPOINTS and
            request.method == 'POST'
        )

    def should_rate_limit(self, request: HttpRequest) -> bool:
        """Vérifie si la requête doit être rate limitée."""
        if not self.is_login_request(request):
            return False

        return self.rate_limit_service.should_rate_limit(
            request,
            self.PROTECTED_ENDPOINTS,
        )

    def is_login_request(self, request: HttpRequest) -> bool:
        """Vérifie si c'est une requête sur un endpoint protégé."""
        return (
            request.path in self.PROTECTED_ENDPOINTS and
            request.method == 'POST'
        )
    
    def _check_limit(self, key: str, limit: int, window_seconds: int) -> bool:
        """Vérifie si une clé de cache dépasse sa limite dans la fenêtre."""
        return self.rate_limit_service.tracker.exceeds_limit(key, limit, window_seconds)

    def check_user_limit(self, login_name: str) -> bool:
        """Vérifie la limite par utilisateur."""
        return self.rate_limit_service.tracker.exceeds_user_limit(login_name)
    
    def record_attempt(self, request: HttpRequest, response: HttpResponse) -> None:
        """Enregistre une tentative de connexion."""
        # Enregistrer seulement les tentatives échouées
        if response.status_code >= 400:
            logger.info(
                "Accounts failed attempt recorded",
                extra={
                    "event": "accounts.rate_limit.failure_recorded",
                    "endpoint": request.path,
                    "status_code": response.status_code,
                },
            )
            self.rate_limit_service.record_failed_attempt(request)
    
    def get_client_ip(self, request: HttpRequest) -> str:
        """Récupère l'IP du client."""
        return self.rate_limit_service.get_client_ip(request)

    def get_login_identifier(self, request: HttpRequest) -> str:
        """Recupere l'identifiant de connexion pertinent pour le rate limiting."""
        return self.rate_limit_service.get_login_identifier(request)

    def _cache_key_ip(self, ip: str) -> str:
        return self.rate_limit_service.tracker.cache_key_ip(ip)

    def _cache_key_user(self, login_name: str) -> str:
        return self.rate_limit_service.tracker.cache_key_user(login_name)

    def _get_recent_attempts(self, key: str, window_seconds: int | None = None) -> list[float]:
        return self.rate_limit_service.tracker.get_recent_attempts(key, window_seconds)

    def _record_attempt(self, key: str) -> None:
        self.rate_limit_service.tracker._record_attempt(key)
