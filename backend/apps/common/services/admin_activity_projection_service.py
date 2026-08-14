"""Validated, idempotent writer for persistent admin activity events."""

from __future__ import annotations

import logging
import uuid
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date, datetime
from functools import partial
from types import MappingProxyType
from typing import Literal

from common.admin_activity_registry import ADMIN_ACTIVITY_REGISTRY
from common.models import AdminActivityEvent
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger('common.admin_activity')

ProjectionOrigin = Literal['live', 'backfill', 'repair']
JSONScalar = str | int | float | bool | None

FORBIDDEN_CONTEXT_KEYS = frozenset(
    {
        'content',
        'description',
        'email',
        'error',
        'error_message',
        'message',
        'phone',
        'recipient',
        'symptoms',
    }
)
MAX_CONTEXT_STRING_LENGTH = 160


class AdminActivityProjectionError(ValueError):
    """Raised when a projection command violates the closed contract."""


class AdminActivityCollisionError(AdminActivityProjectionError):
    """Raised when one dedupe key points to incompatible immutable data."""


@dataclass(frozen=True, slots=True)
class AdminActivityProjectionCommand:
    event_type: str
    domain: str
    level: str
    source_app_label: str
    source_model: str
    source_object_id: uuid.UUID
    occurred_on: date | None = None
    occurred_at: datetime | None = None
    source_recorded_at: datetime | None = None
    farm_profile_id: uuid.UUID | None = None
    production_cycle_id: uuid.UUID | None = None
    production_unit_id: uuid.UUID | None = None
    render_context: Mapping[str, JSONScalar] = field(
        default_factory=lambda: MappingProxyType({})
    )
    render_version: int = 1
    origin: ProjectionOrigin = 'live'

    def __post_init__(self) -> None:
        object.__setattr__(self, 'render_context', MappingProxyType(dict(self.render_context)))

    @property
    def dedupe_key(self) -> str:
        return (
            f'v{self.render_version}:{self.event_type}:'
            f'{self.source_app_label}.{self.source_model}:{self.source_object_id}'
        )


def validate_admin_activity_command(command: AdminActivityProjectionCommand) -> None:
    definition = ADMIN_ACTIVITY_REGISTRY.get(command.event_type)
    if definition is None:
        raise AdminActivityProjectionError(f'Unknown event type: {command.event_type}')
    if command.domain != definition.domain:
        raise AdminActivityProjectionError('Event domain does not match the registry')
    if (
        command.source_app_label != definition.source_app_label
        or command.source_model != definition.source_model
    ):
        raise AdminActivityProjectionError('Event source does not match the registry')
    if command.level not in definition.allowed_levels:
        raise AdminActivityProjectionError('Event level does not match the registry')
    if not isinstance(command.source_object_id, uuid.UUID):
        raise AdminActivityProjectionError('The source object identifier must be a UUID')
    if (command.occurred_on is None) == (command.occurred_at is None):
        raise AdminActivityProjectionError('Exactly one occurrence timestamp is required')
    if command.occurred_at is not None and timezone.is_naive(command.occurred_at):
        raise AdminActivityProjectionError('occurred_at must be timezone-aware')
    if command.source_recorded_at is not None and timezone.is_naive(command.source_recorded_at):
        raise AdminActivityProjectionError('source_recorded_at must be timezone-aware')
    if command.render_version != 1:
        raise AdminActivityProjectionError('Unsupported render context version')
    if command.origin not in {'live', 'backfill', 'repair'}:
        raise AdminActivityProjectionError('Unsupported projection origin')

    context_keys = frozenset(command.render_context)
    if context_keys & FORBIDDEN_CONTEXT_KEYS:
        raise AdminActivityProjectionError('Render context contains a forbidden key')
    if not context_keys <= definition.render_context_keys:
        raise AdminActivityProjectionError('Render context contains an unregistered key')
    for value in command.render_context.values():
        if not isinstance(value, (str, int, float, bool, type(None))):
            raise AdminActivityProjectionError('Render context values must be JSON scalars')
        if isinstance(value, str) and len(value) > MAX_CONTEXT_STRING_LENGTH:
            raise AdminActivityProjectionError('Render context value is too long')


def project_admin_activity(
    command: AdminActivityProjectionCommand,
) -> tuple[AdminActivityEvent, bool]:
    """Insert a projection once and reject incompatible dedupe collisions."""
    validate_admin_activity_command(command)
    defaults = {
        'event_type': command.event_type,
        'domain': command.domain,
        'level': command.level,
        'farm_profile_id': command.farm_profile_id,
        'production_cycle_id': command.production_cycle_id,
        'production_unit_id': command.production_unit_id,
        'source_app_label': command.source_app_label,
        'source_model': command.source_model,
        'source_object_id': command.source_object_id,
        'occurred_on': command.occurred_on,
        'occurred_at': command.occurred_at,
        'source_recorded_at': command.source_recorded_at,
        'render_context': dict(command.render_context),
        'render_version': command.render_version,
        'is_backfilled': command.origin == 'backfill',
    }
    event, created = AdminActivityEvent.objects.get_or_create(
        dedupe_key=command.dedupe_key,
        defaults=defaults,
    )
    if created:
        return event, True

    incompatible_fields = [
        field
        for field, expected in defaults.items()
        if field != 'is_backfilled' and getattr(event, field) != expected
    ]
    if incompatible_fields:
        raise AdminActivityCollisionError(
            f'Incompatible projection collision: {", ".join(incompatible_fields)}'
        )

    if command.origin == 'live' and event.is_backfilled:
        AdminActivityEvent.objects.filter(pk=event.pk, is_backfilled=True).update(
            is_backfilled=False
        )
        event.is_backfilled = False
    return event, False


def _project_with_observability(command: AdminActivityProjectionCommand) -> None:
    try:
        project_admin_activity(command)
    except Exception as exc:
        logger.exception(
            'Admin activity projection failed',
            extra={
                'event': 'admin_activity.projection.failed',
                'event_type': command.event_type,
                'source_app_label': command.source_app_label,
                'source_model': command.source_model,
                'source_object_id': str(command.source_object_id),
                'dedupe_key': command.dedupe_key,
                'exception_class': exc.__class__.__name__,
            },
        )


def schedule_admin_activity_projection(command: AdminActivityProjectionCommand) -> None:
    """Schedule a robust write after the surrounding business commit succeeds."""
    validate_admin_activity_command(command)
    transaction.on_commit(partial(_project_with_observability, command), robust=True)
