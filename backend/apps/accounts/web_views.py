"""
Pages web server-side du reinitialisation de mot de passe.

Le lien email ouvre un formulaire heberge par l'API (pas de deep link
applicatif aujourd'hui). La page parle la langue du compte proprietaire.
Ces vues ne passent PAS par DRF: ce sont des vues Django classiques,
protegees par CsrfViewMiddleware et montees hors de /api/.
"""
from __future__ import annotations

import logging

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.http import urlsafe_base64_decode
from django.views import View

from .models import User
from .services.password_service import PasswordResetService

logger = logging.getLogger("accounts")

__all__ = [
    "PasswordResetConfirmPageView",
    "PasswordResetDonePageView",
]


def _reset_texts(language_preference: str) -> dict[str, str]:
    fr = language_preference or "fr"
    if fr.lower().startswith("fr"):
        return {
            "title": "Nouveau mot de passe",
            "intro": (
                "Choisissez un nouveau mot de passe pour votre compte AquaCare."
            ),
            "password_label": "Nouveau mot de passe",
            "password_confirm_label": "Confirmer le nouveau mot de passe",
            "submit": "Enregistrer le nouveau mot de passe",
            "invalid_title": "Lien invalide",
            "invalid_link": (
                "Ce lien de réinitialisation est invalide ou a expiré. "
                "Demandez un nouveau lien depuis l'application."
            ),
            "mismatch": "Les mots de passe ne correspondent pas.",
            "invalid_password": "Ce mot de passe n'est pas valide.",
            "success_title": "Mot de passe modifié",
            "success_intro": (
                "Votre mot de passe a été changé. Vous pouvez maintenant vous "
                "connecter à l'application AquaCare avec le nouveau mot de passe."
            ),
        }
    return {
        "title": "New password",
        "intro": "Choose a new password for your AquaCare account.",
        "password_label": "New password",
        "password_confirm_label": "Confirm new password",
        "submit": "Save new password",
        "invalid_title": "Invalid link",
        "invalid_link": (
            "This reset link is invalid or has expired. "
            "Request a new link from the app."
        ),
        "mismatch": "The passwords do not match.",
        "invalid_password": "This password is not valid.",
        "success_title": "Password changed",
        "success_intro": (
            "Your password has been changed. You can now sign in to the AquaCare "
            "app with the new password."
        ),
    }


class _ResetPageBase(View):
    def _language_for_uid(self, uidb64: str) -> str:
        try:
            user_pk = urlsafe_base64_decode(uidb64).decode()
            user = User.objects.get(pk=user_pk)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return "fr"
        return user.language_preference or "fr"

    def _render_invalid(self, request, uidb64: str, token: str, language: str):
        texts = _reset_texts(language)
        # Le titre du formulaire ("Nouveau mot de passe") n'a pas de sens
        # quand il n'y a plus de formulaire a remplir.
        texts = {**texts, "title": texts["invalid_title"]}
        return render(
            request,
            "accounts/password_reset_form.html",
            {
                "uidb64": uidb64,
                "token": token,
                "invalid_link": True,
                "texts": texts,
            },
            status=400,
        )


class PasswordResetConfirmPageView(_ResetPageBase):
    """GET/POST — formulaire de definition du nouveau mot de passe."""

    def get(self, request, uidb64: str, token: str):
        language = self._language_for_uid(uidb64)
        try:
            PasswordResetService.resolve_reset_target(uidb64, token)
        except Exception:
            logger.info(
                "Password reset page rejected link",
                extra={"event": "accounts.password.reset.page_rejected"},
            )
            return self._render_invalid(request, uidb64, token, language)

        return render(
            request,
            "accounts/password_reset_form.html",
            {
                "uidb64": uidb64,
                "token": token,
                "invalid_link": False,
                "texts": _reset_texts(language),
            },
        )

    def post(self, request, uidb64: str, token: str):
        language = self._language_for_uid(uidb64)
        texts = _reset_texts(language)
        password = request.POST.get("password", "")
        password_confirm = request.POST.get("password_confirm", "")

        try:
            user = PasswordResetService.resolve_reset_target(uidb64, token)
        except Exception:
            logger.info(
                "Password reset page rejected link on submit",
                extra={"event": "accounts.password.reset.page_rejected"},
            )
            return self._render_invalid(request, uidb64, token, language)

        if password != password_confirm:
            return render(
                request,
                "accounts/password_reset_form.html",
                {
                    "uidb64": uidb64,
                    "token": token,
                    "invalid_link": False,
                    "error_message": texts["mismatch"],
                    "texts": texts,
                },
                status=400,
            )

        try:
            validate_password(password, user=user)
        except ValidationError:
            return render(
                request,
                "accounts/password_reset_form.html",
                {
                    "uidb64": uidb64,
                    "token": token,
                    "invalid_link": False,
                    "error_message": texts["invalid_password"],
                    "texts": texts,
                },
                status=400,
            )

        PasswordResetService.confirm_reset(uidb64, token, password)
        return redirect(
            f"{reverse('accounts-web:password_reset_done')}?lang={language}"
        )


class PasswordResetDonePageView(View):
    """Page de confirmation apres reinitialisation reussie."""

    def get(self, request):
        language = request.GET.get("lang", "fr")
        return render(
            request,
            "accounts/password_reset_done.html",
            {"texts": _reset_texts(language)},
        )
