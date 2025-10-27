"""
Tests unitaires pour SanitaryService.

Coverage cible : >50%
"""
import pytest
from datetime import date

from apps.aquaculture.services.sanitary_service import SanitaryService
from apps.aquaculture.models import SanitaryLog
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
        from apps.aquaculture.models import Notification

        cycle = ProductionCycleFactory()

        SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='disease',
            symptoms='Maladie détectée avec pertes d\'appétit'
        )

        # Vérifie qu'une notification a été créée
        notifications = Notification.objects.filter(
            cycle=cycle,
            notification_type='alert'
        )
        assert notifications.exists()


@pytest.mark.django_db
class TestSanitaryServiceResolve:
    """Tests de résolution d'événements sanitaires."""

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

        # Résoudre
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

        # Créer plusieurs logs
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

        # Récupérer analyse historique
        analysis = SanitaryService.analyze_sanitary_history(cycle)

        assert analysis['total_events'] == 2
        assert analysis['active_count'] == 1
        assert analysis['resolved_count'] == 1
