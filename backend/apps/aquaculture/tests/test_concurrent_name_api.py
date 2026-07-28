"""PostgreSQL concurrency guarantees exercised through the public HTTP APIs."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from aquaculture.models import ProductionUnit
from django.db import close_old_connections, connection
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

pytestmark = [
    pytest.mark.django_db(transaction=True),
    pytest.mark.skipif(
        connection.vendor != 'postgresql',
        reason='Requires PostgreSQL concurrency',
    ),
]


def _generic_payload(*, name: str, client_uuid: str | None = None) -> dict[str, str]:
    payload = {
        'name': name,
        'unit_type': 'tank',
        'purpose': ProductionUnit.PURPOSE_PRODUCTION,
        'volume_m3': '5.00',
    }
    if client_uuid is not None:
        payload['client_uuid'] = client_uuid
    return payload


def _calibration_payload(
    *,
    name: str,
    client_uuid: str | None = None,
    volume_m3: str = '5.00',
) -> dict[str, str]:
    payload = {'name': name, 'volume_m3': volume_m3}
    if client_uuid is not None:
        payload['client_uuid'] = client_uuid
    return payload


def _post_concurrently(user, requests: list[tuple[str, dict]]) -> list:
    """Issue requests with separate clients and thread-local DB connections."""

    access_token = str(RefreshToken.for_user(user).access_token)
    barrier = Barrier(len(requests))

    def post_once(request: tuple[str, dict]):
        url, payload = request
        close_old_connections()
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        try:
            barrier.wait()
            return client.post(url, payload, format='json')
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=len(requests)) as executor:
        return list(executor.map(post_once, requests))


@pytest.mark.parametrize(
    ('first_facade', 'second_facade'),
    [
        ('generic', 'generic'),
        ('calibration', 'calibration'),
        ('generic', 'calibration'),
    ],
    ids=['generic-generic', 'calibration-calibration', 'generic-calibration'],
)
def test_concurrent_name_api_returns_one_created_and_one_business_conflict(
    farm_profile,
    first_facade,
    second_facade,
):
    urls = {
        'generic': reverse('aquaculture:production-unit-list'),
        'calibration': reverse('aquaculture:calibration-tank-list'),
    }
    payload_factory = {
        'generic': _generic_payload,
        'calibration': _calibration_payload,
    }
    responses = _post_concurrently(
        farm_profile.user,
        [
            (urls[first_facade], payload_factory[first_facade](name='Bac Nord')),
            (urls[second_facade], payload_factory[second_facade](name='BAC NORD')),
        ],
    )

    assert sorted(response.status_code for response in responses) in ([201, 400], [201, 409])
    assert all(response.status_code < 500 for response in responses)
    conflict = next(response for response in responses if response.status_code != 201)
    assert conflict.data['code'] == 'duplicate_production_unit_name'
    assert ProductionUnit.objects.filter(
        farm_profile=farm_profile,
        name__iexact='Bac Nord',
    ).count() == 1


def test_concurrent_name_api_same_client_uuid_same_payload_is_idempotent(farm_profile):
    client_uuid = str(uuid4())
    url = reverse('aquaculture:calibration-tank-list')
    payload = _calibration_payload(
        name='Bac UUID idempotent',
        client_uuid=client_uuid,
    )

    responses = _post_concurrently(
        farm_profile.user,
        [(url, payload), (url, payload)],
    )

    assert [response.status_code for response in responses] == [201, 201]
    assert responses[0].data['id'] == responses[1].data['id']
    assert ProductionUnit.objects.filter(client_uuid=client_uuid).count() == 1


def test_concurrent_name_api_same_client_uuid_different_payload_is_conflict(farm_profile):
    client_uuid = str(uuid4())
    url = reverse('aquaculture:calibration-tank-list')

    responses = _post_concurrently(
        farm_profile.user,
        [
            (
                url,
                _calibration_payload(
                    name='Bac UUID conflictuel',
                    client_uuid=client_uuid,
                    volume_m3='5.00',
                ),
            ),
            (
                url,
                _calibration_payload(
                    name='Bac UUID conflictuel',
                    client_uuid=client_uuid,
                    volume_m3='8.00',
                ),
            ),
        ],
    )

    assert sorted(response.status_code for response in responses) in ([201, 400], [201, 409])
    assert all(response.status_code < 500 for response in responses)
    conflict = next(response for response in responses if response.status_code != 201)
    assert conflict.data['code'] == 'production_unit_client_uuid_conflict'
    assert ProductionUnit.objects.filter(client_uuid=client_uuid).count() == 1
