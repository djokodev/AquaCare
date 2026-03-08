from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from typing import Final, TypedDict

from django.core.cache import cache
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.http.request import RawPostDataException
from django.utils import translation
from django.utils.translation import gettext as _


class EndpointRateLimitConfig(TypedDict):
    """Configuration de throttling pour un endpoint protégé."""

    ip_limit: int
    window_seconds: int


class LoginRequestPayload(TypedDict, total=False):
    """Shape minimale attendue pour le payload de connexion."""

    login_name: str
    phone_number: str


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
        window = window_seconds if window_seconds is not None else self.window_seconds
        current_time = time.time()
        attempts = cache.get(key, [])
        recent_attempts = [
            attempt for attempt in attempts
            if current_time - attempt < window
        ]

        if recent_attempts != attempts:
            cache.set(key, recent_attempts, timeout=window)

        return recent_attempts

    def exceeds_limit(self, key: str, limit: int, window_seconds: int) -> bool:
        attempts = self.get_recent_attempts(key, window_seconds)
        return len(attempts) >= limit

    def exceeds_user_limit(self, login_name: str) -> bool:
        attempts = self.get_recent_attempts(self.cache_key_user(login_name))
        return len(attempts) >= self.user_limit

    def record_failure(self, ip: str, login_name: str) -> None:
        self._record_attempt(self.cache_key_ip(ip))
        if login_name:
            self._record_attempt(self.cache_key_user(login_name))

    def _record_attempt(self, key: str) -> None:
        attempts = self.get_recent_attempts(key)
        attempts.append(time.time())
        cache.set(key, attempts, timeout=self.window_seconds)


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

        # 3. Si utilisateur connecté, utiliser sa préférence (pour l'API mobile)
        if hasattr(request, 'user') and request.user.is_authenticated:
            if hasattr(request.user, 'language_preference'):
                user_lang = request.user.language_preference
                if user_lang in ['fr', 'en']:
                    return user_lang

        # 4. Utiliser l'header Accept-Language
        accept_language = request.META.get('HTTP_ACCEPT_LANGUAGE', '')
        if accept_language:
            # Analyser l'header Accept-Language (simplifié�)
            if accept_language.lower().startswith('en'):
                return 'en'
            elif accept_language.lower().startswith('fr'):
                return 'fr'

        # 5. Par défaut : français (contexte Cameroun)
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
    Spécialement important pour l'API mobile MAVECAM.
    
    Règles :
    - Max 5 tentatives par IP par minute
    - Max 3 tentatives par utilisateur par minute
    - Blocage progressif en cas d'abus répété
    """
    
    # Endpoints proteges et leurs limites specifiques
    PROTECTED_ENDPOINTS: Final[dict[str, EndpointRateLimitConfig]] = {
        '/api/accounts/login/': {'ip_limit': 5, 'window_seconds': 60},
        '/api/accounts/register/': {'ip_limit': 10, 'window_seconds': 60},
    }

    def __init__(self, get_response):
        self.get_response = get_response
        self.ip_limit = 5
        self.user_limit = 3
        self.window_seconds = 60
        self.tracker = LoginAttemptTracker(
            user_limit=self.user_limit,
            window_seconds=self.window_seconds,
        )

    def __call__(self, request: HttpRequest) -> HttpResponse:
        # Vérifier le rate limiting avant traitement
        if self.should_rate_limit(request):
            return JsonResponse({
                'error': _('Trop de tentatives de connexion. Veuillez patienter.'),
                'retry_after': 60
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

        endpoint_config = self.PROTECTED_ENDPOINTS[request.path]
        ip_limit = endpoint_config['ip_limit']
        window = endpoint_config['window_seconds']

        ip = self.get_client_ip(request)

        # Vérifier les tentatives par IP (avec limite spécifique à l'endpoint)
        if self._check_limit(self._cache_key_ip(ip), ip_limit, window):
            return True

        # Vérifier les tentatives par utilisateur (login uniquement)
        if request.path == '/api/accounts/login/':
            login_identifier = self.get_login_identifier(request)
            if login_identifier and self.check_user_limit(login_identifier):
                return True

        return False

    def is_login_request(self, request: HttpRequest) -> bool:
        """Vérifie si c'est une requête sur un endpoint protégé."""
        return (
            request.path in self.PROTECTED_ENDPOINTS and
            request.method == 'POST'
        )
    
    def _check_limit(self, key: str, limit: int, window_seconds: int) -> bool:
        """Vérifie si une clé de cache dépasse sa limite dans la fenêtre."""
        return self.tracker.exceeds_limit(key, limit, window_seconds)

    def check_user_limit(self, login_name: str) -> bool:
        """Vérifie la limite par utilisateur."""
        return self.tracker.exceeds_user_limit(login_name)
    
    def record_attempt(self, request: HttpRequest, response: HttpResponse) -> None:
        """Enregistre une tentative de connexion."""
        # Enregistrer seulement les tentatives échouées
        if response.status_code != 200:
            ip = self.get_client_ip(request)
            login_identifier = self.get_login_identifier(request)
            self.tracker.record_failure(ip, login_identifier)
    
    def get_client_ip(self, request: HttpRequest) -> str:
        """Récupère l'IP du client."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0].strip()
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip or ''

    def get_login_identifier(self, request: HttpRequest) -> str:
        """Recupere l'identifiant de connexion pertinent pour le rate limiting."""
        try:
            body = json.loads(request.body.decode('utf-8'))
            if not isinstance(body, dict):
                return ''

            payload = LoginRequestPayload(**body)
            login_name = payload.get('login_name', '').strip()
            if login_name:
                return login_name.casefold()

            phone_number = payload.get('phone_number', '').strip()
            if phone_number:
                return phone_number

            return ''
        except (json.JSONDecodeError, RawPostDataException, UnicodeDecodeError, AttributeError):
            return ''

    def _cache_key_ip(self, ip: str) -> str:
        return self.tracker.cache_key_ip(ip)

    def _cache_key_user(self, login_name: str) -> str:
        return self.tracker.cache_key_user(login_name)

    def _get_recent_attempts(self, key: str, window_seconds: int | None = None) -> list[float]:
        return self.tracker.get_recent_attempts(key, window_seconds)

    def _record_attempt(self, key: str) -> None:
        self.tracker._record_attempt(key)
