"""
Tests unitaires pour SanitaryService.

Coverage cible : >50%
"""
import pytest
from datetime import date
from django.contrib.contenttypes.models import ContentType

from apps.aquaculture.services.sanitary_service import SanitaryService
from apps.aquaculture.models import SanitaryLog
from apps.notifications.models import Notification
from tests.fixtures.factories import ProductionCycleFactory


@pytest.mark.django_db
class TestSanitaryServiceCreateLog:
    """Tests de création de logs sanitaires."""

    def test_create_sanitary_log_success(self):
        """Test création log sanitaire valide."""
        cycle = ProductionCycleFactory()

        log = SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='disease',
            symptoms='Symptômes observés : taches blanches sur corps',
            affected_count=50
        )

        assert log is not None
        assert log.cycle == cycle
        assert log.event_type == 'disease'
        assert log.resolved is False

    def test_create_sanitary_log_creates_notification(self):
        """Test création notification automatique."""
        cycle = ProductionCycleFactory()

        sanitary_log = SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='disease',
            symptoms="Maladie détectée avec pertes d'appétit"
        )

        notifications = Notification.objects.filter(
            content_type=ContentType.objects.get_for_model(SanitaryLog),
            object_id=sanitary_log.id,
            notification_type='alert'
        )
        assert notifications.exists()


@pytest.mark.django_db
class TestSanitaryServiceResolve:
    """Tests de résolution d'évènements sanitaires."""

    def test_resolve_sanitary_log(self):
        """Test résolution log sanitaire."""
        cycle = ProductionCycleFactory()

        log = SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='disease',
            symptoms='Problème détecté avec symptômes visibles'
        )
        assert log.resolved is False

        resolved_log = SanitaryService.resolve_sanitary_issue(
            sanitary_log_id=str(log.id),
            resolution_notes='Traitement effectué avec succès'
        )

        assert resolved_log.resolved is True
        assert resolved_log.resolution_notes == 'Traitement effectué avec succès'
        assert resolved_log.resolution_date is not None


@pytest.mark.django_db
class TestSanitaryServiceAnalysis:
    """Tests d'analyse sanitaire."""

    def test_get_unresolved_issues(self):
        """Test récupération problèmes non résolus."""
        cycle = ProductionCycleFactory()

        SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='disease',
            symptoms='Non résolu - symptômes persistants'
        )

        log_resolved = SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='treatment',
            symptoms='Résolu - traitement appliqué avec succès'
        )
        SanitaryService.resolve_sanitary_issue(str(log_resolved.id), resolution_notes='OK')

        analysis = SanitaryService.analyze_sanitary_history(cycle)

        assert analysis['total_events'] == 2
        assert analysis['active_count'] == 1
        assert analysis['resolved_count'] == 1
