"""Compatibility adapter for the aquaculture farm setup use case."""

from __future__ import annotations

from typing import Any

from aquaculture.services.farm_production_plan_service import FarmProductionPlanService
from accounts.models import FarmProfile


class FarmSetupService:
    """Facade accounts gardee pour compatibilite avec l'endpoint existant."""

    @classmethod
    def complete_setup(
        cls,
        farm_profile: FarmProfile,
        setup_data: dict[str, Any],
    ) -> FarmProfile:
        """Delegue la persistance et les regles de production a aquaculture."""
        return FarmProductionPlanService.complete_setup(farm_profile, setup_data)
