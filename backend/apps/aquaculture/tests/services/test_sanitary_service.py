"""
Tests unitaires pour SanitaryService.

Coverage cible : >50%
"""
from datetime import date
from uuid import uuid4

import pytest
from aquaculture.models import SanitaryLog
from aquaculture.services.sanitary_service import SanitaryService
from django.contrib.contenttypes.models import ContentType
from notifications.models import Notification

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

    def test_create_sanitary_log_deduplicates_by_client_uuid(self):
        """Un retry offline avec le même client_uuid retourne le log existant."""
        cycle = ProductionCycleFactory()
        client_uuid = uuid4()

        first_log = SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='disease',
            symptoms='Symptômes observés avec nage erratique persistante',
            client_uuid=client_uuid,
            created_offline=True,
        )
        second_log = SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='disease',
            symptoms='Retry mobile du même événement sanitaire',
            client_uuid=client_uuid,
            created_offline=True,
        )

        assert second_log.id == first_log.id
        assert SanitaryLog.objects.filter(client_uuid=client_uuid).count() == 1


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
        assert resolved_log.notes is not None
        assert 'Traitement effectué avec succès' in resolved_log.notes
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

    def test_health_score_perfect_with_no_events(self):
        """Score de santé doit être 100 pour un cycle sans événements."""
        cycle = ProductionCycleFactory()
        analysis = SanitaryService.analyze_sanitary_history(cycle)
        assert analysis['health_score'] == 100

    def test_health_score_decreases_with_active_issues(self):
        """Score de santé doit diminuer avec des problèmes actifs."""
        cycle = ProductionCycleFactory()

        # Create 3 active issues
        for _ in range(3):
            SanitaryService.create_sanitary_log(
                cycle=cycle,
                event_date=date.today(),
                event_type='disease',
                symptoms='Maladie active avec symptômes visibles graves'
            )

        analysis = SanitaryService.analyze_sanitary_history(cycle)
        assert analysis['health_score'] < 100
        assert analysis['active_count'] == 3

    def test_health_score_improves_after_resolution(self):
        """Score de santé doit être meilleur après résolution des problèmes."""
        cycle = ProductionCycleFactory()

        log = SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='disease',
            symptoms='Maladie détectée avec perte d appétit notable'
        )
        analysis_before = SanitaryService.analyze_sanitary_history(cycle)

        SanitaryService.resolve_sanitary_issue(str(log.id), resolution_notes='Guérison constatée')
        analysis_after = SanitaryService.analyze_sanitary_history(cycle)

        assert analysis_after['health_score'] >= analysis_before['health_score']
        assert analysis_after['active_count'] == 0

    def test_recommendations_generated_for_active_issues(self):
        """Des recommandations doivent être générées quand il y a des problèmes actifs."""
        cycle = ProductionCycleFactory()

        SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='disease',
            symptoms='Maladie bactérienne visible sur plusieurs poissons'
        )

        analysis = SanitaryService.analyze_sanitary_history(cycle)
        assert len(analysis['recommendations']) > 0

    def test_recommendations_include_disease_advice(self):
        """Recommandations doivent mentionner l'isolation pour les maladies actives."""
        cycle = ProductionCycleFactory()

        SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='disease',
            symptoms='Infection fongique étendue sur les nageoires'
        )

        analysis = SanitaryService.analyze_sanitary_history(cycle)
        recs = ' '.join(str(r) for r in analysis['recommendations'])
        assert 'Isolez' in recs or 'Maladie' in recs

    def test_resolve_event_creates_resolution_notification(self):
        """Résolution d'un événement doit créer une notification."""
        from django.contrib.contenttypes.models import ContentType
        from notifications.models import Notification

        cycle = ProductionCycleFactory()
        log = SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='water_quality',
            symptoms='Problème qualité eau oxygène dissous insuffisant'
        )

        SanitaryService.resolve_sanitary_issue(
            str(log.id),
            resolution_notes='Aération améliorée et niveau normalisé'
        )

        resolution_notifications = Notification.objects.filter(
            content_type=ContentType.objects.get_for_model(SanitaryLog),
            object_id=log.id,
            notification_type='ticket_resolved'
        )
        assert resolution_notifications.exists()

    def test_resolve_event_without_notes(self):
        """Résolution sans notes doit fonctionner."""
        cycle = ProductionCycleFactory()
        log = SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='treatment',
            symptoms='Traitement préventif effectué sur tout le stock'
        )

        resolved = SanitaryService.resolve_sanitary_issue(str(log.id))
        assert resolved.resolved is True
        assert resolved.resolution_date is not None

    def test_analysis_resolution_rate(self):
        """Taux de résolution doit être correctement calculé."""
        cycle = ProductionCycleFactory()

        log1 = SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='disease',
            symptoms='Première maladie avec symptômes observés'
        )
        SanitaryService.resolve_sanitary_issue(str(log1.id), resolution_notes='Résolu')

        SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='disease',
            symptoms='Deuxième maladie encore en cours de traitement'
        )

        analysis = SanitaryService.analyze_sanitary_history(cycle)
        assert analysis['resolution_rate'] == 50.0

    def test_active_issues_by_cycle_groups_correctly(self):
        """get_active_issues_by_cycle doit grouper par cycle."""
        cycle = ProductionCycleFactory()
        user = cycle.farm_profile.user

        SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='disease',
            symptoms='Maladie active sur plusieurs poissons'
        )
        SanitaryService.create_sanitary_log(
            cycle=cycle,
            event_date=date.today(),
            event_type='water_quality',
            symptoms='Problème eau qualité insuffisante notable'
        )

        grouped = SanitaryService.get_active_issues_by_cycle(user)
        assert len(grouped) == 1
        assert grouped[0]['issues_count'] == 2
