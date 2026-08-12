"""Contrats du cas d'usage de resolution sanitaire Admin."""

from datetime import date

import pytest
from aquaculture.domain.exceptions import (
    InvalidSanitaryDataException,
    SanitaryLogNotFoundException,
)
from aquaculture.services.sanitary_application_service import (
    AdminSanitaryApplicationService,
    ResolveSanitaryIssueCommand,
    SanitaryApplicationService,
)
from aquaculture.services.sanitary_service import SanitaryService
from common.admin_policies import RBACConstants
from django.contrib.admin.models import LogEntry
from django.contrib.auth.models import Group
from django.core.exceptions import PermissionDenied
from django.core.management import call_command
from notifications.models import Notification

from tests.fixtures.factories import ProductionCycleFactory, UserFactory


def _incident(cycle):
    return SanitaryService.create_sanitary_log(
        cycle=cycle,
        event_date=date.today(),
        event_type="disease",
        symptoms="Nage erratique et perte d'appetit",
    )


def _manager(*, with_permissions=True):
    manager = UserFactory(is_staff=True)
    group, _ = Group.objects.get_or_create(name=RBACConstants.GROUP_MANAGERS)
    manager.groups.add(group)
    if with_permissions:
        call_command("setup_rbac", verbosity=0)
        manager = type(manager).objects.get(pk=manager.pk)
    return manager


@pytest.mark.django_db
def test_authorized_manager_resolves_farm_incident_and_is_audited():
    cycle = ProductionCycleFactory()
    incident = _incident(cycle)
    manager = _manager()

    resolved = AdminSanitaryApplicationService.resolve_issue(
        farm_owner=cycle.farm_profile.user,
        actor=manager,
        sanitary_log=incident,
        command=ResolveSanitaryIssueCommand(resolution_notes="Traitement controle"),
    )

    assert resolved.resolved is True
    audit = LogEntry.objects.get(user=manager, object_id=str(incident.pk))
    assert "console Admin" in audit.change_message


@pytest.mark.django_db
def test_manager_without_django_permission_cannot_resolve_incident():
    cycle = ProductionCycleFactory()
    incident = _incident(cycle)

    with pytest.raises(PermissionDenied):
        AdminSanitaryApplicationService.resolve_issue(
            farm_owner=cycle.farm_profile.user,
            actor=_manager(with_permissions=False),
            sanitary_log=incident,
            command=ResolveSanitaryIssueCommand(),
        )


@pytest.mark.django_db
def test_mobile_user_from_another_farm_cannot_resolve_incident():
    cycle = ProductionCycleFactory()
    incident = _incident(cycle)
    other_owner = UserFactory()

    with pytest.raises(SanitaryLogNotFoundException):
        SanitaryApplicationService.resolve_issue(
            user=other_owner,
            sanitary_log=incident,
            command=ResolveSanitaryIssueCommand(),
        )


@pytest.mark.django_db
def test_resolution_notification_remains_addressed_to_farm_owner():
    cycle = ProductionCycleFactory()
    incident = _incident(cycle)
    manager = _manager()

    AdminSanitaryApplicationService.resolve_issue(
        farm_owner=cycle.farm_profile.user,
        actor=manager,
        sanitary_log=incident,
        command=ResolveSanitaryIssueCommand(),
    )

    notification = Notification.objects.get(
        notification_type="ticket_resolved",
        object_id=incident.pk,
    )
    assert notification.user == cycle.farm_profile.user
    assert notification.user != manager


@pytest.mark.django_db
def test_resolving_an_already_resolved_incident_keeps_domain_behavior():
    cycle = ProductionCycleFactory()
    incident = _incident(cycle)
    manager = _manager()
    command = ResolveSanitaryIssueCommand()

    AdminSanitaryApplicationService.resolve_issue(
        farm_owner=cycle.farm_profile.user,
        actor=manager,
        sanitary_log=incident,
        command=command,
    )

    with pytest.raises(InvalidSanitaryDataException, match="deja resolu|déjà résolu"):
        AdminSanitaryApplicationService.resolve_issue(
            farm_owner=cycle.farm_profile.user,
            actor=manager,
            sanitary_log=incident,
            command=command,
        )
