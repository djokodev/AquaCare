from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from aquaculture.cycle_launch_serializers import CycleLaunchRequestSerializer
from aquaculture.models import CycleUnitAllocation, FarmProductionPlan, ProductionCycle, ProductionUnit
from aquaculture.services.cycle_launch_application_service import CycleLaunchApplicationService
from django.db import connection
from django.urls import reverse
from rest_framework import status


def launch_payload(*, launch_uuid: str | None = None) -> dict:
    return {
        "launch_uuid": launch_uuid or str(uuid4()),
        "production_plan": {
            "annual_production_target_kg": "1520.00",
            "num_cycles_per_year": 2,
            "fingerlings_cost_per_unit_fcfa": "50.00",
            "planned_selling_price_per_kg_fcfa": "2000.00",
        },
        "cycle": {
            "species": "clarias",
            "start_date": date.today().isoformat(),
            "initial_count": 2000,
            "initial_average_weight": "10.00",
            "target_harvest_weight_g": "400.00",
            "planned_cycle_duration_days": 150,
            "expected_survival_rate_pct": "95.00",
            "planned_selling_price_per_kg_fcfa": "2000.00",
            "fingerlings_cost_fcfa": "100000.00",
            "other_operational_costs_fcfa": "12000.00",
            "planned_feed_bags": 38,
            "created_offline": False,
        },
        "production_units": [
            {"local_id": "production-unit-a", "name": "Bassin A", "unit_type": "tank", "volume_m3": "12"},
            {"local_id": "production-unit-b", "name": "Bassin B", "unit_type": "tank", "volume_m3": "8"},
        ],
        "allocations": [
            {"production_unit_local_id": "production-unit-a", "fish_count": 1200},
            {"production_unit_local_id": "production-unit-b", "fish_count": 800},
        ],
    }


@pytest.mark.django_db
def test_cycle_launch_creates_complete_aggregate_and_replays(auth_client, farm_profile):
    url = reverse("aquaculture:production_cycle_launch")
    payload = launch_payload()

    created = auth_client.post(url, payload, format="json")

    assert created.status_code == status.HTTP_201_CREATED
    assert created.data["idempotent_replay"] is False
    assert len(created.data["production_units"]) == 2
    assert len(created.data["cycle_unit_allocations"]) == 2
    assert created.data["production_cycle"]["initial_count"] == 2000
    assert sum(item["initial_fish_count"] for item in created.data["cycle_unit_allocations"]) == 2000
    assert created.data["production_cycle"]["planned_harvest_date"] == (date.today() + timedelta(days=149)).isoformat()
    assert created.data["production_unit_id_by_local_id"]["production-unit-a"]

    assert ProductionCycle.objects.count() == 1
    assert ProductionUnit.objects.count() == 2
    assert CycleUnitAllocation.objects.count() == 2
    assert FarmProductionPlan.objects.get(farm_profile=farm_profile).setup_completed is True
    assert CycleUnitAllocation.objects.get(initial_fish_count=1200).initial_biomass_kg == Decimal("12.00")

    cycle_ids = {created.data["production_cycle"]["id"]}
    replay = auth_client.post(url, payload, format="json")

    assert replay.status_code == status.HTTP_200_OK
    assert replay.data["idempotent_replay"] is True
    assert replay.data["production_cycle"]["id"] in cycle_ids
    assert replay.data["production_unit_id_by_local_id"] == created.data["production_unit_id_by_local_id"]
    assert ProductionCycle.objects.count() == 1
    assert ProductionUnit.objects.count() == 2
    assert CycleUnitAllocation.objects.count() == 2

    conflict_payload = launch_payload(launch_uuid=payload["launch_uuid"])
    conflict_payload["cycle"]["initial_count"] = 1999
    conflict_payload["allocations"][1]["fish_count"] = 799
    conflict = auth_client.post(url, conflict_payload, format="json")

    assert conflict.status_code == status.HTTP_409_CONFLICT
    assert conflict.data["code"] == "cycle_launch_idempotency_conflict"
    assert ProductionCycle.objects.count() == 1


@pytest.mark.django_db
def test_cycle_launch_rolls_back_plan_cycle_units_and_allocations(
    auth_client,
    farm_profile,
    monkeypatch,
):
    auth_client.raise_request_exception = False
    original_save = CycleUnitAllocation.save

    def fail_on_second_allocation(self, *args, **kwargs):
        if self.initial_fish_count == 800:
            raise RuntimeError("injected allocation failure")
        return original_save(self, *args, **kwargs)

    monkeypatch.setattr(CycleUnitAllocation, "save", fail_on_second_allocation)

    response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        launch_payload(),
        format="json",
    )

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert ProductionCycle.objects.count() == 0
    assert ProductionUnit.objects.count() == 0
    assert CycleUnitAllocation.objects.count() == 0
    plan = FarmProductionPlan.objects.get(farm_profile=farm_profile)
    assert plan.setup_completed is False


@pytest.mark.django_db
def test_direct_cycle_creation_requires_units(auth_client):
    response = auth_client.post(
        reverse("aquaculture:production-cycle-list"),
        {"species": "clarias", "initial_count": 1000},
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["code"] == "cycle_launch_requires_production_units"


@pytest.mark.django_db
@pytest.mark.parametrize(
    "mutation",
    [
        lambda payload: payload["production_units"].clear(),
        lambda payload: payload["allocations"].clear(),
        lambda payload: payload["allocations"].__setitem__(
            1, {"production_unit_local_id": "unknown", "fish_count": 800}
        ),
        lambda payload: payload["allocations"].__setitem__(
            1, {"production_unit_local_id": "production-unit-b", "fish_count": 0}
        ),
    ],
)
def test_cycle_launch_rejects_invalid_structure(auth_client, mutation):
    payload = launch_payload()
    mutation(payload)

    response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        payload,
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert ProductionCycle.objects.count() == 0


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="Concurrent row-lock verification requires PostgreSQL",
)
def test_concurrent_identical_launches_create_one_aggregate(farm_profile):
    serializer = CycleLaunchRequestSerializer(data=launch_payload())
    assert serializer.is_valid(), serializer.errors
    user = farm_profile.user

    def launch_once():
        connection.close()
        try:
            return CycleLaunchApplicationService.launch(user, serializer.validated_data)
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: launch_once(), range(2)))

    assert sorted(result.idempotent_replay for result in results) == [False, True]
    assert ProductionCycle.objects.filter(farm_profile=farm_profile).count() == 1
    assert ProductionUnit.objects.filter(farm_profile=farm_profile).count() == 2
    assert CycleUnitAllocation.objects.filter(cycle__farm_profile=farm_profile).count() == 2
