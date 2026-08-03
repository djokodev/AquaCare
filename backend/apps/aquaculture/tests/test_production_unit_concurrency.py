"""Garanties PostgreSQL sur l'unicité globale des noms d'unités."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from aquaculture.models import ProductionUnit
from aquaculture.services.integrity_error_service import (
    translate_production_unit_integrity_error,
)
from aquaculture.services.sync_service import SyncService
from django.db import IntegrityError, connection


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'postgresql', reason='Requires PostgreSQL constraints')
def test_production_unit_duplicate_name_is_owned_by_database(farm_profile):
    ProductionUnit.objects.create(
        farm_profile=farm_profile,
        name='Bac atomique',
        unit_type='tank',
        volume_m3='5.00',
    )

    with pytest.raises(IntegrityError) as exc_info:
        ProductionUnit.objects.create(
            farm_profile=farm_profile,
            name='BAC ATOMIQUE',
            unit_type='tank',
            volume_m3='5.00',
        )

    mapped = translate_production_unit_integrity_error(exc_info.value)
    assert mapped['code'] == 'duplicate_production_unit_name'


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'postgresql', reason='Requires PostgreSQL concurrency')
@pytest.mark.parametrize(
    ('first_purpose', 'second_purpose'),
    [
        (ProductionUnit.PURPOSE_PRODUCTION, ProductionUnit.PURPOSE_PRODUCTION),
        (ProductionUnit.PURPOSE_CALIBRATION, ProductionUnit.PURPOSE_CALIBRATION),
        (ProductionUnit.PURPOSE_PRODUCTION, ProductionUnit.PURPOSE_CALIBRATION),
    ],
)
def test_concurrent_name_collision_is_a_controlled_business_error(
    farm_profile,
    first_purpose,
    second_purpose,
):
    barrier = Barrier(2)

    def create(name, purpose):
        connection.close()
        barrier.wait()
        try:
            unit = ProductionUnit.objects.create(
                farm_profile_id=farm_profile.id,
                name=name,
                unit_type='tank',
                purpose=purpose,
                volume_m3='5.00',
            )
            return ('created', str(unit.id))
        except IntegrityError as exc:
            mapped = translate_production_unit_integrity_error(exc)
            return ('conflict', mapped['code'])
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(
            lambda args: create(*args),
            [('Bac Nord', first_purpose), ('BAC NORD', second_purpose)],
        ))

    assert sorted(result[0] for result in results) == ['conflict', 'created']
    assert next(result[1] for result in results if result[0] == 'conflict') == (
        'duplicate_production_unit_name'
    )
    assert ProductionUnit.objects.filter(
        farm_profile=farm_profile,
        name__iexact='Bac Nord',
    ).count() == 1


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'postgresql', reason='Requires PostgreSQL concurrency')
def test_concurrent_name_full_sync_returns_one_controlled_conflict(farm_profile):
    barrier = Barrier(2)
    payloads = [
        {
            'calibration_tanks': [{
                'client_uuid': str(uuid4()),
                'name': name,
                'volume_m3': '5.00',
                'is_active': True,
            }],
        }
        for name in ('Bac Sync Nord', 'BAC SYNC NORD')
    ]

    def sync_once(payload):
        connection.close()
        try:
            barrier.wait()
            return SyncService.perform_full_sync(farm_profile.user, payload)
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(sync_once, payloads))

    assert sorted(result['status'] for result in results) == ['partial_success', 'success']
    conflict = next(result for result in results if result['status'] == 'partial_success')
    assert conflict['errors'][0]['code'] == 'duplicate_production_unit_name'
    assert ProductionUnit.objects.filter(
        farm_profile=farm_profile,
        name__iexact='Bac Sync Nord',
    ).count() == 1


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(connection.vendor != 'postgresql', reason='Requires PostgreSQL concurrency')
def test_concurrent_name_full_sync_same_uuid_same_payload_is_idempotent(farm_profile):
    client_uuid = str(uuid4())
    barrier = Barrier(2)
    payload = {
        'calibration_tanks': [{
            'client_uuid': client_uuid,
            'name': 'Bac Sync Idempotent',
            'volume_m3': '5.00',
            'is_active': True,
        }],
    }

    def sync_once():
        connection.close()
        try:
            barrier.wait()
            return SyncService.perform_full_sync(farm_profile.user, payload)
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _index: sync_once(), range(2)))

    assert all(result['status'] == 'success' for result in results)
    assert ProductionUnit.objects.filter(client_uuid=client_uuid).count() == 1


@pytest.mark.django_db
def test_concurrent_name_full_sync_same_uuid_different_payload_is_conflict(farm_profile):
    client_uuid = str(uuid4())
    base_payload = {
        'calibration_tanks': [{
            'client_uuid': client_uuid,
            'name': 'Bac Sync Stable',
            'volume_m3': '5.00',
            'is_active': True,
        }],
    }
    changed_payload = {
        'calibration_tanks': [{
            **base_payload['calibration_tanks'][0],
            'volume_m3': '8.00',
        }],
    }

    first = SyncService.perform_full_sync(farm_profile.user, base_payload)
    conflict = SyncService.perform_full_sync(farm_profile.user, changed_payload)

    assert first['status'] == 'success'
    assert conflict['status'] == 'partial_success'
    assert conflict['errors'][0]['code'] == 'production_unit_client_uuid_conflict'
    assert ProductionUnit.objects.filter(client_uuid=client_uuid).count() == 1
