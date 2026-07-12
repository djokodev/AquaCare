from datetime import date
from decimal import Decimal
from uuid import UUID

import pytest
from aquaculture.domain.cycle_launch_idempotency import (
    calculate_cycle_launch_payload_hash,
    canonicalize_cycle_launch_payload,
)


def launch_payload() -> dict:
    return {
        "launch_uuid": UUID("8bfdbf37-ef57-4829-a9b6-98a0c2645a31"),
        "launch_kind": "additional_cycle",
        "cycle": {"start_date": date(2026, 10, 1), "initial_count": 2000},
        "production_units": [
            {"local_id": "b", "source": "existing", "production_unit_id": UUID("22222222-2222-2222-2222-222222222222")},
            {"local_id": "a", "source": "existing", "production_unit_id": UUID("11111111-1111-1111-1111-111111111111")},
        ],
        "allocations": [
            {"production_unit_local_id": "b", "fish_count": 800},
            {"production_unit_local_id": "a", "fish_count": 1200},
        ],
        "decimal_value": Decimal("1.00"),
    }


def test_hash_is_stable_for_key_and_array_order_changes_without_mutating_payload():
    payload = launch_payload()
    reordered = {
        **payload,
        "cycle": {"initial_count": 2000, "start_date": date(2026, 10, 1)},
        "production_units": list(reversed(payload["production_units"])),
        "allocations": list(reversed(payload["allocations"])),
    }
    original_order = [unit["local_id"] for unit in payload["production_units"]]

    assert calculate_cycle_launch_payload_hash(payload) == calculate_cycle_launch_payload_hash(reordered)
    assert [unit["local_id"] for unit in payload["production_units"]] == original_order
    assert canonicalize_cycle_launch_payload(payload)["production_units"][0]["local_id"] == "a"


def test_hash_changes_when_existing_unit_selection_changes():
    payload = launch_payload()
    changed = launch_payload()
    changed["production_units"][0]["production_unit_id"] = UUID("33333333-3333-3333-3333-333333333333")

    assert calculate_cycle_launch_payload_hash(payload) != calculate_cycle_launch_payload_hash(changed)


@pytest.mark.parametrize("blank_cycle_name", ["", "   "])
def test_missing_cycle_name_hash_matches_blank_cycle_name(blank_cycle_name):
    missing = launch_payload()
    blank = launch_payload()
    blank["cycle"]["cycle_name"] = blank_cycle_name

    assert calculate_cycle_launch_payload_hash(missing) == calculate_cycle_launch_payload_hash(blank)


def test_cycle_name_hash_is_stable_after_trimming():
    trimmed = launch_payload()
    padded = launch_payload()
    trimmed["cycle"]["cycle_name"] = "Cycle Test"
    padded["cycle"]["cycle_name"] = "  Cycle Test  "

    assert calculate_cycle_launch_payload_hash(trimmed) == calculate_cycle_launch_payload_hash(padded)


def test_cycle_name_hash_changes_for_different_non_empty_names():
    first = launch_payload()
    second = launch_payload()
    first["cycle"]["cycle_name"] = "Cycle Test"
    second["cycle"]["cycle_name"] = "Autre cycle"

    assert calculate_cycle_launch_payload_hash(first) != calculate_cycle_launch_payload_hash(second)


def test_cycle_name_canonicalization_does_not_mutate_payload():
    payload = launch_payload()
    payload["cycle"]["cycle_name"] = "  Cycle Test  "
    original_payload = {
        **payload,
        "cycle": {**payload["cycle"]},
        "production_units": [*payload["production_units"]],
        "allocations": [*payload["allocations"]],
    }

    canonicalize_cycle_launch_payload(payload)
    calculate_cycle_launch_payload_hash(payload)

    assert payload == original_payload
    assert payload["cycle"]["cycle_name"] == "  Cycle Test  "
