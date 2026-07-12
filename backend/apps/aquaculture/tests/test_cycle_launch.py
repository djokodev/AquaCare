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
        "launch_kind": "initial_setup",
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
            {
                "local_id": "production-unit-a",
                "source": "new",
                "name": "Bassin A",
                "unit_type": "tank",
                "volume_m3": "12",
            },
            {
                "local_id": "production-unit-b",
                "source": "new",
                "name": "Bassin B",
                "unit_type": "tank",
                "volume_m3": "8",
            },
        ],
        "allocations": [
            {"production_unit_local_id": "production-unit-a", "fish_count": 1200},
            {"production_unit_local_id": "production-unit-b", "fish_count": 800},
        ],
    }


def additional_launch_payload(
    production_units: list[ProductionUnit],
    *,
    launch_uuid: str | None = None,
) -> dict:
    payload = launch_payload(launch_uuid=launch_uuid)
    payload.pop("production_plan")
    payload["launch_kind"] = "additional_cycle"
    payload["production_units"] = [
        {
            "local_id": f"selected-{unit.id}",
            "source": "existing",
            "production_unit_id": str(unit.id),
        }
        for unit in production_units
    ]
    payload["allocations"] = [
        {
            "production_unit_local_id": f"selected-{unit.id}",
            "fish_count": count,
        }
        for unit, count in zip(production_units, (2000,) if len(production_units) == 1 else (1200, 800))
    ]
    return payload


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
def test_additional_cycle_reuses_existing_units_and_preserves_setup(auth_client, farm_profile):
    initial_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        launch_payload(),
        format="json",
    )
    assert initial_response.status_code == status.HTTP_201_CREATED
    existing_units = list(ProductionUnit.objects.filter(farm_profile=farm_profile).order_by("name"))
    plan_before = FarmProductionPlan.objects.get(farm_profile=farm_profile)
    setup_snapshot = {
        "setup_unit_count": plan_before.setup_unit_count,
        "setup_infrastructure_type": plan_before.setup_infrastructure_type,
        "setup_unit_volume_m3": plan_before.setup_unit_volume_m3,
    }

    payload = additional_launch_payload(existing_units)
    created = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        payload,
        format="json",
    )

    assert created.status_code == status.HTTP_201_CREATED
    assert ProductionCycle.objects.filter(farm_profile=farm_profile).count() == 2
    assert ProductionUnit.objects.filter(farm_profile=farm_profile).count() == 2
    assert CycleUnitAllocation.objects.filter(cycle__farm_profile=farm_profile).count() == 4
    plan_after = FarmProductionPlan.objects.get(farm_profile=farm_profile)
    assert {
        "setup_unit_count": plan_after.setup_unit_count,
        "setup_infrastructure_type": plan_after.setup_infrastructure_type,
        "setup_unit_volume_m3": plan_after.setup_unit_volume_m3,
    } == setup_snapshot
    assert {item["id"] for item in created.data["production_units"]} == {
        str(unit.id) for unit in existing_units
    }

    replay = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        payload,
        format="json",
    )
    assert replay.status_code == status.HTTP_200_OK
    assert replay.data["idempotent_replay"] is True
    assert ProductionCycle.objects.filter(farm_profile=farm_profile).count() == 2
    assert CycleUnitAllocation.objects.filter(cycle__farm_profile=farm_profile).count() == 4


@pytest.mark.django_db
def test_additional_cycle_requires_completed_setup(auth_client):
    response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        {
            **additional_launch_payload(
                [ProductionUnit(id=uuid4())],
            ),
        },
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["code"] == "cycle_launch_mode_conflict"


@pytest.mark.django_db
def test_initial_setup_is_rejected_after_farm_configuration(auth_client, farm_profile):
    initial = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        launch_payload(),
        format="json",
    )
    assert initial.status_code == status.HTTP_201_CREATED

    response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        launch_payload(),
        format="json",
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["code"] == "cycle_launch_mode_conflict"


@pytest.mark.django_db
def test_initial_setup_requires_a_production_plan(auth_client):
    payload = launch_payload()
    payload.pop("production_plan")

    response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        payload,
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "production_plan" in response.data
    assert ProductionCycle.objects.count() == 0


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("species", "expected_price"),
    [("clarias", Decimal("2000.00")), ("tilapia", Decimal("2800.00"))],
)
def test_initial_setup_resolves_species_selling_price_default(
    auth_client,
    farm_profile,
    species,
    expected_price,
):
    payload = launch_payload()
    payload["cycle"]["species"] = species
    payload["cycle"].pop("planned_selling_price_per_kg_fcfa")
    payload["production_plan"].pop("planned_selling_price_per_kg_fcfa")

    response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        payload,
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    cycle = ProductionCycle.objects.get(farm_profile=farm_profile)
    plan = FarmProductionPlan.objects.get(farm_profile=farm_profile)
    assert cycle.planned_selling_price_per_kg_fcfa == expected_price
    assert plan.planned_selling_price_per_kg_fcfa == expected_price
    assert cycle.planned_selling_price_per_kg_fcfa != Decimal("1.00")


@pytest.mark.django_db
def test_launch_rejects_zero_selling_price(auth_client):
    payload = launch_payload()
    payload["cycle"]["planned_selling_price_per_kg_fcfa"] = "0"

    response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        payload,
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "planned_selling_price_per_kg_fcfa" in response.data["cycle"]


@pytest.mark.django_db
def test_additional_cycle_rejects_foreign_and_inactive_units(
    auth_client,
    farm_profile,
    user_factory,
):
    initial_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        launch_payload(),
        format="json",
    )
    assert initial_response.status_code == status.HTTP_201_CREATED
    own_units = list(ProductionUnit.objects.filter(farm_profile=farm_profile).order_by("name"))

    other_user = user_factory()
    other_farm = other_user.farm_profile
    foreign_unit = ProductionUnit.objects.create(
        farm_profile=other_farm,
        name="Bassin étranger",
        unit_type="tank",
        volume_m3=10,
    )
    foreign_payload = additional_launch_payload([foreign_unit])
    foreign_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        foreign_payload,
        format="json",
    )
    assert foreign_response.status_code == status.HTTP_404_NOT_FOUND

    own_units[0].status = "inactive"
    own_units[0].save(update_fields=["status", "updated_at"])
    inactive_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        additional_launch_payload(own_units),
        format="json",
    )
    assert inactive_response.status_code == status.HTTP_400_BAD_REQUEST
    assert inactive_response.data["code"] == "cycle_launch_unit_inactive"


@pytest.mark.django_db
def test_launch_preserves_client_unit_and_allocation_order(auth_client):
    payload = launch_payload()
    payload["production_units"].reverse()
    payload["allocations"].reverse()

    response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        payload,
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert [unit["name"] for unit in response.data["production_units"]] == [
        "Bassin B",
        "Bassin A",
    ]
    assert [allocation["initial_fish_count"] for allocation in response.data["cycle_unit_allocations"]] == [
        800,
        1200,
    ]


@pytest.mark.django_db
def test_additional_cycle_payload_change_returns_idempotency_conflict(auth_client, farm_profile):
    initial_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        launch_payload(),
        format="json",
    )
    assert initial_response.status_code == status.HTTP_201_CREATED
    existing_units = list(ProductionUnit.objects.filter(farm_profile=farm_profile).order_by("name"))
    payload = additional_launch_payload(existing_units)
    created = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        payload,
        format="json",
    )
    assert created.status_code == status.HTTP_201_CREATED

    conflict_payload = additional_launch_payload(
        list(reversed(existing_units)),
        launch_uuid=payload["launch_uuid"],
    )
    conflict = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        conflict_payload,
        format="json",
    )

    assert conflict.status_code == status.HTTP_409_CONFLICT
    assert conflict.data["code"] == "cycle_launch_idempotency_conflict"


@pytest.mark.django_db
def test_additional_cycle_rolls_back_cycle_and_allocations(
    auth_client,
    farm_profile,
    monkeypatch,
):
    initial_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        launch_payload(),
        format="json",
    )
    assert initial_response.status_code == status.HTTP_201_CREATED
    existing_units = list(ProductionUnit.objects.filter(farm_profile=farm_profile).order_by("name"))
    original_save = CycleUnitAllocation.save

    def fail_on_additional_second_allocation(self, *args, **kwargs):
        if self.initial_fish_count == 800 and self.cycle_id != initial_response.data["production_cycle"]["id"]:
            raise RuntimeError("injected additional allocation failure")
        return original_save(self, *args, **kwargs)

    monkeypatch.setattr(CycleUnitAllocation, "save", fail_on_additional_second_allocation)
    auth_client.raise_request_exception = False
    response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        additional_launch_payload(existing_units),
        format="json",
    )

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert ProductionCycle.objects.filter(farm_profile=farm_profile).count() == 1
    assert ProductionUnit.objects.filter(farm_profile=farm_profile).count() == 2
    assert CycleUnitAllocation.objects.filter(cycle__farm_profile=farm_profile).count() == 2


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
