"""Pure canonicalization and deterministic identifiers for cycle launches."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any


def _canonical_value(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, (Decimal, uuid.UUID)):
        return str(value)
    if isinstance(value, dict):
        return {key: _canonical_value(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_canonical_value(item) for item in value]
    return value


def canonicalize_cycle_launch_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Return an order-independent copy without mutating the validated payload."""
    canonical = _canonical_value(payload)
    canonical["production_units"] = sorted(
        canonical.get("production_units", []),
        key=lambda unit: (
            unit.get("local_id", ""),
            unit.get("source", ""),
            unit.get("production_unit_id", ""),
        ),
    )
    canonical["allocations"] = sorted(
        canonical.get("allocations", []),
        key=lambda allocation: allocation.get("production_unit_local_id", ""),
    )
    return canonical


def calculate_cycle_launch_payload_hash(payload: dict[str, Any]) -> str:
    """Hash client intent independently from dictionary and array ordering."""
    encoded = json.dumps(
        canonicalize_cycle_launch_payload(payload),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def derive_unit_client_uuid(launch_uuid: uuid.UUID, local_id: str) -> uuid.UUID:
    return uuid.uuid5(launch_uuid, f"unit:{local_id}")


def derive_allocation_client_uuid(launch_uuid: uuid.UUID, local_id: str) -> uuid.UUID:
    return uuid.uuid5(launch_uuid, f"allocation:{local_id}")
