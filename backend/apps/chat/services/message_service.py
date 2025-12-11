# coding: utf-8
"""
Message domain service.
Handles message creation, retrieval, read status, and offline sync deduplication.
"""

from typing import Optional
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from django.core.files.uploadedfile import UploadedFile

from ..domain.value_objects import MessageContent, MediaAttachment
from ..domain.exceptions import (
    InvalidMessageContent,
    InvalidMediaFormat,
    MediaTooLarge,
)
from .conversation_service import ConversationService

User = get_user_model()


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
    @transaction.atomic
    def send_user_message(
        user,
        content: str,
        media_file: Optional[UploadedFile] = None,
        media_type: Optional[str] = None,
        client_uuid: Optional[str] = None,
        created_offline: bool = False
    ):
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
        from ..models import Message

        # Validate content using Domain Value Object
        try:
            message_content = MessageContent(text=content)
        except ValueError as e:
            raise InvalidMessageContent(str(e))

        # Validate media if provided
        if media_file and media_type:
            try:
                media_attachment = MediaAttachment(
                    file_path=media_file.name,
                    media_type=media_type,
                    file_size_bytes=media_file.size,
                    mime_type=media_file.content_type or 'application/octet-stream'
                )
            except ValueError as e:
                # Determine specific exception type
                error_msg = str(e)
                if "exceeds maximum size" in error_msg:
                    raise MediaTooLarge(error_msg)
                else:
                    raise InvalidMediaFormat(error_msg)

        # Get or create conversation
        conversation = ConversationService.get_or_create_conversation(user)

        # Deduplication: Check for existing message with same client_uuid
        if client_uuid:
            existing = Message.objects.filter(client_uuid=client_uuid).first()
            if existing:
                # Return existing message (idempotent operation)
                return existing

        # Create new message
        message = Message.objects.create(
            conversation=conversation,
            sender_type='user',
            sender_user=None,  # User messages don't track sender_user
            content=content,
            media_type=media_type or 'none',
            media_file=media_file,
            client_uuid=client_uuid,
            created_offline=created_offline,
            synced_at=None if created_offline else timezone.now()
        )

        # Update conversation metadata
        ConversationService.update_last_message_timestamp(conversation)
        ConversationService.increment_unread_count(conversation, for_user=False)

        # Note: Auto-acknowledgment will be triggered by signal (not here)

        return message

    @staticmethod
    @transaction.atomic
    def send_admin_message(
        conversation,
        admin_user,
        content: str,
        media_file: Optional[UploadedFile] = None,
        media_type: Optional[str] = None,
    ):
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
        from ..models import Message

        # Validate content
        try:
            message_content = MessageContent(text=content)
        except ValueError as e:
            raise InvalidMessageContent(str(e))

        # Validate media if provided
        if media_file and media_type:
            try:
                media_attachment = MediaAttachment(
                    file_path=media_file.name,
                    media_type=media_type,
                    file_size_bytes=media_file.size,
                    mime_type=media_file.content_type or 'application/octet-stream',
                )
            except ValueError as e:
                error_msg = str(e)
                if "exceeds maximum size" in error_msg:
                    raise MediaTooLarge(error_msg)
                else:
                    raise InvalidMediaFormat(error_msg)

        # Create message
        message = Message.objects.create(
            conversation=conversation,
            sender_type='admin',
            sender_user=admin_user,  # Track which admin responded
            content=content,
            media_type=media_type or 'none',
            media_file=media_file,
        )

        # Update conversation metadata
        ConversationService.update_last_message_timestamp(conversation)
        ConversationService.increment_unread_count(conversation, for_user=True)

        # Note: Notification will be triggered by signal (not here)

        return message

    @staticmethod
    def send_system_message(conversation, content: str):
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
        from ..models import Message

        message = Message.objects.create(
            conversation=conversation,
            sender_type='system',
            sender_user=None,
            content=content,
            media_type='none'
        )

        # Update conversation timestamp (but not unread count)
        ConversationService.update_last_message_timestamp(conversation)

        return message

    @staticmethod
    @transaction.atomic
    def mark_messages_as_read(conversation, reader_is_admin: bool = False):
        """
        Mark all unread messages in conversation as read.

        Args:
            conversation: Conversation instance
            reader_is_admin: True if admin is reading, False if user is reading
        """
        from ..models import Message

        if reader_is_admin:
            # Admin reading user messages
            unread_messages = conversation.messages.filter(
                sender_type='user',
                is_read=False
            )
            # Reset admin's unread count
            ConversationService.reset_unread_count(conversation, for_user=False)
        else:
            # User reading admin/system messages
            unread_messages = conversation.messages.filter(
                sender_type__in=['admin', 'system'],
                is_read=False
            )
            # Reset user's unread count
            ConversationService.reset_unread_count(conversation, for_user=True)

        # Bulk update all unread messages
        unread_messages.update(
            is_read=True,
            read_at=timezone.now()
        )
