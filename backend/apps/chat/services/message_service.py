"""
Message domain service.
Handles message creation, retrieval, read status, and offline sync deduplication.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from ..domain.exceptions import (
    ClientUUIDConflict,
    InvalidMediaFormat,
    InvalidMessageContent,
    MediaTooLarge,
)
from ..domain.value_objects import MediaAttachment, MediaKind, MessageContent
from .conversation_service import ConversationService

User = get_user_model()

if TYPE_CHECKING:
    from chat.models import Conversation, Message
    from chat.models import User as ChatUser


UnreadRecipient = Literal['user', 'admin']
SenderType = Literal['user', 'admin', 'system']


class MessageService:
    """
    Service for managing messages.

    Responsibilities:
    - Send user messages (with optional media)
    - Send admin messages
    - Send system messages (auto-acknowledgment)
    - Handle offline sync deduplication via client_uuid
    - Mark messages as read
    """

    @staticmethod
    def _validate_message_content(content: str) -> None:
        """Valide le contenu textuel et propage une erreur domaine explicite."""
        try:
            MessageContent(text=content)
        except ValueError as err:
            raise InvalidMessageContent(str(err)) from err

    @staticmethod
    def _validate_media_attachment(
        media_file: UploadedFile | None,
        media_type: str | None,
    ) -> MediaKind | None:
        """Valide le media eventuel et renvoie son type normalise."""
        if not media_file or not media_type:
            return None

        normalized_media_type = media_type

        try:
            MediaAttachment(
                file_path=media_file.name,
                media_type=normalized_media_type,
                file_size_bytes=media_file.size,
                mime_type=media_file.content_type or 'application/octet-stream',
            )
        except ValueError as err:
            error_msg = str(err)
            if "exceeds maximum size" in error_msg:
                raise MediaTooLarge(error_msg) from err
            raise InvalidMediaFormat(error_msg) from err

        return normalized_media_type

    @staticmethod
    def _get_existing_message_for_client_uuid(
        client_uuid: str | None,
    ) -> Message | None:
        if not client_uuid:
            return None

        from ..models import Message

        return Message.objects.filter(client_uuid=client_uuid).select_related(
            'conversation__user'
        ).first()

    @staticmethod
    def _build_message_payload(
        *,
        conversation: Conversation,
        sender_type: SenderType,
        content: str,
        sender_user: ChatUser | None = None,
        media_type: MediaKind | None = None,
        media_file: UploadedFile | None = None,
        client_uuid: str | None = None,
        created_offline: bool = False,
    ) -> dict[str, object]:
        payload: dict[str, object] = {
            'conversation': conversation,
            'sender_type': sender_type,
            'sender_user': sender_user,
            'content': content,
            'media_type': media_type or 'none',
            'media_file': media_file,
        }
        if client_uuid is not None:
            payload['client_uuid'] = client_uuid
        if created_offline:
            payload['created_offline'] = True
            payload['synced_at'] = None
        elif sender_type == 'user':
            payload['created_offline'] = False
            payload['synced_at'] = timezone.now()
        return payload

    @staticmethod
    def _create_message(
        *,
        conversation: Conversation,
        sender_type: SenderType,
        content: str,
        sender_user: ChatUser | None = None,
        media_file: UploadedFile | None = None,
        media_type: MediaKind | None = None,
        client_uuid: str | None = None,
        created_offline: bool = False,
    ) -> Message:
        from ..models import Message

        payload = MessageService._build_message_payload(
            conversation=conversation,
            sender_type=sender_type,
            sender_user=sender_user,
            content=content,
            media_type=media_type,
            media_file=media_file,
            client_uuid=client_uuid,
            created_offline=created_offline,
        )
        return Message.objects.create(**payload)

    @staticmethod
    def _finalize_sent_message(
        conversation: Conversation,
        unread_recipient: UnreadRecipient | None,
    ) -> None:
        ConversationService.update_last_message_timestamp(conversation)
        if unread_recipient == 'user':
            ConversationService.increment_unread_count(conversation, for_user=True)
        elif unread_recipient == 'admin':
            ConversationService.increment_unread_count(conversation, for_user=False)

    @staticmethod
    def _get_unread_messages_queryset(
        conversation: Conversation,
        *,
        reader_is_admin: bool,
    ) -> QuerySet:
        if reader_is_admin:
            ConversationService.reset_unread_count(conversation, for_user=False)
            return conversation.messages.filter(sender_type='user', is_read=False)

        ConversationService.reset_unread_count(conversation, for_user=True)
        return conversation.messages.filter(sender_type__in=['admin', 'system'], is_read=False)

    @staticmethod
    @transaction.atomic
    def send_user_message(
        user: ChatUser,
        content: str,
        media_file: UploadedFile | None = None,
        media_type: str | None = None,
        client_uuid: str | None = None,
        created_offline: bool = False,
    ) -> Message:
        """
        User sends message to administration.

        Business rules:
        - Content validated via MessageContent value object (max 5000 chars)
        - Media validated via MediaAttachment value object (size + format)
        - Deduplication via client_uuid (if message with same UUID exists, return existing)
        - Auto-creates conversation if doesn't exist
        - Updates conversation metadata (last_message_at, unread_count_admin)

        Args:
            user: User sending the message
            content: Message text content
            media_file: Optional uploaded media file (Django UploadedFile)
            media_type: 'image' or 'video' if media attached
            client_uuid: Client-generated UUID for offline deduplication
            created_offline: Whether message was created offline

        Returns:
            Message instance (created or existing if duplicate)

        Raises:
            InvalidMessageContent: If content is empty or too long
            InvalidMediaFormat: If media format not supported
            MediaTooLarge: If media exceeds size limits
        """
        MessageService._validate_message_content(content)
        normalized_media_type = MessageService._validate_media_attachment(media_file, media_type)
        conversation = ConversationService.get_or_create_conversation(user)

        existing_message = MessageService._get_existing_message_for_client_uuid(client_uuid)
        if existing_message:
            if existing_message.conversation.user_id != user.id:
                raise ClientUUIDConflict(
                    "Client UUID already used by another user."
                )
            return existing_message

        message = MessageService._create_message(
            conversation=conversation,
            sender_type='user',
            sender_user=None,
            content=content,
            media_file=media_file,
            media_type=normalized_media_type,
            client_uuid=client_uuid,
            created_offline=created_offline,
        )
        MessageService._finalize_sent_message(conversation, unread_recipient='admin')
        return message

    @staticmethod
    @transaction.atomic
    def send_admin_message(
        conversation: Conversation,
        admin_user: ChatUser,
        content: str,
        media_file: UploadedFile | None = None,
        media_type: str | None = None,
    ) -> Message:
        """
        Admin sends message to user.

        Business rules:
        - Only text messages (admins can't send media for now)
        - Content validated via MessageContent value object
        - Updates conversation metadata
        - Triggers notification to user (handled by signal)

        Args:
            conversation: Conversation instance
            admin_user: Admin User who sends the message
            content: Message text content

        Returns:
            Message instance

        Raises:
            InvalidMessageContent: If content is empty or too long
        """
        MessageService._validate_message_content(content)
        normalized_media_type = MessageService._validate_media_attachment(media_file, media_type)
        message = MessageService._create_message(
            conversation=conversation,
            sender_type='admin',
            sender_user=admin_user,
            content=content,
            media_file=media_file,
            media_type=normalized_media_type,
        )
        MessageService._finalize_sent_message(conversation, unread_recipient='user')
        return message

    @staticmethod
    def send_system_message(conversation: Conversation, content: str) -> Message:
        """
        Send automated system message (e.g., auto-acknowledgment).

        System messages:
        - Do NOT trigger notifications
        - Do NOT increment unread counts
        - Used for auto-acknowledgment and automated responses

        Args:
            conversation: Conversation instance
            content: System message content

        Returns:
            Message instance
        """
        message = MessageService._create_message(
            conversation=conversation,
            sender_type='system',
            sender_user=None,
            content=content,
        )
        MessageService._finalize_sent_message(conversation, unread_recipient=None)
        return message

    @staticmethod
    @transaction.atomic
    def mark_messages_as_read(conversation: Conversation, reader_is_admin: bool = False) -> None:
        """
        Mark all unread messages in conversation as read.

        Args:
            conversation: Conversation instance
            reader_is_admin: True if admin is reading, False if user is reading
        """
        unread_messages = MessageService._get_unread_messages_queryset(
            conversation,
            reader_is_admin=reader_is_admin,
        )
        unread_messages.update(
            is_read=True,
            read_at=timezone.now()
        )
