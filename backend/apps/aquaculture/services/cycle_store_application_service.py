"""Use cases applicatifs du Magasin de cycle."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from ..models import CycleFeedStockEntry, ProductionCycle
from .cycle_store_service import CycleStorePayload, CycleStoreService


@dataclass(frozen=True)
class DeclareManualStockCommand:
    """Commande applicative de déclaration manuelle de stock."""

    label: str
    quantity_kg: Decimal
    total_cost_fcfa: Decimal
    entry_date: Any
    note: str = ''
    client_uuid: Any = None
    created_offline: bool = False


class CycleStoreApplicationService:
    """Use cases du Magasin exposés à la couche HTTP et au commerce."""

    @staticmethod
    def get_store(cycle: ProductionCycle) -> CycleStorePayload:
        """Retourne le payload du Magasin pour un cycle."""
        return CycleStoreService.get_store_payload(cycle)

    @staticmethod
    def declare_manual_stock(
        *,
        user,
        cycle: ProductionCycle,
        command: DeclareManualStockCommand,
    ) -> CycleFeedStockEntry:
        """Enregistre une déclaration manuelle de stock."""
        return CycleStoreService.declare_manual_stock(
            user=user,
            cycle=cycle,
            label=command.label,
            quantity_kg=command.quantity_kg,
            total_cost_fcfa=command.total_cost_fcfa,
            entry_date=command.entry_date,
            note=command.note,
            client_uuid=command.client_uuid,
            created_offline=command.created_offline,
        )

    @staticmethod
    def import_received_order(order) -> list[CycleFeedStockEntry]:
        """Importe automatiquement les items alimentaires d'une commande reçue."""
        return CycleStoreService.import_received_order(order)
