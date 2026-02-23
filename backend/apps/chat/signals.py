# coding: utf-8
"""
Signals for chat module.
Handles auto-acknowledgment and notification triggers.

IMPORTANT: Signals are registered in apps.py ready() method.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Message
from .services import AutoResponseService
from .tasks import (
    notify_admins_new_user_message_task,
    notify_user_admin_message_task,
)

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Message)
def handle_new_message(sender, instance, created, **kwargs):
    """
    Handle new message creation.

    Triggers:
    1. USER MESSAGE → Send auto-acknowledgment (first message only) + notify admins
    2. ADMIN MESSAGE → Trigger notification to user
    """
    if not created:
        return

    conversation = instance.conversation

    # =========================================================================
    # USER MESSAGE: Send acknowledgment + notify admin
    # =========================================================================
    if instance.sender_type == 'user':
        # Send acknowledgment only for the first user message in a conversation.
        has_previous_user_message = conversation.messages.filter(
            sender_type='user'
        ).exclude(id=instance.id).exists()
        if not has_previous_user_message:
            language = getattr(conversation.user, 'language_preference', 'fr')
            AutoResponseService.send_acknowledgment_message(
                conversation=conversation,
                language=language,
            )

        # Notifications admin (email + in-app), sent asynchronously.
        try:
            notify_admins_new_user_message_task.delay(str(instance.id))
        except Exception:
            logger.exception(
                "Failed to queue async admin chat notification for message %s.",
                instance.id,
            )

    # =========================================================================
    # ADMIN MESSAGE: Trigger notification to user
    # =========================================================================
    elif instance.sender_type == 'admin':
        try:
            notify_user_admin_message_task.delay(str(instance.id))
        except Exception:
            logger.exception(
                "Failed to queue async user chat notification for message %s.",
                instance.id,
            )

    # SYSTEM messages: no-op
