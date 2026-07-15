"""Use cases applicatifs des cycles aquacoles."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from ..models import PartialHarvest, ProductionCycle
from .analytics_service import AnalyticsService
from .cycle_service import CycleCreatePayload, HarvestCycleResult, ProductionCycleService


@dataclass(frozen=True)
class HarvestCycleCommand:
    """Commande applicative de recolte d'un cycle."""

    harvest_date: Any
    final_count: int
    final_average_weight: Decimal
    final_harvested_at: Any
    client_uuid: Any
    harvest_notes: str = ""
    total_harvested_weight: Decimal | None = None
    created_offline: bool = False
    allow_pending_reconciliation: bool = False


@dataclass(frozen=True)
class PartialHarvestCommand:
    """Commande applicative de récolte partielle d'un cycle."""

    harvest_date: Any
    count_harvested: int
    average_weight_g: Decimal
    sale_price_fcfa_per_kg: Decimal | None = None
    notes: str = ""
    client_uuid: Any = None
    created_offline: bool = False


class ProductionCycleApplicationService:
    """Use cases applicatifs exposes a la couche HTTP pour les cycles."""

    @staticmethod
    def create_cycle(user, cycle_data: CycleCreatePayload) -> ProductionCycle:
        """Cree un cycle pour la ferme de l'utilisateur courant."""
        return ProductionCycleService.create_cycle(
            farm_profile=user.farm_profile,
            cycle_data=cycle_data,
        )

    @staticmethod
    def harvest_cycle(
        cycle: ProductionCycle,
        command: HarvestCycleCommand,
    ) -> HarvestCycleResult:
        """Finalise un cycle via la couche applicative."""
        return ProductionCycleService.harvest_cycle(
            cycle=cycle,
            harvest_date=command.harvest_date,
            final_harvested_at=command.final_harvested_at,
            final_count=command.final_count,
            final_average_weight=command.final_average_weight,
            client_uuid=command.client_uuid,
            harvest_notes=command.harvest_notes,
            total_harvested_weight=command.total_harvested_weight,
            created_offline=command.created_offline,
            allow_pending_reconciliation=command.allow_pending_reconciliation,
        )

    @staticmethod
    def partial_harvest_cycle(
        cycle: ProductionCycle,
        command: PartialHarvestCommand,
    ) -> tuple[ProductionCycle, PartialHarvest]:
        """Enregistre une récolte partielle via la couche applicative."""
        return ProductionCycleService.partial_harvest_cycle(
            cycle=cycle,
            harvest_date=command.harvest_date,
            count_harvested=command.count_harvested,
            average_weight_g=command.average_weight_g,
            sale_price_fcfa_per_kg=command.sale_price_fcfa_per_kg,
            notes=command.notes,
            client_uuid=command.client_uuid,
            created_offline=command.created_offline,
        )

    @staticmethod
    def partial_harvest_cycle_unit_allocation(
        allocation,
        command: PartialHarvestCommand,
    ) -> tuple[ProductionCycle, Any, PartialHarvest]:
        """Enregistre une récolte partielle sur une allocation d'unité."""
        return ProductionCycleService.partial_harvest_cycle_unit_allocation(
            allocation=allocation,
            harvest_date=command.harvest_date,
            count_harvested=command.count_harvested,
            average_weight_g=command.average_weight_g,
            sale_price_fcfa_per_kg=command.sale_price_fcfa_per_kg,
            notes=command.notes,
            client_uuid=command.client_uuid,
            created_offline=command.created_offline,
        )

    @staticmethod
    def harvest_cycle_unit_allocation(
        allocation,
        command: HarvestCycleCommand,
    ) -> tuple[ProductionCycle, Any, Any, bool]:
        """Finalise une allocation d'unité via la couche applicative."""
        return ProductionCycleService.harvest_cycle_unit_allocation(
            allocation=allocation,
            harvest_date=command.harvest_date,
            final_harvested_at=command.final_harvested_at,
            final_count=command.final_count,
            final_average_weight=command.final_average_weight,
            client_uuid=command.client_uuid,
            harvest_notes=command.harvest_notes,
            total_harvested_weight=command.total_harvested_weight,
            created_offline=command.created_offline,
            allow_pending_reconciliation=command.allow_pending_reconciliation,
        )

    @staticmethod
    def get_cycle_statistics(cycle: ProductionCycle) -> dict[str, Any]:
        """Retourne les statistiques d'un cycle pour l'adapter HTTP."""
        return AnalyticsService.get_cycle_statistics(cycle)

    @staticmethod
    def compare_cycle_with_history(
        cycle: ProductionCycle,
        *,
        limit: int = 3,
    ) -> dict[str, Any]:
        """Construit la comparaison historique d'un cycle."""
        return AnalyticsService.compare_with_previous_cycles(cycle, limit=limit)
