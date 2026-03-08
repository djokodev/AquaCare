"""
DRF ViewSets for chat API.
Handle HTTP requests and delegate business logic to services.
"""

from __future__ import annotations

from django.utils.translation import gettext as _
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
from .serializers import ConversationSerializer, MessageSerializer, SendMessageSerializer
from .services import ConversationService, MessageService


class ChatMessageThrottle(UserRateThrottle):
    """
    Throttle for chat message sending.

    Rate limit: 10 messages par minute par utilisateur
    Prevents spam and DoS attacks.
    """
    scope = 'chat_message'


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

    def get_throttles(self) -> list[UserRateThrottle]:
        """Apply ChatMessageThrottle on write/read-heavy actions."""
        if getattr(self, 'action', None) in ('send_message', 'mark_read', 'messages'):
            return [ChatMessageThrottle()]
        return super().get_throttles()

    @staticmethod
    def _conversation_not_found_response():
        return Response(
            {'error': _('Conversation introuvable.')},
            status=status.HTTP_404_NOT_FOUND
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
        try:
            # Get conversation with permission check
            conversation = ConversationService.get_conversation_by_id(
                conversation_id=pk,
                requesting_user=request.user
            )
        except ConversationNotFound:
            return self._conversation_not_found_response()
        except UnauthorizedAccess:
            # Do not reveal conversation existence to unauthorized users.
            return self._conversation_not_found_response()

        # Get messages ordered by creation date
        messages = Message.objects.for_feed().filter(conversation=conversation).order_by('created_at')

        # Paginate
        page = self.paginate_queryset(messages)

        if page is not None:
            serializer = MessageSerializer(
                page,
                many=True,
                context={'request': request}
            )
            return self.get_paginated_response(serializer.data)

        # No pagination (small number of messages)
        serializer = MessageSerializer(
            messages,
            many=True,
            context={'request': request}
        )
        return Response(serializer.data)

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
        try:
            # Get conversation with permission check
            conversation = ConversationService.get_conversation_by_id(
                conversation_id=pk,
                requesting_user=request.user
            )
        except ConversationNotFound:
            return self._conversation_not_found_response()
        except UnauthorizedAccess:
            # Do not reveal conversation existence to unauthorized users.
            return self._conversation_not_found_response()

        # Validate input
        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            # Determine sender type based on user role
            if request.user.is_staff:
                # Admin sending message
                message = MessageService.send_admin_message(
                    conversation=conversation,
                    admin_user=request.user,
                    content=serializer.validated_data['content']
                )
            else:
                # User sending message
                message = MessageService.send_user_message(
                    user=request.user,
                    content=serializer.validated_data['content'],
                    media_file=serializer.validated_data.get('media_file'),
                    media_type=serializer.validated_data.get('media_type'),
                    client_uuid=serializer.validated_data.get('client_uuid'),
                    created_offline=serializer.validated_data.get('created_offline', False),
                )

            # Return created message
            response_serializer = MessageSerializer(
                message,
                context={'request': request}
            )
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)

        except InvalidMessageContent:
            return Response(
                {'error': _('Contenu du message invalide.'), 'field': 'content'},
                status=status.HTTP_400_BAD_REQUEST
            )
        except ClientUUIDConflict:
            return Response(
                {
                    'error': _(
                        "Conflit de synchronisation détecté. "
                        "Veuillez actualiser la conversation."
                    ),
                    'field': 'client_uuid',
                },
                status=status.HTTP_409_CONFLICT
            )
        except InvalidMediaFormat:
            return Response(
                {
                    'error': _('Format de média non pris en charge.'),
                    'field': 'media_file',
                },
                status=status.HTTP_400_BAD_REQUEST
            )
        except MediaTooLarge:
            return Response(
                {
                    'error': _('Fichier média trop volumineux.'),
                    'field': 'media_file',
                },
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['post'])
    def mark_read(self, request: Request, pk: str | None = None) -> Response:
        """
        Mark all unread messages in conversation as read.

        POST /api/support/conversations/{id}/mark_read/

        Returns:
            Success message (HTTP 200)
        """
        try:
            # Get conversation with permission check
            conversation = ConversationService.get_conversation_by_id(
                conversation_id=pk,
                requesting_user=request.user
            )
        except ConversationNotFound:
            return self._conversation_not_found_response()
        except UnauthorizedAccess:
            # Do not reveal conversation existence to unauthorized users.
            return self._conversation_not_found_response()

        # Mark as read
        MessageService.mark_messages_as_read(
            conversation=conversation,
            reader_is_admin=request.user.is_staff
        )

        # Return updated conversation with new unread counts
        conversation = Conversation.objects.with_api_annotations().get(pk=conversation.pk)
        serializer = ConversationSerializer(conversation, context={'request': request})
        return Response(serializer.data)
