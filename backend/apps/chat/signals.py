"""
Signals for chat module.
Handles auto-acknowledgment and notification triggers.

IMPORTANT: Signals are registered in apps.py ready() method.
"""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Message
from .services import AutoResponseService, MessageEventPolicyService
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

    plan = MessageEventPolicyService.build_new_message_effects_plan(instance)

    if plan.should_send_acknowledgment and plan.acknowledgment_language is not None:
        AutoResponseService.send_acknowledgment_message(
            conversation=instance.conversation,
            language=plan.acknowledgment_language,
        )

    if plan.should_notify_admins:
        try:
            notify_admins_new_user_message_task.delay(str(instance.id))
        except Exception:
            logger.exception(
                "Failed to queue async admin chat notification for message %s.",
                instance.id,
            )

    if plan.should_notify_user:
        try:
            notify_user_admin_message_task.delay(str(instance.id))
        except Exception:
            logger.exception(
                "Failed to queue async user chat notification for message %s.",
                instance.id,
            )
