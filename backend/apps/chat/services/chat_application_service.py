"""Use cases applicatifs pour les flux API du module chat."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.core.files.uploadedfile import UploadedFile

from ..models import Conversation, Message
from .conversation_service import ConversationService
from .message_service import MessageService

if TYPE_CHECKING:
    from chat.models import User as ChatUser


@dataclass(frozen=True)
class SendMessageCommand:
    """Commande applicative de creation de message."""

    content: str
    media_file: UploadedFile | None = None
    media_type: str | None = None
    client_uuid: str | None = None
    created_offline: bool = False


class ChatApplicationService:
    """Use cases applicatifs exposes a la couche HTTP."""

    @staticmethod
    def get_conversation_queryset_for_user(user: ChatUser):
        """Retourne le scope de conversations visible pour un acteur donne."""
        queryset = Conversation.objects.with_api_annotations().order_by('-last_message_at', '-created_at', '-pk')
        if user.is_staff:
            return queryset
        return queryset.filter(user=user)

    @staticmethod
    def get_conversation_for_actor(
        conversation_id: str | None,
        actor: ChatUser,
    ) -> Conversation:
        """Charge une conversation avec controle d'acces."""
        return ConversationService.get_conversation_by_id(
            conversation_id=conversation_id,
            requesting_user=actor,
        )

    @staticmethod
    def refresh_conversation_for_api(conversation: Conversation) -> Conversation:
        """Recharge une conversation avec ses annotations API."""
        return Conversation.objects.with_api_annotations().get(pk=conversation.pk)

    @staticmethod
    def get_or_create_user_conversation(user: ChatUser) -> Conversation:
        """Use case lecture/creation de la conversation personnelle."""
        conversation = ConversationService.get_or_create_conversation(user)
        return ChatApplicationService.refresh_conversation_for_api(conversation)

    @staticmethod
    def get_conversation_messages(conversation: Conversation):
        """Retourne le feed messages hydrate pour l'API."""
        return Message.objects.for_feed().filter(conversation=conversation).order_by("created_at")

    @staticmethod
    def send_message(
        conversation: Conversation,
        actor: ChatUser,
        command: SendMessageCommand,
    ) -> Message:
        """Use case d'envoi de message, user ou admin."""
        if actor.is_staff:
            return MessageService.send_admin_message(
                conversation=conversation,
                admin_user=actor,
                content=command.content,
                media_file=command.media_file,
                media_type=command.media_type,
            )

        return MessageService.send_user_message(
            user=actor,
            content=command.content,
            media_file=command.media_file,
            media_type=command.media_type,
            client_uuid=command.client_uuid,
            created_offline=command.created_offline,
        )

    @staticmethod
    def mark_conversation_as_read(
        conversation: Conversation,
        actor: ChatUser,
    ) -> Conversation:
        """Use case de lecture des messages d'une conversation."""
        MessageService.mark_messages_as_read(
            conversation=conversation,
            reader_is_admin=actor.is_staff,
        )
        return ChatApplicationService.refresh_conversation_for_api(conversation)
