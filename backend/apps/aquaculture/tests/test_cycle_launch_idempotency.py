from datetime import date
from decimal import Decimal
from uuid import UUID

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
