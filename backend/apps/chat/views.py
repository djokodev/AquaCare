"""
DRF ViewSets for chat API.
Handle HTTP requests and delegate business logic to services.
"""

from __future__ import annotations

from typing import Any

from django.utils.translation import gettext as _
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

from .domain.exceptions import (
    ClientUUIDConflict,
    ConversationNotFound,
    InvalidMediaFormat,
    InvalidMessageContent,
    MediaTooLarge,
    UnauthorizedAccess,
)
from .models import Conversation, Message
from .permissions import IsConversationOwnerOrAdmin
from .serializers import (
    ChatErrorResponseSerializer,
    ConversationSerializer,
    MessageSerializer,
    SendMessageSerializer,
)
from .services import ConversationService, MessageService


class ChatMessageThrottle(UserRateThrottle):
    """
    Throttle for chat message sending.

    Rate limit: 10 messages par minute par utilisateur
    Prevents spam and DoS attacks.
    """
    scope = 'chat_message'


@extend_schema_view(
    list=extend_schema(
        summary="Lister les conversations support",
        responses={200: ConversationSerializer(many=True)},
    ),
    retrieve=extend_schema(
        summary="Recuperer une conversation",
        responses={
            200: ConversationSerializer,
            404: OpenApiResponse(description="Conversation introuvable"),
        },
    ),
    get_my_conversation=extend_schema(
        summary="Recuperer ou creer ma conversation support",
        responses={200: ConversationSerializer},
    ),
    messages=extend_schema(
        summary="Lister les messages d'une conversation",
        responses={
            200: MessageSerializer(many=True),
            404: OpenApiResponse(description="Conversation introuvable"),
        },
    ),
    send_message=extend_schema(
        summary="Envoyer un message dans une conversation",
        request=SendMessageSerializer,
        responses={
            201: MessageSerializer,
            400: ChatErrorResponseSerializer,
            404: OpenApiResponse(description="Conversation introuvable"),
            409: ChatErrorResponseSerializer,
        },
    ),
    mark_read=extend_schema(
        summary="Marquer les messages comme lus",
        responses={
            200: ConversationSerializer,
            404: OpenApiResponse(description="Conversation introuvable"),
        },
    ),
)
class ConversationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for listing and retrieving conversations.

    Endpoints:
    - GET /api/support/conversations/ - List user's conversation (admin: all conversations)
    - GET /api/support/conversations/{id}/ - Retrieve specific conversation
    - GET /api/support/conversations/{id}/messages/ - List messages (paginated)
    - POST /api/support/conversations/{id}/send_message/ - Send message
    - POST /api/support/conversations/{id}/mark_read/ - Mark messages as read

    Permissions:
    - Authenticated users only
    - Users see only their own conversation
    - Admins see all conversations
    """

    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated, IsConversationOwnerOrAdmin]
    queryset = Conversation.objects.with_api_annotations()

    def get_serializer_class(self):
        if self.action == 'send_message':
            return SendMessageSerializer
        return super().get_serializer_class()

    def get_throttles(self) -> list[UserRateThrottle]:
        """Apply ChatMessageThrottle on write/read-heavy actions."""
        if getattr(self, 'action', None) in ('send_message', 'mark_read', 'messages'):
            return [ChatMessageThrottle()]
        return super().get_throttles()

    @staticmethod
    def _conversation_not_found_response() -> Response:
        return Response(
            ChatErrorResponseSerializer({'error': _('Conversation introuvable.')}).data,
            status=status.HTTP_404_NOT_FOUND
        )

    @staticmethod
    def _get_message_error_response(error: Exception) -> Response:
        if isinstance(error, InvalidMessageContent):
            return Response(
                ChatErrorResponseSerializer(
                    {'error': _('Contenu du message invalide.'), 'field': 'content'}
                ).data,
                status=status.HTTP_400_BAD_REQUEST
            )

        if isinstance(error, ClientUUIDConflict):
            return Response(
                ChatErrorResponseSerializer(
                    {
                        'error': _(
                            "Conflit de synchronisation détecté. "
                            "Veuillez actualiser la conversation."
                        ),
                        'field': 'client_uuid',
                    }
                ).data,
                status=status.HTTP_409_CONFLICT
            )

        if isinstance(error, (InvalidMediaFormat, MediaTooLarge)):
            message = (
                _('Fichier média trop volumineux.')
                if isinstance(error, MediaTooLarge)
                else _('Format de média non pris en charge.')
            )
            return Response(
                ChatErrorResponseSerializer(
                    {'error': message, 'field': 'media_file'}
                ).data,
                status=status.HTTP_400_BAD_REQUEST
            )

        raise error

    def _get_accessible_conversation(
        self,
        conversation_id: str | None,
        request_user: Any,
    ) -> Conversation | Response:
        try:
            return ConversationService.get_conversation_by_id(
                conversation_id=conversation_id,
                requesting_user=request_user,
            )
        except (ConversationNotFound, UnauthorizedAccess):
            return self._conversation_not_found_response()

    def _serialize_message(self, message: Message, request: Request) -> Response:
        serializer = MessageSerializer(message, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _serialize_messages(self, request: Request, messages) -> Response:
        page = self.paginate_queryset(messages)
        if page is not None:
            serializer = MessageSerializer(page, many=True, context={'request': request})
            return self.get_paginated_response(serializer.data)

        serializer = MessageSerializer(messages, many=True, context={'request': request})
        return Response(serializer.data)

    def _serialize_conversation(self, conversation: Conversation, request: Request) -> Response:
        refreshed_conversation = Conversation.objects.with_api_annotations().get(pk=conversation.pk)
        serializer = ConversationSerializer(refreshed_conversation, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def _send_validated_message(
        self,
        conversation: Conversation,
        request: Request,
        validated_data: dict[str, Any],
    ) -> Message:
        if request.user.is_staff:
            return MessageService.send_admin_message(
                conversation=conversation,
                admin_user=request.user,
                content=validated_data['content'],
                media_file=validated_data.get('media_file'),
                media_type=validated_data.get('media_type'),
            )

        return MessageService.send_user_message(
            user=request.user,
            content=validated_data['content'],
            media_file=validated_data.get('media_file'),
            media_type=validated_data.get('media_type'),
            client_uuid=validated_data.get('client_uuid'),
            created_offline=validated_data.get('created_offline', False),
        )

    def get_queryset(self):
        """
        Get conversations for current user.

        Returns:
            QuerySet: User's conversation or all conversations (if admin)
        """
        user = self.request.user

        if user.is_staff:
            return Conversation.objects.with_api_annotations()

        return Conversation.objects.with_api_annotations().filter(user=user)

    @action(detail=False, methods=['get'], url_path='me')
    def get_my_conversation(self, request: Request) -> Response:
        """
        Get or create current user's conversation with administration.

        GET /api/support/conversations/me/

        Returns:
            Conversation object (created if doesn't exist yet)

        This endpoint ensures the user always has a conversation available,
        creating it automatically on first access.
        """
        conversation = ConversationService.get_or_create_conversation(request.user)
        conversation = Conversation.objects.with_api_annotations().get(pk=conversation.pk)

        serializer = self.get_serializer(conversation)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'])
    def messages(self, request: Request, pk: str | None = None) -> Response:
        """
        List messages in conversation (paginated).

        GET /api/support/conversations/{id}/messages/?page=1

        Returns:
            Paginated list of messages ordered by created_at (ascending)
        """
        conversation = self._get_accessible_conversation(pk, request.user)
        if isinstance(conversation, Response):
            return conversation

        messages = Message.objects.for_feed().filter(conversation=conversation).order_by('created_at')
        return self._serialize_messages(request, messages)

    @action(detail=True, methods=['post'], throttle_classes=[ChatMessageThrottle])
    def send_message(self, request: Request, pk: str | None = None) -> Response:
        """
        Send message in conversation.

        POST /api/support/conversations/{id}/send_message/

        Body (multipart/form-data or JSON):
        - content: str (required) - Message text
        - media_file: file (optional) - Image or video file
        - media_type: 'image' | 'video' (required if media_file)
        - client_uuid: UUID (optional) - For offline deduplication
        - created_offline: bool (optional) - Default: false

        Returns:
            Message object (HTTP 201)
            or error (HTTP 400/403)
        """
        conversation = self._get_accessible_conversation(pk, request.user)
        if isinstance(conversation, Response):
            return conversation

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            message = self._send_validated_message(
                conversation=conversation,
                request=request,
                validated_data=serializer.validated_data,
            )
            return self._serialize_message(message, request)
        except (
            InvalidMessageContent,
            ClientUUIDConflict,
            InvalidMediaFormat,
            MediaTooLarge,
        ) as err:
            return self._get_message_error_response(err)

    @action(detail=True, methods=['post'])
    def mark_read(self, request: Request, pk: str | None = None) -> Response:
        """
        Mark all unread messages in conversation as read.

        POST /api/support/conversations/{id}/mark_read/

        Returns:
            Success message (HTTP 200)
        """
        conversation = self._get_accessible_conversation(pk, request.user)
        if isinstance(conversation, Response):
            return conversation

        MessageService.mark_messages_as_read(
            conversation=conversation,
            reader_is_admin=request.user.is_staff
        )
        return self._serialize_conversation(conversation, request)
