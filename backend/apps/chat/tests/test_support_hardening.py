"""Accès au support réservé aux bons rôles, pièces jointes vérifiées, ordre des messages."""
import io

import pytest
from chat.domain.exceptions import InvalidMediaFormat
from chat.models import Message
from chat.services import ConversationService, MessageService
from chat.services.media_sanitizer import sanitize_media
from django.contrib.auth.models import Permission
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from PIL import Image
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clear_cache():
    cache.clear()


def _client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def _png_bytes() -> bytes:
    output = io.BytesIO()
    Image.new('RGB', (4, 4)).save(output, format='PNG')
    return output.getvalue()


def _grant(user, *codenames):
    from django.contrib.contenttypes.models import ContentType

    content_type = ContentType.objects.get(app_label='chat', model='conversation')
    for codename in codenames:
        permission, _ = Permission.objects.get_or_create(
            content_type=content_type, codename=codename, defaults={'name': codename},
        )
        user.user_permissions.add(permission)
    # Vider le cache de permissions de l'instance
    for attr in ('_perm_cache', '_user_perm_cache', '_group_perm_cache'):
        if hasattr(user, attr):
            delattr(user, attr)


class TestSupportAccess:
    def test_staff_without_support_role_cannot_read_farmer_conversations(self, authenticated_user, user_factory):
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        MessageService.send_user_message(
            user=authenticated_user, content='Mes poissons meurent', media_file=None,
            media_type='none', client_uuid=None, created_offline=False,
        )
        commerce_staff = user_factory(is_staff=True, is_superuser=False)
        client = _client(commerce_staff)

        listing = client.get(reverse('conversation-list'))
        assert all(item['id'] != str(conversation.id) for item in listing.data.get('results', listing.data))
        messages = client.get(reverse('conversation-messages', kwargs={'pk': conversation.id}))
        assert messages.status_code == 404
        reply = client.post(
            reverse('conversation-send-message', kwargs={'pk': conversation.id}),
            {'content': 'Bonjour'}, format='json',
        )
        assert reply.status_code == 404
        assert not Message.objects.filter(conversation=conversation, sender_type='admin').exists()

    def test_support_agent_can_read_and_reply(self, authenticated_user, user_factory):
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        agent = user_factory(is_staff=True, is_superuser=False)
        _grant(agent, 'view_conversation', 'reply_conversation')
        client = _client(agent)

        assert client.get(reverse('conversation-messages', kwargs={'pk': conversation.id})).status_code == 200
        reply = client.post(
            reverse('conversation-send-message', kwargs={'pk': conversation.id}),
            {'content': 'Nous regardons votre bassin'}, format='json',
        )
        assert reply.status_code == 201
        assert reply.data['sender_type'] == 'admin'

    def test_invalid_conversation_id_returns_404(self, auth_client):
        response = auth_client.get('/api/support/conversations/not-a-uuid/messages/')
        assert response.status_code == 404


class TestMediaSanitizer:
    def test_fake_image_is_rejected(self):
        with pytest.raises(InvalidMediaFormat):
            sanitize_media(SimpleUploadedFile('photo.jpg', b'<html>piege</html>', content_type='image/jpeg'), 'image')

    def test_fake_video_is_rejected(self):
        with pytest.raises(InvalidMediaFormat):
            sanitize_media(SimpleUploadedFile('clip.mp4', b'<html>piege</html>', content_type='video/mp4'), 'video')

    def test_real_png_gets_random_name(self):
        cleaned = sanitize_media(SimpleUploadedFile('ma-ferme.png', _png_bytes(), content_type='image/png'), 'image')
        assert cleaned.name.endswith('.png')
        assert 'ma-ferme' not in cleaned.name

    def test_real_mp4_header_is_accepted(self):
        header = b'\x00\x00\x00\x18ftypmp42' + b'\x00' * 20
        cleaned = sanitize_media(SimpleUploadedFile('clip.mp4', header, content_type='video/mp4'), 'video')
        assert cleaned.name.endswith('.mp4')

    def test_api_rejects_disguised_file_cleanly(self, auth_client, authenticated_user):
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        response = auth_client.post(
            reverse('conversation-send-message', kwargs={'pk': conversation.id}),
            {
                'content': 'Photo',
                'media_type': 'image',
                'media_file': SimpleUploadedFile('photo.jpg', b'not an image', content_type='image/jpeg'),
            },
            format='multipart',
        )
        assert response.status_code == 400


class TestMessageOrdering:
    def test_messages_endpoint_returns_newest_first(self, auth_client, authenticated_user):
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        for index in range(3):
            MessageService.send_user_message(
                user=authenticated_user, content=f'Message {index}', media_file=None,
                media_type='none', client_uuid=None, created_offline=False,
            )
        response = auth_client.get(reverse('conversation-messages', kwargs={'pk': conversation.id}))
        contents = [item['content'] for item in response.data['results'] if item['sender_type'] == 'user']
        assert contents[0] == 'Message 2'


class TestDeletedAccountConversation:
    def test_deleting_account_clears_unread_and_inbox_is_read_only(self, authenticated_user, aquacare_admin):
        from accounts.services.account_deletion_service import AccountDeletionService
        from django.test import Client

        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        MessageService.send_user_message(
            user=authenticated_user, content='Bonjour', media_file=None,
            media_type='none', client_uuid=None, created_offline=False,
        )
        AccountDeletionService.anonymize_user_account(authenticated_user)
        conversation.refresh_from_db()
        assert conversation.unread_count_admin == 0
        assert conversation.messages.exists()  # historique conservé

        client = Client()
        client.force_login(aquacare_admin)
        url = reverse('admin:chat_support_inbox')
        page = client.get(f'{url}?conversation={conversation.id}').content.decode()
        assert 'name="reply_content"' not in page
        client.post(url, {'conversation_id': str(conversation.id), 'action': 'reply', 'reply_content': 'Allo'})
        assert not conversation.messages.filter(sender_type='admin').exists()
