"""Use cases applicatifs des plans d'alimentation aquacoles."""

from __future__ import annotations

from dataclasses import dataclass

from django.utils.translation import gettext_lazy as _
from rest_framework.exceptions import NotFound

from ..domain.exceptions import FeedingPlanGenerationError
from ..models import CycleUnitAllocation, FeedingPlan
from .feeding_service import FeedingPlanService


class FeedingCycleNotFoundError(NotFound):
    """Cycle de reference introuvable pour la generation de plans."""

    default_detail = _("Cycle non trouvé")
    default_code = "feeding_cycle_not_found"


@dataclass(frozen=True)
class GenerateFeedingPlansCommand:
    """Commande applicative de generation de plans d'alimentation."""

    cycle_unit_allocation_id: str
    weeks_ahead: int
    cycle_id: str | None = None


class FeedingPlanApplicationService:
    """Use cases applicatifs exposes a la couche HTTP pour les plans d'alimentation."""

    @staticmethod
    def generate_feeding_plans(
        *,
        user,
        command: GenerateFeedingPlansCommand,
    ) -> list[FeedingPlan]:
        """Genere les plans d'alimentation pour une allocation d'unité appartenant a l'utilisateur."""
        if not command.cycle_unit_allocation_id:
            raise FeedingPlanGenerationError(
                _("Le plan d'alimentation doit être généré depuis une unité de production.")
            )

        allocation = CycleUnitAllocation.objects.select_related(
            'cycle',
            'cycle__farm_profile__user',
            'production_unit',
            'production_unit__farm_profile',
        ).filter(
            id=command.cycle_unit_allocation_id,
            cycle__farm_profile__user=user,
        ).first()
        if allocation is None:
            raise FeedingPlanGenerationError(
                _("L'allocation de cycle par unité est introuvable ou ne vous appartient pas.")
            )

        if command.cycle_id and str(allocation.cycle_id) != str(command.cycle_id):
            raise FeedingPlanGenerationError(
                _("L'allocation ne correspond pas au cycle demandé.")
            )

        if allocation.cycle.status != 'active':
            raise FeedingPlanGenerationError(
                _("Impossible de générer des plans pour un cycle non actif")
            )

        return FeedingPlanService.generate_weekly_plans_for_allocation(
            allocation=allocation,
            weeks_ahead=command.weeks_ahead,
        )
