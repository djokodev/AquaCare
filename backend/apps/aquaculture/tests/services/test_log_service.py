"""
Tests unitaires pour CycleLogService.

Coverage cible : >70%
"""
import pytest
from decimal import Decimal
from datetime import date, timedelta
from django.utils import timezone

from aquaculture.services.log_service import CycleLogService
from aquaculture.models import CycleLog
from aquaculture.domain.exceptions import (
    BusinessRuleViolation,
    InsufficientFishCountError,
    InvalidDateRangeError
)
from tests.fixtures.factories import ProductionCycleFactory, UserFactory


@pytest.mark.django_db
class TestCycleLogServiceCreateLog:
    """Tests de création de logs quotidiens."""

    def test_create_log_success(self):
        """Test création log valide avec données complètes."""
        cycle = ProductionCycleFactory(
            current_count=5000,
            current_biomass=Decimal('75.00')
        )
        log_data = {
            'log_date': date.today(),
            'mortality_count': 10,
            'feed_quantity': Decimal('5.0'),
            'water_temperature': Decimal('28.5'),
            'ph_level': Decimal('7.2'),
            'dissolved_oxygen': Decimal('6.5'),
            'observations': "Poissons en bonne santé"
        }

        log = CycleLogService.create_log(cycle, log_data)

        assert log is not None
        assert log.cycle == cycle
        assert log.log_date == log_data['log_date']
        assert log.mortality_count == 10
        assert log.feed_quantity == Decimal('5.0')

    def test_create_log_with_sample_auto_calculates_average(self):
        """Test calcul automatique poids moyen depuis échantillon."""
        cycle = ProductionCycleFactory()
        log_data = {
            'log_date': date.today(),
            'sample_count': 20,
            'sample_total_weight': Decimal('2500'),  # 125g moyenne
        }

        log = CycleLogService.create_log(cycle, log_data)

        assert log.average_weight == Decimal('125.00')

    def test_create_log_rejects_date_before_cycle_start(self):
        """Test rejet date avant début cycle."""
        cycle = ProductionCycleFactory(start_date=date(2025, 6, 1))
        log_data = {
            'log_date': date(2025, 5, 1),  # Avant start_date
            'mortality_count': 5
        }

        with pytest.raises(InvalidDateRangeError):
            CycleLogService.create_log(cycle, log_data)

    def test_create_log_rejects_excessive_mortality(self):
        """Test rejet mortalité > effectif actuel."""
        cycle = ProductionCycleFactory(current_count=100)
        log_data = {
            'log_date': date.today(),
            'mortality_count': 150  # > current_count
        }

        with pytest.raises(InsufficientFishCountError):
            CycleLogService.create_log(cycle, log_data)

    def test_create_log_rejects_duplicate_date(self):
        """Test rejet doublon même date."""
        cycle = ProductionCycleFactory()
        log_date = date.today()

        # Premier log
        CycleLogService.create_log(cycle, {'log_date': log_date})

        # Second log même date
        with pytest.raises(BusinessRuleViolation, match="existe déjà"):
            CycleLogService.create_log(cycle, {'log_date': log_date})

    def test_create_log_with_client_uuid_for_sync(self):
        """Test création log avec client_uuid pour sync offline."""
        import uuid

        cycle = ProductionCycleFactory()
        log_date = date.today()
        test_uuid = str(uuid.uuid4())

        # Log avec UUID (pour sync)
        log_data = {
            'log_date': log_date,
            'mortality_count': 5,
            'client_uuid': test_uuid
        }
        log = CycleLogService.create_log(cycle, log_data)

        assert log is not None
        assert log.client_uuid == test_uuid
        assert log.created_offline is False


@pytest.mark.django_db
class TestCycleLogServiceBulkLogs:
    """Tests de création bulk (sync offline)."""

    def test_create_bulk_logs_success(self):
        """Test création bulk avec succès."""
        user = UserFactory()
        cycle = ProductionCycleFactory(
            farm_profile__user=user,
            start_date=date.today() - timedelta(days=10)
        )

        import uuid
        logs_data = [
            {
                'cycle': str(cycle.id),
                'log_date': date.today() - timedelta(days=2),
                'mortality_count': 5,
                'client_uuid': str(uuid.uuid4())
            },
            {
                'cycle': str(cycle.id),
                'log_date': date.today() - timedelta(days=1),
                'mortality_count': 3,
                'client_uuid': str(uuid.uuid4())
            }
        ]

        result = CycleLogService.create_bulk_logs(logs_data, user)

        assert result['created'] == 2
        assert result['updated'] == 0
        assert len(result['errors']) == 0
        assert len(result['logs']) == 2

    def test_create_bulk_logs_deduplicates_by_uuid(self):
        """Test déduplication par client_uuid."""
        import uuid

        user = UserFactory()
        cycle = ProductionCycleFactory(farm_profile__user=user)

        test_uuid = str(uuid.uuid4())
        # Créer log existant
        existing_log = CycleLogService.create_log(
            cycle,
            {
                'log_date': date.today(),
                'mortality_count': 5,
                'client_uuid': test_uuid
            }
        )

        # Sync avec même UUID mais données différentes
        logs_data = [
            {
                'cycle': str(cycle.id),
                'log_date': date.today(),
                'mortality_count': 10,  # Différent
                'client_uuid': test_uuid
            }
        ]

        result = CycleLogService.create_bulk_logs(logs_data, user)

        assert result['created'] == 0
        assert result['updated'] == 1

        existing_log.refresh_from_db()
        assert existing_log.mortality_count == 10  # Mis à jour

    def test_create_bulk_logs_handles_errors_gracefully(self):
        """Test gestion gracieuse des erreurs individuelles."""
        user = UserFactory()
        cycle = ProductionCycleFactory(
            farm_profile__user=user,
            start_date=date.today() - timedelta(days=5)
        )

        import uuid
        logs_data = [
            {
                'cycle': str(cycle.id),
                'log_date': date.today(),
                'mortality_count': 5,
                'client_uuid': str(uuid.uuid4())
            },
            {
                'cycle': 'invalid-uuid',  # Cycle inexistant
                'log_date': date.today(),
                'client_uuid': str(uuid.uuid4())
            },
            {
                'cycle': str(cycle.id),
                'log_date': date.today() - timedelta(days=1),
                'mortality_count': 3,
                'client_uuid': str(uuid.uuid4())
            }
        ]

        result = CycleLogService.create_bulk_logs(logs_data, user)

        assert result['created'] == 2  # 2 succès
        assert len(result['errors']) == 1  # 1 erreur
        assert result['errors'][0]['index'] == 1


@pytest.mark.django_db
class TestCycleLogServiceUpdateLog:
    """Tests de mise à jour de logs."""

    def test_update_log_success(self):
        """Test mise à jour log existant."""
        cycle = ProductionCycleFactory()
        log = CycleLogService.create_log(
            cycle,
            {'log_date': date.today(), 'mortality_count': 5}
        )

        update_data = {
            'mortality_count': 10,
            'observations': 'Mise à jour'
        }
        updated_log = CycleLogService.update_log(log, update_data)

        assert updated_log.mortality_count == 10
        assert updated_log.observations == 'Mise à jour'

    def test_update_log_validates_mortality(self):
        """Test validation mortalité lors mise à jour."""
        cycle = ProductionCycleFactory(
            initial_count=100,
            current_count=95  # Après 5 morts
        )
        log = CycleLogService.create_log(
            cycle,
            {'log_date': date.today(), 'mortality_count': 5}
        )

        update_data = {'mortality_count': 150}  # > current_count

        with pytest.raises(InsufficientFishCountError):
            CycleLogService.update_log(log, update_data)


@pytest.mark.django_db
class TestCycleLogServiceDeduplication:
    """Tests de déduplication UUID."""

    def test_deduplicate_updates_existing_log(self):
        """Test déduplication met à jour log existant."""
        import uuid

        user = UserFactory()
        cycle = ProductionCycleFactory(farm_profile__user=user)

        test_uuid = str(uuid.uuid4())
        # Créer log avec UUID
        existing_log = CycleLogService.create_log(
            cycle,
            {
                'log_date': date.today(),
                'mortality_count': 5,
                'client_uuid': test_uuid
            }
        )

        # Dédupliquer avec nouvelles données via bulk
        log_data = {
            'cycle': str(cycle.id),
            'log_date': date.today(),
            'mortality_count': 15,
            'client_uuid': test_uuid
        }

        result = CycleLogService.create_bulk_logs([log_data], user)

        assert result['created'] == 0
        assert result['updated'] == 1

    def test_deduplicate_creates_new_log_if_not_exists(self):
        """Test déduplication crée nouveau log si inexistant."""
        import uuid

        user = UserFactory()
        cycle = ProductionCycleFactory(farm_profile__user=user)

        new_uuid = str(uuid.uuid4())
        log_data = {
            'cycle': str(cycle.id),
            'log_date': date.today(),
            'mortality_count': 5,
            'client_uuid': new_uuid
        }

        result = CycleLogService.create_bulk_logs([log_data], user)

        assert result['created'] == 1
        assert result['updated'] == 0


@pytest.mark.django_db
class TestCycleLogServiceValidation:
    """Tests des validations métier."""

    def test_validates_sample_coherence(self):
        """Test validation cohérence échantillonnage."""
        cycle = ProductionCycleFactory()
        log_data = {
            'log_date': date.today(),
            'sample_count': 20,
            'sample_total_weight': Decimal('2500'),  # 125g réel
            'average_weight': Decimal('200')  # 200g déclaré (incohérent)
        }

        with pytest.raises(BusinessRuleViolation, match="incohérent"):
            CycleLogService.create_log(cycle, log_data)

    def test_allows_small_sample_with_warning(self):
        """Test accepte petit échantillon avec warning (pas d'erreur)."""
        cycle = ProductionCycleFactory()
        log_data = {
            'log_date': date.today(),
            'sample_count': 3,  # Petit échantillon
            'sample_total_weight': Decimal('375')
        }

        # Ne devrait pas lever d'exception (juste warning dans logs)
        log = CycleLogService.create_log(cycle, log_data)
        assert log is not None
