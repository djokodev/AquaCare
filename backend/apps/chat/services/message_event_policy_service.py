"""Politique applicative des effets de bord apres creation d'un message."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from chat.domain.value_objects import MessageLanguage
    from chat.models import Message


@dataclass(frozen=True)
class NewMessageEffectsPlan:
    """Plan d'effets de bord decide par la couche applicative."""

    should_send_acknowledgment: bool
    acknowledgment_language: MessageLanguage | None
    should_notify_admins: bool
    should_notify_user: bool


class MessageEventPolicyService:
    """Decide quels effets annexes declencher apres creation d'un message."""

    @staticmethod
    def build_new_message_effects_plan(message: Message) -> NewMessageEffectsPlan:
        """Construit le plan d'actions post-create a partir du message cree."""
        if message.sender_type == "user":
            has_previous_user_message = message.conversation.messages.filter(
                sender_type="user",
            ).exclude(id=message.id).exists()
            language = getattr(message.conversation.user, "language_preference", "fr")
            return NewMessageEffectsPlan(
                should_send_acknowledgment=not has_previous_user_message,
                acknowledgment_language=language if not has_previous_user_message else None,
                should_notify_admins=True,
                should_notify_user=False,
            )

        if message.sender_type == "admin":
            return NewMessageEffectsPlan(
                should_send_acknowledgment=False,
                acknowledgment_language=None,
                should_notify_admins=False,
                should_notify_user=True,
            )

        return NewMessageEffectsPlan(
            should_send_acknowledgment=False,
            acknowledgment_language=None,
            should_notify_admins=False,
            should_notify_user=False,
        )
