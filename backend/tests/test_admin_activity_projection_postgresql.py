"""PostgreSQL-only guarantees for the Lot 2A activity projection."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from common.models import AdminActivityEvent
from common.services.admin_activity_projection_service import (
    AdminActivityProjectionCommand,
    project_admin_activity,
)
from django.db import close_old_connections, connection, connections, transaction
from django.db.migrations.recorder import MigrationRecorder
from django.utils import timezone


def _require_postgresql() -> None:
    if connection.vendor != 'postgresql':
        pytest.skip('Lot 2A concurrency contract requires PostgreSQL')


@pytest.mark.django_db(transaction=True)
def test_postgresql_applies_common_migration_0003_with_expected_table():
    _require_postgresql()

    assert ('common', '0003_adminactivityevent') in {
        (migration.app, migration.name)
        for migration in MigrationRecorder.Migration.objects.all()
    }
    assert AdminActivityEvent._meta.db_table in connection.introspection.table_names()


@pytest.mark.django_db(transaction=True)
def test_concurrent_postgresql_dedupe_inserts_converge_to_one_event():
    _require_postgresql()
    command = AdminActivityProjectionCommand(
        event_type='aquaculture.production_unit.created',
        domain='aquaculture',
        level='info',
        source_app_label='aquaculture',
        source_model='productionunit',
        source_object_id=uuid4(),
        occurred_at=timezone.now(),
        render_context={'unit_name': 'Concurrent unit'},
    )
    barrier = Barrier(2)

    def insert_once() -> tuple[int, bool]:
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            with transaction.atomic():
                event, created = project_admin_activity(command)
            return event.pk, created
        finally:
            connections['default'].close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: insert_once(), range(2)))

    event_ids = {event_id for event_id, _ in results}
    assert len(event_ids) == 1
    assert sum(int(created) for _, created in results) == 1
    assert AdminActivityEvent.objects.filter(dedupe_key=command.dedupe_key).count() == 1

    replay, created = project_admin_activity(command)
    assert created is False
    assert replay.pk == event_ids.pop()
