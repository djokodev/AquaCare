"""
Conversation domain service.
Handles conversation lifecycle and retrieval with permission checks.
"""

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F
from django.utils import timezone

# Import when models are available - circular import prevention
# from ..models import Conversation
# from ..domain.exceptions import ConversationNotFound, UnauthorizedAccess

User = get_user_model()


class ConversationService:
    """
    Service for managing conversations.

    Responsibilities:
    - Create conversations (auto-creation on first message)
    - Retrieve conversations with permission checks
    - Update conversation metadata (last_message_at, unread counts)
    """

    @staticmethod
    def get_or_create_conversation(user):
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

        conversation, created = Conversation.objects.get_or_create(
            user=user,
            defaults={'is_active': True}
        )

        return conversation

    @staticmethod
    def get_user_conversation(user):
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
            return Conversation.objects.get(user=user)
        except Conversation.DoesNotExist:
            raise ConversationNotFound(
                f"No conversation found for user {user.id}"
            )

    @staticmethod
    def get_conversation_by_id(conversation_id: str, requesting_user):
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
            conversation = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            raise ConversationNotFound(
                f"Conversation {conversation_id} not found"
            )

        # Permission check
        if not requesting_user.is_staff and conversation.user != requesting_user:
            raise UnauthorizedAccess(
                f"User {requesting_user.id} cannot access conversation {conversation_id}"
            )

        return conversation

    @staticmethod
    @transaction.atomic
    def update_last_message_timestamp(conversation):
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
    def increment_unread_count(conversation, for_user: bool = True):
        """
        Increment unread message count.

        Args:
            conversation: Conversation instance
            for_user: If True, increment user's unread count (admin sent message)
                     If False, increment admin's unread count (user sent message)
        """
        if for_user:
            conversation.unread_count_user = F('unread_count_user') + 1
            conversation.save(update_fields=['unread_count_user', 'updated_at'])
            conversation.refresh_from_db()
        else:
            conversation.unread_count_admin = F('unread_count_admin') + 1
            conversation.save(update_fields=['unread_count_admin', 'updated_at'])
            conversation.refresh_from_db()

    @staticmethod
    @transaction.atomic
    def reset_unread_count(conversation, for_user: bool = True):
        """
        Reset unread message count to zero.

        Called when user/admin opens conversation and reads messages.

        Args:
            conversation: Conversation instance
            for_user: If True, reset user's unread count
                     If False, reset admin's unread count
        """
        if for_user:
            conversation.unread_count_user = 0
            conversation.save(update_fields=['unread_count_user', 'updated_at'])
            conversation.refresh_from_db()
        else:
            conversation.unread_count_admin = 0
            conversation.save(update_fields=['unread_count_admin', 'updated_at'])
            conversation.refresh_from_db()
