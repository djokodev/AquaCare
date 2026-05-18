"""Gateway commerce pour les acces au contexte aquaculture (cycles)."""

from __future__ import annotations

from typing import Any

from .contracts import ProductionCycleReadModel


class ProductionCycleAccessError(ValueError):
    """Erreur levee quand un cycle aquaculture est introuvable ou non accessible."""


class ProductionCycleGateway:
    """Facade pour limiter le couplage direct du module commerce vers aquaculture."""

    @staticmethod
    def get_user_cycle(*, user_id: Any, cycle_id: str | None):
        """
        Retourne le cycle aquaculture appartenant a l'utilisateur.

        Raises:
            ProductionCycleAccessError: cycle absent, invalide, ou non possede.
        """
        if not cycle_id:
            raise ProductionCycleAccessError("Cycle introuvable")

        from aquaculture.models import ProductionCycle

        try:
            cycle: ProductionCycleReadModel = ProductionCycle.objects.get(
                id=cycle_id,
                farm_profile__user_id=user_id,
            )
            return cycle
        except ProductionCycle.DoesNotExist as exc:
            raise ProductionCycleAccessError("Cycle introuvable") from exc
