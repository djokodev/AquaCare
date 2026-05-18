from __future__ import annotations

import pytest
from chat.models import Message
from chat.permissions import IsConversationOwnerOrAdmin
from chat.services import ConversationService, MessageService
from rest_framework.test import APIRequestFactory


@pytest.mark.django_db
class TestIsConversationOwnerOrAdmin:
    @pytest.fixture
    def permission(self) -> IsConversationOwnerOrAdmin:
        return IsConversationOwnerOrAdmin()

    @pytest.fixture
    def request_factory(self) -> APIRequestFactory:
        return APIRequestFactory()

    def test_regular_user_can_access_own_conversation(
        self,
        permission: IsConversationOwnerOrAdmin,
        request_factory: APIRequestFactory,
        authenticated_user,
    ) -> None:
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        request = request_factory.get("/")
        request.user = authenticated_user

        assert permission.has_object_permission(request, view=None, obj=conversation) is True

    def test_regular_user_cannot_access_other_conversation(
        self,
        permission: IsConversationOwnerOrAdmin,
        request_factory: APIRequestFactory,
        authenticated_user,
        user_factory,
    ) -> None:
        other_user = user_factory()
        conversation = ConversationService.get_or_create_conversation(other_user)
        request = request_factory.get("/")
        request.user = authenticated_user

        assert permission.has_object_permission(request, view=None, obj=conversation) is False

    def test_regular_user_can_access_own_message(
        self,
        permission: IsConversationOwnerOrAdmin,
        request_factory: APIRequestFactory,
        authenticated_user,
    ) -> None:
        message = MessageService.send_user_message(
            user=authenticated_user,
            content="Besoin d'aide",
            media_file=None,
            media_type="none",
            client_uuid=None,
            created_offline=False,
        )
        request = request_factory.get("/")
        request.user = authenticated_user

        assert permission.has_object_permission(request, view=None, obj=message) is True

    def test_staff_user_can_access_any_object(
        self,
        permission: IsConversationOwnerOrAdmin,
        request_factory: APIRequestFactory,
        user_factory,
        aquacare_admin,
    ) -> None:
        other_user = user_factory()
        conversation = ConversationService.get_or_create_conversation(other_user)
        message = Message.objects.create(
            conversation=conversation,
            sender_type="user",
            content="Question support",
        )
        request = request_factory.get("/")
        request.user = aquacare_admin

        assert permission.has_object_permission(request, view=None, obj=conversation) is True
        assert permission.has_object_permission(request, view=None, obj=message) is True

    def test_unknown_object_type_is_denied(
        self,
        permission: IsConversationOwnerOrAdmin,
        request_factory: APIRequestFactory,
        authenticated_user,
    ) -> None:
        request = request_factory.get("/")
        request.user = authenticated_user

        assert permission.has_object_permission(request, view=None, obj=object()) is False
