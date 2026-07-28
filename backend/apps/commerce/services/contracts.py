"""Contrats typés (lecture seule) entre commerce et ses contextes externes."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Protocol


class ProductionCycleReadModel(Protocol):
    """Shape minimale d'un cycle aquaculture consomme par commerce."""

    id: object
    cycle_name: str
    species: str
    start_date: date
    planned_harvest_date: date | None
    planned_cycle_duration_days: int | None
    target_harvest_weight_g: Decimal | None


class CycleLogReadModel(Protocol):
    """Shape minimale d'un log aquaculture consomme par commerce."""

    feed_quantity: Decimal | None
    average_weight: Decimal | None
    sample_total_weight: Decimal | None
    sample_count: int | None
