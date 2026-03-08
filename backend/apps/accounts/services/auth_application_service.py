"""Services applicatifs pour les flux d'authentification accounts."""

from __future__ import annotations

from dataclasses import dataclass

from accounts.models import User
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken


@dataclass(frozen=True)
class AuthTokenPair:
    """Paire de tokens JWT exposee a l'adapter HTTP."""

    refresh: str
    access: str


@dataclass(frozen=True)
class AuthSuccessResult:
    """Resultat applicatif commun aux flux register/login."""

    user: User
    tokens: AuthTokenPair
    message: str

    def to_payload(self) -> dict[str, object]:
        """Convertit le resultat en payload compatible serializer DRF."""
        return {
            "user": self.user,
            "tokens": {
                "refresh": self.tokens.refresh,
                "access": self.tokens.access,
            },
            "message": self.message,
        }


class InvalidRefreshTokenError(Exception):
    """Refresh token invalide ou deja invalide."""


class AuthApplicationService:
    """Use cases applicatifs lies aux sessions JWT accounts."""

    @staticmethod
    def build_auth_tokens(user: User) -> AuthTokenPair:
        """Construit la paire de tokens JWT pour un utilisateur."""
        refresh = RefreshToken.for_user(user)
        return AuthTokenPair(
            refresh=str(refresh),
            access=str(refresh.access_token),
        )

    @staticmethod
    def build_auth_success_result(user: User, message: str) -> AuthSuccessResult:
        """Construit le resultat applicatif standard des flux auth."""
        return AuthSuccessResult(
            user=user,
            tokens=AuthApplicationService.build_auth_tokens(user),
            message=message,
        )

    @staticmethod
    def blacklist_refresh_token(refresh_token: str) -> None:
        """Invalide un refresh token et propage une erreur applicative stable."""
        try:
            RefreshToken(refresh_token).blacklist()
        except TokenError as err:
            raise InvalidRefreshTokenError("invalid refresh token") from err
