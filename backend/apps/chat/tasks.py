# coding: utf-8
"""
Celery tasks for asynchronous chat notifications.
"""

import logging

from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import mail_admins

from .models import Message

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=5)
def notify_admins_new_user_message_task(self, message_id: str):
    """
    Notify admins asynchronously when a user sends a support message.
    """
    try:
        message = Message.objects.select_related('conversation__user').get(id=message_id)
    except Message.DoesNotExist as exc:
        raise self.retry(exc=exc)

    if message.sender_type != 'user':
        return

    from notifications.services import NotificationService

    conversation = message.conversation
    site_url = getattr(settings, 'SITE_URL', '').rstrip('/')

    mail_admins(
        subject="[AquaCare Support] Nouveau message utilisateur",
        message=f"""
Un nouveau message utilisateur a été reçu dans le support AquaCare.

Conversation: {conversation.id}
Message: {message.id}

Voir la conversation: {site_url}/admin/chat/conversation/{conversation.id}/change/
        """.strip(),
        fail_silently=True,
    )

    from django.contrib.contenttypes.models import ContentType
    from django.utils import timezone
    from notifications.models import Notification

    User = get_user_model()
    admin_users = list(User.objects.filter(is_staff=True, is_active=True))

    if not admin_users:
        return

    content_type = ContentType.objects.get_for_model(message)
    now = timezone.now()

    notifications = [
        Notification(
            user=admin_user,
            notification_type='new_message',
            title="Nouveau message support",
            message="Un nouveau message de support est disponible.",
            content_type=content_type,
            object_id=message.pk,
            metadata={
                'conversation_id': str(conversation.id),
                'sender_type': 'user',
                'message_id': str(message.id),
            },
            channels=['in_app'],
            priority='medium',
            scheduled_for=now,
        )
        for admin_user in admin_users
    ]

    Notification.objects.bulk_create(notifications, ignore_conflicts=False)


@shared_task(bind=True, max_retries=3, default_retry_delay=5)
def notify_user_admin_message_task(self, message_id: str):
    """
    Notify a user asynchronously when support replies.
    """
    try:
        message = Message.objects.select_related('conversation__user').get(id=message_id)
    except Message.DoesNotExist as exc:
        raise self.retry(exc=exc)

    if message.sender_type != 'admin':
        return

    from notifications.services import NotificationService

    conversation = message.conversation
    NotificationService.create_notification(
        user=conversation.user,
        notification_type='new_message',
        title="Nouveau message du support",
        message="Vous avez reçu une réponse du support.",
        content_object=message,
        metadata={
            'conversation_id': str(conversation.id),
            'sender_type': 'admin',
            'message_id': str(message.id),
        },
        channels=['in_app', 'push'],
        priority='medium',
        send_immediately=True,
    )
