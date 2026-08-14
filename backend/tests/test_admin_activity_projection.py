"""Contract tests for the Lot 2A persistent admin activity projection."""

from __future__ import annotations

import logging
from dataclasses import FrozenInstanceError
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

import pytest
from aquaculture.domain.sanitary_severity import sanitary_severity
from aquaculture.models import ProductionCycle, ProductionUnit
from aquaculture.services.admin_activity_projection_service import (
    build_production_cycle_created_command,
    build_sanitary_log_command,
)
from aquaculture.services.sanitary_service import SanitaryService
from chat.services.message_service import MessageService
from commerce.services.admin_activity_projection_service import (
    build_order_activity_command,
)
from common.admin_activity_registry import ADMIN_ACTIVITY_REGISTRY
from common.models import AdminActivityEvent
from common.services.admin_activity_projection_service import (
    AdminActivityCollisionError,
    AdminActivityProjectionCommand,
    AdminActivityProjectionError,
    _project_with_observability,
    project_admin_activity,
    schedule_admin_activity_projection,
)
from django.core.management import CommandError, call_command
from django.db import IntegrityError, models, transaction
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

    def test_collision_rejects_incompatible_immutable_content(self):
        source_object_id = uuid4()
        project_admin_activity(
            _unit_command(
                source_object_id=source_object_id,
                render_context={'unit_name': 'Bac A'},
            )
        )

        with pytest.raises(AdminActivityCollisionError, match='render_context'):
            project_admin_activity(
                _unit_command(
                    source_object_id=source_object_id,
                    render_context={'unit_name': 'Bac B'},
                )
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


@pytest.mark.django_db
class TestAdminActivityHooksAndBackfill:
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
