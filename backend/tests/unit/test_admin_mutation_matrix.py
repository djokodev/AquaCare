"""Matrice de mutations du lot 1, testee sur les ModelAdmin."""

import pytest
from aquaculture.admin import (
    CycleLogAdmin,
    CycleUnitAllocationAdmin,
    FeedingPlanAdmin,
    NutritionalGuideAdmin,
    ProductionCycleAdmin,
    ProductionUnitAdmin,
    SanitaryLogAdmin,
)
from aquaculture.models import (
    CycleLog,
    CycleUnitAllocation,
    FeedingPlan,
    NutritionalGuide,
    ProductionCycle,
    ProductionUnit,
    SanitaryLog,
)
from chat.admin import MessageAdmin
from chat.models import Message
from common.admin_policies import RBACConstants
from django.contrib.admin.sites import AdminSite
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.test import RequestFactory

from tests.fixtures.factories import UserFactory


@pytest.fixture
def manager_request(db):
    manager = UserFactory(is_staff=True)
    group, _ = Group.objects.get_or_create(name=RBACConstants.GROUP_MANAGERS)
    manager.groups.add(group)
    call_command("setup_rbac", verbosity=0)
    manager = type(manager).objects.get(pk=manager.pk)
    request = RequestFactory().get("/admin/")
    request.user = manager
    return request


@pytest.mark.django_db
def test_manager_keeps_service_protected_production_unit_changes(manager_request):
    model_admin = ProductionUnitAdmin(ProductionUnit, AdminSite())

    assert model_admin.has_add_permission(manager_request) is True
    assert model_admin.has_change_permission(manager_request) is True
    assert model_admin.has_delete_permission(manager_request) is False


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("admin_class", "model"),
    [
        (ProductionCycleAdmin, ProductionCycle),
        (CycleUnitAllocationAdmin, CycleUnitAllocation),
        (CycleLogAdmin, CycleLog),
        (FeedingPlanAdmin, FeedingPlan),
        (SanitaryLogAdmin, SanitaryLog),
    ],
)
def test_operational_and_historical_models_have_no_generic_manager_mutation(
    manager_request,
    admin_class,
    model,
):
    model_admin = admin_class(model, AdminSite())

    assert model_admin.has_add_permission(manager_request) is False
    assert model_admin.has_change_permission(manager_request) is False
    assert model_admin.has_delete_permission(manager_request) is False


@pytest.mark.django_db
def test_manager_nutritional_guides_are_strictly_read_only(manager_request):
    model_admin = NutritionalGuideAdmin(NutritionalGuide, AdminSite())

    assert model_admin.has_module_permission(manager_request) is True
    assert model_admin.has_add_permission(manager_request) is False
    assert model_admin.has_change_permission(manager_request) is False
    assert model_admin.has_delete_permission(manager_request) is False


def test_sent_support_messages_are_immutable_even_for_superuser():
    request = RequestFactory().get("/admin/chat/message/")
    request.user = type("Superuser", (), {"is_superuser": True})()
    model_admin = MessageAdmin(Message, AdminSite())

    assert model_admin.has_add_permission(request) is False
    assert model_admin.has_change_permission(request) is False
    assert model_admin.has_delete_permission(request) is False
