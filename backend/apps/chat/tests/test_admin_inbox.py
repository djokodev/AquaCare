"""Non-regressions ciblees de la boite Support du lot 1."""

import pytest
from chat.services import MessageService
from common.admin_policies import RBACConstants
from django.contrib.auth.models import Group, Permission
from django.core.management import call_command
from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext
from django.urls import reverse

from tests.fixtures.factories import UserFactory


def _support_user():
    support = UserFactory(is_staff=True)
    group, _ = Group.objects.get_or_create(name=RBACConstants.GROUP_SUPPORT)
    support.groups.add(group)
    call_command("setup_rbac", verbosity=0)
    return type(support).objects.get(pk=support.pk)


def _unread_conversation(index=0):
    owner = UserFactory()
    message = MessageService.send_user_message(
        owner,
        f"Demande de support numero {index}",
    )
    message.conversation.refresh_from_db()
    return message.conversation, message


@pytest.mark.django_db
def test_opening_conversation_with_get_does_not_mark_messages_read():
    support = _support_user()
    conversation, message = _unread_conversation()
    client = Client()
    client.force_login(support)

    response = client.get(
        reverse("admin:chat_support_inbox"),
        {"conversation": conversation.pk},
    )
    conversation.refresh_from_db()
    message.refresh_from_db()

    assert response.status_code == 200
    assert conversation.unread_count_admin == 1
    assert message.is_read is False
    assert 'data-nav-key="support"' in response.content.decode()
    assert "Boîte Support - Administration AquaCare" in response.content.decode()


@pytest.mark.django_db
def test_explicit_post_marks_support_messages_read():
    support = _support_user()
    conversation, message = _unread_conversation()
    client = Client()
    client.force_login(support)

    response = client.post(
        reverse("admin:chat_support_inbox"),
        {"conversation_id": conversation.pk, "action": "mark_read"},
    )
    conversation.refresh_from_db()
    message.refresh_from_db()

    assert response.status_code == 302
    assert conversation.unread_count_admin == 0
    assert message.is_read is True


@pytest.mark.django_db
def test_support_mutation_requires_csrf():
    support = _support_user()
    conversation, _message = _unread_conversation()
    client = Client(enforce_csrf_checks=True)
    client.force_login(support)

    response = client.post(
        reverse("admin:chat_support_inbox"),
        {"conversation_id": conversation.pk, "action": "mark_read"},
    )

    assert response.status_code == 403


@pytest.mark.django_db
def test_mark_read_requires_explicit_permission():
    support = _support_user()
    conversation, message = _unread_conversation()
    support_group = Group.objects.get(name=RBACConstants.GROUP_SUPPORT)
    support_group.permissions.remove(
        Permission.objects.get(
            content_type__app_label="chat",
            codename="mark_conversation_read",
        )
    )
    support = type(support).objects.get(pk=support.pk)
    client = Client()
    client.force_login(support)

    response = client.post(
        reverse("admin:chat_support_inbox"),
        {"conversation_id": conversation.pk, "action": "mark_read"},
    )
    message.refresh_from_db()

    assert response.status_code == 403
    assert message.is_read is False


@pytest.mark.django_db
def test_support_inbox_paginates_conversations_by_fifty():
    support = _support_user()
    for index in range(51):
        _unread_conversation(index)
    client = Client()
    client.force_login(support)

    response = client.get(reverse("admin:chat_support_inbox"))

    assert response.status_code == 200
    assert response.context["conversation_count"] == 51
    assert len(response.context["conversations"]) == 50


@pytest.mark.django_db
def test_support_inbox_query_growth_is_constant():
    support = _support_user()
    _unread_conversation()
    client = Client()
    client.force_login(support)
    url = reverse("admin:chat_support_inbox")

    with CaptureQueriesContext(connection) as small_capture:
        assert client.get(url).status_code == 200

    for index in range(20):
        _unread_conversation(index)

    with CaptureQueriesContext(connection) as large_capture:
        assert client.get(url).status_code == 200

    assert len(large_capture) <= len(small_capture) + 2


@pytest.mark.django_db
def test_support_inbox_uses_compact_readable_master_detail_structure():
    support = _support_user()
    conversation, _message = _unread_conversation()
    client = Client()
    client.force_login(support)

    response = client.get(
        reverse("admin:chat_support_inbox"),
        {"conversation": conversation.pk},
    )
    html = response.content.decode()

    assert response.status_code == 200
    assert 'class="support-inbox-intro"' in html
    assert 'class="conversation-summary"' in html
    assert 'class="reply-note"' in html
