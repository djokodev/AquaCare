"""
Qui peut faire quoi dans le support.

Être « staff » (accès à l'admin) ne suffit pas : un opérateur commerce ou un
agronome ne doit pas lire les conversations privées des pisciculteurs. Seuls
les agents support (permissions chat) et les superusers y ont accès.
"""

from __future__ import annotations

from typing import Any

from django.db.models import Q, QuerySet


def can_view_all_conversations(user: Any) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or user.has_perm('chat.view_conversation'))
    )


def can_reply_as_support(user: Any) -> bool:
    return bool(
        user
        and user.is_authenticated
        and user.is_active
        and (user.is_superuser or user.has_perm('chat.reply_conversation'))
    )


def support_agents_queryset() -> QuerySet:
    """Utilisateurs actifs à prévenir d'un nouveau message (agents support + superusers)."""
    from django.contrib.auth import get_user_model

    user_model = get_user_model()
    permission_filter = (
        Q(user_permissions__codename='reply_conversation', user_permissions__content_type__app_label='chat')
        | Q(groups__permissions__codename='reply_conversation', groups__permissions__content_type__app_label='chat')
    )
    return user_model.objects.filter(is_active=True).filter(
        Q(is_superuser=True) | (Q(is_staff=True) & permission_filter)
    ).distinct()
