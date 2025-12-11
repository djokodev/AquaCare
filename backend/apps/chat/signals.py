# coding: utf-8
"""
Signals for chat module.
Handles auto-acknowledgment and notification triggers.

IMPORTANT: Signals are registered in apps.py ready() method.
"""

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Message
from .services import AutoResponseService


@receiver(post_save, sender=Message)
def handle_new_message(sender, instance, created, **kwargs):
    """
    Handle new message creation.

    Triggers:
    1. USER MESSAGE → Send auto-acknowledgment (for every message) + notifier les admins
    2. ADMIN MESSAGE → Trigger notification to user
    """
    if not created:
        return

    conversation = instance.conversation

    # =========================================================================
    # USER MESSAGE: Send acknowledgment + notify admin
    # =========================================================================
    if instance.sender_type == 'user':
        # Accusé pour chaque message user
        language = getattr(conversation.user, 'language_preference', 'fr')
        AutoResponseService.send_acknowledgment_message(
            conversation=conversation,
            language=language,
        )

        # Notifications admin (email + in-app)
        try:
            from django.core.mail import mail_admins
            from django.conf import settings
            from django.contrib.auth import get_user_model
            from apps.notifications.services import NotificationService

            user_display = conversation.user.get_full_name() or conversation.user.phone_number
            site_url = getattr(settings, 'SITE_URL', '').rstrip('/')

            mail_admins(
                subject=f"[AquaCare Support] Nouveau message de {user_display}",
                message=f"""
Un utilisateur a envoyé un message dans le support AquaCare.

Utilisateur: {user_display}
Téléphone: {conversation.user.phone_number}
Message: {instance.content}

Voir la conversation: {site_url}/admin/chat/conversation/{conversation.id}/change/
                """.strip(),
                fail_silently=True,
            )

            User = get_user_model()
            admin_users = User.objects.filter(is_staff=True, is_active=True)
            for admin_user in admin_users:
                NotificationService.create_notification(
                    user=admin_user,
                    notification_type='new_message',
                    title="Nouveau message support",
                    message=f"{user_display}: {instance.content[:80]}",
                    content_object=instance,
                    metadata={
                        'conversation_id': str(conversation.id),
                        'sender_type': 'user',
                        'message_id': str(instance.id),
                    },
                    channels=['in_app'],
                    priority='medium',
                    send_immediately=False,
                )
        except Exception as e:
            import logging

            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to send admin notification: {e}")

    # =========================================================================
    # ADMIN MESSAGE: Trigger notification to user
    # =========================================================================
    elif instance.sender_type == 'admin':
        try:
            from apps.notifications.services import NotificationService

            NotificationService.create_notification(
                user=conversation.user,
                notification_type='new_message',
                title="Nouveau message du support",
                message=instance.content[:100],
                content_object=instance,
                metadata={
                    'conversation_id': str(conversation.id),
                    'sender_type': 'admin',
                    'message_id': str(instance.id),
                },
                channels=['in_app', 'push'],
                priority='medium',
                send_immediately=True,
            )
        except Exception:
            pass

    # SYSTEM messages: no-op
