"""
Conversation domain service.
Handles conversation lifecycle and retrieval with permission checks.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F
from django.utils import timezone

User = get_user_model()

if TYPE_CHECKING:
    from chat.models import Conversation
    from chat.models import User as ChatUser


UnreadCounterTarget = Literal['user', 'admin']


class ConversationService:
    """
    Service for managing conversations.

    Responsibilities:
    - Create conversations (auto-creation on first message)
    - Retrieve conversations with permission checks
    - Update conversation metadata (last_message_at, unread counts)
    """

    @staticmethod
    def get_or_create_conversation(user: ChatUser) -> Conversation:
        """
        Get existing conversation for user or create new one.

        Each user has exactly one conversation with administration (OneToOneField).
        This method is idempotent - calling multiple times returns same conversation.

        Args:
            user: User instance

        Returns:
            Conversation instance (existing or newly created)
        """
        from ..models import Conversation

        conversation, _created = Conversation.objects.get_or_create(
            user=user,
            defaults={'is_active': True}
        )

        return Conversation.objects.with_user().get(pk=conversation.pk)

    @staticmethod
    def get_user_conversation(user: ChatUser) -> Conversation:
        """
        Get user's conversation.

        Raises exception if conversation doesn't exist.

        Args:
            user: User instance

        Returns:
            Conversation instance

        Raises:
            ConversationNotFound: If user has no conversation yet
        """
        from ..domain.exceptions import ConversationNotFound
        from ..models import Conversation

        try:
            return Conversation.objects.with_user().get(user=user)
        except Conversation.DoesNotExist as err:
            raise ConversationNotFound(
                f"No conversation found for user {user.id}"
            ) from err

    @staticmethod
    def get_conversation_by_id(conversation_id: str, requesting_user: ChatUser) -> Conversation:
        """
        Get conversation by ID with permission check.

        Permission rules:
        - Users can only access their own conversation
        - Admins (is_staff=True) can access any conversation

        Args:
            conversation_id: UUID string of conversation
            requesting_user: User making the request

        Returns:
            Conversation instance

        Raises:
            ConversationNotFound: If conversation doesn't exist
            UnauthorizedAccess: If user tries to access other user's conversation
        """
        from ..domain.exceptions import ConversationNotFound, UnauthorizedAccess
        from ..models import Conversation

        try:
            conversation = Conversation.objects.with_user().get(id=conversation_id)
        except Conversation.DoesNotExist as err:
            raise ConversationNotFound(
                f"Conversation {conversation_id} not found"
            ) from err

        # Permission check
        if not requesting_user.is_staff and conversation.user != requesting_user:
            raise UnauthorizedAccess(
                f"User {requesting_user.id} cannot access conversation {conversation_id}"
            )

        return conversation

    @staticmethod
    @transaction.atomic
    def update_last_message_timestamp(conversation: Conversation) -> None:
        """
        Update conversation's last_message_at timestamp to now.

        This is called whenever a new message is created.

        Args:
            conversation: Conversation instance
        """
        conversation.last_message_at = timezone.now()
        conversation.save(update_fields=['last_message_at', 'updated_at'])

    @staticmethod
    @transaction.atomic
    def _refresh_counter_state(conversation: Conversation) -> None:
        """Recharge les compteurs mis a jour par `F()` expressions."""
        conversation.refresh_from_db()

    @staticmethod
    def _get_unread_counter_field(for_user: bool) -> UnreadCounterTarget:
        return 'user' if for_user else 'admin'

    @staticmethod
    @transaction.atomic
    def _save_unread_count(
        conversation: Conversation,
        *,
        target: UnreadCounterTarget,
        value: int | F,
    ) -> None:
        field_name = f'unread_count_{target}'
        setattr(conversation, field_name, value)
        conversation.save(update_fields=[field_name, 'updated_at'])
        ConversationService._refresh_counter_state(conversation)

    @staticmethod
    @transaction.atomic
    def increment_unread_count(conversation: Conversation, for_user: bool = True) -> None:
        """
        Increment unread message count.

        Args:
            conversation: Conversation instance
            for_user: If True, increment user's unread count (admin sent message)
                     If False, increment admin's unread count (user sent message)
        """
        target = ConversationService._get_unread_counter_field(for_user)
        ConversationService._save_unread_count(
            conversation,
            target=target,
            value=F(f'unread_count_{target}') + 1,
        )

    @staticmethod
    @transaction.atomic
    def reset_unread_count(conversation: Conversation, for_user: bool = True) -> None:
        """
        Reset unread message count to zero.

        Called when user/admin opens conversation and reads messages.

        Args:
            conversation: Conversation instance
            for_user: If True, reset user's unread count
                     If False, reset admin's unread count
        """
        target = ConversationService._get_unread_counter_field(for_user)
        ConversationService._save_unread_count(conversation, target=target, value=0)
