"""
Tests for chat API endpoints.

Tests HTTP layer: viewsets, serializers, permissions, and API responses.
"""
import uuid
from unittest.mock import patch

import pytest
from chat.models import Conversation, Message
from chat.services import ConversationService, MessageService
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework import status


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
        ConversationService.get_or_create_conversation(other_user)

        url = reverse('conversation-list')
        response = auth_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 1
        assert response.data['results'][0]['id'] == str(user_conv.id)

    def test_list_conversations_admin_sees_all(self, api_client, aquacare_admin, user_factory):
        """Test that admin users see all conversations."""
        from rest_framework_simplejwt.tokens import RefreshToken

        # Authenticate as admin
        refresh = RefreshToken.for_user(aquacare_admin)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

        # Create multiple conversations
        user1 = user_factory()
        user2 = user_factory()
        ConversationService.get_or_create_conversation(user1)
        ConversationService.get_or_create_conversation(user2)

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

    def test_get_my_conversation_creates_conversation_when_missing(self, auth_client, authenticated_user):
        """Test l'action custom /me pour garantir une conversation disponible."""
        Conversation.objects.filter(user=authenticated_user).delete()

        url = reverse('conversation-get-my-conversation')
        response = auth_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['user'] == authenticated_user.id
        assert Conversation.objects.filter(user=authenticated_user).count() == 1


@pytest.mark.django_db
class TestMessagesAPI:
    """Tests for messages endpoint."""

    def test_get_messages_success(self, auth_client, authenticated_user, aquacare_admin):
        """Test getting messages for a conversation."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        # Create some messages
        MessageService.send_user_message(authenticated_user, "Message 1", None, 'none', None, False)
        MessageService.send_admin_message(conversation, aquacare_admin, "Response 1")
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

        assert response.status_code == status.HTTP_404_NOT_FOUND


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

    def test_send_message_hides_admin_identifier_from_regular_user(
        self, auth_client, authenticated_user, aquacare_admin
    ):
        """User responses must not expose internal admin sender identifiers."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        MessageService.send_admin_message(conversation, aquacare_admin, "Réponse support")

        url = reverse('conversation-messages', kwargs={'pk': conversation.id})
        response = auth_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        admin_messages = [
            message for message in response.data['results']
            if message['sender_type'] == 'admin'
        ]
        assert admin_messages
        assert all(message['sender_user'] is None for message in admin_messages)

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

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_send_message_client_uuid_conflict_other_user(self, auth_client, authenticated_user, user_factory):
        """Test that reusing a client UUID from another user returns 409."""
        own_conversation = ConversationService.get_or_create_conversation(authenticated_user)
        other_user = user_factory()
        other_conversation = ConversationService.get_or_create_conversation(other_user)
        client_uuid = str(uuid.uuid4())

        other_client = self._build_auth_client_for_user(other_user)

        url_other = reverse('conversation-send-message', kwargs={'pk': other_conversation.id})
        first_response = other_client.post(
            url_other,
            {
                'content': 'Other user message',
                'client_uuid': client_uuid,
                'created_offline': True,
            },
            format='json'
        )
        assert first_response.status_code == status.HTTP_201_CREATED

        url_own = reverse('conversation-send-message', kwargs={'pk': own_conversation.id})
        conflict_response = auth_client.post(
            url_own,
            {
                'content': 'Current user message',
                'client_uuid': client_uuid,
                'created_offline': True,
            },
            format='json'
        )

        assert conflict_response.status_code == status.HTTP_409_CONFLICT
        assert conflict_response.data['field'] == 'client_uuid'

    @staticmethod
    def _build_auth_client_for_user(user):
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken

        client = APIClient()
        refresh = RefreshToken.for_user(user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        return client


@pytest.mark.django_db
class TestMarkReadAPI:
    """Tests for marking messages as read."""

    def test_mark_messages_as_read_success(self, auth_client, authenticated_user, aquacare_admin):
        """Test marking messages as read successfully."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        # Admin sends messages
        MessageService.send_admin_message(conversation, aquacare_admin, "Message 1")
        MessageService.send_admin_message(conversation, aquacare_admin, "Message 2")

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

        assert response.status_code == status.HTTP_404_NOT_FOUND


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

    def test_only_first_user_message_triggers_acknowledgment(self, authenticated_user):
        """Test that only the first user message triggers acknowledgment."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        # Send multiple messages
        MessageService.send_user_message(authenticated_user, "Premier", None, 'none', None, False)
        MessageService.send_user_message(authenticated_user, "Deuxième", None, 'none', None, False)

        system_count = Message.objects.filter(
            conversation=conversation,
            sender_type='system'
        ).count()

        # Only one acknowledgment for the first user message
        assert system_count == 1

    def test_admin_message_creates_notification(self, authenticated_user, aquacare_admin):
        """Test that admin message triggers notification creation."""
        from notifications.models import Notification

        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        # Send admin message
        MessageService.send_admin_message(
            conversation=conversation,
            admin_user=aquacare_admin,
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
        assert "réponse de l'équipe support" not in notification.message.lower()


@pytest.mark.django_db
class TestRateLimiting:
    """Tests for rate limiting on chat endpoints."""

    def test_send_message_rate_limit_enforced(self, auth_client, authenticated_user, settings):
        """Test that sending more than 10 messages per minute returns 429.

        Uses an isolated locmem cache to avoid interference from parallel test workers
        that share the same Redis instance and call cache.clear() between tests.
        """
        # Use isolated in-process cache so xdist workers don't clear each other's state
        settings.CACHES = {
            'default': {
                'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
                'LOCATION': f'throttle-test-{id(self)}',
            }
        }
        from django.core.cache import cache as throttle_cache
        throttle_cache.clear()

        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        url = reverse('conversation-send-message', kwargs={'pk': conversation.id})

        # Send 10 messages (within limit)
        for i in range(10):
            response = auth_client.post(url, {'content': f'Message {i}'}, format='json')
            assert response.status_code == status.HTTP_201_CREATED, (
                f"Message {i} should succeed, got {response.status_code}"
            )

        # 11th message should be throttled
        response = auth_client.post(url, {'content': 'Message 11'}, format='json')
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS


@pytest.mark.django_db
class TestMediaValidation:
    """
    Tests for media file size and format validation at the serializer level.

    Note: Tests use the serializer directly rather than the HTTP layer because
    multipart encoding in APIClient recreates the file object from actual bytes,
    discarding any manually set .size attributes on the Python object.
    """

    def _make_mock_file(self, size_bytes: int, content_type: str, name: str):
        """Create a mock file with a controlled .size attribute."""
        from unittest.mock import MagicMock
        mock = MagicMock()
        mock.size = size_bytes
        mock.content_type = content_type
        mock.name = name
        return mock

    def test_image_too_large_rejected(self):
        """Test that an image > 10MB is rejected by the serializer."""
        from chat.serializers import SendMessageSerializer
        from rest_framework import serializers as drf_serializers

        mock_file = self._make_mock_file(11 * 1024 * 1024, 'image/jpeg', 'big.jpg')
        serializer = SendMessageSerializer()

        # Field-level validation passes (only checks > 50MB threshold)
        serializer.validate_media_file(mock_file)

        # Cross-field validation should reject image > 10MB
        with pytest.raises(drf_serializers.ValidationError):
            serializer.validate({'content': 'Test', 'media_file': mock_file, 'media_type': 'image'})

    def test_video_too_large_rejected(self):
        """Test that a video > 50MB is rejected at field-level validation."""
        from chat.serializers import SendMessageSerializer
        from rest_framework import serializers as drf_serializers

        mock_file = self._make_mock_file(51 * 1024 * 1024, 'video/mp4', 'big.mp4')
        serializer = SendMessageSerializer()

        with pytest.raises(drf_serializers.ValidationError):
            serializer.validate_media_file(mock_file)

    def test_invalid_media_format_rejected(self, auth_client, authenticated_user):
        """Test that uploading an invalid file format via API returns 400."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        invalid_file = SimpleUploadedFile(
            name='malware.exe',
            content=b'MZ\x90\x00',
            content_type='application/octet-stream'
        )

        url = reverse('conversation-send-message', kwargs={'pk': conversation.id})
        data = {
            'content': 'Test',
            'media_type': 'image',
            'media_file': invalid_file,
        }
        response = auth_client.post(url, data, format='multipart')

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        response_text = str(response.data)
        assert 'format' in response_text.lower() or 'supporté' in response_text.lower()

    def test_missing_content_type_rejected(self, auth_client, authenticated_user):
        """A media upload without MIME type should be rejected."""
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        invalid_file = SimpleUploadedFile(
            name='test.jpg',
            content=b'image-bytes',
            content_type='',
        )

        url = reverse('conversation-send-message', kwargs={'pk': conversation.id})
        response = auth_client.post(
            url,
            {
                'content': 'Test',
                'media_type': 'image',
                'media_file': invalid_file,
            },
            format='multipart'
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'type mime' in str(response.data).lower() or 'requis' in str(response.data).lower()

    def test_image_within_10mb_passes_serializer(self):
        """Test that an image within 10MB passes both serializer validations."""
        from chat.serializers import SendMessageSerializer

        mock_file = self._make_mock_file(5 * 1024 * 1024, 'image/jpeg', 'ok.jpg')
        serializer = SendMessageSerializer()

        serializer.validate_media_file(mock_file)
        result = serializer.validate({'content': 'Test', 'media_file': mock_file, 'media_type': 'image'})
        assert result['content'] == 'Test'


@pytest.mark.django_db
class TestUnreadCountConcurrency:
    """Tests for unread count consistency using F() expressions."""

    def test_unread_count_increments_correctly(self, authenticated_user, aquacare_admin):
        """Test that multiple unread count increments are applied correctly."""
        from chat.services import ConversationService

        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        assert conversation.unread_count_user == 0

        # Increment 3 times
        for _ in range(3):
            ConversationService.increment_unread_count(conversation, for_user=True)
            conversation.refresh_from_db()

        conversation.refresh_from_db()
        assert conversation.unread_count_user == 3

    def test_unread_count_reset_is_atomic(self, authenticated_user, aquacare_admin):
        """Test that resetting unread count is atomic and sets value to 0."""
        from chat.services import ConversationService

        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        # Set initial count
        ConversationService.increment_unread_count(conversation, for_user=True)
        ConversationService.increment_unread_count(conversation, for_user=True)
        conversation.refresh_from_db()
        assert conversation.unread_count_user == 2

        # Reset
        ConversationService.reset_unread_count(conversation, for_user=True)
        conversation.refresh_from_db()
        assert conversation.unread_count_user == 0


@pytest.mark.django_db
class TestIsolationSecurity:
    """Tests verifying user isolation for mark_read and message listing."""

    def test_mark_read_isolation(self, auth_client, user_factory, aquacare_admin):
        """Test that userA cannot mark messages as read in userB's conversation."""
        other_user = user_factory()
        other_conversation = ConversationService.get_or_create_conversation(other_user)

        # Admin sends a message to other_user's conversation
        MessageService.send_admin_message(
            other_conversation,
            aquacare_admin,
            "Message for other user"
        )

        # auth_client (authenticated as userA) tries to mark_read userB's conversation
        url = reverse('conversation-mark-read', kwargs={'pk': other_conversation.id})
        response = auth_client.post(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_messages_list_isolation(self, auth_client, user_factory):
        """Test that userA cannot list messages from userB's conversation."""
        other_user = user_factory()
        other_conversation = ConversationService.get_or_create_conversation(other_user)

        url = reverse('conversation-messages', kwargs={'pk': other_conversation.id})
        response = auth_client.get(url)

        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestBulkNotificationTask:
    """Tests for the Celery bulk notification task."""

    def test_notify_admin_task_uses_bulk_create(self, authenticated_user, aquacare_admin):
        """Test that notify_admins_new_user_message_task creates N notifications in 1 bulk_create."""
        from chat.tasks import notify_admins_new_user_message_task
        from notifications.models import Notification

        ConversationService.get_or_create_conversation(authenticated_user)
        message = MessageService.send_user_message(
            user=authenticated_user,
            content="Test message",
            media_file=None,
            media_type='none',
            client_uuid=None,
            created_offline=False
        )

        initial_count = Notification.objects.count()

        # Patch bulk_create to verify it's called once
        from notifications.models import Notification as NotifModel
        original_bulk_create = NotifModel.objects.bulk_create

        bulk_create_calls = []

        def tracking_bulk_create(objs, **kwargs):
            bulk_create_calls.append(len(objs))
            return original_bulk_create(objs, **kwargs)

        with patch.object(NotifModel.objects, 'bulk_create', side_effect=tracking_bulk_create):
            notify_admins_new_user_message_task(str(message.id))

        # bulk_create was called exactly once
        assert len(bulk_create_calls) == 1
        # And created notifications for all admins in one shot
        assert Notification.objects.count() > initial_count
