"""
Tests unitaires pour SyncService.

Coverage cible : >50%
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from aquaculture.models import (
    CycleLog,
    CycleUnitAllocation,
    FinalHarvestOperation,
    ProductionUnit,
    SanitaryLog,
)
from aquaculture.services.calibration_service import CalibrationService
from aquaculture.services.cycle_service import ProductionCycleService
from aquaculture.services.sync_service import SyncService
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

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

    def test_get_server_updates_limits_queries_for_cycles_with_feed_cost(self):
        """Le pull sync doit éviter les requêtes par cycle lors de la sérialisation coût aliment."""
        from decimal import Decimal

        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)

        # Crée des cycles avec consommation d'aliment pour activer total_feed_cost serializer field
        for idx in range(5):
            ProductionCycleFactory(
                farm_profile=farm,
                start_date=date.today() - timedelta(days=20 + idx),
                total_feed_consumed=Decimal('12.50'),
            )

        with CaptureQueriesContext(connection) as ctx:
            updates = SyncService.get_server_updates(user)

        assert 'cycles' in updates
        # 4 requêtes principales attendues: cycles, logs, plans, sanitary logs
        # + marge de sécurité pour variations ORM mineures
        assert len(ctx.captured_queries) <= 5


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

    def test_sync_new_cycles_deduplicates_by_client_uuid(self):
        """Deux retries du même nouveau cycle offline ne créent pas de doublon."""
        import uuid

        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        FarmProfileFactory(user=user)
        client_uuid = str(uuid.uuid4())
        cycles_data = [
            {
                'client_uuid': client_uuid,
                'cycle_name': 'Cycle offline retry',
                'species': 'tilapia',
                'pond_identifier': 'Bassin A',
                'pond_surface_m2': '20.00',
                'start_date': date.today().isoformat(),
                'initial_count': 200,
                'initial_average_weight': '10.00',
            }
        ]

        result1 = SyncService.sync_new_cycles(user, cycles_data)
        result2 = SyncService.sync_new_cycles(user, cycles_data)

        assert result1['errors'] == []
        assert result1['created'] == 1
        assert result2['created'] == 0
        assert result2['updated'] == 1

    def test_sync_new_cycles_rejects_client_uuid_from_another_user(self):
        """Un client_uuid de cycle appartenant à un autre utilisateur est rejeté."""
        import uuid

        from tests.fixtures.factories import FarmProfileFactory

        user1 = UserFactory()
        user2 = UserFactory()
        farm1 = FarmProfileFactory(user=user1)
        FarmProfileFactory(user=user2)
        client_uuid = str(uuid.uuid4())

        ProductionCycleFactory(farm_profile=farm1, client_uuid=client_uuid)

        result = SyncService.sync_new_cycles(user2, [
            {
                'client_uuid': client_uuid,
                'cycle_name': 'Cycle conflict',
                'species': 'tilapia',
                'pond_identifier': 'Bassin B',
                'pond_surface_m2': '20.00',
                'start_date': date.today().isoformat(),
                'initial_count': 200,
                'initial_average_weight': '10.00',
            }
        ])

        assert result['created'] == 0
        assert len(result['errors']) == 1
        assert 'autre utilisateur' in result['errors'][0]['error']


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

    def test_sync_cycle_logs_allows_same_day_logs_for_different_units(self):
        """Le sync doit conserver deux logs unitaires distincts le même jour."""
        import uuid

        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            start_date=date.today() - timedelta(days=10),
        )
        allocation_1 = create_cycle_unit_allocation(cycle, 'Bac 1')
        allocation_2 = create_cycle_unit_allocation(cycle, 'Bac 2')

        logs_data = [
            {
                'client_uuid': str(uuid.uuid4()),
                'cycle': str(cycle.id),
                'cycle_unit_allocation': str(allocation_1.id),
                'log_date': date.today(),
                'mortality_count': 2,
            },
            {
                'client_uuid': str(uuid.uuid4()),
                'cycle': str(cycle.id),
                'cycle_unit_allocation': str(allocation_2.id),
                'log_date': date.today(),
                'mortality_count': 3,
            },
        ]

        result = SyncService.sync_cycle_logs(user, logs_data)

        assert result['created'] == 2
        assert len(result['errors']) == 0
        assert CycleLog.objects.filter(cycle=cycle, log_date=date.today()).count() == 2

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
        import uuid

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
                'client_uuid': str(uuid.uuid4()),
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

    def test_sync_sanitary_logs_deduplicates_by_client_uuid(self):
        """Deux retries du même log sanitaire offline ne créent pas de doublon."""
        import uuid

        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            start_date=date.today() - timedelta(days=10),
        )
        client_uuid = str(uuid.uuid4())

        logs_data = [
            {
                'client_uuid': client_uuid,
                'cycle': str(cycle.id),
                'event_date': date.today(),
                'event_type': 'treatment',
                'symptoms': 'Traitement préventif observé sur plusieurs poissons.',
            },
            {
                'client_uuid': client_uuid,
                'cycle': str(cycle.id),
                'event_date': date.today(),
                'event_type': 'treatment',
                'symptoms': 'Retry du traitement préventif depuis le mobile.',
            },
        ]

        result = SyncService.sync_sanitary_logs(user, logs_data)

        assert result['created'] == 1
        assert result['updated'] == 1
        assert len(result['errors']) == 0
        assert SanitaryLog.objects.filter(client_uuid=client_uuid).count() == 1

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

    def test_sync_sanitary_logs_keeps_cycle_unit_allocation(self):
        """Le sync sanitaire doit persister l'allocation d'unité."""
        import uuid

        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            start_date=date.today() - timedelta(days=10),
        )
        allocation = create_cycle_unit_allocation(cycle, 'Bac 1')

        logs_data = [
            {
                'client_uuid': str(uuid.uuid4()),
                'cycle': str(cycle.id),
                'cycle_unit_allocation': str(allocation.id),
                'event_date': date.today(),
                'event_type': 'treatment',
                'symptoms': 'Observation de comportement atypique chez plusieurs spécimens.',
            }
        ]

        result = SyncService.sync_sanitary_logs(user, logs_data)

        assert result['created'] == 1
        assert len(result['errors']) == 0
        created_log = SanitaryLog.objects.get(cycle=cycle)
        assert created_log.cycle_unit_allocation_id == allocation.id

    def test_full_sync_orders_calibration_before_final_harvest_and_replays(self):
        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        day = timezone.localdate() - timedelta(days=1)
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            start_date=day - timedelta(days=10),
            initial_count=500,
            current_count=500,
            initial_average_weight=Decimal('100.00'),
            current_average_weight=Decimal('100.00'),
            initial_biomass=Decimal('50.00'),
            current_biomass=Decimal('50.00'),
            status='active',
        )
        source = create_cycle_unit_allocation(cycle, 'Source sync récolte')
        source.initial_fish_count = 500
        source.current_fish_count = 500
        source.initial_biomass_kg = Decimal('50.00')
        source.current_biomass_kg = Decimal('50.00')
        source.save()
        tank = ProductionUnit.objects.create(
            farm_profile=farm,
            name='Bac sync récolte',
            unit_type='tank',
            purpose=ProductionUnit.PURPOSE_CALIBRATION,
            volume_m3=Decimal('5.00'),
        )
        calibration_uuid = uuid4()
        harvest_uuid = uuid4()
        calibration_at = timezone.make_aware(
            datetime.combine(day, time.min)
        ) + timedelta(hours=12)
        harvest_at = calibration_at + timedelta(hours=6)
        sync_data = {
            'calibration_operations': [{
                'client_uuid': str(calibration_uuid),
                'source_allocation_id': str(source.id),
                'destination_production_unit_id': str(tank.id),
                'calibrated_at': calibration_at.isoformat(),
                'transferred_count': 100,
                'transferred_average_weight_g': '100.00',
                'created_offline': True,
            }],
            'final_harvests': [{
                'client_uuid': str(harvest_uuid),
                'allocation_id': str(source.id),
                'harvest_date': day.isoformat(),
                'final_harvested_at': harvest_at.isoformat(),
                'final_count': 400,
                'final_average_weight': '300.00',
                'total_harvested_weight': '120.00',
                'created_offline': True,
            }],
        }

        first = SyncService.perform_full_sync(user, sync_data)
        replay = SyncService.perform_full_sync(user, sync_data)

        operation = FinalHarvestOperation.objects.get(client_uuid=harvest_uuid)
        assert first['status'] == 'success'
        assert replay['status'] == 'success'
        assert first['processed']['calibration_operations'] == 1
        assert first['processed']['final_harvests'] == 1
        assert replay['processed']['calibration_operations'] == 1
        assert replay['processed']['final_harvests'] == 1
        assert operation.reconciliation_status == FinalHarvestOperation.STATUS_RECONCILED
        assert operation.computed_count_before_harvest == 400
        assert FinalHarvestOperation.objects.count() == 1

    def test_delta_sync_exposes_pending_harvest_reconciliation_update(self):
        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        day = timezone.localdate() - timedelta(days=1)
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            start_date=day - timedelta(days=10),
            initial_count=500,
            current_count=500,
            initial_average_weight=Decimal('100.00'),
            current_average_weight=Decimal('100.00'),
            initial_biomass=Decimal('50.00'),
            current_biomass=Decimal('50.00'),
            status='active',
        )
        source = create_cycle_unit_allocation(cycle, 'Source delta récolte')
        source.initial_fish_count = 500
        source.current_fish_count = 500
        source.initial_biomass_kg = Decimal('50.00')
        source.current_biomass_kg = Decimal('50.00')
        source.save()
        tank = ProductionUnit.objects.create(
            farm_profile=farm,
            name='Bac delta récolte',
            unit_type='tank',
            purpose=ProductionUnit.PURPOSE_CALIBRATION,
            volume_m3=Decimal('5.00'),
        )
        harvest_at = timezone.now() - timedelta(hours=1)
        _cycle, _allocation, operation, _created = (
            ProductionCycleService.harvest_cycle_unit_allocation(
                source,
                harvest_date=timezone.localdate(harvest_at),
                final_harvested_at=harvest_at,
                final_count=400,
                final_average_weight=Decimal('300.00'),
                client_uuid=uuid4(),
                created_offline=True,
                allow_pending_reconciliation=True,
            )
        )
        assert operation.reconciliation_status == FinalHarvestOperation.STATUS_PENDING
        since = timezone.now()
        CalibrationService.calibrate(
            source_allocation=source,
            destination_production_unit=tank,
            user=user,
            client_uuid=uuid4(),
            calibrated_at=harvest_at - timedelta(minutes=30),
            transferred_count=100,
            transferred_average_weight_g=Decimal('100.00'),
            created_offline=True,
        )

        updates = SyncService.get_server_updates(
            user,
            last_sync=since.isoformat(),
            include_calibration=True,
        )

        assert len(updates['final_harvests']) == 1
        assert updates['final_harvests'][0]['reconciliation_status'] == 'reconciled'

    def test_full_sync_rejects_calibration_exactly_at_final_harvest(self):
        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        day = timezone.localdate() - timedelta(days=1)
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            start_date=day - timedelta(days=10),
            initial_count=500,
            current_count=500,
            initial_average_weight=Decimal('100.00'),
            current_average_weight=Decimal('100.00'),
            initial_biomass=Decimal('50.00'),
            current_biomass=Decimal('50.00'),
            status='active',
        )
        source = create_cycle_unit_allocation(cycle, 'Source borne récolte')
        tank = ProductionUnit.objects.create(
            farm_profile=farm,
            name='Bac borne récolte',
            unit_type='tank',
            purpose=ProductionUnit.PURPOSE_CALIBRATION,
            volume_m3=Decimal('5.00'),
        )
        harvested_at = timezone.make_aware(datetime.combine(day, time(hour=18)))

        result = SyncService.perform_full_sync(user, {
            'calibration_operations': [{
                'client_uuid': str(uuid4()),
                'source_allocation_id': str(source.id),
                'destination_production_unit_id': str(tank.id),
                'calibrated_at': harvested_at.isoformat(),
                'transferred_count': 100,
                'transferred_average_weight_g': '100.00',
                'created_offline': True,
            }],
            'final_harvests': [{
                'client_uuid': str(uuid4()),
                'allocation_id': str(source.id),
                'harvest_date': day.isoformat(),
                'final_harvested_at': harvested_at.isoformat(),
                'final_count': 400,
                'final_average_weight': '300.00',
                'total_harvested_weight': '120.00',
                'created_offline': True,
            }],
        })

        operation = FinalHarvestOperation.objects.get(allocation=source)
        assert result['status'] == 'partial_success'
        assert result['processed']['final_harvests'] == 1
        assert result['processed']['calibration_operations'] == 0
        assert operation.reconciliation_status == FinalHarvestOperation.STATUS_PENDING
        assert source.calibration_operations_out.count() == 0

    def test_full_sync_rejects_naive_datetime_without_losing_valid_items(self):
        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        day = timezone.localdate() - timedelta(days=1)
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            start_date=day - timedelta(days=10),
            initial_count=500,
            current_count=500,
            initial_average_weight=Decimal('100.00'),
            current_average_weight=Decimal('100.00'),
            initial_biomass=Decimal('50.00'),
            current_biomass=Decimal('50.00'),
            status='active',
        )
        source = create_cycle_unit_allocation(cycle, 'Source datetime sync')
        harvested_at = timezone.make_aware(datetime.combine(day, time(hour=18)))

        result = SyncService.perform_full_sync(user, {
            'calibration_operations': [{
                'client_uuid': str(uuid4()),
                'calibrated_at': f'{day.isoformat()}T12:00:00',
            }],
            'final_harvests': [{
                'client_uuid': str(uuid4()),
                'allocation_id': str(source.id),
                'harvest_date': day.isoformat(),
                'final_harvested_at': harvested_at.isoformat(),
                'final_count': 500,
                'final_average_weight': '300.00',
                'total_harvested_weight': '150.00',
                'created_offline': True,
            }],
        })

        assert result['status'] == 'partial_success'
        assert result['processed']['final_harvests'] == 1
        assert result['errors'][0]['code'] == 'invalid_calibration_operation'
        assert FinalHarvestOperation.objects.filter(allocation=source).count() == 1

    def test_global_harvest_child_operation_references_are_exposed_and_idempotent(self):
        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        day = timezone.localdate() - timedelta(days=1)
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            start_date=day - timedelta(days=10),
            initial_count=1000,
            current_count=1000,
            initial_average_weight=Decimal('100.00'),
            current_average_weight=Decimal('100.00'),
            initial_biomass=Decimal('100.00'),
            current_biomass=Decimal('100.00'),
            status='active',
        )
        allocations = [
            create_cycle_unit_allocation(cycle, 'Cycle scope harvest 1'),
            create_cycle_unit_allocation(cycle, 'Cycle scope harvest 2'),
        ]
        client_uuid = uuid4()
        harvested_at = timezone.make_aware(datetime.combine(day, time(hour=18)))
        payload = {
            'final_harvests': [{
                'client_uuid': str(client_uuid),
                'cycle_id': str(cycle.id),
                'harvest_date': day.isoformat(),
                'final_harvested_at': harvested_at.isoformat(),
                'final_count': 1000,
                'final_average_weight': '300.00',
                'total_harvested_weight': '300.00',
                'created_offline': True,
            }],
        }

        first = SyncService.perform_full_sync(user, payload)
        replay = SyncService.perform_full_sync(user, payload)

        operations = list(FinalHarvestOperation.objects.order_by('allocation_id'))
        assert first['status'] == 'success'
        assert first['accepted']['final_harvests'] == [str(client_uuid)]
        assert first['items'][0]['reconciliation_status'] == 'reconciled'
        assert set(first['items'][0]['operation_ids']) == {
            str(operation.id) for operation in operations
        }
        assert set(first['items'][0]['operation_client_uuids']) == {
            str(operation.client_uuid) for operation in operations
        }
        assert replay['status'] == 'success'
        assert replay['processed']['final_harvests'] == 1
        assert replay['accepted']['final_harvests'] == [str(client_uuid)]
        assert FinalHarvestOperation.objects.filter(allocation__in=allocations).count() == 2
        assert all(
            operation.reconciliation_status == FinalHarvestOperation.STATUS_RECONCILED
            for operation in operations
        )

    def test_full_sync_partial_success_confirms_all_accepted_collections(self):
        """Un échec isolé ne remet pas les cinq commandes valides en file."""
        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        day = timezone.localdate() - timedelta(days=1)
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            start_date=day - timedelta(days=10),
            initial_count=500,
            current_count=500,
            initial_average_weight=Decimal('100.00'),
            current_average_weight=Decimal('100.00'),
            initial_biomass=Decimal('50.00'),
            current_biomass=Decimal('50.00'),
            status='active',
        )
        allocation = create_cycle_unit_allocation(cycle, 'Récolte partial success')
        uuids = {
            key: uuid4()
            for key in ('cycle', 'log', 'sanitary', 'tank', 'calibration', 'harvest')
        }
        harvested_at = timezone.make_aware(datetime.combine(day, time(hour=18)))

        result = SyncService.perform_full_sync(user, {
            'new_cycles': [{
                'client_uuid': str(uuids['cycle']),
                'cycle_name': 'Cycle accepté en lot',
                'species': 'tilapia',
                'pond_identifier': 'Bassin accepted',
                'pond_surface_m2': '20.00',
                'start_date': day.isoformat(),
                'initial_count': 200,
                'initial_average_weight': '10.00',
            }],
            'cycle_logs': [{
                'client_uuid': str(uuids['log']),
                'cycle': str(cycle.id),
                'log_date': day.isoformat(),
                'mortality_count': 0,
            }],
            'sanitary_logs': [{
                'client_uuid': str(uuids['sanitary']),
                'cycle': str(cycle.id),
                'event_date': day.isoformat(),
                'event_type': 'treatment',
                'symptoms': 'Observation préventive suffisamment détaillée.',
            }],
            'calibration_tanks': [{
                'client_uuid': str(uuids['tank']),
                'name': 'Bac accepted partial',
                'volume_m3': '5.00',
            }],
            'calibration_operations': [{
                'client_uuid': str(uuids['calibration']),
                'source_allocation_id': str(uuid4()),
                'destination_production_unit_id': str(uuid4()),
                'calibrated_at': (harvested_at - timedelta(hours=1)).isoformat(),
                'transferred_count': 10,
            }],
            'final_harvests': [{
                'client_uuid': str(uuids['harvest']),
                'allocation_id': str(allocation.id),
                'harvest_date': day.isoformat(),
                'final_harvested_at': harvested_at.isoformat(),
                'final_count': 500,
                'final_average_weight': '300.00',
                'total_harvested_weight': '150.00',
                'created_offline': True,
            }],
        })

        assert result['status'] == 'partial_success'
        assert result['accepted'] == {
            'cycles': [str(uuids['cycle'])],
            'cycle_logs': [str(uuids['log'])],
            'sanitary_logs': [str(uuids['sanitary'])],
            'calibration_tanks': [str(uuids['tank'])],
            'calibration_operations': [],
            'final_harvests': [str(uuids['harvest'])],
        }
        assert result['processed'] == {
            'cycles': 1,
            'cycle_logs': 1,
            'cycle_logs_updated': 0,
            'sanitary_logs': 1,
            'calibration_tanks': 1,
            'calibration_operations': 0,
            'final_harvests': 1,
        }
        assert {item['client_uuid'] for item in result['items']} == {
            str(uuids[key]) for key in ('cycle', 'log', 'sanitary', 'tank', 'harvest')
        }
        assert result['errors'][0]['client_uuid'] == str(uuids['calibration'])

    def test_full_sync_does_not_accept_failed_items(self):
        sync_result = SyncService._build_full_sync_response({})
        SyncService._record_full_sync_accept(
            sync_result,
            accepted_key='cycle_logs',
            item_type='cycle_log',
            client_uuid=None,
        )

        assert sync_result['accepted']['cycle_logs'] == []
        assert sync_result['items'] == []

    def test_full_sync_partial_success_lists_only_accepted_business_items(self):
        from tests.fixtures.factories import FarmProfileFactory

        user = UserFactory()
        farm = FarmProfileFactory(user=user)
        day = timezone.localdate() - timedelta(days=1)
        cycle = ProductionCycleFactory(
            farm_profile=farm,
            start_date=day - timedelta(days=10),
            initial_count=500,
            current_count=500,
            initial_average_weight=Decimal('100.00'),
            current_average_weight=Decimal('100.00'),
            initial_biomass=Decimal('50.00'),
            current_biomass=Decimal('50.00'),
            status='active',
        )
        create_cycle_unit_allocation(cycle, 'Partial success harvest')
        harvest_uuid = uuid4()
        calibration_uuid = uuid4()
        harvested_at = timezone.make_aware(datetime.combine(day, time(hour=18)))

        result = SyncService.perform_full_sync(user, {
            'calibration_operations': [{
                'client_uuid': str(calibration_uuid),
                'source_allocation_id': str(uuid4()),
                'destination_production_unit_id': str(uuid4()),
                'calibrated_at': (harvested_at - timedelta(hours=1)).isoformat(),
                'transferred_count': 10,
                'transferred_average_weight_g': '100.00',
                'created_offline': True,
            }],
            'final_harvests': [{
                'client_uuid': str(harvest_uuid),
                'cycle_id': str(cycle.id),
                'harvest_date': day.isoformat(),
                'final_harvested_at': harvested_at.isoformat(),
                'final_count': 500,
                'final_average_weight': '300.00',
                'total_harvested_weight': '150.00',
                'created_offline': True,
            }],
        })

        assert result['status'] == 'partial_success'
        assert result['accepted']['final_harvests'] == [str(harvest_uuid)]
        assert result['accepted']['calibration_operations'] == []
        assert result['processed']['final_harvests'] == 1
        assert result['processed']['calibration_operations'] == 0
        assert result['errors'][0]['client_uuid'] == str(calibration_uuid)
