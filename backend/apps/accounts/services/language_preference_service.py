"""Services de resolution de langue pour les requetes accounts."""

from __future__ import annotations

from django.http import HttpRequest
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import UntypedToken


class LanguagePreferenceService:
    """Resolve la langue utilisateur depuis les contextes d'authentification."""

    @staticmethod
    def get_jwt_user_language(request: HttpRequest) -> str | None:
        """Retourne la preference langue embarquee dans le JWT si disponible."""
        if not request.path.startswith('/api/'):
            return None
        if not request.META.get('HTTP_AUTHORIZATION'):
            return None

        try:
            authenticator = JWTAuthentication()
            header = authenticator.get_header(request)
            if header is None:
                return None
            raw_token = authenticator.get_raw_token(header)
            if raw_token is None:
                return None
            token = UntypedToken(raw_token)
        except (InvalidToken, TokenError):
            return None

        user_lang = token.get('language_preference')
        if user_lang in ['fr', 'en']:
            return user_lang
        return None
