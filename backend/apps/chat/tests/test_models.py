from __future__ import annotations

from types import SimpleNamespace

import pytest
from chat.models import Conversation, Message
from chat.services import ConversationService
from django.utils import timezone


@pytest.mark.django_db
class TestConversationModel:
    def test_string_representation_prefers_full_name(self, authenticated_user) -> None:
        conversation = ConversationService.get_or_create_conversation(authenticated_user)

        assert str(conversation) == f"Conversation avec {authenticated_user.get_full_name()}"

    def test_string_representation_falls_back_to_phone_number(self) -> None:
        conversation_double = SimpleNamespace(
            user=SimpleNamespace(
                get_full_name=lambda: "",
                phone_number="+237690333655",
            )
        )

        assert Conversation.__str__(conversation_double) == "Conversation avec +237690333655"


@pytest.mark.django_db
class TestMessageModel:
    def test_string_representation_truncates_long_content(self, authenticated_user) -> None:
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        message = Message.objects.create(
            conversation=conversation,
            sender_type="user",
            content="x" * 40,
        )

        rendered = str(message)

        assert "Utilisateur message:" in rendered
        assert "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx..." in rendered

    def test_mark_as_read_sets_timestamp_only_once(self, authenticated_user) -> None:
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        message = Message.objects.create(
            conversation=conversation,
            sender_type="user",
            content="Merci",
        )

        message.mark_as_read()
        first_read_at = message.read_at

        assert message.is_read is True
        assert first_read_at is not None

        message.mark_as_read()
        message.refresh_from_db()

        assert message.read_at == first_read_at
        assert message.read_at <= timezone.now()
