"""
Services du cycle de vie du mot de passe.

Decision prod 2026-09 (module accounts):
- Changement de mot de passe authentifie (mot de passe courant requis).
- Reinitialisation par email: l'email est obligatoire a l'inscription et
  sert de canal unique de reset (pas d'OTP SMS pour le lancement).
- Le lien de reset pointe vers une page web serveur (utilisable depuis le
  navigateur du telephone, sans deep link applicatif); l'API expose aussi
  la confirmation pour un ecran dedie dans l'app plus tard.
- Anti-enumeration: /password/forgot/ repond toujours OK, meme si le compte
  n'existe pas, est desactive, supprime ou sans email.
"""
from __future__ import annotations

import logging

from accounts.models import User
from accounts.validators import normalize_phone_number
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

logger = logging.getLogger("accounts")

__all__ = [
    "PasswordChangeService",
    "PasswordResetService",
    "InvalidPasswordResetLinkError",
]


class InvalidPasswordResetLinkError(Exception):
    """Lien/token de reinitialisation invalide ou expire."""


def _pick_text(language_preference: str, fr: str, en: str) -> str:
    return fr if (language_preference or "fr").lower().startswith("fr") else en


class PasswordChangeService:
    """Changement de mot de passe par l'utilisateur authentifie."""

    @staticmethod
    def change_password(user: User, new_password: str) -> None:
        user.set_password(new_password)
        user.save(update_fields=["password"])
        logger.info(
            "Password changed by owner",
            extra={
                "event": "accounts.password.change.succeeded",
                "user_id": str(user.pk),
            },
        )


class PasswordResetService:
    """Demande + confirmation de reinitialisation par email."""

    @staticmethod
    def find_resettable_user(phone_number: str) -> User | None:
        """
        Compte eligible au reset: actif, non supprime, avec email.

        Le telephone est l'identifiant unique de connexion; la
        normalisation est la meme que celle du login.
        """
        normalized = normalize_phone_number(phone_number)
        if not normalized:
            return None
        try:
            return User.objects.get(
                phone_number=normalized,
                is_active=True,
            )
        except User.DoesNotExist:
            return None

    @staticmethod
    def build_reset_link(request, user: User) -> str:
        """Lien absolu vers la page web de confirmation (cote API)."""
        uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        path = reverse(
            "accounts-web:password_reset_confirm",
            kwargs={"uidb64": uidb64, "token": token},
        )
        base_url = request.build_absolute_uri("/")
        return f"{base_url.rstrip('/')}{path}"

    @classmethod
    def send_reset_email(cls, request, user: User) -> bool:
        """Envoie l'email de reset dans la langue du compte. True si envoye."""
        if not (user.email or "").strip():
            return False

        reset_link = cls.build_reset_link(request, user)
        language = user.language_preference or "fr"
        subject = _pick_text(
            language,
            "AquaCare — Reinitialisation de votre mot de passe",
            "AquaCare — Password reset",
        )
        body = _pick_text(
            language,
            (
                "Bonjour,\n\n"
                "Vous avez demande la reinitialisation de votre mot de passe "
                "AquaCare.\n\n"
                f"Ouvrez ce lien pour choisir un nouveau mot de passe (valide 1 heure):\n"
                f"{reset_link}\n\n"
                "Si vous n'etes pas a l'origine de cette demande, ignorez ce message; "
                "votre mot de passe actuel reste valable.\n\n"
                "L'equipe AquaCare"
            ),
            (
                "Hello,\n\n"
                "You requested a password reset for your AquaCare account.\n\n"
                f"Open this link to choose a new password (valid for 1 hour):\n"
                f"{reset_link}\n\n"
                "If you did not request this, ignore this message; your current "
                "password stays valid.\n\n"
                "The AquaCare team"
            ),
        )

        try:
            send_mail(
                subject=subject,
                message=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )
        except Exception:
            logger.exception(
                "Password reset email delivery failed",
                extra={
                    "event": "accounts.password.reset.email_failed",
                    "user_id": str(user.pk),
                },
            )
            return False

        logger.info(
            "Password reset email sent",
            extra={
                "event": "accounts.password.reset.email_sent",
                "user_id": str(user.pk),
            },
        )
        return True

    @staticmethod
    def _resolve_user_from_uid(uidb64: str) -> User | None:
        try:
            user_pk = urlsafe_base64_decode(uidb64).decode()
            user = User.objects.get(pk=user_pk)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return None
        return user

    @classmethod
    def resolve_reset_target(cls, uidb64: str, token: str) -> User:
        """
        Valide le couple (uid, token) et retourne le compte eligible.

        Le token encode le hash du mot de passe: tout changement de mot de
        passe invalide immediatement les liens encore en circulation.
        """
        user = cls._resolve_user_from_uid(uidb64)
        if user is None or not user.is_active:
            raise InvalidPasswordResetLinkError
        if not default_token_generator.check_token(user, token):
            raise InvalidPasswordResetLinkError
        return user

    @classmethod
    def confirm_reset(cls, uidb64: str, token: str, new_password: str) -> User:
        user = cls.resolve_reset_target(uidb64, token)
        user.set_password(new_password)
        user.save(update_fields=["password"])
        logger.info(
            "Password reset completed via email link",
            extra={
                "event": "accounts.password.reset.completed",
                "user_id": str(user.pk),
            },
        )
        return user
