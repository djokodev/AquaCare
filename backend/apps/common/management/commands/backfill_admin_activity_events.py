"""Backfill or repair the persistent admin activity projection."""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from functools import partial
from typing import Any

from aquaculture.models import (
    CalibrationOperation,
    CycleLog,
    FinalHarvestOperation,
    ProductionCycle,
    ProductionReport,
    ProductionUnit,
    ReportDispatchLog,
    SanitaryLog,
)
from aquaculture.services.admin_activity_projection_service import (
    build_calibration_completed_command,
    build_cycle_log_received_command,
    build_final_harvest_completed_command,
    build_production_cycle_created_command,
    build_production_report_generated_command,
    build_production_unit_created_command,
    build_report_dispatch_command,
    build_sanitary_log_command,
)
from chat.models import Message
from chat.services.admin_activity_projection_service import (
    build_user_message_received_command,
)
from commerce.models import Order
from commerce.services.admin_activity_projection_service import (
    build_order_activity_command,
)
from common.admin_activity_registry import ADMIN_ACTIVITY_REGISTRY
from common.models import AdminActivityEvent
from common.services.admin_activity_projection_service import (
    AdminActivityProjectionCommand,
    ProjectionOrigin,
    project_admin_activity,
)
from django.core.management.base import BaseCommand, CommandError, CommandParser
from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

DEFAULT_LOOKBACK_DAYS = 180
DEFAULT_BATCH_SIZE = 500
DEFAULT_MAX_EVENTS = 100_000
logger = logging.getLogger('common.admin_activity')


@dataclass(frozen=True, slots=True)
class ProjectionSource:
    event_type: str
    domain: str
    queryset_factory: Callable[[], QuerySet]
    command_builder: Callable[..., AdminActivityProjectionCommand]
    backfill_field: str
    repair_field: str | None
    backfill_is_date: bool = False
    repair_is_date: bool = False


def _sources() -> tuple[ProjectionSource, ...]:
    aquaculture = 'aquaculture'
    return (
        ProjectionSource(
            'aquaculture.production_unit.created',
            aquaculture,
            lambda: ProductionUnit.objects.select_related('farm_profile'),
            build_production_unit_created_command,
            'created_at',
            'created_at',
        ),
        ProjectionSource(
            'aquaculture.production_cycle.created',
            aquaculture,
            lambda: ProductionCycle.objects.select_related('farm_profile').filter(
                cycle_kind=ProductionCycle.CYCLE_KIND_STANDARD
            ),
            build_production_cycle_created_command,
            'start_date',
            'created_at',
            backfill_is_date=True,
        ),
        ProjectionSource(
            'aquaculture.cycle_log.received',
            aquaculture,
            lambda: CycleLog.objects.select_related(
                'cycle__farm_profile',
                'cycle_unit_allocation__production_unit',
            ),
            build_cycle_log_received_command,
            'log_date',
            'created_at',
            backfill_is_date=True,
        ),
        ProjectionSource(
            'aquaculture.sanitary_log.created',
            aquaculture,
            lambda: SanitaryLog.objects.select_related(
                'cycle__farm_profile',
                'cycle_unit_allocation__production_unit',
            ),
            partial(
                build_sanitary_log_command,
                event_type='aquaculture.sanitary_log.created',
            ),
            'event_date',
            'created_at',
            backfill_is_date=True,
        ),
        ProjectionSource(
            'aquaculture.sanitary_log.resolved',
            aquaculture,
            lambda: SanitaryLog.objects.select_related(
                'cycle__farm_profile',
                'cycle_unit_allocation__production_unit',
            ).filter(resolved=True, resolution_date__isnull=False),
            partial(
                build_sanitary_log_command,
                event_type='aquaculture.sanitary_log.resolved',
            ),
            'resolution_date',
            None,
            backfill_is_date=True,
        ),
        ProjectionSource(
            'aquaculture.calibration.completed',
            aquaculture,
            lambda: CalibrationOperation.objects.select_related(
                'source_allocation__cycle__farm_profile',
                'source_allocation__production_unit',
                'destination_allocation__production_unit',
            ),
            build_calibration_completed_command,
            'calibrated_at',
            'created_at',
        ),
        ProjectionSource(
            'aquaculture.final_harvest.completed',
            aquaculture,
            lambda: FinalHarvestOperation.objects.select_related(
                'allocation__cycle__farm_profile',
                'allocation__production_unit',
            ),
            build_final_harvest_completed_command,
            'harvested_at',
            'created_at',
        ),
        ProjectionSource(
            'aquaculture.production_report.generated',
            aquaculture,
            lambda: ProductionReport.objects.select_related('farm_profile').filter(
                generated_at__isnull=False
            ),
            build_production_report_generated_command,
            'generated_at',
            'generated_at',
        ),
        ProjectionSource(
            'aquaculture.report_dispatch.succeeded',
            aquaculture,
            lambda: ReportDispatchLog.objects.select_related(
                'report__farm_profile'
            ).filter(status='success'),
            build_report_dispatch_command,
            'created_at',
            'created_at',
        ),
        ProjectionSource(
            'aquaculture.report_dispatch.failed',
            aquaculture,
            lambda: ReportDispatchLog.objects.select_related(
                'report__farm_profile'
            ).filter(status='failed'),
            build_report_dispatch_command,
            'created_at',
            'created_at',
        ),
        *(
            ProjectionSource(
                event_type,
                'commerce',
                lambda field=field: Order.objects.select_related(
                    'farm_profile'
                ).filter(**{f'{field}__isnull': False}),
                partial(build_order_activity_command, event_type=event_type),
                field,
                field,
            )
            for event_type, field in (
                ('commerce.order.created', 'created_at'),
                ('commerce.order.delivered', 'delivered_at'),
                ('commerce.order.ready_for_pickup', 'ready_for_pickup_at'),
                ('commerce.order.received', 'received_at'),
            )
        ),
        ProjectionSource(
            'support.user_message.received',
            'support',
            lambda: Message.objects.select_related(
                'conversation__user__farm_profile'
            ).filter(sender_type='user'),
            build_user_message_received_command,
            'created_at',
            'created_at',
        ),
    )


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise CommandError(f'Invalid date {value!r}; expected YYYY-MM-DD') from exc


def _normalize_filters(values: list[str] | None) -> frozenset[str]:
    return frozenset(
        item.strip()
        for value in values or []
        for item in value.split(',')
        if item.strip()
    )


def _date_bounds(
    since: date | None,
    until: date | None,
) -> tuple[datetime | None, datetime | None]:
    if since is None or until is None:
        return None, None
    current_timezone = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(since, time.min), current_timezone)
    end = timezone.make_aware(
        datetime.combine(until + timedelta(days=1), time.min),
        current_timezone,
    )
    return start, end


def _bounded_queryset(
    source: ProjectionSource,
    *,
    since: date | None,
    until: date | None,
    mode: ProjectionOrigin,
) -> QuerySet:
    queryset = source.queryset_factory()
    if since is None or until is None:
        return queryset.order_by('pk')
    field = source.backfill_field if mode == 'backfill' else source.repair_field
    field_is_date = (
        source.backfill_is_date if mode == 'backfill' else source.repair_is_date
    )
    if field is None:
        return queryset.none()
    if field_is_date:
        queryset = queryset.filter(
            **{
                f'{field}__gte': since,
                f'{field}__lte': until,
            }
        )
    else:
        start, end = _date_bounds(since, until)
        queryset = queryset.filter(
            **{
                f'{field}__gte': start,
                f'{field}__lt': end,
            }
        )
    return queryset.order_by('pk')


class Command(BaseCommand):
    help = 'Backfill or repair the persistent admin activity projection.'

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument('--since', type=str)
        parser.add_argument('--until', type=str)
        parser.add_argument('--domains', nargs='+')
        parser.add_argument('--event-types', nargs='+')
        parser.add_argument('--source-object-id', type=str)
        parser.add_argument('--batch-size', type=int, default=DEFAULT_BATCH_SIZE)
        parser.add_argument('--max-events', type=int, default=DEFAULT_MAX_EVENTS)
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--all', action='store_true', dest='include_all')
        parser.add_argument('--confirm-all', action='store_true')
        parser.add_argument(
            '--mode',
            choices=('backfill', 'repair'),
            default='backfill',
        )

    def handle(self, *args: Any, **options: Any) -> None:
        batch_size = options['batch_size']
        max_events = options['max_events']
        if batch_size < 1:
            raise CommandError('--batch-size must be positive')
        if max_events < 1:
            raise CommandError('--max-events must be positive')

        include_all = options['include_all']
        if include_all and (options['since'] or options['until']):
            raise CommandError('--all cannot be combined with --since or --until')
        if include_all and not options['confirm_all']:
            raise CommandError('--all requires the explicit --confirm-all safeguard')

        today = timezone.localdate()
        since = (
            None
            if include_all
            else _parse_date(options['since'])
            if options['since']
            else today - timedelta(days=DEFAULT_LOOKBACK_DAYS)
        )
        until = (
            None
            if include_all
            else _parse_date(options['until'])
            if options['until']
            else today
        )
        if since is not None and until is not None and since > until:
            raise CommandError('--since must be on or before --until')

        requested_domains = _normalize_filters(options['domains'])
        allowed_domains = {'aquaculture', 'commerce', 'support'}
        if unknown_domains := requested_domains - allowed_domains:
            raise CommandError(f'Unknown domains: {", ".join(sorted(unknown_domains))}')
        requested_types = _normalize_filters(options['event_types'])
        if unknown_types := requested_types - ADMIN_ACTIVITY_REGISTRY.keys():
            raise CommandError(f'Unknown event types: {", ".join(sorted(unknown_types))}')

        source_object_id = self._parse_source_object_id(
            options['source_object_id'],
            mode=options['mode'],
            requested_types=requested_types,
            include_all=include_all,
            since_option=options['since'],
            until_option=options['until'],
        )

        selected_sources = tuple(
            source
            for source in _sources()
            if (not requested_domains or source.domain in requested_domains)
            and (not requested_types or source.event_type in requested_types)
        )
        querysets = tuple(
            (
                source,
                source.queryset_factory().filter(pk=source_object_id).order_by('pk')
                if source_object_id is not None
                else _bounded_queryset(
                    source,
                    since=since,
                    until=until,
                    mode=options['mode'],
                ),
            )
            for source in selected_sources
        )
        candidate_count = sum(queryset.count() for _, queryset in querysets)
        if candidate_count > max_events:
            raise CommandError(
                f'{candidate_count} candidates exceed --max-events={max_events}'
            )
        if options['dry_run']:
            self._write_dry_run(querysets)
            return

        origin: ProjectionOrigin = options['mode']
        created_count = 0
        existing_count = 0
        error_count = 0
        for source, queryset in querysets:
            batch: list[object] = []
            for source_object in queryset.iterator(chunk_size=batch_size):
                batch.append(source_object)
                if len(batch) == batch_size:
                    created, existing, errors = self._project_batch(
                        source,
                        batch,
                        origin,
                    )
                    created_count += created
                    existing_count += existing
                    error_count += errors
                    batch.clear()
            if batch:
                created, existing, errors = self._project_batch(
                    source,
                    batch,
                    origin,
                )
                created_count += created
                existing_count += existing
                error_count += errors

        self.stdout.write(
            self.style.SUCCESS(
                f'Projection complete: {created_count} created, '
                f'{existing_count} already present, 0 ignored, '
                f'{error_count} errors'
            )
        )
        if error_count:
            raise CommandError(
                f'Projection completed with {error_count} errors; inspect structured logs'
            )

    @staticmethod
    def _parse_source_object_id(
        value: str | None,
        *,
        mode: str,
        requested_types: frozenset[str],
        include_all: bool,
        since_option: str | None,
        until_option: str | None,
    ) -> uuid.UUID | None:
        if value is None:
            return None
        if mode != 'repair':
            raise CommandError('--source-object-id is only available in repair mode')
        if len(requested_types) != 1:
            raise CommandError('--source-object-id requires exactly one --event-types value')
        if include_all or since_option or until_option:
            raise CommandError(
                '--source-object-id cannot be combined with --all, --since, or --until'
            )
        try:
            return uuid.UUID(value)
        except (AttributeError, ValueError) as exc:
            raise CommandError('--source-object-id must be a valid UUID') from exc

    def _write_dry_run(
        self,
        querysets: tuple[tuple[ProjectionSource, QuerySet], ...],
    ) -> None:
        total_candidates = 0
        total_existing = 0
        for source, queryset in querysets:
            candidates = queryset.count()
            existing = AdminActivityEvent.objects.filter(
                event_type=source.event_type,
                source_object_id__in=queryset.values('pk'),
            ).count()
            potential = max(candidates - existing, 0)
            total_candidates += candidates
            total_existing += existing
            self.stdout.write(
                f'{source.event_type}: candidates={candidates}, '
                f'already_projected={existing}, potential_creations={potential}'
            )
        self.stdout.write(
            self.style.SUCCESS(
                f'Dry run total: candidates={total_candidates}, '
                f'already_projected={total_existing}, '
                f'potential_creations={max(total_candidates - total_existing, 0)}'
            )
        )

    @staticmethod
    def _project_batch(
        source: ProjectionSource,
        source_objects: list[object],
        origin: ProjectionOrigin,
    ) -> tuple[int, int, int]:
        created_count = 0
        existing_count = 0
        error_count = 0
        with transaction.atomic():
            for source_object in source_objects:
                command = None
                try:
                    command = source.command_builder(source_object, origin=origin)
                    with transaction.atomic():
                        _, created = project_admin_activity(command)
                    created_count += int(created)
                    existing_count += int(not created)
                except Exception as exc:
                    error_count += 1
                    logger.error(
                        'Admin activity reconciliation failed',
                        extra={
                            'event': 'admin_activity.reconciliation.failed',
                            'event_type': source.event_type,
                            'source_app_label': source_object._meta.app_label,
                            'source_model': source_object._meta.model_name,
                            'source_object_id': str(source_object.pk),
                            'dedupe_key': command.dedupe_key if command else None,
                            'exception_class': exc.__class__.__name__,
                        },
                    )
        return created_count, existing_count, error_count
