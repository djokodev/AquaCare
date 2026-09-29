"""
Routes web (hors /api/) du module accounts: pages de reinitialisation
de mot de passe ouvertes depuis le lien email.
"""
from __future__ import annotations

from django.urls import path

from . import web_views

app_name = 'accounts-web'

urlpatterns = [
    path(
        'accounts/password/reset/<uidb64>/<token>/',
        web_views.PasswordResetConfirmPageView.as_view(),
        name='password_reset_confirm',
    ),
    path(
        'accounts/password/reset/done/',
        web_views.PasswordResetDonePageView.as_view(),
        name='password_reset_done',
    ),
]
