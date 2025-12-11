# coding: utf-8
"""
Tests for chat API endpoints.

Tests HTTP layer: viewsets, serializers, permissions, and API responses.
"""
import pytest
import uuid
from django.urls import reverse
from rest_framework import status
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.chat.models import Conversation, Message
from apps.chat.services import ConversationService, MessageService


@pytest.mark.django_db
class TestConversationListAPI:
    """Tests for listing conversations."""

    def test_list_conversations_unauthenticated(self, api_client):
        """Test that unauthenticated users cannot list conversations."""
        url = reverse('conversation-list')
        response = api_client.get(url)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_conversations_user_sees_own_only(self, auth_client, authenticated_user, user_factory):
        """Test that regular users see only their own conversation."""
        # Create user's conversation
        user_conv = ConversationService.get_or_create_conversation(authenticated_user)

        # Create another user's conversation
        other_user = user_factory()
        other_conv = ConversationService.get_or_create_conversation(other_user)

        url = reverse('conversation-list')
        response = auth_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 1
        assert response.data['results'][0]['id'] == str(user_conv.id)

    def test_list_conversations_admin_sees_all(self, api_client, mavecam_admin, user_factory):
        """Test that admin users see all conversations."""
        from rest_framework_simplejwt.tokens import RefreshToken

        # Authenticate as admin
        refresh = RefreshToken.for_user(mavecam_admin)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

        # Create multiple conversations
        user1 = user_factory()
        user2 = user_factory()
        conv1 = ConversationService.get_or_create_conversation(user1)
        conv2 = ConversationService.get_or_create_conversation(user2)

        url = reverse('conversation-list')
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) >= 2  # At least the 2 we created


@pytest.mark.django_db
class TestConversationDetailAPI:
    """Tests for conversation detail endpoint."""

    def test_get_conversation_detail_success(self, auth_client, authenticated_user):
        """Test getting conversation detail successfully."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        url = reverse('conversation-detail', kwargs={'pk': conversation.id})
        response = auth_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['id'] == str(conversation.id)
        assert 'user_name' in response.data
        assert 'unread_count_user' in response.data

    def test_get_conversation_detail_unauthorized(self, auth_client, user_factory):
        """Test that users cannot access other users' conversations."""
        other_user = user_factory()
        other_conversation = ConversationService.get_or_create_conversation(other_user)

        url = reverse('conversation-detail', kwargs={'pk': other_conversation.id})
        response = auth_client.get(url)

        # Either 403 or 404 is acceptable for security (don't reveal existence)
        assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]


@pytest.mark.django_db
class TestMessagesAPI:
    """Tests for messages endpoint."""

    def test_get_messages_success(self, auth_client, authenticated_user, mavecam_admin):
        """Test getting messages for a conversation."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        # Create some messages
        MessageService.send_user_message(authenticated_user, "Message 1", None, 'none', None, False)
        MessageService.send_admin_message(conversation, mavecam_admin, "Response 1")
        MessageService.send_user_message(authenticated_user, "Message 2", None, 'none', None, False)

        url = reverse('conversation-messages', kwargs={'pk': conversation.id})
        response = auth_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
        assert len(response.data['results']) >= 3  # At least our 3 messages (+ maybe system messages)

    def test_get_messages_pagination(self, auth_client, authenticated_user):
        """Test messages pagination."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        # Create 25 messages
        for i in range(25):
            MessageService.send_user_message(
                authenticated_user,
                f"Message {i}",
                None,
                'none',
                None,
                False
            )

        url = reverse('conversation-messages', kwargs={'pk': conversation.id})
        response = auth_client.get(url, {'page': 1})

        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data
        assert 'next' in response.data
        assert 'previous' in response.data

    def test_get_messages_unauthorized(self, auth_client, user_factory):
        """Test that users cannot access messages from other users' conversations."""
        other_user = user_factory()
        other_conversation = ConversationService.get_or_create_conversation(other_user)

        url = reverse('conversation-messages', kwargs={'pk': other_conversation.id})
        response = auth_client.get(url)

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestSendMessageAPI:
    """Tests for sending messages."""

    def test_send_text_message_success(self, auth_client, authenticated_user):
        """Test sending a text message successfully."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        url = reverse('conversation-send-message', kwargs={'pk': conversation.id})
        data = {
            'content': 'Bonjour, j\'ai besoin d\'aide',
        }
        response = auth_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['content'] == 'Bonjour, j\'ai besoin d\'aide'
        assert response.data['sender_type'] == 'user'

    def test_send_message_with_client_uuid(self, auth_client, authenticated_user):
        """Test sending message with client UUID for offline sync."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        client_uuid = str(uuid.uuid4())

        url = reverse('conversation-send-message', kwargs={'pk': conversation.id})
        data = {
            'content': 'Offline message',
            'client_uuid': client_uuid,
            'created_offline': True
        }
        response = auth_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['client_uuid'] == client_uuid
        assert response.data['created_offline'] is True

    def test_send_message_duplicate_uuid_idempotent(self, auth_client, authenticated_user):
        """Test that duplicate client UUID is idempotent."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        client_uuid = str(uuid.uuid4())

        url = reverse('conversation-send-message', kwargs={'pk': conversation.id})
        data = {
            'content': 'First attempt',
            'client_uuid': client_uuid,
            'created_offline': True
        }

        # Send first time
        response1 = auth_client.post(url, data, format='json')
        assert response1.status_code == status.HTTP_201_CREATED
        message_id = response1.data['id']

        # Send again with same UUID
        data['content'] = 'Second attempt (should be ignored)'
        response2 = auth_client.post(url, data, format='json')
        assert response2.status_code == status.HTTP_201_CREATED
        assert response2.data['id'] == message_id  # Same message returned
        assert response2.data['content'] == 'First attempt'  # Original content preserved

    def test_send_message_empty_content_rejected(self, auth_client, authenticated_user):
        """Test that empty messages are rejected."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        url = reverse('conversation-send-message', kwargs={'pk': conversation.id})
        data = {
            'content': '',
        }
        response = auth_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_send_message_with_image(self, auth_client, authenticated_user):
        """Test sending message with image attachment."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        # Create small test image
        image_content = b'fake image data'
        image_file = SimpleUploadedFile(
            name='test_image.jpg',
            content=image_content,
            content_type='image/jpeg'
        )

        url = reverse('conversation-send-message', kwargs={'pk': conversation.id})
        data = {
            'content': 'Voici ma mare',
            'media_type': 'image',
            'media_file': image_file
        }
        response = auth_client.post(url, data, format='multipart')

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['media_type'] == 'image'
        assert 'media_url' in response.data
        assert response.data['media_url'] is not None

    def test_send_message_media_without_file_rejected(self, auth_client, authenticated_user):
        """Test that specifying media type without file is rejected."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        url = reverse('conversation-send-message', kwargs={'pk': conversation.id})
        data = {
            'content': 'Test',
            'media_type': 'image',
            # No media_file provided
        }
        response = auth_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_send_message_unauthorized(self, auth_client, user_factory):
        """Test that users cannot send messages to other users' conversations."""
        other_user = user_factory()
        other_conversation = ConversationService.get_or_create_conversation(other_user)

        url = reverse('conversation-send-message', kwargs={'pk': other_conversation.id})
        data = {
            'content': 'Unauthorized message',
        }
        response = auth_client.post(url, data, format='json')

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestMarkReadAPI:
    """Tests for marking messages as read."""

    def test_mark_messages_as_read_success(self, auth_client, authenticated_user, mavecam_admin):
        """Test marking messages as read successfully."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        # Admin sends messages
        MessageService.send_admin_message(conversation, mavecam_admin, "Message 1")
        MessageService.send_admin_message(conversation, mavecam_admin, "Message 2")

        conversation.refresh_from_db()
        assert conversation.unread_count_user > 0

        url = reverse('conversation-mark-read', kwargs={'pk': conversation.id})
        response = auth_client.post(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['unread_count_user'] == 0

    def test_mark_read_unauthorized(self, auth_client, user_factory):
        """Test that users cannot mark messages in other conversations as read."""
        other_user = user_factory()
        other_conversation = ConversationService.get_or_create_conversation(other_user)

        url = reverse('conversation-mark-read', kwargs={'pk': other_conversation.id})
        response = auth_client.post(url)

        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestSignalIntegration:
    """Tests for signal-based features (acknowledgment and notifications)."""

    def test_first_user_message_triggers_acknowledgment(self, authenticated_user):
        """Test that first user message triggers automatic acknowledgment."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        # Send first user message
        MessageService.send_user_message(
            authenticated_user,
            "Premier message",
            None,
            'none',
            None,
            False
        )

        # Check for system acknowledgment message
        system_messages = Message.objects.filter(
            conversation=conversation,
            sender_type='system'
        )

        assert system_messages.exists()
        acknowledgment = system_messages.first()
        assert "reçu" in acknowledgment.content.lower() or "received" in acknowledgment.content.lower()

    def test_each_user_message_triggers_acknowledgment(self, authenticated_user):
        """Test that every user message triggers acknowledgment."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        # Send multiple messages
        MessageService.send_user_message(authenticated_user, "Premier", None, 'none', None, False)
        MessageService.send_user_message(authenticated_user, "Deuxième", None, 'none', None, False)

        system_count = Message.objects.filter(
            conversation=conversation,
            sender_type='system'
        ).count()

        # One acknowledgment per user message
        assert system_count == 2

    def test_admin_message_creates_notification(self, authenticated_user, mavecam_admin):
        """Test that admin message triggers notification creation."""
        from apps.notifications.models import Notification

        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        # Send admin message
        MessageService.send_admin_message(
            conversation=conversation,
            admin_user=mavecam_admin,
            content="Réponse de l'équipe support"
        )

        # Check notification was created
        notifications = Notification.objects.filter(
            user=authenticated_user,
            notification_type='new_message'
        )

        assert notifications.exists()
        notification = notifications.first()
        assert "support" in notification.title.lower() or "message" in notification.title.lower()
