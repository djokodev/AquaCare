# coding: utf-8
"""
Tests for chat service layer.

Tests business logic in ConversationService, MessageService, and AutoResponseService.
Uses Django database with pytest fixtures.
"""
import pytest
import uuid
from decimal import Decimal
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile

from chat.models import Conversation, Message
from chat.services import ConversationService, MessageService, AutoResponseService
from chat.domain import (
    InvalidMessageContent,
    MediaTooLarge,
    InvalidMediaFormat,
    ConversationNotFound,
    UnauthorizedAccess,
    ClientUUIDConflict,
)


@pytest.mark.django_db
class TestConversationService:
    """Tests for ConversationService."""

    def test_get_or_create_conversation_creates_new(self, authenticated_user):
        """Test that get_or_create creates a new conversation if none exists."""
        # Verify no conversation exists initially
        assert not Conversation.objects.filter(user=authenticated_user).exists()

        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        assert conversation is not None
        assert conversation.user == authenticated_user
        assert conversation.is_active
        assert conversation.unread_count_user == 0
        assert conversation.unread_count_admin == 0

    def test_get_or_create_conversation_returns_existing(self, authenticated_user):
        """Test that get_or_create returns existing conversation."""
        # Create conversation first time
        conv1 = ConversationService.get_or_create_conversation(authenticated_user)

        # Call again - should return same conversation
        conv2 = ConversationService.get_or_create_conversation(authenticated_user)

        assert conv1.id == conv2.id
        assert Conversation.objects.filter(user=authenticated_user).count() == 1

    def test_get_user_conversation_success(self, authenticated_user):
        """Test getting user's conversation successfully."""
        # Create conversation
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        # Retrieve it
        retrieved = ConversationService.get_user_conversation(authenticated_user)

        assert retrieved.id == conversation.id

    def test_get_user_conversation_not_found(self, authenticated_user):
        """Test error when user has no conversation."""
        with pytest.raises(ConversationNotFound):
            ConversationService.get_user_conversation(authenticated_user)

    def test_get_conversation_by_id_user_owns(self, authenticated_user):
        """Test user can access their own conversation by ID."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        retrieved = ConversationService.get_conversation_by_id(
            conversation_id=conversation.id,
            requesting_user=authenticated_user
        )

        assert retrieved.id == conversation.id

    def test_get_conversation_by_id_user_unauthorized(self, user_factory):
        """Test user cannot access another user's conversation."""
        user1 = user_factory()
        user2 = user_factory()

        conversation = ConversationService.get_or_create_conversation(user1)

        with pytest.raises(UnauthorizedAccess):
            ConversationService.get_conversation_by_id(
                conversation_id=conversation.id,
                requesting_user=user2
            )

    def test_get_conversation_by_id_admin_access_any(self, user_factory, mavecam_admin):
        """Test admin can access any conversation."""
        user = user_factory()
        conversation = ConversationService.get_or_create_conversation(user)

        # Admin should be able to access
        retrieved = ConversationService.get_conversation_by_id(
            conversation_id=conversation.id,
            requesting_user=mavecam_admin
        )

        assert retrieved.id == conversation.id

    def test_update_last_message_timestamp(self, authenticated_user):
        """Test updating last message timestamp."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        original_timestamp = conversation.last_message_at

        # Wait a moment and update
        import time
        time.sleep(0.1)

        ConversationService.update_last_message_timestamp(conversation)
        conversation.refresh_from_db()

        assert conversation.last_message_at > original_timestamp

    def test_increment_unread_count_user(self, authenticated_user):
        """Test incrementing unread count for user."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        assert conversation.unread_count_user == 0

        ConversationService.increment_unread_count(conversation, for_user=True)
        conversation.refresh_from_db()

        assert conversation.unread_count_user == 1

    def test_increment_unread_count_admin(self, authenticated_user):
        """Test incrementing unread count for admin."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        assert conversation.unread_count_admin == 0

        ConversationService.increment_unread_count(conversation, for_user=False)
        conversation.refresh_from_db()

        assert conversation.unread_count_admin == 1

    def test_reset_unread_count_user(self, authenticated_user):
        """Test resetting unread count for user."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        conversation.unread_count_user = 5
        conversation.save()

        ConversationService.reset_unread_count(conversation, for_user=True)
        conversation.refresh_from_db()

        assert conversation.unread_count_user == 0

    def test_reset_unread_count_admin(self, authenticated_user):
        """Test resetting unread count for admin."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        conversation.unread_count_admin = 5
        conversation.save()

        ConversationService.reset_unread_count(conversation, for_user=False)
        conversation.refresh_from_db()

        assert conversation.unread_count_admin == 0


@pytest.mark.django_db
class TestMessageService:
    """Tests for MessageService."""

    def test_send_user_message_text_only(self, authenticated_user):
        """Test sending a text-only user message."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        message = MessageService.send_user_message(
            user=authenticated_user,
            content="Bonjour, j'ai besoin d'aide",
            media_file=None,
            media_type='none',
            client_uuid=None,
            created_offline=False
        )

        assert message is not None
        assert message.conversation == conversation
        assert message.sender_type == 'user'
        assert message.content == "Bonjour, j'ai besoin d'aide"
        assert message.media_type == 'none'
        assert not message.created_offline

    def test_send_user_message_with_client_uuid(self, authenticated_user):
        """Test sending message with client UUID for offline sync."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        client_uuid = uuid.uuid4()

        message = MessageService.send_user_message(
            user=authenticated_user,
            content="Message offline",
            media_file=None,
            media_type='none',
            client_uuid=client_uuid,
            created_offline=True
        )

        assert message.client_uuid == client_uuid
        assert message.created_offline

    def test_send_user_message_duplicate_uuid_returns_existing(self, authenticated_user):
        """Test that duplicate client_uuid returns existing message (deduplication)."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        client_uuid = uuid.uuid4()

        # Send first message
        message1 = MessageService.send_user_message(
            user=authenticated_user,
            content="First attempt",
            media_file=None,
            media_type='none',
            client_uuid=client_uuid,
            created_offline=True
        )

        # Send again with same UUID - should return existing
        message2 = MessageService.send_user_message(
            user=authenticated_user,
            content="Second attempt (should be ignored)",
            media_file=None,
            media_type='none',
            client_uuid=client_uuid,
            created_offline=True
        )

        assert message1.id == message2.id
        assert message1.content == "First attempt"
        assert Message.objects.filter(client_uuid=client_uuid).count() == 1

    def test_send_user_message_duplicate_uuid_other_user_rejected(self, user_factory):
        """Test that a client_uuid cannot be reused by another user."""
        user1 = user_factory()
        user2 = user_factory()
        client_uuid = uuid.uuid4()

        MessageService.send_user_message(
            user=user1,
            content="Message from user 1",
            media_file=None,
            media_type='none',
            client_uuid=client_uuid,
            created_offline=True
        )

        with pytest.raises(ClientUUIDConflict):
            MessageService.send_user_message(
                user=user2,
                content="Message from user 2",
                media_file=None,
                media_type='none',
                client_uuid=client_uuid,
                created_offline=True
            )

    def test_send_user_message_empty_content_rejected(self, authenticated_user):
        """Test that empty message content is rejected."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        with pytest.raises(InvalidMessageContent):
            MessageService.send_user_message(
                user=authenticated_user,
                content="",
                media_file=None,
                media_type='none',
                client_uuid=None,
                created_offline=False
            )

    def test_send_user_message_too_long_rejected(self, authenticated_user):
        """Test that messages exceeding 5000 chars are rejected."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        long_content = "a" * 5001

        with pytest.raises(InvalidMessageContent):
            MessageService.send_user_message(
                user=authenticated_user,
                content=long_content,
                media_file=None,
                media_type='none',
                client_uuid=None,
                created_offline=False
            )

    def test_send_user_message_with_image(self, authenticated_user):
        """Test sending message with image attachment."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        # Create small test image
        image_content = b'fake image data'
        image_file = SimpleUploadedFile(
            name='test_image.jpg',
            content=image_content,
            content_type='image/jpeg'
        )

        message = MessageService.send_user_message(
            user=authenticated_user,
            content="Voici ma mare",
            media_file=image_file,
            media_type='image',
            client_uuid=None,
            created_offline=False
        )

        assert message.media_type == 'image'
        assert message.media_file
        assert 'test_image' in message.media_file.name

    def test_send_admin_message(self, authenticated_user, mavecam_admin):
        """Test sending admin response message."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        message = MessageService.send_admin_message(
            conversation=conversation,
            admin_user=mavecam_admin,
            content="Bonjour, comment puis-je vous aider?"
        )

        assert message.sender_type == 'admin'
        assert message.sender_user == mavecam_admin
        assert message.content == "Bonjour, comment puis-je vous aider?"
        assert message.conversation == conversation

    def test_send_admin_message_increments_unread_user(self, authenticated_user, mavecam_admin):
        """Test that admin message increments unread count for user."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        assert conversation.unread_count_user == 0

        MessageService.send_admin_message(
            conversation=conversation,
            admin_user=mavecam_admin,
            content="Test message"
        )

        conversation.refresh_from_db()
        assert conversation.unread_count_user == 1

    def test_send_system_message(self, authenticated_user):
        """Test sending system message (acknowledgment)."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        message = MessageService.send_system_message(
            conversation=conversation,
            content="Message reçu, nous vous répondrons sous 24h"
        )

        assert message.sender_type == 'system'
        assert message.sender_user is None
        assert message.content == "Message reçu, nous vous répondrons sous 24h"

    def test_send_system_message_does_not_increment_unread(self, authenticated_user):
        """Test that system messages don't increment unread counts."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        initial_unread = conversation.unread_count_user

        MessageService.send_system_message(
            conversation=conversation,
            content="System acknowledgment"
        )

        conversation.refresh_from_db()
        assert conversation.unread_count_user == initial_unread

    def test_mark_messages_as_read(self, authenticated_user, mavecam_admin):
        """Test marking messages as read."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        # Admin sends 3 messages
        msg1 = MessageService.send_admin_message(conversation, mavecam_admin, "Message 1")
        msg2 = MessageService.send_admin_message(conversation, mavecam_admin, "Message 2")
        msg3 = MessageService.send_admin_message(conversation, mavecam_admin, "Message 3")

        # All should be unread
        assert not msg1.is_read
        assert not msg2.is_read
        assert not msg3.is_read
        conversation.refresh_from_db()
        assert conversation.unread_count_user == 3

        # Mark as read (user is reading, so reader_is_admin=False)
        MessageService.mark_messages_as_read(conversation, reader_is_admin=False)

        # Refresh and check
        msg1.refresh_from_db()
        msg2.refresh_from_db()
        msg3.refresh_from_db()
        conversation.refresh_from_db()

        assert msg1.is_read
        assert msg2.is_read
        assert msg3.is_read
        assert msg1.read_at is not None
        assert conversation.unread_count_user == 0


@pytest.mark.django_db
class TestAutoResponseService:
    """Tests for AutoResponseService."""

    def test_send_acknowledgment_message_french(self, authenticated_user):
        """Test sending acknowledgment message in French."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        message = AutoResponseService.send_acknowledgment_message(
            conversation=conversation,
            language='fr'
        )

        assert message is not None
        assert message.sender_type == 'system'
        assert "reçu" in message.content.lower()
        assert "24 heures" in message.content.lower() or "24h" in message.content.lower()

    def test_send_acknowledgment_message_english(self, authenticated_user):
        """Test sending acknowledgment message in English."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        message = AutoResponseService.send_acknowledgment_message(
            conversation=conversation,
            language='en'
        )

        assert message is not None
        assert message.sender_type == 'system'
        assert "received" in message.content.lower()
        assert "24 hours" in message.content.lower() or "24h" in message.content.lower()

    def test_send_acknowledgment_default_language(self, authenticated_user):
        """Test that invalid language defaults to French."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        message = AutoResponseService.send_acknowledgment_message(
            conversation=conversation,
            language='es'  # Invalid - should default to French
        )

        assert message is not None
        assert "reçu" in message.content.lower()  # French text


@pytest.mark.django_db
class TestUnreadCountFExpressions:
    """Tests ensuring F() expression atomic updates work correctly."""

    def test_increment_uses_f_expression(self, authenticated_user):
        """Test that increment_unread_count uses F() so no read-modify-write race."""
        from django.db.models import F
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        # Call twice to ensure both increments are applied
        ConversationService.increment_unread_count(conversation, for_user=True)
        conversation.refresh_from_db()
        ConversationService.increment_unread_count(conversation, for_user=True)
        conversation.refresh_from_db()

        assert conversation.unread_count_user == 2

    def test_increment_admin_uses_f_expression(self, authenticated_user):
        """Test that admin unread count increments correctly with F()."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        ConversationService.increment_unread_count(conversation, for_user=False)
        conversation.refresh_from_db()
        ConversationService.increment_unread_count(conversation, for_user=False)
        conversation.refresh_from_db()

        assert conversation.unread_count_admin == 2

    def test_reset_after_increment(self, authenticated_user):
        """Test reset_unread_count properly zeroes after multiple increments."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        for _ in range(5):
            ConversationService.increment_unread_count(conversation, for_user=True)

        conversation.refresh_from_db()
        assert conversation.unread_count_user == 5

        ConversationService.reset_unread_count(conversation, for_user=True)
        conversation.refresh_from_db()
        assert conversation.unread_count_user == 0
