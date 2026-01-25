"""
Tests unitaires pour SyncService.

Coverage cible : >50%
"""
import pytest
from datetime import date, timedelta
from django.utils import timezone

from aquaculture.services.sync_service import SyncService
from aquaculture.models import ProductionCycle, CycleLog
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
        from aquaculture.models import CycleLog
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
        from tests.fixtures.factories import FarmProfileFactory
        import uuid

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
        from aquaculture.models import CycleLog
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
