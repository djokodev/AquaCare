"""Compatibility adapter for the annual aquaculture simulation use case."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from aquaculture.services.annual_simulation_service import (
        AQUACARE_FEE_PER_KG,
        DEFAULT_OTHER_COSTS_RATE_PCT,
        DEFAULT_SURVIVAL_RATE,
        INITIAL_WEIGHT_G,
        SPECIES_DEFAULTS,
        TECHNICAL_PAUSE_BETWEEN_CYCLES_DAYS,
        AnnualSimulationResult,
        AnnualSimulationService,
        CycleBreakdown,
        ResolvedSimulationInputs,
    )

__all__ = [
    "AQUACARE_FEE_PER_KG",
    "DEFAULT_SURVIVAL_RATE",
    "INITIAL_WEIGHT_G",
    "DEFAULT_OTHER_COSTS_RATE_PCT",
    "TECHNICAL_PAUSE_BETWEEN_CYCLES_DAYS",
    "SPECIES_DEFAULTS",
    "AnnualSimulationResult",
    "AnnualSimulationService",
    "CycleBreakdown",
    "ResolvedSimulationInputs",
]


def __getattr__(name: str) -> Any:
    """Delegue les symboles vers aquaculture en lazy import (PEP 562)."""
    if name not in __all__:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    from aquaculture.services import annual_simulation_service as aquaculture_simulation

    return getattr(aquaculture_simulation, name)
