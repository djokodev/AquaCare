"""
Services du cycle de vie du mot de passe.

Decision prod 2026-09 (module accounts):
- Changement de mot de passe authentifie (mot de passe courant requis).
- Reinitialisation par email: l'email est obligatoire a l'inscription et
  sert de canal unique de reset (pas d'OTP SMS pour le lancement).
- Le lien de reset pointe vers une page web serveur (utilisable depuis le
  navigateur du telephone, sans deep link applicatif); l'API expose aussi
  la confirmation pour un ecran dedie dans l'app plus tard.
- /password/forgot/ indique clairement si le numero n'a pas de compte actif
  ou pas d'email (decision produit 2026-09: le login revele deja l'existence
  d'un compte, l'anti-enumeration n'apportait donc rien ici). Le throttle
  PasswordForgotThrottle limite les essais.
- Un reset revoque tous les refresh tokens du compte (sessions volees
  incluses). Le changement de mot de passe authentifie ne les revoque PAS:
  l'appareil courant resterait deconnecte sans changement cote mobile.
"""
from __future__ import annotations

import logging

from accounts.models import User
from accounts.validators import normalize_phone_number
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.template.loader import render_to_string
from django.templatetags.static import static
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from .account_cleanup_adapters import JwtTokenCleanupAdapter

logger = logging.getLogger("accounts")

LOGO_STATIC_PATH = "brand/aquacare-logo.png"

__all__ = [
    "PasswordChangeService",
    "PasswordResetService",
    "InvalidPasswordResetLinkError",
    "mask_email",
]


def mask_email(email: str) -> str:
    """Masque un email pour l'afficher sans le reveler: d***@gmail.com."""
    local, _, domain = (email or "").strip().partition("@")
    if not local or not domain:
        return ""
    return f"{local[0]}***@{domain}"


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
            "Réinitialisation de votre mot de passe",
            "Reset your password",
        )
        body = _pick_text(
            language,
            (
                "Bonjour,\n\n"
                "Vous avez demandé la réinitialisation de votre mot de passe "
                "AquaCare.\n\n"
                f"Ouvrez ce lien pour choisir un nouveau mot de passe (valable 1 heure) :\n"
                f"{reset_link}\n\n"
                "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : "
                "votre mot de passe actuel reste valable.\n\n"
                "L'équipe AquaCare"
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
            message = EmailMultiAlternatives(
                subject=subject,
                body=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                to=[user.email],
            )
            html = cls._build_html_email(request, reset_link, language, subject)
            if html:
                message.attach_alternative(html, "text/html")
            message.send(fail_silently=False)
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

    @classmethod
    def _build_html_email(
        cls,
        request,
        reset_link: str,
        language: str,
        title: str,
    ) -> str:
        """
        Rendu HTML de l'email, aux couleurs AquaCare.

        Un echec de rendu ne doit jamais empecher l'envoi: on renvoie une
        chaine vide, Django retombe alors sur la version texte seule.
        """
        try:
            # URL publique HTTPS: Gmail et les autres clients telechargent le
            # logo via leur proxy d'images. Une URL d'API locale (LAN) ou une
            # image CID (retiree par le relais SMTP Resend) ne s'affichent pas.
            logo_url = (
                getattr(settings, "EMAIL_LOGO_URL", "")
                or request.build_absolute_uri(static(LOGO_STATIC_PATH))
            )
            texts = {
                "title": title,
                "intro": _pick_text(
                    language,
                    "Vous avez demandé la réinitialisation du mot de passe de "
                    "votre compte AquaCare.",
                    "You requested a password reset for your AquaCare account.",
                ),
                "cta": _pick_text(
                    language,
                    "Choisir un nouveau mot de passe",
                    "Choose a new password",
                ),
                "expiry": _pick_text(
                    language,
                    "Ce lien est valable 1 heure. Si vous n'êtes pas à l'origine "
                    "de cette demande, ignorez ce message : votre mot de passe "
                    "actuel reste valable.",
                    "This link is valid for 1 hour. If you did not request it, "
                    "ignore this message: your current password stays valid.",
                ),
                "ignore": _pick_text(
                    language,
                    "Pour votre sécurité, ne partagez jamais ce lien avec "
                    "quelqu'un d'autre.",
                    "For your security, never share this link with anyone.",
                ),
                "team": _pick_text(
                    language,
                    "L'équipe AquaCare",
                    "The AquaCare team",
                ),
            }
            return render_to_string(
                "accounts/emails/password_reset.html",
                {
                    "language": language,
                    "logo_url": logo_url,
                    "reset_link": reset_link,
                    "texts": texts,
                },
            )
        except Exception:
            logger.exception(
                "Password reset HTML email rendering failed; sending text only",
                extra={"event": "accounts.password.reset.html_render_failed"},
            )
            return ""

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
    @transaction.atomic
    def confirm_reset(cls, uidb64: str, token: str, new_password: str) -> User:
        user = cls.resolve_reset_target(uidb64, token)
        user.set_password(new_password)
        user.save(update_fields=["password"])
        # Un reset signifie souvent "quelqu'un d'autre a acces au compte":
        # on revoque tous les refresh tokens encore en circulation, sinon un
        # token vole resterait renouvelable indefiniment (rotation JWT).
        JwtTokenCleanupAdapter().cleanup_for_user(user.pk)
        logger.info(
            "Password reset completed via email link",
            extra={
                "event": "accounts.password.reset.completed",
                "user_id": str(user.pk),
            },
        )
        return user
