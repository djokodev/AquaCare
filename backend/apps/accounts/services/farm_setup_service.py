"""Compatibility adapter for the aquaculture farm setup use case."""

from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any

from accounts.models import FarmProfile

if TYPE_CHECKING:
    from aquaculture.services.farm_production_plan_service import FarmProductionPlanService


class FarmSetupService:
    """Facade accounts gardee pour compatibilite avec l'endpoint existant."""

    SETTINGS_FIELDS = frozenset({"default_feed_price_per_kg"})

    @staticmethod
    def _service() -> type[FarmProductionPlanService]:
        from aquaculture.services.farm_production_plan_service import FarmProductionPlanService

        return FarmProductionPlanService

    @classmethod
    def complete_setup(
        cls,
        farm_profile: FarmProfile,
        setup_data: dict[str, Any],
    ) -> FarmProfile:
        """Delegue la persistance et les regles de production a aquaculture."""
        return cls._service().complete_setup(farm_profile, setup_data)

    @classmethod
    def get_plan_data(cls, farm_profile: FarmProfile) -> dict[str, Any]:
        """Expose la lecture des parametres de plan pour les serializers accounts."""
        return cls._service().get_plan_data(farm_profile)

    @classmethod
    def update_settings(
        cls,
        farm_profile: FarmProfile,
        updates: Mapping[str, Any],
    ) -> None:
        """Expose la mise a jour des settings economiques du plan."""
        cls._service().update_settings(farm_profile, dict(updates))

    @classmethod
    def reset_for_account_deletion(cls, farm_profile: FarmProfile) -> None:
        """Expose la remise a zero du plan lors de l'anonymisation."""
        cls._service().reset_for_account_deletion(farm_profile)

    @classmethod
    def ensure_plan_exists(cls, farm_profile: FarmProfile) -> None:
        """Assure l'existence du plan de production par defaut pour une ferme."""
        cls._service().get_or_create_plan(farm_profile)
