"""Services applicatifs pour les flux d'authentification accounts."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from accounts.domain.login_identifier import LoginIdentifier
from accounts.managers import AmbiguousLoginNameError
from accounts.models import User
from accounts.validators import normalize_phone_number
from django.utils.translation import gettext as _
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken, UntypedToken

logger = logging.getLogger(__name__)


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


class AuthValidationError(Exception):
    """Erreur metier liee au formulaire d'authentification."""

    def __init__(self, message: str, *, field_name: str | None = None) -> None:
        super().__init__(message)
        self.field_name = field_name


class InvalidCredentialsError(AuthValidationError):
    """Identifiants invalides ou compte inactif."""


class AmbiguousCredentialsError(AuthValidationError):
    """Le nom de connexion correspond a plusieurs comptes."""


class AuthApplicationService:
    """Use cases applicatifs lies aux sessions JWT accounts."""

    @staticmethod
    def authenticate_user(
        *,
        login_name: str | None = None,
        phone_number: str | None = None,
        password: str | None = None,
    ) -> User:
        """Authentifie un utilisateur via les backends Django configures."""
        identifier = LoginIdentifier.from_credentials(
            login_name=login_name,
            phone_number=phone_number,
        )
        if not identifier.has_value:
            logger.warning(
                "Authentication rejected",
                extra={
                    "event": "accounts.login.rejected",
                    "reason_code": "missing_credentials",
                    "auth_method": "unknown",
                    "status_code": 400,
                },
            )
            raise InvalidCredentialsError(
                _("Veuillez fournir soit le nom de connexion soit le numéro de téléphone."),
            )

        if not password:
            logger.warning(
                "Authentication rejected",
                extra={
                    "event": "accounts.login.rejected",
                    "reason_code": "missing_password",
                    "auth_method": "phone_number" if identifier.phone_number else "login_name",
                    "status_code": 400,
                },
            )
            raise InvalidCredentialsError(
                _("Le mot de passe est requis."),
                field_name="password",
            )

        try:
            if identifier.login_name:
                user = User.objects.get_by_login_name(identifier.login_name)
            else:
                normalized_phone = normalize_phone_number(identifier.phone_number)
                user = User.objects.get_by_natural_key(normalized_phone)
        except AmbiguousLoginNameError as err:
            logger.warning(
                "Authentication rejected",
                extra={
                    "event": "accounts.login.rejected",
                    "reason_code": "ambiguous_login_name",
                    "auth_method": "login_name",
                    "status_code": 400,
                },
            )
            raise AmbiguousCredentialsError(
                _(
                    "Plusieurs comptes correspondent à ce nom de connexion. "
                    "Utilisez plutôt votre numéro de téléphone."
                ),
                field_name="login_name",
            ) from err
        except User.DoesNotExist as err:
            auth_method = "phone_number" if identifier.phone_number else "login_name"
            reason_code = "unknown_phone_number" if identifier.phone_number else "unknown_login_name"
            logger.warning(
                "Authentication rejected",
                extra={
                    "event": "accounts.login.rejected",
                    "reason_code": reason_code,
                    "auth_method": auth_method,
                    "status_code": 400,
                },
            )
            if identifier.phone_number:
                raise InvalidCredentialsError(
                    _("Aucun compte n'est associé à ce numéro de téléphone."),
                    field_name="phone_number",
                ) from err
            raise InvalidCredentialsError(
                _("Aucun compte n'est associé à ce nom de connexion."),
                field_name="login_name",
            ) from err

        if not user.is_active:
            logger.warning(
                "Authentication rejected",
                extra={
                    "event": "accounts.login.rejected",
                    "reason_code": "inactive_account",
                    "auth_method": "phone_number" if identifier.phone_number else "login_name",
                    "status_code": 400,
                },
            )
            raise InvalidCredentialsError(
                _("Ce compte a été désactivé. Contactez AquaCare pour obtenir de l'aide."),
            )
        if not user.check_password(password):
            logger.warning(
                "Authentication rejected",
                extra={
                    "event": "accounts.login.rejected",
                    "reason_code": "invalid_password",
                    "auth_method": "phone_number" if identifier.phone_number else "login_name",
                    "status_code": 400,
                },
            )
            raise InvalidCredentialsError(
                _("Mot de passe incorrect."),
                field_name="password",
            )
        return user

    @staticmethod
    def build_auth_tokens(user: User) -> AuthTokenPair:
        """Construit la paire de tokens JWT pour un utilisateur."""
        refresh = RefreshToken.for_user(user)
        refresh["language_preference"] = user.language_preference
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
    def _is_blacklisted_refresh_for_expected_user(
        refresh_token: str,
        expected_user: User | None,
    ) -> bool:
        try:
            token = UntypedToken(refresh_token)
        except TokenError:
            return False

        if token.get(api_settings.TOKEN_TYPE_CLAIM) != RefreshToken.token_type:
            return False
        if expected_user is not None and str(token.get("user_id")) != str(expected_user.pk):
            return False

        jti = token.get(api_settings.JTI_CLAIM)
        if not jti:
            return False

        try:
            from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
        except ImportError:
            return False

        return BlacklistedToken.objects.filter(token__jti=jti).exists()

    @staticmethod
    def blacklist_refresh_token(refresh_token: str, expected_user: User | None = None) -> None:
        """Invalide un refresh token et propage une erreur applicative stable."""
        try:
            token = RefreshToken(refresh_token)
            if expected_user is not None and str(token.get("user_id")) != str(expected_user.pk):
                raise InvalidRefreshTokenError("refresh token does not belong to user")
            token.blacklist()
        except TokenError as err:
            if AuthApplicationService._is_blacklisted_refresh_for_expected_user(
                refresh_token,
                expected_user,
            ):
                return
            raise InvalidRefreshTokenError("invalid refresh token") from err
