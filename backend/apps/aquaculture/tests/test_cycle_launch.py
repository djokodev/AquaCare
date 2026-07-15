from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from aquaculture.cycle_launch_serializers import CycleLaunchRequestSerializer
from aquaculture.models import CycleUnitAllocation, FarmProductionPlan, ProductionCycle, ProductionUnit
from aquaculture.services.cycle_launch_application_service import (
    CycleLaunchApplicationService,
    CycleLaunchUnitAlreadyAllocated,
    CycleLaunchUnitCapacityExceeded,
    CycleLaunchUnitCapacityUnavailable,
)
from aquaculture.services.cycle_service import ProductionCycleService
from django.db import connection
from django.urls import reverse
from django.utils import timezone
from django.utils.translation import override
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
def test_cycle_launch_creates_empty_calibration_units_atomically(auth_client, farm_profile):
    payload = launch_payload()
    tank_uuid = str(uuid4())
    payload['calibration_units'] = [
        {'client_uuid': tank_uuid, 'name': 'Bac de tri A', 'volume_m3': '10.00'},
    ]

    response = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        payload,
        format='json',
    )

    assert response.status_code == status.HTTP_201_CREATED
    tank = ProductionUnit.objects.get(client_uuid=tank_uuid)
    assert tank.farm_profile == farm_profile
    assert tank.unit_type == 'tank'
    assert tank.purpose == ProductionUnit.PURPOSE_CALIBRATION
    assert tank.cycle_allocations.count() == 0
    assert ProductionUnit.objects.filter(purpose=ProductionUnit.PURPOSE_PRODUCTION).count() == 2

    invalid = launch_payload()
    invalid['calibration_units'] = [
        {'client_uuid': str(uuid4()), 'name': 'Doublon', 'volume_m3': '10.00'},
        {'client_uuid': str(uuid4()), 'name': 'DOUBLON', 'volume_m3': '8.00'},
    ]
    rejected = auth_client.post(
        reverse('aquaculture:production_cycle_launch'),
        invalid,
        format='json',
    )
    assert rejected.status_code == status.HTTP_400_BAD_REQUEST
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
    initial_cycle = ProductionCycle.objects.get(farm_profile=farm_profile)
    ProductionCycleService.harvest_cycle(
        initial_cycle,
        harvest_date=date.today(),
        final_harvested_at=timezone.now(),
        client_uuid=uuid4(),
        final_count=2000,
        final_average_weight=Decimal("400"),
    )
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
def test_additional_cycle_rejects_occupied_unit_but_accepts_another_free_unit(
    auth_client,
    farm_profile,
):
    initial_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        launch_payload(),
        format="json",
    )
    assert initial_response.status_code == status.HTTP_201_CREATED
    occupied_unit = ProductionUnit.objects.filter(farm_profile=farm_profile).order_by("name").first()
    free_unit = ProductionUnit.objects.create(
        farm_profile=farm_profile,
        name="Bassin libre",
        unit_type="tank",
        volume_m3=12,
    )

    free_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        additional_launch_payload([free_unit]),
        format="json",
    )
    assert free_response.status_code == status.HTTP_201_CREATED

    occupied_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        additional_launch_payload([occupied_unit]),
        format="json",
    )

    assert occupied_response.status_code == status.HTTP_409_CONFLICT
    assert occupied_response.data["code"] == "cycle_launch_unit_already_allocated"
    assert ProductionCycle.objects.filter(farm_profile=farm_profile).count() == 2
    assert CycleUnitAllocation.objects.filter(cycle__farm_profile=farm_profile).count() == 3


@pytest.mark.django_db
def test_harvested_allocation_can_reuse_its_production_unit(auth_client, farm_profile):
    initial_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        launch_payload(),
        format="json",
    )
    assert initial_response.status_code == status.HTTP_201_CREATED
    allocation = CycleUnitAllocation.objects.filter(
        cycle__farm_profile=farm_profile,
        initial_fish_count=1200,
    ).get()
    ProductionCycleService.harvest_cycle_unit_allocation(
        allocation,
        harvest_date=date.today(),
        final_harvested_at=timezone.now(),
        client_uuid=uuid4(),
        final_count=1200,
        final_average_weight=Decimal("400"),
    )

    response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        additional_launch_payload([allocation.production_unit]),
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
def test_harvested_cycle_can_reuse_its_production_units(auth_client, farm_profile):
    initial_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        launch_payload(),
        format="json",
    )
    assert initial_response.status_code == status.HTTP_201_CREATED
    initial_cycle = ProductionCycle.objects.get(farm_profile=farm_profile)
    ProductionCycleService.harvest_cycle(
        initial_cycle,
        harvest_date=date.today(),
        final_harvested_at=timezone.now(),
        client_uuid=uuid4(),
        final_count=2000,
        final_average_weight=Decimal("400"),
    )
    existing_units = list(ProductionUnit.objects.filter(farm_profile=farm_profile).order_by("name"))

    response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        additional_launch_payload(existing_units),
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
def test_existing_tank_capacity_accepts_exact_limit_and_rejects_overflow(
    auth_client,
    farm_profile,
):
    initial_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        launch_payload(),
        format="json",
    )
    assert initial_response.status_code == status.HTTP_201_CREATED
    exact_unit = ProductionUnit.objects.create(
        farm_profile=farm_profile,
        name="Bac capacité exacte",
        unit_type="tank",
        volume_m3=4,
    )
    exact_payload = additional_launch_payload([exact_unit])
    exact_payload["cycle"]["initial_count"] = 1200
    exact_payload["allocations"][0]["fish_count"] = 1200
    exact_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        exact_payload,
        format="json",
    )
    assert exact_response.status_code == status.HTTP_201_CREATED

    overflow_unit = ProductionUnit.objects.create(
        farm_profile=farm_profile,
        name="Bac capacité dépassée",
        unit_type="tank",
        volume_m3=4,
    )
    overflow_payload = additional_launch_payload([overflow_unit])
    overflow_payload["cycle"]["initial_count"] = 1201
    overflow_payload["allocations"][0]["fish_count"] = 1201
    overflow_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        overflow_payload,
        format="json",
    )

    assert overflow_response.status_code == status.HTTP_400_BAD_REQUEST
    assert overflow_response.data["code"] == "cycle_launch_unit_capacity_exceeded"
    assert ProductionCycle.objects.filter(farm_profile=farm_profile).count() == 2


@pytest.mark.django_db
def test_existing_pond_capacity_is_validated(auth_client, farm_profile):
    initial_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        launch_payload(),
        format="json",
    )
    assert initial_response.status_code == status.HTTP_201_CREATED
    pond = ProductionUnit.objects.create(
        farm_profile=farm_profile,
        name="Étang capacité",
        unit_type="pond",
        surface_m2=120,
    )
    payload = additional_launch_payload([pond])
    payload["cycle"]["initial_count"] = 1200
    payload["allocations"][0]["fish_count"] = 1200

    response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        payload,
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
def test_existing_unit_without_dimensions_returns_structured_capacity_error(
    auth_client,
    farm_profile,
):
    initial_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        launch_payload(),
        format="json",
    )
    assert initial_response.status_code == status.HTTP_201_CREATED
    unit = ProductionUnit.objects.create(
        farm_profile=farm_profile,
        name="Bac sans dimension",
        unit_type="tank",
        volume_m3=4,
    )
    ProductionUnit.objects.filter(pk=unit.pk).update(volume_m3=None)
    payload = additional_launch_payload([unit])

    response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        payload,
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["code"] == "cycle_launch_unit_capacity_unavailable"
    assert ProductionCycle.objects.filter(farm_profile=farm_profile).count() == 1
    assert CycleUnitAllocation.objects.filter(cycle__farm_profile=farm_profile).count() == 2


@pytest.mark.django_db
def test_existing_unit_overflow_is_rejected_even_when_total_is_valid(
    auth_client,
    farm_profile,
):
    initial_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        launch_payload(),
        format="json",
    )
    assert initial_response.status_code == status.HTTP_201_CREATED
    first_unit = ProductionUnit.objects.create(
        farm_profile=farm_profile,
        name="Bac surcharge",
        unit_type="tank",
        volume_m3=4,
    )
    second_unit = ProductionUnit.objects.create(
        farm_profile=farm_profile,
        name="Bac équilibré",
        unit_type="tank",
        volume_m3=4,
    )
    payload = additional_launch_payload([first_unit, second_unit])
    payload["cycle"]["initial_count"] = 2400
    payload["allocations"] = [
        {"production_unit_local_id": f"selected-{first_unit.id}", "fish_count": 1201},
        {"production_unit_local_id": f"selected-{second_unit.id}", "fish_count": 1199},
    ]

    response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        payload,
        format="json",
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.data["code"] == "cycle_launch_unit_capacity_exceeded"
    assert ProductionCycle.objects.filter(farm_profile=farm_profile).count() == 1


@pytest.mark.django_db
def test_additional_cycle_preserves_custom_name_and_hashes_it(
    auth_client,
    farm_profile,
):
    initial_response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        launch_payload(),
        format="json",
    )
    assert initial_response.status_code == status.HTTP_201_CREATED
    ProductionCycleService.harvest_cycle(
        ProductionCycle.objects.get(farm_profile=farm_profile),
        harvest_date=date.today(),
        final_harvested_at=timezone.now(),
        client_uuid=uuid4(),
        final_count=2000,
        final_average_weight=Decimal("400"),
    )
    unit = ProductionUnit.objects.filter(farm_profile=farm_profile).order_by("name").first()
    payload = additional_launch_payload([unit])
    payload["cycle"]["cycle_name"] = "  Cycle Clarias Bassin Nord  "

    response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        payload,
        format="json",
    )
    assert response.status_code == status.HTTP_201_CREATED
    cycle = ProductionCycle.objects.get(client_uuid=payload["launch_uuid"])
    assert cycle.cycle_name == "Cycle Clarias Bassin Nord"

    replay = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        payload,
        format="json",
    )
    assert replay.status_code == status.HTTP_200_OK

    conflict_payload = {**payload, "cycle": {**payload["cycle"], "cycle_name": "Autre nom"}}
    conflict = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        conflict_payload,
        format="json",
    )
    assert conflict.status_code == status.HTTP_409_CONFLICT
    assert conflict.data["code"] == "cycle_launch_idempotency_conflict"


@pytest.mark.django_db
@pytest.mark.parametrize("cycle_name", [None, "   "])
def test_missing_or_blank_cycle_name_uses_backend_default(auth_client, cycle_name):
    payload = launch_payload()
    if cycle_name is None:
        payload["cycle"].pop("cycle_name", None)
    else:
        payload["cycle"]["cycle_name"] = cycle_name

    response = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        payload,
        format="json",
    )

    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["production_cycle"]["cycle_name"].startswith("Cycle Clarias")


@pytest.mark.django_db
@pytest.mark.parametrize(
    ("first_cycle_name", "retry_cycle_name"),
    [(None, "   "), ("   ", None)],
)
def test_cycle_launch_replays_when_cycle_name_is_missing_or_blank(
    auth_client,
    first_cycle_name,
    retry_cycle_name,
):
    payload = launch_payload()
    if first_cycle_name is not None:
        payload["cycle"]["cycle_name"] = first_cycle_name

    created = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        payload,
        format="json",
    )
    assert created.status_code == status.HTTP_201_CREATED

    retry_payload = {
        **payload,
        "cycle": {**payload["cycle"]},
    }
    if retry_cycle_name is None:
        retry_payload["cycle"].pop("cycle_name", None)
    else:
        retry_payload["cycle"]["cycle_name"] = retry_cycle_name

    replay = auth_client.post(
        reverse("aquaculture:production_cycle_launch"),
        retry_payload,
        format="json",
    )

    assert replay.status_code == status.HTTP_200_OK
    assert replay.data["idempotent_replay"] is True
    assert replay.data["production_cycle"]["id"] == created.data["production_cycle"]["id"]
    assert ProductionCycle.objects.count() == 1
    assert ProductionUnit.objects.count() == 2
    assert CycleUnitAllocation.objects.count() == 2


@pytest.mark.parametrize(
    ("language", "expected_messages"),
    [
        (
            "fr",
            [
                "Cette unité de production est déjà utilisée par un autre cycle actif.",
                "La capacité recommandée de l'unité de production est dépassée.",
                "La capacité de cette unité de production ne peut pas être déterminée.",
            ],
        ),
        (
            "en",
            [
                "This production unit is already assigned to another active cycle.",
                "The recommended capacity of the production unit has been exceeded.",
                "The capacity of this production unit cannot be determined.",
            ],
        ),
    ],
)
def test_new_launch_errors_are_localized(language, expected_messages):
    with override(language):
        assert str(CycleLaunchUnitAlreadyAllocated().detail) == expected_messages[0]
        assert str(CycleLaunchUnitCapacityExceeded().detail) == expected_messages[1]
        assert str(CycleLaunchUnitCapacityUnavailable().detail) == expected_messages[2]


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
    ProductionCycleService.harvest_cycle(
        ProductionCycle.objects.get(farm_profile=farm_profile),
        harvest_date=date.today(),
        final_harvested_at=timezone.now(),
        client_uuid=uuid4(),
        final_count=2000,
        final_average_weight=Decimal("400"),
    )
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
    ProductionCycleService.harvest_cycle(
        ProductionCycle.objects.get(farm_profile=farm_profile),
        harvest_date=date.today(),
        final_harvested_at=timezone.now(),
        client_uuid=uuid4(),
        final_count=2000,
        final_average_weight=Decimal("400"),
    )
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
def test_concurrent_name_identical_launches_create_one_aggregate(farm_profile):
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


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="Concurrent row-lock verification requires PostgreSQL",
)
def test_concurrent_different_launches_reserve_one_existing_unit(farm_profile):
    setup_serializer = CycleLaunchRequestSerializer(data=launch_payload())
    assert setup_serializer.is_valid(), setup_serializer.errors
    user = farm_profile.user
    initial_result = CycleLaunchApplicationService.launch(
        user,
        setup_serializer.validated_data,
    )
    unit = initial_result.production_units[0]
    CycleUnitAllocation.objects.filter(
        cycle=initial_result.production_cycle,
        production_unit=unit,
    ).update(status=CycleUnitAllocation.STATUS_HARVESTED)
    payloads = [
        additional_launch_payload([unit], launch_uuid=str(uuid4())),
        additional_launch_payload([unit], launch_uuid=str(uuid4())),
    ]
    validated_payloads = []
    for payload in payloads:
        serializer = CycleLaunchRequestSerializer(data=payload)
        assert serializer.is_valid(), serializer.errors
        validated_payloads.append(serializer.validated_data)

    def launch_once(payload):
        connection.close()
        try:
            return CycleLaunchApplicationService.launch(user, payload)
        except CycleLaunchUnitAlreadyAllocated:
            return "occupied"
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(launch_once, validated_payloads))

    assert sum(result != "occupied" for result in results) == 1
    assert results.count("occupied") == 1
    assert ProductionCycle.objects.filter(farm_profile=farm_profile).count() == 2
    assert ProductionUnit.objects.filter(farm_profile=farm_profile).count() == 2
    assert CycleUnitAllocation.objects.filter(cycle__farm_profile=farm_profile).count() == 3
