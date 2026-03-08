"""Use cases applicatifs des plans d'alimentation aquacoles."""

from __future__ import annotations

from dataclasses import dataclass

from ..models import FeedingPlan, ProductionCycle
from .feeding_service import FeedingPlanService


class FeedingCycleNotFoundError(ValueError):
    """Cycle de reference introuvable pour la generation de plans."""


@dataclass(frozen=True)
class GenerateFeedingPlansCommand:
    """Commande applicative de generation de plans d'alimentation."""

    cycle_id: str
    weeks_ahead: int


class FeedingPlanApplicationService:
    """Use cases applicatifs exposes a la couche HTTP pour les plans d'alimentation."""

    @staticmethod
    def generate_feeding_plans(
        *,
        user,
        command: GenerateFeedingPlansCommand,
    ) -> list[FeedingPlan]:
        """Genere les plans d'alimentation pour un cycle appartenant a l'utilisateur."""
        cycle = ProductionCycle.objects.filter(
            id=command.cycle_id,
            farm_profile__user=user,
        ).first()
        if cycle is None:
            raise FeedingCycleNotFoundError("Cycle non trouvé")

        return FeedingPlanService.generate_weekly_plans(
            cycle=cycle,
            weeks_ahead=command.weeks_ahead,
        )
