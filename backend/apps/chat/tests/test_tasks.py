from __future__ import annotations

from unittest.mock import Mock, patch

import pytest
from chat.models import Message
from chat.services import ConversationService, MessageService
from chat.tasks import (
    notify_admins_new_user_message_task,
    notify_user_admin_message_task,
)
from notifications.models import Notification


class RetryTriggered(Exception):
    """Sentinel exception for Celery retry assertions."""


@pytest.mark.django_db
class TestNotifyAdminsNewUserMessageTask:
    def test_retries_when_message_does_not_exist(self, monkeypatch) -> None:
        retry_mock = Mock(side_effect=RetryTriggered("retry"))
        monkeypatch.setattr(notify_admins_new_user_message_task, "retry", retry_mock)

        with pytest.raises(RetryTriggered, match="retry"):
            notify_admins_new_user_message_task.run("00000000-0000-0000-0000-000000000000")

        retry_mock.assert_called_once()

    def test_returns_early_for_non_user_message(self, authenticated_user, aquacare_admin) -> None:
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        admin_message = MessageService.send_admin_message(
            conversation=conversation,
            admin_user=aquacare_admin,
            content="Réponse support",
        )

        with patch("django.core.mail.EmailMessage.send") as send_mock:
            notify_admins_new_user_message_task.run(str(admin_message.id))

        send_mock.assert_not_called()
        assert Notification.objects.count() == 0

    def test_creates_admin_notifications_for_user_message(
        self,
        authenticated_user,
        aquacare_admin,
        user_factory,
        settings,
    ) -> None:
        from django.contrib.auth.models import Permission

        second_admin = user_factory(is_staff=True, is_superuser=False)
        second_admin.user_permissions.add(
            Permission.objects.get_or_create(
                codename='reply_conversation',
                content_type=__import__('django.contrib.contenttypes.models', fromlist=['ContentType'])
                .ContentType.objects.get(app_label='chat', model='conversation'),
                defaults={'name': 'Can reply'},
            )[0]
        )
        # Un staff sans rôle support (ex. commerce) ne doit PAS être prévenu.
        user_factory(is_staff=True, is_superuser=False)
        ConversationService.get_or_create_conversation(authenticated_user)
        user_message = MessageService.send_user_message(
            user=authenticated_user,
            content="Bonjour support",
            media_file=None,
            media_type="none",
            client_uuid=None,
            created_offline=False,
        )
        with patch("django.core.mail.EmailMessage.send") as send_mock:
            notify_admins_new_user_message_task.run(str(user_message.id))

        # Plus aucun email : l'équipe est notifiée uniquement in-app.
        send_mock.assert_not_called()

        notifications = Notification.objects.filter(notification_type="new_message").order_by("user_id")
        assert notifications.count() == 2
        assert {notification.user_id for notification in notifications} == {
            aquacare_admin.id,
            second_admin.id,
        }
        assert all(notification.metadata["sender_type"] == "user" for notification in notifications)

    def test_skips_notification_creation_when_no_admin_exists(
        self,
        authenticated_user,
        settings,
    ) -> None:
        Message.objects.all().delete()
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        user_message = Message.objects.create(
            conversation=conversation,
            sender_type="user",
            content="Aucun admin disponible",
        )
        notify_admins_new_user_message_task.run(str(user_message.id))

        assert Notification.objects.count() == 0


@pytest.mark.django_db
class TestNotifyUserAdminMessageTask:
    def test_retries_when_admin_message_does_not_exist(self, monkeypatch) -> None:
        retry_mock = Mock(side_effect=RetryTriggered("retry"))
        monkeypatch.setattr(notify_user_admin_message_task, "retry", retry_mock)

        with pytest.raises(RetryTriggered, match="retry"):
            notify_user_admin_message_task.run("00000000-0000-0000-0000-000000000000")

        retry_mock.assert_called_once()

    def test_returns_early_for_non_admin_message(self, authenticated_user) -> None:
        user_message = MessageService.send_user_message(
            user=authenticated_user,
            content="Question utilisateur",
            media_file=None,
            media_type="none",
            client_uuid=None,
            created_offline=False,
        )

        with patch("notifications.services.NotificationService.create_notification") as create_notification_mock:
            notify_user_admin_message_task.run(str(user_message.id))

        create_notification_mock.assert_not_called()

    def test_notifies_user_for_admin_message(self, authenticated_user, aquacare_admin) -> None:
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        admin_message = MessageService.send_admin_message(
            conversation=conversation,
            admin_user=aquacare_admin,
            content="Le support vous répond",
        )

        with patch("notifications.services.NotificationService.create_notification") as create_notification_mock:
            notify_user_admin_message_task.run(str(admin_message.id))

        create_notification_mock.assert_called_once_with(
            user=conversation.user,
            notification_type="new_message",
            title="Nouveau message du support",
            message="Vous avez reçu une réponse du support.",
            content_object=admin_message,
            metadata={
                "conversation_id": str(conversation.id),
                "sender_type": "admin",
                "message_id": str(admin_message.id),
            },
            channels=["in_app", "push"],
            priority="medium",
            send_immediately=True,
        )

    def test_notifies_user_in_english_when_language_is_english(
        self,
        authenticated_user,
        aquacare_admin,
    ) -> None:
        authenticated_user.language_preference = "en"
        authenticated_user.save(update_fields=["language_preference"])
        conversation = ConversationService.get_or_create_conversation(authenticated_user)
        admin_message = MessageService.send_admin_message(
            conversation=conversation,
            admin_user=aquacare_admin,
            content="Support reply",
        )

        with patch("notifications.services.NotificationService.create_notification") as create_notification_mock:
            notify_user_admin_message_task.run(str(admin_message.id))

        kwargs = create_notification_mock.call_args.kwargs
        assert kwargs["title"] == "New message from support"
        assert kwargs["message"] == "Support has replied to your message."
        assert kwargs["channels"] == ["in_app", "push"]
