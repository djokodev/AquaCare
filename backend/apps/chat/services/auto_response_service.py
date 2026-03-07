"""
Auto-response service for system-generated messages.
Handles automated acknowledgment messages when user sends first message.
"""

from .message_service import MessageService


class AutoResponseService:
    """
    Service for automated system responses.

    Currently handles:
    - Acknowledgment message when user sends first message
    """

    # Predefined acknowledgment messages (multilingual)
    ACKNOWLEDGMENT_MESSAGES = {
        'fr': (
            "Nous avons bien reçu votre message. "
            "Un membre de l'équipe AquaCare vous répondra dans les 24 heures."
        ),
        'en': (
            "We have received your message. "
            "An AquaCare team member will respond within 24 hours."
        ),
    }

    @staticmethod
    def send_acknowledgment_message(conversation, language: str = 'fr'):
        """
        Send automated acknowledgment message.

        This is called after user sends their first message to reassure them
        that their message was received.

        Args:
            conversation: Conversation instance
            language: User's language preference ('fr' or 'en')

        Returns:
            Message instance (system message)
        """
        # Get acknowledgment text in user's language
        acknowledgment_text = AutoResponseService.ACKNOWLEDGMENT_MESSAGES.get(
            language,
            AutoResponseService.ACKNOWLEDGMENT_MESSAGES['fr']  # Default to French
        )

        # Send as system message (won't trigger notification)
        message = MessageService.send_system_message(
            conversation=conversation,
            content=acknowledgment_text
        )

        return message
