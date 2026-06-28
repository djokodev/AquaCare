"""
Tests unitaires pour CycleLogService.

Coverage cible : >70%
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from aquaculture.domain.exceptions import BusinessRuleViolation, InsufficientFishCountError, InvalidDateRangeError
from aquaculture.models import CycleLog, CycleUnitAllocation, ProductionUnit
from aquaculture.services.log_service import CycleLogService

from tests.fixtures.factories import ProductionCycleFactory, UserFactory


def create_cycle_unit_allocation(cycle, name='Bac 1'):
    unit = ProductionUnit.objects.create(
        farm_profile=cycle.farm_profile,
        name=name,
        unit_type='tank',
        volume_m3=Decimal('3.00'),
    )
    return CycleUnitAllocation.objects.create(
        cycle=cycle,
        production_unit=unit,
        initial_fish_count=500,
        current_fish_count=500,
        initial_biomass_kg=Decimal('5.00'),
        current_biomass_kg=Decimal('5.00'),
    )


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

    def test_create_log_allows_global_and_unit_same_day(self):
        """Un log global et un log unitaire peuvent coexister le même jour."""
        cycle = ProductionCycleFactory()
        allocation = create_cycle_unit_allocation(cycle, 'Bac 1')
        log_date = date.today()

        global_log = CycleLogService.create_log(cycle, {'log_date': log_date})
        unit_log = CycleLogService.create_log(
            cycle,
            {
                'log_date': log_date,
                'cycle_unit_allocation': allocation,
            },
        )

        assert global_log.id != unit_log.id
        assert CycleLog.objects.filter(cycle=cycle, log_date=log_date).count() == 2
        assert CycleLog.objects.filter(cycle=cycle, log_date=log_date, cycle_unit_allocation__isnull=True).count() == 1
        assert CycleLog.objects.filter(cycle=cycle, log_date=log_date, cycle_unit_allocation=allocation).count() == 1

    def test_create_log_allows_same_day_logs_for_different_units(self):
        """Deux unités différentes peuvent avoir un log le même jour."""
        cycle = ProductionCycleFactory()
        allocation_1 = create_cycle_unit_allocation(cycle, 'Bac 1')
        allocation_2 = create_cycle_unit_allocation(cycle, 'Bac 2')
        log_date = date.today()

        first_log = CycleLogService.create_log(
            cycle,
            {
                'log_date': log_date,
                'cycle_unit_allocation': allocation_1,
            },
        )
        second_log = CycleLogService.create_log(
            cycle,
            {
                'log_date': log_date,
                'cycle_unit_allocation': allocation_2,
            },
        )

        assert first_log.id != second_log.id
        assert CycleLog.objects.filter(cycle=cycle, log_date=log_date).count() == 2
        assert CycleLog.objects.filter(cycle=cycle, log_date=log_date, cycle_unit_allocation=allocation_1).count() == 1
        assert CycleLog.objects.filter(cycle=cycle, log_date=log_date, cycle_unit_allocation=allocation_2).count() == 1

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

    def test_create_bulk_logs_allows_same_day_logs_for_different_units(self):
        """Le bulk doit accepter plusieurs logs unitaires le même jour."""
        user = UserFactory()
        cycle = ProductionCycleFactory(
            farm_profile__user=user,
            start_date=date.today() - timedelta(days=10)
        )
        allocation_1 = create_cycle_unit_allocation(cycle, 'Bac 1')
        allocation_2 = create_cycle_unit_allocation(cycle, 'Bac 2')

        logs_data = [
            {
                'cycle': str(cycle.id),
                'log_date': date.today(),
                'mortality_count': 2,
                'cycle_unit_allocation': allocation_1,
            },
            {
                'cycle': str(cycle.id),
                'log_date': date.today(),
                'mortality_count': 3,
                'cycle_unit_allocation': allocation_2,
            },
        ]

        result = CycleLogService.create_bulk_logs(logs_data, user)

        assert result['created'] == 2
        assert result['updated'] == 0
        assert len(result['errors']) == 0
        assert CycleLog.objects.filter(cycle=cycle, log_date=date.today()).count() == 2

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
        CycleLogService.create_log(
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


@pytest.mark.django_db
class TestCycleLogServiceCreatedOffline:
    """Tests du flag created_offline."""

    def test_create_log_offline_flag_defaults_to_false(self):
        """create_log sans created_offline → False par défaut."""
        cycle = ProductionCycleFactory()
        log = CycleLogService.create_log(cycle, {'log_date': date.today()})
        assert log.created_offline is False

    def test_create_log_with_created_offline_true(self):
        """create_log avec created_offline=True conserve le flag."""
        cycle = ProductionCycleFactory()
        log = CycleLogService.create_log(
            cycle,
            {'log_date': date.today()},
            created_offline=True
        )
        assert log.created_offline is True

    def test_create_log_with_client_uuid_stores_uuid_on_log(self):
        """Créer un log avec client_uuid stocke bien le UUID sur le log créé."""
        import uuid

        cycle = ProductionCycleFactory()
        test_uuid = str(uuid.uuid4())

        log = CycleLogService.create_log(
            cycle,
            {'log_date': date.today(), 'client_uuid': test_uuid}
        )
        assert str(log.client_uuid) == test_uuid


@pytest.mark.django_db
class TestBulkLogsCrossUserConflict:
    """Tests du conflit UUID cross-utilisateur dans create_bulk_logs."""

    def test_bulk_logs_rejects_uuid_belonging_to_another_user(self):
        """Un client_uuid appartenant à un autre utilisateur est rejeté."""
        import uuid

        user1 = UserFactory()
        user2 = UserFactory()
        cycle1 = ProductionCycleFactory(farm_profile__user=user1)
        cycle2 = ProductionCycleFactory(farm_profile__user=user2)

        conflict_uuid = str(uuid.uuid4())
        # user1 creates a log with this UUID
        CycleLogService.create_log(cycle1, {
            'log_date': date.today(),
            'mortality_count': 2,
            'client_uuid': conflict_uuid,
        })

        # user2 tries to sync with the same UUID
        logs_data = [
            {
                'cycle': str(cycle2.id),
                'log_date': date.today(),
                'mortality_count': 5,
                'client_uuid': conflict_uuid,
            }
        ]

        result = CycleLogService.create_bulk_logs(logs_data, user2)

        assert result['created'] == 0
        assert len(result['errors']) == 1
        assert 'autre utilisateur' in result['errors'][0]['error']

    def test_bulk_logs_rejects_uuid_linked_to_different_cycle(self):
        """Un client_uuid lié à un autre cycle du même utilisateur est rejeté."""
        import uuid

        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        cycle1 = ProductionCycleFactory(
            farm_profile=farm,
            start_date=date.today() - timedelta(days=10)
        )
        cycle2 = ProductionCycleFactory(
            farm_profile=farm,
            start_date=date.today() - timedelta(days=10)
        )

        link_uuid = str(uuid.uuid4())
        CycleLogService.create_log(cycle1, {
            'log_date': date.today() - timedelta(days=2),
            'mortality_count': 1,
            'client_uuid': link_uuid,
        })

        logs_data = [
            {
                'cycle': str(cycle2.id),
                'log_date': date.today() - timedelta(days=1),
                'mortality_count': 3,
                'client_uuid': link_uuid,
            }
        ]

        result = CycleLogService.create_bulk_logs(logs_data, user)

        assert result['created'] == 0
        assert len(result['errors']) == 1
        assert 'autre cycle' in result['errors'][0]['error']

    def test_bulk_logs_in_batch_duplicate_uuid_updates_not_creates(self):
        """Un UUID répété dans le même batch update le log, pas en crée un second."""
        import uuid

        user = UserFactory()
        cycle = ProductionCycleFactory(
            farm_profile__user=user,
            start_date=date.today() - timedelta(days=10)
        )

        same_uuid = str(uuid.uuid4())
        logs_data = [
            {
                'cycle': str(cycle.id),
                'log_date': date.today() - timedelta(days=2),
                'mortality_count': 5,
                'client_uuid': same_uuid,
            },
            {
                'cycle': str(cycle.id),
                'log_date': date.today() - timedelta(days=2),
                'mortality_count': 10,  # Different mortality
                'client_uuid': same_uuid,  # Same UUID
            },
        ]

        result = CycleLogService.create_bulk_logs(logs_data, user)

        # Should create 1, update 1 — not create 2
        assert result['created'] == 1
        assert result['updated'] == 1
        assert len(result['logs']) == 1  # No duplicate in logs list

    def test_bulk_logs_with_user_none_still_processes(self):
        """create_bulk_logs avec user=None (contexte test) fonctionne sans crash."""
        import uuid

        cycle = ProductionCycleFactory(
            start_date=date.today() - timedelta(days=10)
        )

        logs_data = [
            {
                'cycle': str(cycle.id),
                'log_date': date.today() - timedelta(days=1),
                'mortality_count': 3,
                'client_uuid': str(uuid.uuid4()),
            }
        ]

        # user=None: should not crash (no ownership filter applied)
        result = CycleLogService.create_bulk_logs(logs_data, user=None)

        assert result['created'] == 1
        assert len(result['errors']) == 0

    def test_bulk_logs_missing_cycle_id_adds_error(self):
        """Un log sans cycle_id est rejeté avec message clair."""
        import uuid

        user = UserFactory()
        logs_data = [
            {
                'log_date': date.today(),
                'mortality_count': 5,
                'client_uuid': str(uuid.uuid4()),
            }
        ]

        result = CycleLogService.create_bulk_logs(logs_data, user)

        assert result['created'] == 0
        assert len(result['errors']) == 1
        assert 'cycle_id requis' in result['errors'][0]['error']
