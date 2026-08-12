"""Tests de la source unique des capacites de la console admin."""

import pytest
from common.admin_capabilities import (
    AdminCapability,
    capabilities_for_user,
    has_capability_and_permission,
)
from common.admin_policies import RBACConstants
from django.contrib.auth.models import Group
from django.core.management import call_command


@pytest.mark.django_db
def test_staff_without_role_has_no_business_capability(user_factory):
    user = user_factory(is_staff=True)

    assert capabilities_for_user(user) == frozenset()


@pytest.mark.django_db
def test_multi_role_capabilities_are_a_union(user_factory):
    user = user_factory(is_staff=True)
    manager, _ = Group.objects.get_or_create(name=RBACConstants.GROUP_MANAGERS)
    support, _ = Group.objects.get_or_create(name=RBACConstants.GROUP_SUPPORT)
    user.groups.add(manager, support)

    capabilities = capabilities_for_user(user)

    assert AdminCapability.MANAGE_ACCOUNTS in capabilities
    assert AdminCapability.MANAGE_SUPPORT in capabilities
    assert AdminCapability.MANAGE_COMMERCE not in capabilities


@pytest.mark.django_db
def test_screen_block_requires_capability_and_django_permission(user_factory):
    user = user_factory(is_staff=True)
    manager, _ = Group.objects.get_or_create(name=RBACConstants.GROUP_MANAGERS)
    user.groups.add(manager)

    assert AdminCapability.VIEW_USERS in capabilities_for_user(user)
    assert not has_capability_and_permission(
        user,
        AdminCapability.VIEW_USERS,
        "accounts.view_user",
    )

    call_command("setup_rbac", verbosity=0)
    user = type(user).objects.get(pk=user.pk)

    assert has_capability_and_permission(
        user,
        AdminCapability.VIEW_USERS,
        "accounts.view_user",
    )


@pytest.mark.django_db
def test_nutritional_guides_are_not_mutable_by_manager(user_factory):
    user = user_factory(is_staff=True)
    manager, _ = Group.objects.get_or_create(name=RBACConstants.GROUP_MANAGERS)
    user.groups.add(manager)
    call_command("setup_rbac", verbosity=0)
    user = type(user).objects.get(pk=user.pk)

    assert user.has_perm("aquaculture.view_nutritionalguide")
    assert not user.has_perm("aquaculture.add_nutritionalguide")
    assert not user.has_perm("aquaculture.change_nutritionalguide")
    assert not user.has_perm("aquaculture.delete_nutritionalguide")
