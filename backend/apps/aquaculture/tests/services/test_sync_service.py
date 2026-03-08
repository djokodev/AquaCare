"""
Tests unitaires pour SyncService.

Coverage cible : >50%
"""
from datetime import date, timedelta

import pytest
from aquaculture.models import CycleLog
from aquaculture.services.sync_service import SyncService
from django.utils import timezone

from tests.fixtures.factories import ProductionCycleFactory, UserFactory


@pytest.mark.django_db
class TestSyncServicePullData:
    """Tests de récupération données pour sync."""

    def test_get_cycles_for_sync(self):
        """Test récupération cycles pour sync."""
        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)

        ProductionCycleFactory(farm_profile=farm, status='active')
        ProductionCycleFactory(farm_profile=farm, status='harvested')

        # Autre utilisateur
        ProductionCycleFactory()

        updates = SyncService.get_server_updates(user)

        # Devrait retourner les cycles de l'utilisateur
        assert 'cycles' in updates
        assert isinstance(updates['cycles'], list)

    def test_get_logs_since_date(self):
        """Test récupération logs depuis date."""
        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            start_date=date.today() - timedelta(days=10)
        )

        # Créer logs (pas offline pour être dans server_updates)
        CycleLog.objects.create(
            cycle=cycle,
            log_date=date.today() - timedelta(days=5),
            created_offline=False
        )
        CycleLog.objects.create(
            cycle=cycle,
            log_date=date.today() - timedelta(days=2),
            created_offline=False
        )

        # Récupérer logs depuis 3 jours
        since_date = (timezone.now() - timedelta(days=3)).isoformat()
        updates = SyncService.get_server_updates(user, last_sync=since_date)

        assert 'cycle_logs' in updates
        assert isinstance(updates['cycle_logs'], list)


@pytest.mark.django_db
class TestSyncServicePushData:
    """Tests d'envoi données (sync offline → serveur)."""

    def test_sync_offline_logs_success(self):
        """Test sync logs offline avec succès."""
        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            start_date=date.today() - timedelta(days=10)
        )

        import uuid
        offline_logs = [
            {
                'cycle': str(cycle.id),
                'log_date': date.today() - timedelta(days=1),
                'mortality_count': 5,
                'client_uuid': str(uuid.uuid4()),
                'created_offline': True
            },
            {
                'cycle': str(cycle.id),
                'log_date': date.today(),
                'mortality_count': 3,
                'client_uuid': str(uuid.uuid4()),
                'created_offline': True
            }
        ]

        result = SyncService.sync_cycle_logs(user, offline_logs)

        assert result['created'] == 2
        assert result['updated'] == 0
        assert len(result['errors']) == 0

    def test_sync_deduplicates_by_uuid(self):
        """Test déduplication par UUID lors sync."""
        import uuid

        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(farm_profile=farm)

        test_uuid = str(uuid.uuid4())
        # Première sync
        logs_data = [
            {
                'cycle': str(cycle.id),
                'log_date': date.today(),
                'mortality_count': 5,
                'client_uuid': test_uuid
            }
        ]
        result1 = SyncService.sync_cycle_logs(user, logs_data)
        assert result1['created'] == 1

        # Seconde sync même UUID (update)
        logs_data[0]['mortality_count'] = 10
        result2 = SyncService.sync_cycle_logs(user, logs_data)

        assert result2['created'] == 0
        assert result2['updated'] == 1


@pytest.mark.django_db
class TestSyncServiceConflictResolution:
    """Tests de résolution de conflits."""

    def test_detect_sync_conflicts(self):
        """Test déduplication avec conflits."""
        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(farm_profile=farm)

        # Créer log serveur
        import uuid

        from aquaculture.services.log_service import CycleLogService

        conflict_uuid = str(uuid.uuid4())
        server_log = CycleLogService.create_log(cycle, {
            'log_date': date.today(),
            'mortality_count': 5,
            'client_uuid': conflict_uuid
        })
        server_log.updated_at = timezone.now()
        server_log.save()

        # Simuler log client avec même UUID mais données différentes
        client_log_data = {
            'cycle': str(cycle.id),
            'log_date': date.today(),
            'mortality_count': 10,  # Différent
            'client_uuid': conflict_uuid
        }

        result = SyncService.sync_cycle_logs(user, [client_log_data])

        # Devrait mettre à jour (pas créer)
        assert result['created'] == 0
        assert result['updated'] == 1


@pytest.mark.django_db
class TestSyncServiceHealthCheck:
    """Tests de vérification santé sync."""

    def test_get_sync_status_for_user(self):
        """Test statut sync utilisateur."""
        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(farm_profile=farm)

        # Créer logs offline
        CycleLog.objects.create(
            cycle=cycle,
            log_date=date.today(),
            created_offline=True
        )

        stats = SyncService.get_sync_statistics(user)

        assert 'total_logs' in stats
        assert 'unsynced_logs' in stats
        assert 'last_sync_date' in stats
        assert 'offline_percentage' in stats


@pytest.mark.django_db
class TestSyncCycleLogsEdgeCases:
    """Tests des cas limites pour sync_cycle_logs."""

    def test_invalid_uuid_cycle_id_adds_error(self):
        """Un cycle_id invalide (non-UUID) est ignoré et ajouté aux erreurs."""
        import uuid

        user = UserFactory()
        logs_data = [
            {
                'cycle': 'not-a-valid-uuid',
                'log_date': date.today(),
                'mortality_count': 5,
                'client_uuid': str(uuid.uuid4()),
            }
        ]

        result = SyncService.sync_cycle_logs(user, logs_data)

        assert result['created'] == 0
        assert len(result['errors']) == 1
        assert 'non trouvé' in result['errors'][0]['error']

    def test_missing_cycle_id_adds_error(self):
        """Un log sans cycle_id est rejeté avec message d'erreur."""
        import uuid

        user = UserFactory()
        logs_data = [
            {
                'log_date': date.today(),
                'mortality_count': 5,
                'client_uuid': str(uuid.uuid4()),
            }
        ]

        result = SyncService.sync_cycle_logs(user, logs_data)

        assert result['created'] == 0
        assert len(result['errors']) == 1
        assert result['errors'][0]['error'] == 'Le champ cycle est requis'

    def test_uuid_conflict_with_another_user_adds_error(self):
        """Un client_uuid appartenant à un autre utilisateur est rejeté."""
        import uuid

        from aquaculture.services.log_service import CycleLogService

        from tests.fixtures.factories import FarmProfileFactory

        user1 = UserFactory()
        user2 = UserFactory()
        farm1 = FarmProfileFactory(user=user1)
        farm2 = FarmProfileFactory(user=user2)
        cycle1 = ProductionCycleFactory(
            farm_profile=farm1,
            start_date=date.today() - timedelta(days=10),
        )
        cycle2 = ProductionCycleFactory(
            farm_profile=farm2,
            start_date=date.today() - timedelta(days=10),
        )

        conflict_uuid = str(uuid.uuid4())
        # user1 has a log with this UUID
        CycleLogService.create_log(cycle1, {
            'log_date': date.today(),
            'mortality_count': 5,
            'client_uuid': conflict_uuid,
        })

        # user2 tries to sync with the same UUID
        logs_data = [
            {
                'cycle': str(cycle2.id),
                'log_date': date.today(),
                'mortality_count': 3,
                'client_uuid': conflict_uuid,
            }
        ]

        result = SyncService.sync_cycle_logs(user2, logs_data)

        assert result['created'] == 0
        assert len(result['errors']) == 1
        assert 'autre utilisateur' in result['errors'][0]['error']

    def test_uuid_linked_to_different_cycle_adds_error(self):
        """Un client_uuid lié à un autre cycle du même utilisateur est rejeté."""
        import uuid

        from aquaculture.services.log_service import CycleLogService

        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        cycle1 = ProductionCycleFactory(
            farm_profile=farm,
            start_date=date.today() - timedelta(days=10),
        )
        cycle2 = ProductionCycleFactory(
            farm_profile=farm,
            start_date=date.today() - timedelta(days=10),
        )

        link_uuid = str(uuid.uuid4())
        # UUID attached to cycle1
        CycleLogService.create_log(cycle1, {
            'log_date': date.today(),
            'mortality_count': 2,
            'client_uuid': link_uuid,
        })

        # Try to sync same UUID on cycle2
        logs_data = [
            {
                'cycle': str(cycle2.id),
                'log_date': date.today(),
                'mortality_count': 4,
                'client_uuid': link_uuid,
            }
        ]

        result = SyncService.sync_cycle_logs(user, logs_data)

        assert result['created'] == 0
        assert len(result['errors']) == 1
        assert 'autre cycle' in result['errors'][0]['error']

    def test_invalid_date_format_adds_error(self):
        """Un log avec date au mauvais format est rejeté proprement."""
        import uuid

        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            start_date=date.today() - timedelta(days=10),
        )

        logs_data = [
            {
                'cycle': str(cycle.id),
                'log_date': '22-02-2026',  # Wrong format (should be YYYY-MM-DD)
                'mortality_count': 5,
                'client_uuid': str(uuid.uuid4()),
            }
        ]

        result = SyncService.sync_cycle_logs(user, logs_data)

        assert result['created'] == 0
        assert len(result['errors']) == 1
        assert 'date' in result['errors'][0]['error'].lower()

    def test_partial_batch_succeeds_despite_one_error(self):
        """Les entrées valides sont créées même si d'autres sont invalides."""
        import uuid

        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            start_date=date.today() - timedelta(days=10),
        )

        logs_data = [
            {
                'cycle': str(cycle.id),
                'log_date': date.today() - timedelta(days=1),
                'mortality_count': 5,
                'client_uuid': str(uuid.uuid4()),
            },
            {
                'cycle': 'invalid-uuid',  # Will produce an error
                'log_date': date.today(),
                'client_uuid': str(uuid.uuid4()),
            },
        ]

        result = SyncService.sync_cycle_logs(user, logs_data)

        assert result['created'] == 1
        assert len(result['errors']) == 1


@pytest.mark.django_db
class TestSyncSanitaryLogs:
    """Tests de synchronisation des logs sanitaires."""

    def test_sync_sanitary_logs_basic_success(self):
        """Sync d'un log sanitaire valide crée un nouvel enregistrement."""
        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            start_date=date.today() - timedelta(days=10),
        )

        from aquaculture.models import SanitaryLog
        logs_data = [
            {
                'cycle': str(cycle.id),
                'event_date': date.today(),
                'event_type': 'treatment',
                'symptoms': 'Observation de comportement atypique chez plusieurs spécimens.',
            }
        ]

        result = SyncService.sync_sanitary_logs(user, logs_data)

        assert result['created'] == 1
        assert len(result['errors']) == 0
        assert SanitaryLog.objects.filter(cycle=cycle).count() == 1

    def test_sync_sanitary_logs_invalid_cycle_id_adds_error(self):
        """Un cycle_id invalide pour un log sanitaire est rejeté."""

        user = UserFactory()
        logs_data = [
            {
                'cycle': 'not-a-uuid',
                'event_date': date.today(),
                'event_type': 'treatment',
                'symptoms': 'Test symptômes suffisamment longs.',
            }
        ]

        result = SyncService.sync_sanitary_logs(user, logs_data)

        assert result['created'] == 0
        assert len(result['errors']) == 1

    def test_sync_sanitary_logs_missing_cycle_adds_error(self):
        """Un log sanitaire sans cycle_id est rejeté."""
        user = UserFactory()
        logs_data = [
            {
                'event_date': date.today(),
                'event_type': 'treatment',
                'symptoms': 'Test symptômes.',
            }
        ]

        result = SyncService.sync_sanitary_logs(user, logs_data)

        assert result['created'] == 0
        assert len(result['errors']) == 1
        assert 'cycle' in result['errors'][0]['error'].lower()

    def test_sync_sanitary_logs_mixed_valid_invalid(self):
        """Les entrées valides sont créées même si d'autres sont invalides."""
        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            start_date=date.today() - timedelta(days=10),
        )

        logs_data = [
            {
                'cycle': str(cycle.id),
                'event_date': date.today(),
                'event_type': 'vaccination',
                'symptoms': 'Vaccination préventive réalisée sur l\'ensemble du bassin.',
            },
            {
                'cycle': 'invalid-cycle-uuid',
                'event_date': date.today(),
                'event_type': 'treatment',
                'symptoms': 'Test invalide.',
            },
        ]

        result = SyncService.sync_sanitary_logs(user, logs_data)

        assert result['created'] == 1
        assert len(result['errors']) == 1
