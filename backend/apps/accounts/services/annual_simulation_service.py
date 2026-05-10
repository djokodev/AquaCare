"""Compatibility adapter for the annual aquaculture simulation use case."""

from aquaculture.services.annual_simulation_service import (
    AQUACARE_FEE_PER_KG,
    DEFAULT_SURVIVAL_RATE,
    INITIAL_WEIGHT_G,
    SPECIES_DEFAULTS,
    AnnualSimulationResult,
    AnnualSimulationService,
    CycleBreakdown,
    ResolvedSimulationInputs,
)

__all__ = [
    "AQUACARE_FEE_PER_KG",
    "DEFAULT_SURVIVAL_RATE",
    "INITIAL_WEIGHT_G",
    "SPECIES_DEFAULTS",
    "AnnualSimulationResult",
    "AnnualSimulationService",
    "CycleBreakdown",
    "ResolvedSimulationInputs",
]
