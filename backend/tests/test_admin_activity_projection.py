"""Contract tests for the Lot 2A persistent admin activity projection."""

from __future__ import annotations

import json
import logging
from dataclasses import FrozenInstanceError, replace
from datetime import date, timedelta
from decimal import Decimal
from io import StringIO
from types import SimpleNamespace
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from aquaculture.domain.sanitary_severity import sanitary_severity
from aquaculture.models import (
    CycleLog,
    CycleUnitAllocation,
    ProductionCycle,
    ProductionReport,
    ProductionUnit,
    SanitaryLog,
)
from aquaculture.services.admin_activity_projection_service import (
    build_production_cycle_created_command,
    build_production_report_generated_command,
    build_production_unit_created_command,
    build_sanitary_log_command,
)
from aquaculture.services.calibration_service import CalibrationService
from aquaculture.services.cycle_service import ProductionCycleService
from aquaculture.services.log_service import CycleLogService
from aquaculture.services.production_unit_service import ProductionUnitLifecycleService
from aquaculture.services.report_service import ReportService
from aquaculture.services.sanitary_service import SanitaryService
from aquaculture.services.sync_service import SyncService
from chat.services.message_service import MessageService
from commerce.models import Product
from commerce.services.admin_activity_projection_service import (
    build_order_activity_command,
)
from commerce.services.order_service import OrderService
from common.admin_activity_registry import ADMIN_ACTIVITY_REGISTRY
from common.models import AdminActivityEvent
from common.services.admin_activity_projection_service import (
    ADMIN_ACTIVITY_DEDUPE_VERSION,
    AdminActivityCollisionError,
    AdminActivityProjectionCommand,
    AdminActivityProjectionError,
    _project_with_observability,
    project_admin_activity,
    schedule_admin_activity_projection,
)
from django.core.management import CommandError, call_command
from django.db import IntegrityError, models, transaction
from django.urls import reverse
from django.utils import timezone


def _unit_command(
    *,
    source_object_id=None,
    render_context=None,
    origin='live',
) -> AdminActivityProjectionCommand:
    return AdminActivityProjectionCommand(
        event_type='aquaculture.production_unit.created',
        domain='aquaculture',
        level='info',
        source_app_label='aquaculture',
        source_model='productionunit',
        source_object_id=source_object_id or uuid4(),
        occurred_at=timezone.now(),
        render_context=render_context or {},
        origin=origin,
    )


def _create_cycle(farm_profile, *, name='Cycle projection') -> ProductionCycle:
    return ProductionCycle.objects.create(
        farm_profile=farm_profile,
        cycle_name=name,
        species='clarias',
        pond_identifier='Bassin projection',
        pond_surface_m2=Decimal('100'),
        pond_volume_m3=Decimal('200'),
        start_date=timezone.localdate() - timedelta(days=30),
        initial_count=1000,
        initial_average_weight=Decimal('10'),
        initial_biomass=Decimal('10.00'),
        current_count=1000,
        current_average_weight=Decimal('10'),
        current_biomass=Decimal('10.00'),
        status='active',
    )


def _create_allocation(
    cycle: ProductionCycle,
    *,
    name='Bac allocation projection',
    average_weight=Decimal('100.00'),
) -> CycleUnitAllocation:
    unit = ProductionUnit.objects.create(
        farm_profile=cycle.farm_profile,
        name=name,
        unit_type='tank',
        volume_m3=Decimal('10.00'),
    )
    cycle.initial_average_weight = average_weight
    cycle.current_average_weight = average_weight
    cycle.initial_biomass = average_weight
    cycle.current_biomass = average_weight
    cycle.save(
        update_fields=[
            'initial_average_weight',
            'current_average_weight',
            'initial_biomass',
            'current_biomass',
            'updated_at',
        ]
    )
    return CycleUnitAllocation.objects.create(
        cycle=cycle,
        production_unit=unit,
        initial_fish_count=1000,
        current_fish_count=1000,
        initial_biomass_kg=average_weight,
        current_biomass_kg=average_weight,
    )


def _launch_payload() -> dict[str, object]:
    return {
        'launch_uuid': str(uuid4()),
        'launch_kind': 'initial_setup',
        'production_plan': {
            'annual_production_target_kg': '1000.00',
            'num_cycles_per_year': 2,
            'fingerlings_cost_per_unit_fcfa': '50.00',
            'planned_selling_price_per_kg_fcfa': '2000.00',
        },
        'cycle': {
            'species': 'clarias',
            'start_date': timezone.localdate().isoformat(),
            'initial_count': 100,
            'initial_average_weight': '10.00',
            'target_harvest_weight_g': '400.00',
            'planned_cycle_duration_days': 150,
            'expected_survival_rate_pct': '95.00',
            'planned_selling_price_per_kg_fcfa': '2000.00',
            'fingerlings_cost_fcfa': '5000.00',
            'other_operational_costs_fcfa': '1000.00',
            'planned_feed_bags': 2,
            'created_offline': False,
        },
        'production_units': [
            {
                'local_id': 'unit-lot-2a',
                'source': 'new',
                'name': 'Bac launch Lot 2A',
                'unit_type': 'tank',
                'volume_m3': '10.00',
            }
        ],
        'allocations': [
            {
                'production_unit_local_id': 'unit-lot-2a',
                'fish_count': 100,
            }
        ],
    }


@pytest.mark.django_db
class TestAdminActivityProjection:
    def test_registry_is_closed_over_the_fifteen_lot_2a_events(self):
        assert len(ADMIN_ACTIVITY_REGISTRY) == 15
        assert set(ADMIN_ACTIVITY_REGISTRY) == set(AdminActivityEvent.EventType.values)
        assert set(ADMIN_ACTIVITY_REGISTRY) == {
            'aquaculture.production_unit.created',
            'aquaculture.production_cycle.created',
            'aquaculture.cycle_log.received',
            'aquaculture.sanitary_log.created',
            'aquaculture.sanitary_log.resolved',
            'aquaculture.calibration.completed',
            'aquaculture.final_harvest.completed',
            'aquaculture.production_report.generated',
            'aquaculture.report_dispatch.succeeded',
            'aquaculture.report_dispatch.failed',
            'commerce.order.created',
            'commerce.order.delivered',
            'commerce.order.ready_for_pickup',
            'commerce.order.received',
            'support.user_message.received',
        }

    def test_projection_is_idempotent_and_uses_a_monotone_server_identifier(self):
        first_command = _unit_command()
        first, first_created = project_admin_activity(first_command)
        replay, replay_created = project_admin_activity(first_command)
        second, _ = project_admin_activity(_unit_command())

        assert first_created is True
        assert replay_created is False
        assert replay.pk == first.pk
        assert second.pk > first.pk
        assert isinstance(first.pk, int)
        assert isinstance(AdminActivityEvent._meta.pk, models.BigAutoField)

    def test_backfill_flag_is_cleared_when_the_live_event_wins_the_race(self):
        source_object_id = uuid4()
        backfill_command = _unit_command(
            source_object_id=source_object_id,
            origin='backfill',
        )
        event, _ = project_admin_activity(backfill_command)
        assert event.is_backfilled is True

        live_command = AdminActivityProjectionCommand(
            **{
                field: getattr(backfill_command, field)
                for field in (
                    'event_type',
                    'domain',
                    'level',
                    'source_app_label',
                    'source_model',
                    'source_object_id',
                    'occurred_on',
                    'occurred_at',
                    'source_recorded_at',
                    'farm_profile_id',
                    'production_cycle_id',
                    'production_unit_id',
                    'render_context',
                    'render_version',
                )
            },
            origin='live',
        )
        replay, created = project_admin_activity(live_command)

        assert created is False
        assert replay.is_backfilled is False

    def test_render_snapshot_change_is_not_an_identity_collision(self):
        source_object_id = uuid4()
        original, _ = project_admin_activity(
            command := _unit_command(
                source_object_id=source_object_id,
                render_context={'unit_name': 'Ferme A'},
            )
        )

        replay, created = project_admin_activity(
            replace(command, render_context={'unit_name': 'Ferme B'})
        )

        assert created is False
        assert replay.pk == original.pk
        assert replay.render_context == {'unit_name': 'Ferme A'}

    def test_collision_rejects_incompatible_immutable_content(self):
        command = _unit_command()
        project_admin_activity(command)

        with pytest.raises(AdminActivityCollisionError, match='occurred_at'):
            project_admin_activity(
                replace(command, occurred_at=command.occurred_at + timedelta(seconds=1))
            )

    def test_collision_rejects_two_incompatible_known_source_timestamps(self):
        command = replace(_unit_command(), source_recorded_at=timezone.now())
        project_admin_activity(command)

        with pytest.raises(AdminActivityCollisionError, match='source_recorded_at'):
            project_admin_activity(
                replace(
                    command,
                    source_recorded_at=command.source_recorded_at + timedelta(seconds=1),
                )
            )

    def test_dedupe_version_is_independent_from_render_version(self):
        command = _unit_command()

        assert ADMIN_ACTIVITY_DEDUPE_VERSION == 1
        assert replace(command, render_version=2).dedupe_key == command.dedupe_key

    def test_unique_dedupe_key_is_enforced_by_the_database(self):
        command = _unit_command()
        event, _ = project_admin_activity(command)

        with pytest.raises(IntegrityError), transaction.atomic():
            AdminActivityEvent.objects.create(
                event_type=event.event_type,
                domain=event.domain,
                level=event.level,
                source_app_label=event.source_app_label,
                source_model=event.source_model,
                source_object_id=uuid4(),
                occurred_at=timezone.now(),
                dedupe_key=event.dedupe_key,
            )

    @pytest.mark.parametrize(
        'changes',
        (
            {'event_type': 'unknown.event'},
            {'domain': 'commerce'},
            {'source_model': 'wrongmodel'},
            {'source_object_id': SimpleNamespace(id=uuid4())},
            {'occurred_on': date.today()},
            {'render_context': {'message': 'private content'}},
            {'render_context': {'unknown': 'value'}},
        ),
    )
    def test_invalid_or_sensitive_commands_are_rejected(self, changes):
        values = {
            'event_type': 'aquaculture.production_unit.created',
            'domain': 'aquaculture',
            'level': 'info',
            'source_app_label': 'aquaculture',
            'source_model': 'productionunit',
            'source_object_id': uuid4(),
            'occurred_at': timezone.now(),
            'render_context': {},
        }
        values.update(changes)

        with pytest.raises(AdminActivityProjectionError):
            project_admin_activity(AdminActivityProjectionCommand(**values))

    def test_command_and_nested_context_are_immutable(self):
        command = _unit_command(render_context={'unit_name': 'Bac A'})

        with pytest.raises(FrozenInstanceError):
            command.level = 'critical'
        with pytest.raises(TypeError):
            command.render_context['unit_name'] = 'Bac B'

    def test_database_enforces_exactly_one_business_occurrence(self):
        command = _unit_command()
        with pytest.raises(IntegrityError), transaction.atomic():
            AdminActivityEvent.objects.create(
                event_type=command.event_type,
                domain=command.domain,
                level=command.level,
                source_app_label=command.source_app_label,
                source_model=command.source_model,
                source_object_id=command.source_object_id,
                occurred_on=date.today(),
                occurred_at=command.occurred_at,
                dedupe_key=command.dedupe_key,
            )

    def test_source_foreign_keys_are_set_null_without_deleting_the_event(
        self,
        farm_profile,
    ):
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac projection',
            unit_type='tank',
            volume_m3='10.00',
        )
        command = _unit_command()
        command = AdminActivityProjectionCommand(
            **{
                field: getattr(command, field)
                for field in (
                    'event_type',
                    'domain',
                    'level',
                    'source_app_label',
                    'source_model',
                    'source_object_id',
                    'occurred_at',
                )
            },
            farm_profile_id=farm_profile.id,
            production_unit_id=unit.id,
        )
        event, _ = project_admin_activity(command)

        unit.delete()
        event.refresh_from_db()

        assert event.production_unit_id is None
        assert event.farm_profile_id == farm_profile.id

    def test_schedule_uses_a_robust_on_commit_callback(self):
        command = _unit_command()
        with patch(
            'common.services.admin_activity_projection_service.transaction.on_commit'
        ) as on_commit:
            schedule_admin_activity_projection(command)

        assert on_commit.call_count == 1
        assert on_commit.call_args.kwargs == {'robust': True}

    def test_rolled_back_business_transaction_discards_projection(
        self,
        django_capture_on_commit_callbacks,
    ):
        command = _unit_command()
        with django_capture_on_commit_callbacks(execute=True):
            with pytest.raises(RuntimeError), transaction.atomic():
                schedule_admin_activity_projection(command)
                raise RuntimeError('rollback business write')

        assert AdminActivityEvent.objects.count() == 0

    def test_projection_failure_is_logged_without_render_context(self, caplog):
        command = _unit_command(render_context={'unit_name': 'Safe name'})
        with (
            patch(
                'common.services.admin_activity_projection_service.project_admin_activity',
                side_effect=RuntimeError('database unavailable'),
            ),
            caplog.at_level(logging.ERROR, logger='common.admin_activity'),
        ):
            _project_with_observability(command)

        record = caplog.records[-1]
        assert record.event == 'admin_activity.projection.failed'
        assert record.event_type == command.event_type
        assert record.exception_class == 'RuntimeError'
        assert not hasattr(record, 'render_context')


@pytest.mark.django_db(transaction=True)
class TestAdminActivityProjectionResilience:
    def test_preparation_failure_never_rolls_back_business_mutation(
        self,
        farm_profile,
        caplog,
    ):
        with (
            patch(
                'aquaculture.services.admin_activity_projection_service.'
                'build_production_unit_created_command',
                side_effect=RuntimeError('SECRET_SUPPORT_MESSAGE'),
            ),
            caplog.at_level(logging.ERROR, logger='common.admin_activity'),
            transaction.atomic(),
        ):
            unit = ProductionUnit.objects.create(
                farm_profile=farm_profile,
                name='Bac métier conservé',
                unit_type='tank',
                volume_m3='10.00',
            )
            ProductionUnitLifecycleService.record_created(unit)

        assert ProductionUnit.objects.filter(pk=unit.pk).exists()
        assert not AdminActivityEvent.objects.filter(source_object_id=unit.pk).exists()
        record = caplog.records[-1]
        assert record.event == 'admin_activity.projection.failed'
        assert record.exception_class == 'RuntimeError'
        assert 'SECRET_SUPPORT_MESSAGE' not in caplog.text

    def test_projector_database_failure_after_commit_keeps_business_mutation(
        self,
        farm_profile,
        caplog,
    ):
        with (
            patch(
                'common.services.admin_activity_projection_service.project_admin_activity',
                side_effect=IntegrityError('database unavailable'),
            ),
            caplog.at_level(logging.ERROR, logger='common.admin_activity'),
            transaction.atomic(),
        ):
            unit = ProductionUnit.objects.create(
                farm_profile=farm_profile,
                name='Bac panne DB projection',
                unit_type='tank',
                volume_m3='10.00',
            )
            ProductionUnitLifecycleService.record_created(unit)

        assert ProductionUnit.objects.filter(pk=unit.pk).exists()
        assert not AdminActivityEvent.objects.filter(source_object_id=unit.pk).exists()
        assert caplog.records[-1].exception_class == 'IntegrityError'

    def test_callback_validation_failure_after_commit_keeps_business_mutation(
        self,
        farm_profile,
        caplog,
    ):
        with (
            patch(
                'common.services.admin_activity_projection_service.'
                'validate_admin_activity_command',
                side_effect=[None, AdminActivityProjectionError('callback invalid')],
            ),
            caplog.at_level(logging.ERROR, logger='common.admin_activity'),
            transaction.atomic(),
        ):
            unit = ProductionUnit.objects.create(
                farm_profile=farm_profile,
                name='Bac validation callback',
                unit_type='tank',
                volume_m3='10.00',
            )
            ProductionUnitLifecycleService.record_created(unit)

        assert ProductionUnit.objects.filter(pk=unit.pk).exists()
        assert not AdminActivityEvent.objects.filter(source_object_id=unit.pk).exists()
        assert caplog.records[-1].exception_class == 'AdminActivityProjectionError'


@pytest.mark.django_db
class TestAdminActivityHooksAndBackfill:
    def test_production_unit_api_and_owner_service_emit_once_each(
        self,
        auth_client,
        farm_profile,
        django_capture_on_commit_callbacks,
    ):
        with django_capture_on_commit_callbacks(execute=True):
            response = auth_client.post(
                reverse('aquaculture:production-unit-list'),
                {
                    'name': 'Bac API Lot 2A',
                    'unit_type': 'tank',
                    'volume_m3': '10.00',
                },
                format='json',
            )
        assert response.status_code == 201, response.data

        service_unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac service propriétaire',
            unit_type='tank',
            volume_m3='11.00',
        )
        with django_capture_on_commit_callbacks(execute=True):
            ProductionUnitLifecycleService.record_created(service_unit)
            ProductionUnitLifecycleService.record_created(service_unit)

        source_ids = {service_unit.pk, UUID(response.data['id'])}
        events = AdminActivityEvent.objects.filter(
            event_type='aquaculture.production_unit.created',
            source_object_id__in=source_ids,
        )
        assert events.count() == 2
        assert events.filter(source_object_id=service_unit.pk).count() == 1

    def test_cycle_launch_and_replay_emit_one_cycle_and_one_unit_event(
        self,
        auth_client,
        django_capture_on_commit_callbacks,
    ):
        payload = _launch_payload()
        url = reverse('aquaculture:production_cycle_launch')
        with django_capture_on_commit_callbacks(execute=True):
            created = auth_client.post(url, payload, format='json')
            replay = auth_client.post(url, payload, format='json')

        assert created.status_code == 201, created.data
        assert replay.status_code == 200, replay.data
        cycle_id = created.data['production_cycle']['id']
        unit_id = created.data['production_units'][0]['id']
        assert AdminActivityEvent.objects.filter(
            event_type='aquaculture.production_cycle.created',
            source_object_id=cycle_id,
        ).count() == 1
        assert AdminActivityEvent.objects.filter(
            event_type='aquaculture.production_unit.created',
            source_object_id=unit_id,
        ).count() == 1

    def test_calibration_tank_sync_replay_emits_one_production_unit_event(
        self,
        authenticated_user,
        farm_profile,
        django_capture_on_commit_callbacks,
    ):
        client_uuid = uuid4()
        payload = {
            'calibration_tanks': [
                {
                    'client_uuid': str(client_uuid),
                    'name': 'Bac sync Lot 2A',
                    'volume_m3': '5.00',
                }
            ]
        }
        with django_capture_on_commit_callbacks(execute=True):
            first = SyncService.perform_full_sync(authenticated_user, payload)
            replay = SyncService.perform_full_sync(authenticated_user, payload)

        unit = ProductionUnit.objects.get(client_uuid=client_uuid)
        assert first['status'] == 'success'
        assert replay['status'] == 'success'
        assert unit.farm_profile_id == farm_profile.pk
        assert AdminActivityEvent.objects.filter(
            event_type='aquaculture.production_unit.created',
            source_object_id=unit.pk,
        ).count() == 1

    def test_standard_cycle_hook_excludes_calibration_cycle(
        self,
        farm_profile,
        django_capture_on_commit_callbacks,
    ):
        base = {
            'species': 'clarias',
            'pond_identifier': 'Bassin service Lot 2A',
            'pond_surface_m2': Decimal('100.00'),
            'start_date': timezone.localdate(),
            'initial_count': 100,
            'initial_average_weight': Decimal('10.00'),
        }
        with django_capture_on_commit_callbacks(execute=True):
            standard = ProductionCycleService.create_cycle(
                farm_profile,
                {**base, 'cycle_name': 'Cycle standard Lot 2A'},
            )
            calibration = ProductionCycleService.create_cycle(
                farm_profile,
                {
                    **base,
                    'cycle_name': 'Cycle calibration Lot 2A',
                    'pond_identifier': 'Bassin calibration Lot 2A',
                    'cycle_kind': ProductionCycle.CYCLE_KIND_CALIBRATION,
                },
            )

        assert AdminActivityEvent.objects.filter(
            event_type='aquaculture.production_cycle.created',
            source_object_id=standard.pk,
        ).count() == 1
        assert not AdminActivityEvent.objects.filter(
            event_type='aquaculture.production_cycle.created',
            source_object_id=calibration.pk,
        ).exists()

    def test_cycle_log_service_replay_emits_exactly_one_event(
        self,
        authenticated_user,
        farm_profile,
        django_capture_on_commit_callbacks,
    ):
        cycle = _create_cycle(farm_profile, name='Cycle log hook')
        client_uuid = uuid4()
        payload = {
            'client_uuid': client_uuid,
            'log_date': timezone.localdate(),
            'mortality_count': 0,
        }
        with django_capture_on_commit_callbacks(execute=True):
            first = CycleLogService.create_log(
                cycle,
                dict(payload),
                created_offline=True,
                user=authenticated_user,
            )
            replay = CycleLogService.create_log(
                cycle,
                dict(payload),
                created_offline=True,
                user=authenticated_user,
            )

        assert replay.pk == first.pk
        assert AdminActivityEvent.objects.filter(
            event_type='aquaculture.cycle_log.received',
            source_object_id=first.pk,
        ).count() == 1

    def test_calibration_and_final_harvest_replays_emit_once(
        self,
        authenticated_user,
        farm_profile,
        django_capture_on_commit_callbacks,
    ):
        calibration_cycle = _create_cycle(farm_profile, name='Cycle calibration hook')
        source = _create_allocation(calibration_cycle, average_weight=Decimal('100.00'))
        tank = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac destination calibration',
            unit_type='tank',
            purpose=ProductionUnit.PURPOSE_CALIBRATION,
            volume_m3=Decimal('10.00'),
        )
        calibration_uuid = uuid4()
        calibrated_at = timezone.now().replace(microsecond=0)
        with django_capture_on_commit_callbacks(execute=True):
            first_calibration, _, created = CalibrationService.calibrate(
                source_allocation=source,
                destination_production_unit=tank,
                user=authenticated_user,
                client_uuid=calibration_uuid,
                calibrated_at=calibrated_at,
                transferred_count=100,
                transferred_average_weight_g=Decimal('100.00'),
            )
            replay_calibration, _, replay_created = CalibrationService.calibrate(
                source_allocation=source,
                destination_production_unit=tank,
                user=authenticated_user,
                client_uuid=calibration_uuid,
                calibrated_at=calibrated_at,
                transferred_count=100,
                transferred_average_weight_g=Decimal('100.00'),
            )

        assert created is True
        assert replay_created is False
        assert replay_calibration.pk == first_calibration.pk
        assert AdminActivityEvent.objects.filter(
            event_type='aquaculture.calibration.completed',
            source_object_id=first_calibration.pk,
        ).count() == 1

        harvest_cycle = _create_cycle(farm_profile, name='Cycle récolte hook')
        allocation = _create_allocation(
            harvest_cycle,
            name='Bac récolte hook',
            average_weight=Decimal('300.00'),
        )
        harvest_uuid = uuid4()
        harvested_at = timezone.now().replace(microsecond=0)
        with django_capture_on_commit_callbacks(execute=True):
            _, _, first_harvest, created = ProductionCycleService.harvest_cycle_unit_allocation(
                allocation,
                harvest_date=timezone.localdate(),
                final_count=1000,
                final_average_weight=Decimal('300.00'),
                final_harvested_at=harvested_at,
                client_uuid=harvest_uuid,
            )
            _, _, replay_harvest, replay_created = ProductionCycleService.harvest_cycle_unit_allocation(
                allocation,
                harvest_date=timezone.localdate(),
                final_count=1000,
                final_average_weight=Decimal('300.00'),
                final_harvested_at=harvested_at,
                client_uuid=harvest_uuid,
            )

        assert created is True
        assert replay_created is False
        assert replay_harvest.pk == first_harvest.pk
        assert AdminActivityEvent.objects.filter(
            event_type='aquaculture.final_harvest.completed',
            source_object_id=first_harvest.pk,
        ).count() == 1

    def test_report_first_generation_regeneration_and_dispatch_hooks(
        self,
        farm_profile,
        django_capture_on_commit_callbacks,
    ):
        period = timezone.localdate() - timedelta(days=1)
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type='daily',
            scope_type='cycle',
            period_start=period,
            period_end=period,
        )
        first_generated_at = timezone.now() - timedelta(minutes=5)
        latest_generated_at = timezone.now()
        with django_capture_on_commit_callbacks(execute=True):
            ReportService._apply_generated_report_content(
                report,
                payload={},
                pdf_bytes=b'%PDF-1.4 first',
                filename='lot-2a-first.pdf',
                generated_at=first_generated_at,
            )
            ReportService._apply_generated_report_content(
                report,
                payload={},
                pdf_bytes=b'%PDF-1.4 regenerated',
                filename='lot-2a-regenerated.pdf',
                generated_at=latest_generated_at,
            )
            succeeded = ReportService._create_dispatch_log(
                report,
                channel='email',
                status='success',
                recipient='secret-recipient@example.test',
            )
            failed = ReportService._create_dispatch_log(
                report,
                channel='email',
                status='failed',
                recipient='secret-recipient@example.test',
                error_code='smtp_unavailable',
            )

        generated = AdminActivityEvent.objects.get(
            event_type='aquaculture.production_report.generated',
            source_object_id=report.pk,
        )
        assert generated.occurred_at == first_generated_at
        assert AdminActivityEvent.objects.filter(
            event_type='aquaculture.report_dispatch.succeeded',
            source_object_id=succeeded.pk,
        ).count() == 1
        assert AdminActivityEvent.objects.filter(
            event_type='aquaculture.report_dispatch.failed',
            source_object_id=failed.pk,
        ).count() == 1

    def test_order_create_and_all_transition_replays_emit_once(
        self,
        authenticated_user,
        farm_profile,
        aquacare_admin,
        django_capture_on_commit_callbacks,
    ):
        authenticated_user.region = 'littoral'
        authenticated_user.department = 'wouri'
        authenticated_user.city = 'Douala'
        authenticated_user.neighborhood = 'Bonamoussadi'
        authenticated_user.save()
        product = Product.objects.create(
            name='Aliment hook Lot 2A',
            brand='dibaq',
            species='tilapia',
            phase='grossissement',
            pellet_size_mm=Decimal('3.0'),
            protein_percentage=Decimal('32.0'),
            lipid_percentage=10,
            package_weight_kg=Decimal('20.0'),
            price_per_package=Decimal('30000.00'),
        )

        home_uuid = uuid4()
        with django_capture_on_commit_callbacks(execute=True):
            home = OrderService.create_order(
                user=authenticated_user,
                items_data=[{'product_id': str(product.pk), 'quantity': 1}],
                delivery_method='home',
                client_uuid=str(home_uuid),
                created_offline=True,
            )
            replay_home = OrderService.create_order(
                user=authenticated_user,
                items_data=[{'product_id': str(product.pk), 'quantity': 1}],
                delivery_method='home',
                client_uuid=str(home_uuid),
                created_offline=True,
            )
            delivered = OrderService.mark_order_ready_for_customer_confirmation(
                home,
                aquacare_admin,
            )
            delivered_replay = OrderService.mark_order_ready_for_customer_confirmation(
                home,
                aquacare_admin,
            )
            received = OrderService.confirm_order_receipt(home, authenticated_user)
            received_replay = OrderService.confirm_order_receipt(home, authenticated_user)

        assert replay_home.pk == home.pk
        assert delivered.transitioned is True
        assert delivered_replay.transitioned is False
        assert received_replay.pk == received.pk
        for event_type in (
            'commerce.order.created',
            'commerce.order.delivered',
            'commerce.order.received',
        ):
            assert AdminActivityEvent.objects.filter(
                event_type=event_type,
                source_object_id=home.pk,
            ).count() == 1

        pickup_uuid = uuid4()
        with django_capture_on_commit_callbacks(execute=True):
            pickup = OrderService.create_order(
                user=authenticated_user,
                items_data=[{'product_id': str(product.pk), 'quantity': 1}],
                delivery_method='pickup',
                pickup_location='ndogpasi',
                client_uuid=str(pickup_uuid),
                created_offline=True,
            )
            ready = OrderService.mark_order_ready_for_customer_confirmation(
                pickup,
                aquacare_admin,
            )
            ready_replay = OrderService.mark_order_ready_for_customer_confirmation(
                pickup,
                aquacare_admin,
            )
            OrderService.confirm_order_receipt(pickup, authenticated_user)

        assert ready.transitioned is True
        assert ready_replay.transitioned is False
        assert AdminActivityEvent.objects.filter(
            event_type='commerce.order.ready_for_pickup',
            source_object_id=pickup.pk,
        ).count() == 1
        assert AdminActivityEvent.objects.filter(
            event_type='commerce.order.received',
            source_object_id=pickup.pk,
        ).count() == 1

    def test_support_admin_and_system_messages_are_excluded(
        self,
        authenticated_user,
        aquacare_admin,
        django_capture_on_commit_callbacks,
    ):
        with django_capture_on_commit_callbacks(execute=True):
            user_message = MessageService.send_user_message(
                authenticated_user,
                'SECRET_SUPPORT_MESSAGE',
                client_uuid=str(uuid4()),
                created_offline=True,
            )
            admin_message = MessageService.send_admin_message(
                user_message.conversation,
                aquacare_admin,
                'Réponse support',
            )
            system_message = MessageService.send_system_message(
                user_message.conversation,
                'Accusé système',
            )

        assert AdminActivityEvent.objects.filter(
            event_type='support.user_message.received',
            source_object_id=user_message.pk,
        ).count() == 1
        assert not AdminActivityEvent.objects.filter(
            source_object_id__in=[admin_message.pk, system_message.pk]
        ).exists()

    def test_real_source_pii_sentinels_never_reach_projection_or_logs(
        self,
        authenticated_user,
        farm_profile,
        django_capture_on_commit_callbacks,
        caplog,
    ):
        sentinels = {
            '+237699999999',
            'pii@example.test',
            'SECRET_ADDRESS_SENTINEL',
            'SECRET_SUPPORT_MESSAGE',
            'SECRET_SYMPTOMS',
            'SECRET_MEDICATION',
            'secret-recipient@example.test',
        }
        authenticated_user.phone_number = '+237699999999'
        authenticated_user.email = 'pii@example.test'
        authenticated_user.region = 'littoral'
        authenticated_user.department = 'wouri'
        authenticated_user.city = 'Douala'
        authenticated_user.neighborhood = 'SECRET_ADDRESS_SENTINEL'
        authenticated_user.save()

        cycle = _create_cycle(farm_profile, name='Cycle confidentialité')
        sanitary = SanitaryLog.objects.create(
            cycle=cycle,
            event_date=timezone.localdate(),
            event_type='treatment',
            symptoms='SECRET_SYMPTOMS',
            medication_used='SECRET_MEDICATION',
        )
        project_admin_activity(
            build_sanitary_log_command(
                sanitary,
                event_type='aquaculture.sanitary_log.created',
            )
        )

        product = Product.objects.create(
            name='Aliment confidentialité',
            brand='dibaq',
            species='tilapia',
            phase='grossissement',
            pellet_size_mm=Decimal('3.0'),
            protein_percentage=Decimal('32.0'),
            lipid_percentage=10,
            package_weight_kg=Decimal('20.0'),
            price_per_package=Decimal('30000.00'),
        )
        period = timezone.localdate()
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type='daily',
            scope_type='cycle',
            scope_object_id=cycle.pk,
            period_start=period,
            period_end=period,
            generated_at=timezone.now(),
        )
        with (
            caplog.at_level(logging.ERROR, logger='common.admin_activity'),
            django_capture_on_commit_callbacks(execute=True),
        ):
            OrderService.create_order(
                user=authenticated_user,
                items_data=[{'product_id': str(product.pk), 'quantity': 1}],
                delivery_method='home',
                client_uuid=str(uuid4()),
                created_offline=True,
            )
            MessageService.send_user_message(
                authenticated_user,
                'SECRET_SUPPORT_MESSAGE',
                client_uuid=str(uuid4()),
                created_offline=True,
            )
            ReportService._create_dispatch_log(
                report,
                channel='email',
                status='failed',
                recipient='secret-recipient@example.test',
                error_code='smtp_unavailable',
            )

        persisted_projection = json.dumps(
            list(AdminActivityEvent.objects.values('render_context', 'dedupe_key')),
            default=str,
        )
        for sentinel in sentinels:
            assert sentinel not in persisted_projection
            assert sentinel not in caplog.text

    def test_live_sanitary_resolution_converges_with_unknown_backfill_timestamp(self):
        source_object_id = uuid4()
        recorded_at = timezone.now()
        live = AdminActivityProjectionCommand(
            event_type='aquaculture.sanitary_log.resolved',
            domain='aquaculture',
            level='info',
            source_app_label='aquaculture',
            source_model='sanitarylog',
            source_object_id=source_object_id,
            occurred_on=timezone.localdate(),
            source_recorded_at=recorded_at,
            render_context={'farm_name': 'Ferme A'},
        )
        event, _ = project_admin_activity(live)

        replay, created = project_admin_activity(
            replace(
                live,
                source_recorded_at=None,
                render_context={'farm_name': 'Ferme B'},
                origin='backfill',
            )
        )

        assert created is False
        assert replay.pk == event.pk
        assert replay.source_recorded_at == recorded_at
        assert replay.render_context == {'farm_name': 'Ferme A'}
        assert AdminActivityEvent.objects.filter(dedupe_key=live.dedupe_key).count() == 1

    def test_renamed_farm_does_not_rewrite_the_persisted_snapshot(
        self,
        farm_profile,
    ):
        farm_profile.farm_name = 'Ferme A'
        farm_profile.save(update_fields=['farm_name'])
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac snapshot',
            unit_type='tank',
            volume_m3='10.00',
        )
        command = build_production_unit_created_command(unit)
        event, _ = project_admin_activity(command)

        farm_profile.farm_name = 'Ferme B'
        farm_profile.save(update_fields=['farm_name'])
        unit.refresh_from_db()
        replay_command = build_production_unit_created_command(unit, origin='repair')
        replay, created = project_admin_activity(replay_command)

        assert command.dedupe_key == replay_command.dedupe_key
        assert created is False
        assert replay.pk == event.pk
        assert replay.render_context['farm_name'] == 'Ferme A'

    def test_repair_clears_backfill_provenance_for_the_same_event(self):
        command = _unit_command(origin='backfill')
        event, _ = project_admin_activity(command)

        replay, created = project_admin_activity(replace(command, origin='repair'))

        assert created is False
        assert replay.pk == event.pk
        assert replay.is_backfilled is False

    def test_live_convergence_enriches_unknown_source_timestamp(self):
        backfill = AdminActivityProjectionCommand(
            event_type='aquaculture.sanitary_log.resolved',
            domain='aquaculture',
            level='info',
            source_app_label='aquaculture',
            source_model='sanitarylog',
            source_object_id=uuid4(),
            occurred_on=timezone.localdate(),
            source_recorded_at=None,
            origin='backfill',
        )
        event, _ = project_admin_activity(backfill)
        recorded_at = timezone.now()

        replay, created = project_admin_activity(
            replace(backfill, source_recorded_at=recorded_at, origin='live')
        )

        assert created is False
        assert replay.pk == event.pk
        assert replay.source_recorded_at == recorded_at
        assert replay.is_backfilled is False

    def test_user_message_offline_retry_schedules_only_one_projection(
        self,
        authenticated_user,
        farm_profile,
        django_capture_on_commit_callbacks,
        settings,
    ):
        settings.ADMIN_ACTIVITY_CENTER_ENABLED = False
        client_uuid = uuid4()
        with django_capture_on_commit_callbacks(execute=True):
            first = MessageService.send_user_message(
                authenticated_user,
                'Bonjour support',
                client_uuid=str(client_uuid),
                created_offline=True,
            )
            replay = MessageService.send_user_message(
                authenticated_user,
                'Bonjour support',
                client_uuid=str(client_uuid),
                created_offline=True,
            )

        assert replay.pk == first.pk
        event = AdminActivityEvent.objects.get(
            event_type='support.user_message.received',
            source_object_id=first.id,
        )
        assert event.render_context == {}
        assert event.is_backfilled is False

    def test_sanitary_hook_uses_stable_level_and_deduplicates_retry(
        self,
        authenticated_user,
        farm_profile,
        django_capture_on_commit_callbacks,
    ):
        production_cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name='Cycle sanitaire',
            species='clarias',
            pond_identifier='Bassin sanitaire',
            pond_surface_m2=Decimal('100'),
            pond_volume_m3=Decimal('200'),
            start_date=timezone.localdate() - timedelta(days=30),
            initial_count=1000,
            initial_average_weight=Decimal('10'),
            initial_biomass=Decimal('10.00'),
            current_count=950,
            current_average_weight=Decimal('35'),
            current_biomass=Decimal('33.25'),
            status='active',
        )
        client_uuid = uuid4()
        with django_capture_on_commit_callbacks(execute=True):
            first = SanitaryService.create_or_get_sanitary_log(
                cycle=production_cycle,
                event_date=timezone.localdate(),
                event_type='water_quality',
                symptoms='Qualité eau anormale',
                affected_count=1,
                user=authenticated_user,
                client_uuid=client_uuid,
                created_offline=True,
            )
            replay = SanitaryService.create_or_get_sanitary_log(
                cycle=production_cycle,
                event_date=timezone.localdate(),
                event_type='water_quality',
                symptoms='Qualité eau anormale',
                affected_count=1,
                user=authenticated_user,
                client_uuid=client_uuid,
                created_offline=True,
            )

        assert first.created is True
        assert replay.created is False
        event = AdminActivityEvent.objects.get(
            event_type='aquaculture.sanitary_log.created',
            source_object_id=first.log.id,
        )
        assert event.level == AdminActivityEvent.Level.ATTENTION
        assert 'affected_count' not in event.render_context

        with django_capture_on_commit_callbacks(execute=True):
            resolved = SanitaryService.resolve_sanitary_issue(
                str(first.log.id),
                user=authenticated_user,
                resolution_date=timezone.localdate(),
            )
        resolved_event = AdminActivityEvent.objects.get(
            event_type='aquaculture.sanitary_log.resolved',
            source_object_id=resolved.id,
        )
        assert resolved_event.occurred_on == timezone.localdate()
        assert resolved_event.source_recorded_at is not None

    def test_historical_sanitary_resolution_keeps_unknown_source_timestamp(self):
        farm_id = uuid4()
        cycle_id = uuid4()
        log = SimpleNamespace(
            id=uuid4(),
            event_type='water_quality',
            event_date=date(2026, 1, 1),
            resolution_date=date(2026, 1, 2),
            created_at=timezone.now(),
            cycle_unit_allocation=None,
            cycle_id=cycle_id,
            cycle=SimpleNamespace(
                id=cycle_id,
                cycle_name='Cycle historique',
                farm_profile_id=farm_id,
                farm_profile=SimpleNamespace(
                    id=farm_id,
                    farm_name='Ferme historique',
                ),
            ),
        )

        command = build_sanitary_log_command(
            log,
            event_type='aquaculture.sanitary_log.resolved',
            origin='backfill',
        )

        assert command.occurred_on == date(2026, 1, 2)
        assert command.source_recorded_at is None

        created_command = build_sanitary_log_command(
            log,
            event_type='aquaculture.sanitary_log.created',
            origin='backfill',
        )
        assert created_command.level == AdminActivityEvent.Level.ATTENTION

    def test_cycle_creation_uses_start_date_and_real_server_timestamp(self):
        farm_id = uuid4()
        cycle_id = uuid4()
        created_at = timezone.now()
        start_date = date(2026, 1, 1)
        command = build_production_cycle_created_command(
            SimpleNamespace(
                id=cycle_id,
                cycle_name='Cycle métier',
                start_date=start_date,
                created_at=created_at,
                farm_profile_id=farm_id,
                farm_profile=SimpleNamespace(farm_name='Ferme métier'),
            )
        )

        assert command.occurred_on == start_date
        assert command.occurred_at is None
        assert command.source_recorded_at == created_at

    @pytest.mark.parametrize(
        ('event_type', 'timestamp_field'),
        (
            ('commerce.order.created', 'created_at'),
            ('commerce.order.delivered', 'delivered_at'),
            ('commerce.order.ready_for_pickup', 'ready_for_pickup_at'),
            ('commerce.order.received', 'received_at'),
        ),
    )
    def test_order_transitions_use_their_dedicated_timestamp(
        self,
        event_type,
        timestamp_field,
    ):
        timestamp = timezone.now()
        order = SimpleNamespace(
            id=uuid4(),
            created_at=timestamp,
            delivered_at=timestamp,
            ready_for_pickup_at=timestamp,
            received_at=timestamp,
            farm_profile_id=uuid4(),
            production_cycle_id=None,
            farm_profile=SimpleNamespace(farm_name='Ferme commande'),
            order_number='ORD-TEST',
        )

        command = build_order_activity_command(order, event_type=event_type)

        assert command.occurred_at == getattr(order, timestamp_field)
        assert command.source_recorded_at == getattr(order, timestamp_field)

    def test_sanitary_severity_never_depends_on_mutable_counts(self):
        assert sanitary_severity('disease') == 'critical'
        assert sanitary_severity('abnormal_mortality') == 'critical'
        assert sanitary_severity('water_quality') == 'warning'
        assert sanitary_severity('treatment') == 'info'

    def test_backfill_and_repair_have_distinct_provenance(
        self,
        farm_profile,
    ):
        first_unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac backfill',
            unit_type='tank',
            volume_m3='10.00',
        )
        call_command(
            'backfill_admin_activity_events',
            event_types=['aquaculture.production_unit.created'],
            mode='backfill',
            verbosity=0,
        )
        backfilled = AdminActivityEvent.objects.get(
            source_object_id=first_unit.id
        )
        assert backfilled.is_backfilled is True

        second_unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac repair',
            unit_type='tank',
            volume_m3='11.00',
        )
        call_command(
            'backfill_admin_activity_events',
            event_types=['aquaculture.production_unit.created'],
            mode='repair',
            verbosity=0,
        )
        repaired = AdminActivityEvent.objects.get(
            source_object_id=second_unit.id
        )
        assert repaired.is_backfilled is False
        call_command(
            'backfill_admin_activity_events',
            event_types=['aquaculture.production_unit.created'],
            mode='repair',
            verbosity=0,
        )
        assert AdminActivityEvent.objects.count() == 2

    def test_repair_uses_recent_server_arrival_for_an_old_cycle_log(
        self,
        farm_profile,
    ):
        production_cycle = _create_cycle(farm_profile)
        old_log_date = timezone.localdate() - timedelta(days=365)
        log = CycleLog.objects.create(
            cycle=production_cycle,
            log_date=old_log_date,
            mortality_count=0,
            feed_quantity=Decimal('1.00'),
        )

        call_command(
            'backfill_admin_activity_events',
            event_types=['aquaculture.cycle_log.received'],
            mode='repair',
            since=(timezone.localdate() - timedelta(days=2)).isoformat(),
            until=timezone.localdate().isoformat(),
            verbosity=0,
        )

        event = AdminActivityEvent.objects.get(source_object_id=log.pk)
        assert event.occurred_on == old_log_date
        assert event.source_recorded_at == log.created_at
        assert event.is_backfilled is False

    def test_targeted_repair_reconstructs_sanitary_resolution_by_source_uuid(
        self,
        farm_profile,
    ):
        production_cycle = _create_cycle(farm_profile)
        log = SanitaryLog.objects.create(
            cycle=production_cycle,
            event_date=timezone.localdate() - timedelta(days=10),
            event_type='water_quality',
            symptoms='SECRET_SYMPTOMS',
            medication_used='SECRET_MEDICATION',
            resolved=True,
            resolution_date=timezone.localdate() - timedelta(days=5),
        )

        call_command(
            'backfill_admin_activity_events',
            event_types=['aquaculture.sanitary_log.resolved'],
            source_object_id=str(log.pk),
            mode='repair',
            verbosity=0,
        )

        event = AdminActivityEvent.objects.get(
            event_type='aquaculture.sanitary_log.resolved',
            source_object_id=log.pk,
        )
        assert event.source_recorded_at is None
        assert event.is_backfilled is False

        call_command(
            'backfill_admin_activity_events',
            event_types=['aquaculture.sanitary_log.resolved'],
            source_object_id=str(log.pk),
            mode='repair',
            verbosity=0,
        )
        assert AdminActivityEvent.objects.filter(dedupe_key=event.dedupe_key).count() == 1

    @pytest.mark.parametrize(
        ('event_types', 'source_object_id', 'message'),
        (
            (None, 'b143d157-6bc3-4db3-919c-2c413de045de', 'exactly one'),
            (['aquaculture.sanitary_log.resolved'], 'not-a-uuid', 'valid UUID'),
        ),
    )
    def test_targeted_repair_requires_one_event_type_and_a_valid_uuid(
        self,
        event_types,
        source_object_id,
        message,
    ):
        with pytest.raises(CommandError, match=message):
            call_command(
                'backfill_admin_activity_events',
                event_types=event_types,
                source_object_id=source_object_id,
                mode='repair',
                verbosity=0,
            )

    def test_report_regeneration_preserves_the_first_persisted_snapshot(
        self,
        farm_profile,
    ):
        first_generated_at = timezone.now() - timedelta(days=1)
        report = ProductionReport.objects.create(
            farm_profile=farm_profile,
            report_type='daily',
            scope_type='cycle',
            period_start=timezone.localdate() - timedelta(days=1),
            period_end=timezone.localdate() - timedelta(days=1),
            generated_at=first_generated_at,
        )
        event, _ = project_admin_activity(
            build_production_report_generated_command(report)
        )

        latest_generated_at = timezone.now()
        ProductionReport.objects.filter(pk=report.pk).update(
            generated_at=latest_generated_at
        )
        call_command(
            'backfill_admin_activity_events',
            event_types=['aquaculture.production_report.generated'],
            mode='repair',
            verbosity=0,
        )
        event.refresh_from_db()

        assert AdminActivityEvent.objects.filter(dedupe_key=event.dedupe_key).count() == 1
        assert event.occurred_at == first_generated_at
        assert event.source_recorded_at == first_generated_at

    def test_dry_run_reports_counts_per_event_type_without_building(
        self,
        farm_profile,
    ):
        unit = ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac dry-run détaillé',
            unit_type='tank',
            volume_m3='10.00',
        )
        output = StringIO()
        with patch(
            'common.management.commands.backfill_admin_activity_events.'
            'build_production_unit_created_command',
            side_effect=AssertionError('builder must not run'),
        ):
            call_command(
                'backfill_admin_activity_events',
                event_types=['aquaculture.production_unit.created'],
                dry_run=True,
                stdout=output,
                verbosity=0,
            )

        text = output.getvalue()
        assert 'aquaculture.production_unit.created: candidates=1' in text
        assert 'already_projected=0' in text
        assert 'potential_creations=1' in text
        assert 'Dry run total: candidates=1' in text
        assert not AdminActivityEvent.objects.filter(source_object_id=unit.pk).exists()

    def test_backfill_dry_run_and_all_safeguard(self, farm_profile):
        ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Bac dry run',
            unit_type='tank',
            volume_m3='10.00',
        )
        call_command(
            'backfill_admin_activity_events',
            event_types=['aquaculture.production_unit.created'],
            dry_run=True,
            verbosity=0,
        )
        assert AdminActivityEvent.objects.count() == 0

        with pytest.raises(CommandError, match='confirm-all'):
            call_command(
                'backfill_admin_activity_events',
                include_all=True,
                verbosity=0,
            )

        ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='Second bac guard',
            unit_type='tank',
            volume_m3='10.00',
        )
        with pytest.raises(CommandError, match='max-events'):
            call_command(
                'backfill_admin_activity_events',
                event_types=['aquaculture.production_unit.created'],
                max_events=1,
                dry_run=True,
                verbosity=0,
            )
