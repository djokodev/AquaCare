from __future__ import annotations

import pytest
from chat.models import Conversation, Message
from chat.serializers import ConversationSerializer, MessageSerializer
from chat.services import ConversationService
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIRequestFactory


@pytest.mark.django_db
class TestMessageSerializer:
    @pytest.fixture
    def request_factory(self) -> APIRequestFactory:
        return APIRequestFactory()

    def test_sender_user_hidden_for_non_staff_viewer(
        self,
        authenticated_user,
        mavecam_admin,
        request_factory: APIRequestFactory,
    ) -> None:
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        message = Message.objects.create(
            conversation=conversation,
            sender_type="admin",
            sender_user=mavecam_admin,
            content="Réponse du support",
        )
        request = request_factory.get("/")
        request.user = authenticated_user

        data = MessageSerializer(message, context={"request": request}).data

        assert data["sender_user"] is None

    def test_sender_user_visible_for_staff_viewer_even_when_missing(
        self,
        authenticated_user,
        mavecam_admin,
        request_factory: APIRequestFactory,
    ) -> None:
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        system_message = Message.objects.create(
            conversation=conversation,
            sender_type="system",
            content="Message système",
        )
        request = request_factory.get("/")
        request.user = mavecam_admin

        data = MessageSerializer(system_message, context={"request": request}).data

        assert data["sender_user"] is None

    def test_system_message_uses_system_sender_name(self, authenticated_user) -> None:
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        system_message = Message.objects.create(
            conversation=conversation,
            sender_type="system",
            content="Accusé de réception",
        )

        data = MessageSerializer(system_message).data

        assert data["sender_name"] == "Système AquaCare"

    def test_media_url_falls_back_to_relative_url_without_request(self, authenticated_user) -> None:
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        media_file = SimpleUploadedFile("proof.jpg", b"fake-image-content", content_type="image/jpeg")
        message = Message.objects.create(
            conversation=conversation,
            sender_type="user",
            content="Voir la pièce jointe",
            media_type="image",
            media_file=media_file,
        )

        data = MessageSerializer(message).data

        assert data["media_url"] == message.media_file.url


@pytest.mark.django_db
class TestConversationSerializer:
    def test_last_message_fallback_without_annotations(self, authenticated_user) -> None:
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        Message.objects.create(
            conversation=conversation,
            sender_type="user",
            content="Dernier message visible",
        )

        data = ConversationSerializer(Conversation.objects.get(pk=conversation.pk)).data

        assert data["last_message"]["content"] == "Dernier message visible"
        assert data["message_count"] == 1

    def test_last_message_is_none_when_conversation_empty(self, authenticated_user) -> None:
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        data = ConversationSerializer(conversation).data

        assert data["last_message"] is None
        assert data["message_count"] == 0
