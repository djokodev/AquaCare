"""Use cases applicatifs du Magasin de cycle."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils.translation import gettext_lazy as _

from ..models import CycleFeedStockEntry, ProductionCycle
from .cycle_store_service import CycleStorePayload, CycleStoreService
from .feed_reference_service import FeedReferenceService


@dataclass(frozen=True)
class DeclareManualStockCommand:
    """Commande applicative de déclaration manuelle de stock."""

    quantity_kg: Decimal
    total_cost_fcfa: Decimal
    entry_date: Any
    feed_reference_id: Any = None
    feed_reference_client_uuid: Any = None
    external_feed: dict[str, Any] | None = None
    label: str = ''
    feed_size_mm: Decimal | None = None
    note: str = ''
    client_uuid: Any = None
    created_offline: bool = False


@dataclass(frozen=True)
class DeclareOpeningStockCommand:
    """Opening balance captured exactly at the cycle tracking baseline."""

    quantity_kg: Decimal
    cost_status: str
    total_cost_fcfa: Decimal | None
    feed_reference_id: Any = None
    feed_reference_client_uuid: Any = None
    external_feed: dict[str, Any] | None = None
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
    @transaction.atomic
    def declare_manual_stock(
        *,
        user,
        cycle: ProductionCycle,
        command: DeclareManualStockCommand,
    ) -> CycleFeedStockEntry:
        """Enregistre une déclaration manuelle de stock."""
        feed_reference_by_id = None
        feed_reference_by_client_uuid = None
        if command.feed_reference_id:
            feed_reference_by_id = FeedReferenceService.get_owned(
                user=user,
                reference_id=command.feed_reference_id,
            )
        if command.feed_reference_client_uuid:
            feed_reference_by_client_uuid = FeedReferenceService.get_owned_by_client_uuid(
                user=user,
                farm_profile=cycle.farm_profile,
                client_uuid=command.feed_reference_client_uuid,
            )
        if (
            feed_reference_by_id is not None
            and feed_reference_by_client_uuid is not None
            and feed_reference_by_id.id != feed_reference_by_client_uuid.id
        ):
            raise ValueError(_('L’identifiant et le client_uuid désignent deux aliments différents.'))

        feed_reference = feed_reference_by_id or feed_reference_by_client_uuid
        if feed_reference is not None:
            pass
        elif command.external_feed or (command.label and command.feed_size_mm is not None):
            feed_reference = FeedReferenceService.create(
                user=user,
                farm_profile=cycle.farm_profile,
                data={
                    **(command.external_feed or {
                        'name': command.label,
                        'species': cycle.species,
                        'pellet_size_mm': command.feed_size_mm,
                    }),
                    'source': 'external',
                },
            )
        else:
            raise ValueError(_('Une référence aliment est requise.'))
        if feed_reference.farm_profile_id != cycle.farm_profile_id:
            raise PermissionError(_('Cet aliment appartient à une autre ferme.'))
        if feed_reference.species != cycle.species:
            raise ValueError(_('Cet aliment ne correspond pas à l’espèce du cycle.'))
        return CycleStoreService.declare_manual_stock(
            user=user,
            cycle=cycle,
            feed_reference=feed_reference,
            quantity_kg=command.quantity_kg,
            total_cost_fcfa=command.total_cost_fcfa,
            entry_date=command.entry_date,
            note=command.note,
            client_uuid=command.client_uuid,
            created_offline=command.created_offline,
        )

    @staticmethod
    def _resolve_feed_reference(
        *,
        user,
        cycle: ProductionCycle,
        feed_reference_id=None,
        feed_reference_client_uuid=None,
        external_feed: dict[str, Any] | None = None,
    ):
        feed_reference_by_id = None
        feed_reference_by_client_uuid = None
        if feed_reference_id:
            feed_reference_by_id = FeedReferenceService.get_owned(
                user=user,
                reference_id=feed_reference_id,
            )
        if feed_reference_client_uuid:
            feed_reference_by_client_uuid = FeedReferenceService.get_owned_by_client_uuid(
                user=user,
                farm_profile=cycle.farm_profile,
                client_uuid=feed_reference_client_uuid,
            )
        if (
            feed_reference_by_id is not None
            and feed_reference_by_client_uuid is not None
            and feed_reference_by_id.id != feed_reference_by_client_uuid.id
        ):
            raise ValueError(_('L’identifiant et le client_uuid désignent deux aliments différents.'))
        feed_reference = feed_reference_by_id or feed_reference_by_client_uuid
        if feed_reference is None and external_feed:
            requested_species = external_feed.get('species')
            if requested_species not in (None, cycle.species):
                raise ValueError(_('Cet aliment ne correspond pas à l’espèce du cycle.'))
            feed_reference = FeedReferenceService.create(
                user=user,
                farm_profile=cycle.farm_profile,
                data={
                    **external_feed,
                    'species': cycle.species,
                    'source': 'external',
                },
            )
        if feed_reference is None:
            raise ValueError(_('Une référence aliment est requise.'))
        if feed_reference.farm_profile_id != cycle.farm_profile_id:
            raise PermissionError(_('Cet aliment appartient à une autre ferme.'))
        if feed_reference.species != cycle.species:
            raise ValueError(_('Cet aliment ne correspond pas à l’espèce du cycle.'))
        return feed_reference

    @classmethod
    @transaction.atomic
    def declare_opening_stock(
        cls,
        *,
        user,
        cycle: ProductionCycle,
        command: DeclareOpeningStockCommand,
    ) -> CycleFeedStockEntry:
        feed_reference = cls._resolve_feed_reference(
            user=user,
            cycle=cycle,
            feed_reference_id=command.feed_reference_id,
            feed_reference_client_uuid=command.feed_reference_client_uuid,
            external_feed=command.external_feed,
        )
        return CycleStoreService.declare_opening_stock(
            user=user,
            cycle=cycle,
            feed_reference=feed_reference,
            quantity_kg=command.quantity_kg,
            cost_status=command.cost_status,
            total_cost_fcfa=command.total_cost_fcfa,
            note=command.note,
            client_uuid=command.client_uuid,
            created_offline=command.created_offline,
        )

    @staticmethod
    def import_received_order(order) -> list[CycleFeedStockEntry]:
        """Importe automatiquement les items alimentaires d'une commande reçue."""
        return CycleStoreService.import_received_order(order)

    @staticmethod
    def classify_legacy_stock(*, user, cycle, entry_id, feed_reference_id):
        feed_reference = FeedReferenceService.get_owned(user=user, reference_id=feed_reference_id)
        return CycleStoreService.classify_legacy_stock(
            user=user,
            cycle=cycle,
            entry_id=entry_id,
            feed_reference=feed_reference,
        )
