"""Service métier du Magasin de cycle."""

from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Any, TypedDict

from accounts.models import User
from commerce.models import Order, OrderItem, Product
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from ..domain.exceptions import (
    EventBeforeTrackingStartError,
    FeedStockValidationError,
    StockEntryIdempotencyConflict,
)
from ..models import (
    CycleFeedStockAdjustment,
    CycleFeedStockEntry,
    CycleLog,
    FarmFeedReference,
    ProductionCycle,
)
from .base import BaseService
from .feed_stock_ledger_service import FeedStockLedgerService, FeedStockReservation

logger = logging.getLogger(__name__)

LOW_STOCK_THRESHOLD_KG = Decimal('25')
ZERO_DECIMAL = Decimal('0')
BIOMASS_QUANTIZE = Decimal('0.01')


class CycleStorePendingOrder(TypedDict):
    id: str
    order_number: str
    status: str
    delivery_method: str
    total_bags: int
    total_fcfa: str
    estimated_feed_kg: str
    created_at: datetime


class CycleStoreSummary(TypedDict):
    manual_feed_kg: str
    received_order_feed_kg: str
    total_feed_added_kg: str
    feed_consumed_kg: str
    estimated_feed_remaining_kg: str
    feed_expenses_fcfa: str
    known_feed_expenses_fcfa: str
    known_opening_stock_cost_fcfa: str
    tracked_feed_expenses_fcfa: str
    unknown_cost_entries_count: int
    cost_history_complete: bool
    pending_orders_count: int
    pending_order_amount_fcfa: str
    pending_order_feed_kg: str
    total_feed_needed_kg: str | None
    feed_need_remaining_kg: str | None
    secured_feed_kg: str | None
    feed_to_secure_kg: str | None
    stock_tracking_started_at: date | None
    unclassified_stock_kg: str


class CycleStoreStockItem(TypedDict):
    feed_reference_id: str | None
    source: str | None
    species: str | None
    label: str
    feed_size_mm: str | None
    quantity_added_kg: str
    quantity_consumed_kg: str
    quantity_available_kg: str


class CycleStoreStockBySize(TypedDict):
    feed_size_mm: str
    quantity_added_kg: str
    quantity_consumed_kg: str
    quantity_available_kg: str


class CycleStoreUnclassifiedEntry(TypedDict):
    id: str
    label: str
    quantity_kg: str
    quantity_added_kg: str
    historical_consumption_kg: str
    quantity_available_kg: str
    source: str
    classification_reason: str
    catalog_product_id: str | None
    catalog_product_species: str | None
    catalog_product_pellet_size_mm: str | None


class CycleStorePayload(TypedDict):
    cycle_id: str
    summary: CycleStoreSummary
    status: str
    calculation_status: str
    calculation_source: str
    calculated_at: datetime
    calculation_warnings: list[str]
    stock_items: list[CycleStoreStockItem]
    stock_by_size: list[CycleStoreStockBySize]
    available_pellet_sizes: list[str]
    recommended_pellet_size_mm: str | None
    pending_orders: list[CycleStorePendingOrder]
    stock_tracking_started_at: date | None
    unclassified_entries: list[CycleStoreUnclassifiedEntry]


class CycleStoreService(BaseService):
    """Logique métier du stock d'aliments au niveau cycle."""

    @staticmethod
    def _quantize(value: Decimal) -> Decimal:
        return value.quantize(BIOMASS_QUANTIZE)

    @staticmethod
    def _to_decimal(value: Any) -> Decimal:
        if isinstance(value, Decimal):
            return value
        if value is None:
            return ZERO_DECIMAL
        return Decimal(str(value))

    @staticmethod
    def _ensure_cycle_owner(cycle: ProductionCycle, user: User) -> None:
        if cycle.farm_profile.user_id != user.id:
            raise PermissionError("Cycle non autorisé.")

    @classmethod
    def _available_pellet_sizes(cls, cycle: ProductionCycle) -> list[str]:
        """Retourne les granulométries compatibles avec l'espèce du cycle.

        Les valeurs viennent des plans persistés, du catalogue et des références
        déjà enregistrées. Elles restent des chaînes afin de préserver le contrat
        Decimal de l'API sans imposer une liste codée dans le mobile.
        """
        sizes: set[Decimal] = set()
        plan = getattr(cycle, 'feed_plan_snapshot', None)
        if plan is not None:
            for phase in plan.phases or []:
                value = phase.get('pellet_size_mm')
                if value is not None:
                    sizes.add(cls._to_decimal(value))

        catalog_species = 'catfish' if cycle.species == 'clarias' else cycle.species
        sizes.update(
            cls._to_decimal(value)
            for value in Product.objects.filter(
                is_available=True,
                species=catalog_species,
                pellet_size_mm__isnull=False,
            ).values_list('pellet_size_mm', flat=True)
        )
        sizes.update(
            cls._to_decimal(value)
            for value in FarmFeedReference.objects.filter(
                farm_profile=cycle.farm_profile,
                species=cycle.species,
                pellet_size_mm__isnull=False,
            ).values_list('pellet_size_mm', flat=True)
        )
        return [str(cls._quantize(value).normalize()) for value in sorted(sizes)]

    @classmethod
    def _stock_by_size(
        cls,
        *,
        cycle: ProductionCycle,
        stock_items: list[CycleStoreStockItem],
        at_date: date | None = None,
    ) -> list[CycleStoreStockBySize]:
        grouped: dict[Decimal, CycleStoreStockBySize] = {}
        for item in stock_items:
            if item.get('feed_reference_id') is None:
                continue
            size = item.get('feed_size_mm')
            if size is None:
                continue
            size_decimal = cls._to_decimal(size)
            current = grouped.setdefault(size_decimal, {
                'feed_size_mm': str(cls._quantize(size_decimal).normalize()),
                'quantity_added_kg': '0.00',
                'quantity_consumed_kg': '0.00',
                'quantity_available_kg': '0.00',
            })
            current['quantity_added_kg'] = str(cls._quantize(
                cls._to_decimal(current['quantity_added_kg'])
                + cls._to_decimal(item['quantity_added_kg'])
            ))

        for size_decimal, current in grouped.items():
            state = FeedStockLedgerService.calculate_for_size(
                cycle=cycle,
                feed_size_mm=size_decimal,
                at_date=at_date,
            )
            added = cls._to_decimal(current['quantity_added_kg'])
            # Le magasin et la validation doivent utiliser le même solde
            # réellement disponible à la date courante, sans financer une
            # ration passée avec une entrée future.
            available = min(state.balance_at_date, state.future_headroom)
            current['quantity_consumed_kg'] = str(cls._quantize(added - available))
            current['quantity_available_kg'] = str(cls._quantize(available))
        return [grouped[size] for size in sorted(grouped)]

    @staticmethod
    def _can_import_order_item(
        order_item: OrderItem,
        cycle: ProductionCycle | None = None,
    ) -> bool:
        package_weight = order_item.product_package_weight_kg_snapshot
        if package_weight is None:
            package_weight = getattr(order_item.product, 'package_weight_kg', None)
        if package_weight is None:
            return False
        try:
            valid = Decimal(str(package_weight)) > ZERO_DECIMAL and order_item.quantity > 0
            if not valid or cycle is None:
                return valid
            from .feed_reference_service import FeedReferenceService

            species = order_item.product_species_snapshot or getattr(
                order_item.product,
                'species',
                '',
            )
            return FeedReferenceService.normalize_species(species) == cycle.species
        except (TypeError, ValueError):
            return False

    @staticmethod
    def _calculate_order_item_feed_kg(order_item: OrderItem) -> Decimal:
        if not CycleStoreService._can_import_order_item(order_item):
            return ZERO_DECIMAL
        package_weight = order_item.product_package_weight_kg_snapshot
        if package_weight is None:
            package_weight = order_item.product.package_weight_kg
        return CycleStoreService._to_decimal(package_weight) * CycleStoreService._to_decimal(
            order_item.quantity
        )

    @staticmethod
    def _calculate_pending_order_feed_kg(order: Order) -> Decimal:
        total = ZERO_DECIMAL
        for item in order.items.select_related('product').all():
            total += CycleStoreService._calculate_order_item_feed_kg(item)
        return total

    @staticmethod
    def _calculate_feed_consumed_kg(cycle: ProductionCycle, since_date) -> Decimal:
        if since_date is None:
            return ZERO_DECIMAL

        if cycle.unit_allocations.exists():
            queryset = CycleLog.objects.filter(
                cycle=cycle,
                cycle_unit_allocation__isnull=False,
                log_date__gte=since_date,
            )
        else:
            queryset = CycleLog.objects.filter(
                cycle=cycle,
                cycle_unit_allocation__isnull=True,
                log_date__gte=since_date,
            )

        result = queryset.aggregate(total=Sum('feed_quantity'))
        return CycleStoreService._to_decimal(result['total'])

    @staticmethod
    def _normalize_feed_label(value: str | None) -> str:
        return ' '.join((value or '').strip().casefold().split())

    @staticmethod
    def _normalize_feed_size(value: Any) -> Decimal | None:
        if value in (None, ''):
            return None
        return CycleStoreService._to_decimal(value).quantize(Decimal('0.01'))

    @staticmethod
    def _entry_feed_size(entry: CycleFeedStockEntry) -> Decimal | None:
        if entry.feed_size_mm is not None:
            return CycleStoreService._normalize_feed_size(entry.feed_size_mm)
        product = getattr(entry, 'product', None)
        return CycleStoreService._normalize_feed_size(
            getattr(product, 'pellet_size_mm', None)
        )

    @staticmethod
    def _feed_identity(label: str | None, feed_size_mm: Any) -> tuple[str, Decimal | None]:
        return (
            CycleStoreService._normalize_feed_label(label),
            CycleStoreService._normalize_feed_size(feed_size_mm),
        )

    @staticmethod
    def _get_consumption_queryset(cycle: ProductionCycle, since_date=None):
        queryset = FeedStockLedgerService.consumption_queryset(cycle)
        if since_date is not None:
            queryset = queryset.filter(log_date__gte=since_date)
        return queryset

    @staticmethod
    def get_available_feed_quantity(
        *,
        cycle: ProductionCycle,
        feed_reference: FarmFeedReference,
        log_date: date | None = None,
        existing_log: CycleLog | None = None,
        reserved_feed_kg: Decimal = ZERO_DECIMAL,
        reserved_feed_events: list[FeedStockReservation] | None = None,
    ) -> tuple[Decimal, date | None]:
        """Retourne le solde à la date demandée depuis le ledger canonique."""
        reservations = list(reserved_feed_events or [])
        if reserved_feed_kg > ZERO_DECIMAL:
            reservations.append(
                FeedStockLedgerService.reservation(
                    log_date=log_date or timezone.localdate(),
                    quantity_kg=CycleStoreService._to_decimal(reserved_feed_kg),
                    event_id="legacy-reservation",
                )
            )
        state = FeedStockLedgerService.calculate_for_size(
            cycle=cycle,
            feed_size_mm=CycleStoreService._to_decimal(feed_reference.pellet_size_mm),
            at_date=log_date,
            existing_log=existing_log,
            reservations=reservations,
        )
        return min(state.balance_at_date, state.future_headroom), state.tracking_started_at

    @staticmethod
    def _allocate_legacy_consumption(
        *,
        cycle: ProductionCycle,
        entries: list[CycleFeedStockEntry],
    ) -> dict[Any, Decimal]:
        """Alloue les rations legacy aux entrées compatibles en FIFO chronologique.

        Une entrée déjà classifiée est incluse uniquement si elle possède un
        ajustement ``legacy_consumption``. Cela permet de rejouer exactement la
        même allocation après une classification successive sans réattribuer
        une ration legacy à une seconde entrée.
        """
        adjustments = {
            adjustment.stock_entry_id: CycleStoreService._to_decimal(adjustment.quantity_kg)
            for adjustment in CycleFeedStockAdjustment.objects.filter(
                stock_entry_id__in=[entry.id for entry in entries],
                reason=CycleFeedStockAdjustment.REASON_LEGACY_CONSUMPTION,
            )
        }
        eligible_entries = list(entries)
        allocations = {entry.id: ZERO_DECIMAL for entry in eligible_entries}
        entries_by_identity: dict[
            tuple[str, Decimal | None],
            list[CycleFeedStockEntry],
        ] = {}
        for entry in eligible_entries:
            entries_by_identity.setdefault(
                CycleStoreService._feed_identity(
                    entry.label,
                    CycleStoreService._entry_feed_size(entry),
                ),
                [],
            ).append(entry)
        for identity_entries in entries_by_identity.values():
            identity_entries.sort(
                key=lambda item: (item.entry_date, item.created_at, str(item.id))
            )

        entries_by_size: dict[Decimal, list[CycleFeedStockEntry]] = {}
        for entry in eligible_entries:
            size = CycleStoreService._entry_feed_size(entry)
            if size is not None:
                entries_by_size.setdefault(size, []).append(entry)
        for size_entries in entries_by_size.values():
            size_entries.sort(
                key=lambda item: (item.entry_date, item.created_at, str(item.id))
            )

        logs = (
            CycleStoreService._get_consumption_queryset(cycle)
            .filter(feed_reference__isnull=True, feed_quantity__gt=0)
            .order_by("log_date", "created_at", "id")
        )
        remaining_by_entry = {
            entry.id: max(
                ZERO_DECIMAL,
                CycleStoreService._to_decimal(entry.quantity_kg)
                - CycleStoreService._to_decimal(adjustments.get(entry.id, ZERO_DECIMAL)),
            )
            for entry in eligible_entries
        }
        for log in logs:
            size = CycleStoreService._normalize_feed_size(log.feed_size_mm)
            identity = CycleStoreService._feed_identity(log.feed_type, size)
            remaining_consumption = CycleStoreService._to_decimal(log.feed_quantity)
            candidates = entries_by_size.get(size, []) if size is not None else entries_by_identity.get(identity, [])
            for entry in candidates:
                if entry.entry_date > log.log_date or remaining_consumption <= ZERO_DECIMAL:
                    continue
                available = remaining_by_entry[entry.id]
                allocated = min(available, remaining_consumption)
                allocations[entry.id] += allocated
                remaining_by_entry[entry.id] -= allocated
                remaining_consumption -= allocated
        return allocations

    @staticmethod
    def _build_stock_items(
        *,
        cycle: ProductionCycle,
        entries: list[CycleFeedStockEntry],
        stock_tracking_started_at: date | None,
    ) -> list[CycleStoreStockItem]:
        grouped: dict[Any, dict[str, Any]] = {}
        adjustments = {
            adjustment.stock_entry_id: adjustment.quantity_kg
            for adjustment in CycleFeedStockAdjustment.objects.filter(
                stock_entry_id__in=[entry.id for entry in entries]
            )
        }
        legacy_allocations = CycleStoreService._allocate_legacy_consumption(
            cycle=cycle,
            entries=entries,
        )
        for entry in entries:
            size = CycleStoreService._entry_feed_size(entry)
            identity = (
                ('reference', entry.feed_reference_id)
                if entry.feed_reference_id
                else ('legacy', *CycleStoreService._feed_identity(entry.label, size))
            )
            item = grouped.setdefault(
                identity,
                {
                    'feed_reference_id': str(entry.feed_reference_id) if entry.feed_reference_id else None,
                    'source': entry.feed_reference.source if entry.feed_reference_id else None,
                    'species': entry.feed_reference.species if entry.feed_reference_id else None,
                    'label': entry.label.strip(),
                    'feed_size_mm': size,
                    'quantity_added_kg': ZERO_DECIMAL,
                    'quantity_consumed_kg': ZERO_DECIMAL,
                    '_feed_reference': entry.feed_reference if entry.feed_reference_id else None,
                },
            )
            item['quantity_added_kg'] += entry.quantity_kg
            item['quantity_consumed_kg'] += adjustments.get(entry.id, ZERO_DECIMAL)
            item['quantity_consumed_kg'] += max(
                ZERO_DECIMAL,
                legacy_allocations.get(entry.id, ZERO_DECIMAL)
                - adjustments.get(entry.id, ZERO_DECIMAL),
            )

        if stock_tracking_started_at is not None:
            logs = CycleStoreService._get_consumption_queryset(
                cycle,
                stock_tracking_started_at,
            ).exclude(feed_quantity__isnull=True)
            for log in logs.only('feed_quantity', 'feed_type', 'feed_size_mm', 'feed_reference_id'):
                identity = (
                    ('reference', log.feed_reference_id)
                    if log.feed_reference_id
                    else ('legacy', *CycleStoreService._feed_identity(log.feed_type, log.feed_size_mm))
                )
                if identity in grouped and log.feed_reference_id:
                    grouped[identity]['quantity_consumed_kg'] += CycleStoreService._to_decimal(
                        log.feed_quantity
                    )

        result: list[CycleStoreStockItem] = []
        reference_items_by_size: dict[Decimal, list[dict[str, Any]]] = {}
        reference_first_entry: dict[str, tuple[date, datetime, str]] = {}
        for entry in entries:
            if entry.feed_reference_id is None:
                continue
            reference_id = str(entry.feed_reference_id)
            order_key = (entry.entry_date, entry.created_at, reference_id)
            current_key = reference_first_entry.get(reference_id)
            if current_key is None or order_key < current_key:
                reference_first_entry[reference_id] = order_key
        for item in grouped.values():
            if item['_feed_reference'] is not None and item['feed_size_mm'] is not None:
                reference_items_by_size.setdefault(item['feed_size_mm'], []).append(item)

        for size, size_items in reference_items_by_size.items():
            state = FeedStockLedgerService.calculate_for_size(
                cycle=cycle,
                feed_size_mm=size,
                at_date=timezone.localdate(),
            )
            available = min(state.balance_at_date, state.future_headroom)
            remaining_consumed = max(
                ZERO_DECIMAL,
                sum((item['quantity_added_kg'] for item in size_items), ZERO_DECIMAL)
                - available,
            )
            size_items.sort(
                key=lambda item: reference_first_entry.get(
                    item['feed_reference_id'],
                    (date.max, datetime.max, item['feed_reference_id']),
                )
            )
            for index, item in enumerate(size_items):
                if remaining_consumed <= ZERO_DECIMAL:
                    item['quantity_consumed_kg'] = ZERO_DECIMAL
                    continue
                if index == len(size_items) - 1:
                    consumed = remaining_consumed
                else:
                    consumed = min(item['quantity_added_kg'], remaining_consumed)
                item['quantity_consumed_kg'] = consumed
                remaining_consumed -= consumed
        for item in grouped.values():
            available = item['quantity_added_kg'] - item['quantity_consumed_kg']
            result.append({
                'feed_reference_id': item['feed_reference_id'],
                'source': item['source'],
                'species': item['species'],
                'label': item['label'],
                'feed_size_mm': (
                    str(CycleStoreService._quantize(item['feed_size_mm']))
                    if item['feed_size_mm'] is not None
                    else None
                ),
                'quantity_added_kg': str(
                    CycleStoreService._quantize(item['quantity_added_kg'])
                ),
                'quantity_consumed_kg': str(
                    CycleStoreService._quantize(item['quantity_consumed_kg'])
                ),
                'quantity_available_kg': str(CycleStoreService._quantize(available)),
            })
        return sorted(
            result,
            key=lambda item: (item['label'].casefold(), item['feed_size_mm'] or ''),
        )

    @staticmethod
    def _format_pending_order(order: Order) -> CycleStorePendingOrder:
        estimated_feed_kg = CycleStoreService._calculate_pending_order_feed_kg(order)
        return {
            'id': str(order.id),
            'order_number': order.order_number,
            'status': order.status,
            'delivery_method': order.delivery_method,
            'total_bags': order.total_bags,
            'total_fcfa': str(order.total),
            'estimated_feed_kg': str(CycleStoreService._quantize(estimated_feed_kg)),
            'created_at': order.created_at,
        }

    @staticmethod
    def _get_stock_tracking_started_at(entries: list[CycleFeedStockEntry]) -> date | None:
        if not entries:
            return None
        return min(entry.entry_date for entry in entries)

    @staticmethod
    def _unclassified_entry_metadata(
        *,
        cycle: ProductionCycle,
        entry: CycleFeedStockEntry,
    ) -> tuple[str, str, Product | None]:
        """Décrit pourquoi une ancienne entrée nécessite encore une action.

        Les entrées de commande conservent leur produit et leur commande, mais
        une référence alimentaire peut manquer si la ligne est antérieure au
        référentiel ou si l'espèce du produit ne correspond pas au cycle. Cette
        distinction permet au mobile de proposer une classification seulement
        lorsqu'elle est sûre.
        """
        product = entry.product or (
            entry.order_item.product
            if entry.order_item_id and entry.order_item is not None
            else None
        )
        if entry.source == CycleFeedStockEntry.SOURCE_ORDER and product is not None:
            product_species = 'clarias' if product.species == 'catfish' else product.species
            if product_species != cycle.species:
                return 'order', 'order_species_mismatch', product
            return 'order', 'legacy_order', product
        return 'manual', 'legacy_manual', product

    @staticmethod
    def get_store_payload(cycle: ProductionCycle) -> CycleStorePayload:
        """Construit le résumé du Magasin pour un cycle."""
        entries = list(
            cycle.feed_stock_entries.for_api()
            .filter(entry_date__lte=timezone.localdate())
            .order_by('entry_date', 'created_at')
        )
        pending_orders = list(
            Order.objects.with_details()
            .filter(
                production_cycle=cycle,
                status__in=['confirmed', 'ready_for_pickup', 'delivered'],
            )
            .order_by('-created_at')
        )

        manual_entries = [entry for entry in entries if entry.source == CycleFeedStockEntry.SOURCE_MANUAL]
        received_entries = [entry for entry in entries if entry.source == CycleFeedStockEntry.SOURCE_ORDER]
        stock_tracking_started_at = CycleStoreService._get_stock_tracking_started_at(entries)

        manual_feed_kg = sum((entry.quantity_kg for entry in manual_entries), ZERO_DECIMAL)
        received_order_feed_kg = sum((entry.quantity_kg for entry in received_entries), ZERO_DECIMAL)
        total_feed_added_kg = manual_feed_kg + received_order_feed_kg
        known_entries = [
            entry
            for entry in entries
            if entry.cost_status == CycleFeedStockEntry.COST_STATUS_KNOWN
            and entry.total_cost_fcfa is not None
        ]
        opening_entries = [
            entry
            for entry in known_entries
            if entry.entry_kind == CycleFeedStockEntry.ENTRY_KIND_OPENING_BALANCE
        ]
        tracked_entries = [
            entry
            for entry in known_entries
            if entry.entry_kind != CycleFeedStockEntry.ENTRY_KIND_OPENING_BALANCE
        ]
        known_feed_expenses_fcfa = sum(
            (entry.total_cost_fcfa for entry in known_entries),
            ZERO_DECIMAL,
        )
        known_opening_stock_cost_fcfa = sum(
            (entry.total_cost_fcfa for entry in opening_entries),
            ZERO_DECIMAL,
        )
        tracked_feed_expenses_fcfa = sum(
            (entry.total_cost_fcfa for entry in tracked_entries),
            ZERO_DECIMAL,
        )
        unknown_cost_entries_count = sum(
            entry.cost_status == CycleFeedStockEntry.COST_STATUS_UNKNOWN
            for entry in entries
        )
        cost_history_complete = (
            cycle.history_scope == ProductionCycle.HISTORY_SCOPE_FULL_CYCLE
            and unknown_cost_entries_count == 0
        )
        pending_order_amount_fcfa = sum((order.total for order in pending_orders), ZERO_DECIMAL)
        pending_order_feed_kg = sum(
            (CycleStoreService._calculate_pending_order_feed_kg(order) for order in pending_orders),
            ZERO_DECIMAL,
        )
        total_cycle_feed_consumed_kg = CycleStoreService._to_decimal(
            cycle.total_feed_consumed
        )
        stock_items = CycleStoreService._build_stock_items(
            cycle=cycle,
            entries=entries,
            stock_tracking_started_at=stock_tracking_started_at,
        )
        stock_by_size = CycleStoreService._stock_by_size(
            cycle=cycle,
            stock_items=stock_items,
            at_date=timezone.localdate(),
        )
        history_inconsistent = any(
            FeedStockLedgerService.calculate_for_size(
                cycle=cycle,
                feed_size_mm=item['feed_size_mm'],
                at_date=timezone.localdate(),
            ).minimum_balance < ZERO_DECIMAL
            for item in stock_by_size
        )
        compatible_remaining_kg = sum(
            (CycleStoreService._to_decimal(item['quantity_available_kg']) for item in stock_by_size),
            ZERO_DECIMAL,
        )
        unclassified_remaining_kg = sum(
            (
                CycleStoreService._to_decimal(item['quantity_available_kg'])
                for item in stock_items
                if item['feed_reference_id'] is None
            ),
            ZERO_DECIMAL,
        )
        estimated_feed_remaining_kg = compatible_remaining_kg + unclassified_remaining_kg
        from .cycle_feed_recommendation_service import CycleFeedRecommendationService

        recommendation = CycleFeedRecommendationService.build(cycle)
        recommendation_summary = recommendation['summary']
        available_pellet_sizes = CycleStoreService._available_pellet_sizes(cycle)
        recommended_pellet_size_mm = next(
            (
                phase['pellet_size_mm']
                for phase in recommendation.get('feeding_phases', [])
                if phase.get('phase_status') in {'current', 'future'}
                and phase.get('pellet_size_mm') is not None
            ),
            None,
        )
        calculation_available = recommendation['status'] != 'unavailable'
        total_feed_needed_kg = (
            CycleStoreService._to_decimal(recommendation_summary['planned_total_feed_kg'])
            if recommendation_summary.get('planned_total_feed_kg') is not None
            else None
        )
        feed_need_remaining_kg = (
            CycleStoreService._to_decimal(recommendation_summary['estimated_remaining_need_kg'])
            if calculation_available
            else None
        )
        secured_feed_kg = (
            CycleStoreService._to_decimal(recommendation_summary['compatible_stock_kg'])
            + CycleStoreService._to_decimal(recommendation_summary['pending_order_kg'])
            if calculation_available
            else None
        )
        feed_to_secure_kg = (
            CycleStoreService._to_decimal(recommendation_summary['feed_to_order_kg'])
            if calculation_available
            else None
        )
        unclassified_entries = [entry for entry in entries if entry.feed_reference_id is None]
        legacy_allocations = CycleStoreService._allocate_legacy_consumption(
            cycle=cycle,
            entries=entries,
        )
        unclassified_stock_kg = sum(
            (
                CycleStoreService._to_decimal(item['quantity_available_kg'])
                for item in stock_items
                if item['feed_reference_id'] is None
            ),
            ZERO_DECIMAL,
        )

        pending_orders_count = len(pending_orders)
        if not entries:
            status = 'not_started'
        elif history_inconsistent:
            status = 'check_stock'
        elif estimated_feed_remaining_kg <= ZERO_DECIMAL:
            status = 'check_stock'
        elif estimated_feed_remaining_kg <= LOW_STOCK_THRESHOLD_KG:
            status = 'low'
        else:
            status = 'ok'

        return {
            'cycle_id': str(cycle.id),
            'calculation_status': recommendation['status'],
            'calculation_source': recommendation['source'],
            'calculated_at': recommendation['calculated_at'],
            'calculation_warnings': list(dict.fromkeys([
                *recommendation['warnings'],
                *(['feed_stock_history_inconsistent'] if history_inconsistent else []),
            ])),
            'summary': {
                'manual_feed_kg': str(CycleStoreService._quantize(manual_feed_kg)),
                'received_order_feed_kg': str(CycleStoreService._quantize(received_order_feed_kg)),
                'total_feed_added_kg': str(CycleStoreService._quantize(total_feed_added_kg)),
                'feed_consumed_kg': str(CycleStoreService._quantize(total_cycle_feed_consumed_kg)),
                'estimated_feed_remaining_kg': str(CycleStoreService._quantize(estimated_feed_remaining_kg)),
                # Compatibility field: this is a sum of known feed expenses only.
                'feed_expenses_fcfa': str(CycleStoreService._quantize(known_feed_expenses_fcfa)),
                'known_feed_expenses_fcfa': str(
                    CycleStoreService._quantize(known_feed_expenses_fcfa)
                ),
                'known_opening_stock_cost_fcfa': str(
                    CycleStoreService._quantize(known_opening_stock_cost_fcfa)
                ),
                'tracked_feed_expenses_fcfa': str(
                    CycleStoreService._quantize(tracked_feed_expenses_fcfa)
                ),
                'unknown_cost_entries_count': unknown_cost_entries_count,
                'cost_history_complete': cost_history_complete,
                'pending_orders_count': pending_orders_count,
                'pending_order_amount_fcfa': str(CycleStoreService._quantize(pending_order_amount_fcfa)),
                'pending_order_feed_kg': str(CycleStoreService._quantize(pending_order_feed_kg)),
                'total_feed_needed_kg': (
                    str(CycleStoreService._quantize(total_feed_needed_kg))
                    if total_feed_needed_kg is not None
                    else None
                ),
                'feed_need_remaining_kg': (
                    str(CycleStoreService._quantize(feed_need_remaining_kg))
                    if feed_need_remaining_kg is not None
                    else None
                ),
                'secured_feed_kg': (
                    str(CycleStoreService._quantize(secured_feed_kg))
                    if secured_feed_kg is not None
                    else None
                ),
                'feed_to_secure_kg': (
                    str(CycleStoreService._quantize(feed_to_secure_kg))
                    if feed_to_secure_kg is not None
                    else None
                ),
                'stock_tracking_started_at': stock_tracking_started_at,
                'unclassified_stock_kg': str(CycleStoreService._quantize(unclassified_stock_kg)),
            },
            'status': status,
            'stock_items': stock_items,
            'stock_by_size': stock_by_size,
            'available_pellet_sizes': available_pellet_sizes,
            'recommended_pellet_size_mm': recommended_pellet_size_mm,
            'pending_orders': [CycleStoreService._format_pending_order(order) for order in pending_orders],
            'stock_tracking_started_at': stock_tracking_started_at,
            'unclassified_entries': [
                CycleStoreService._format_unclassified_entry(
                    cycle=cycle,
                    entry=entry,
                    historical_consumption_kg=legacy_allocations.get(entry.id, ZERO_DECIMAL),
                )
                for entry in unclassified_entries
            ],
        }

    @staticmethod
    def _format_unclassified_entry(
        *,
        cycle: ProductionCycle,
        entry: CycleFeedStockEntry,
        historical_consumption_kg: Decimal,
    ) -> CycleStoreUnclassifiedEntry:
        source, classification_reason, product = CycleStoreService._unclassified_entry_metadata(
            cycle=cycle,
            entry=entry,
        )
        product_species = None
        product_size = None
        if product is not None:
            product_species = 'clarias' if product.species == 'catfish' else product.species
            product_size = CycleStoreService._entry_feed_size(entry)
        quantity_available = entry.quantity_kg - historical_consumption_kg
        return {
            'id': str(entry.id),
            'label': entry.label,
            'quantity_kg': str(CycleStoreService._quantize(entry.quantity_kg)),
            'quantity_added_kg': str(CycleStoreService._quantize(entry.quantity_kg)),
            'historical_consumption_kg': str(
                CycleStoreService._quantize(historical_consumption_kg)
            ),
            'quantity_available_kg': str(CycleStoreService._quantize(quantity_available)),
            'source': source,
            'classification_reason': classification_reason,
            'catalog_product_id': str(product.id) if product is not None else None,
            'catalog_product_species': product_species,
            'catalog_product_pellet_size_mm': (
                str(CycleStoreService._quantize(product_size))
                if product_size is not None
                else None
            ),
        }

    @classmethod
    def compatible_feed_references(
        cls,
        *,
        cycle: ProductionCycle,
        feed_size_mm: Decimal,
    ) -> list[FarmFeedReference]:
        """Retourne les références de la ferme compatibles avec une granulométrie."""
        return FeedStockLedgerService.compatible_references(
            cycle=cycle,
            feed_size_mm=feed_size_mm,
        )

    @classmethod
    def resolve_feed_reference_for_size(
        cls,
        *,
        cycle: ProductionCycle,
        feed_size_mm: Decimal,
    ) -> FarmFeedReference | None:
        """Résout une référence interne sans demander son origine au mobile."""
        return next(iter(cls.compatible_feed_references(
            cycle=cycle,
            feed_size_mm=feed_size_mm,
        )), None)

    @classmethod
    def validate_daily_feed_quantity(
        cls,
        *,
        cycle: ProductionCycle,
        feed_quantity: Decimal | None,
        log_date: date,
        cycle_unit_allocation=None,
        existing_log: CycleLog | None = None,
        feed_reference: FarmFeedReference | None = None,
        feed_size_mm: Decimal | None = None,
        reserved_feed_kg: Decimal = ZERO_DECIMAL,
        reserved_feed_events: list[FeedStockReservation] | None = None,
    ) -> None:
        """Valide une ration par granulométrie, toutes origines confondues."""
        quantity = cls._to_decimal(feed_quantity)
        if quantity <= ZERO_DECIMAL:
            return

        size = cls._to_decimal(feed_size_mm) if feed_size_mm is not None else None
        if size is None and feed_reference is not None:
            size = cls._to_decimal(feed_reference.pellet_size_mm)
        if size is None:
            raise FeedStockValidationError(
                code='feed_reference_required',
                detail=_("Sélectionnez la granulométrie distribuée."),
                requested_feed_kg=CycleStoreService._quantize(quantity),
            )
        if feed_reference is not None and feed_reference.farm_profile_id != cycle.farm_profile_id:
            raise FeedStockValidationError(
                code='feed_reference_mismatch',
                detail=_("Cet aliment appartient à une autre ferme."),
                requested_feed_kg=CycleStoreService._quantize(quantity),
                feed_reference_id=feed_reference.id,
            )
        if feed_reference is not None and feed_reference.species != cycle.species:
            raise FeedStockValidationError(
                code='feed_reference_mismatch',
                detail=_("Cet aliment ne correspond pas à l’espèce du cycle."),
                requested_feed_kg=CycleStoreService._quantize(quantity),
                feed_reference_id=feed_reference.id,
            )
        if (
            feed_reference is not None
            and feed_size_mm is not None
            and feed_reference.pellet_size_mm is not None
            and cls._to_decimal(feed_reference.pellet_size_mm) != size
        ):
            raise FeedStockValidationError(
                code='feed_reference_mismatch',
                detail=_("La granulométrie ne correspond pas à l’aliment sélectionné."),
                requested_feed_kg=cls._quantize(quantity),
                feed_reference_id=feed_reference.id,
            )

        references = cls.compatible_feed_references(cycle=cycle, feed_size_mm=size)
        if not references:
            raise FeedStockValidationError(
                code='feed_stock_item_unavailable',
                detail=_("Aucun stock disponible pour cette granulométrie."),
                requested_feed_kg=CycleStoreService._quantize(quantity),
                feed_reference_id=feed_reference.id if feed_reference else None,
            )

        reservations = list(reserved_feed_events or [])
        if reserved_feed_kg > ZERO_DECIMAL:
            reservations.append(
                FeedStockLedgerService.reservation(
                    log_date=log_date,
                    quantity_kg=CycleStoreService._to_decimal(reserved_feed_kg),
                    event_id="legacy-reservation",
                )
            )
        state = FeedStockLedgerService.calculate_for_size(
            cycle=cycle,
            feed_size_mm=size,
            at_date=log_date,
            existing_log=existing_log,
            reservations=reservations,
        )
        available = min(state.balance_at_date, state.future_headroom)
        if state.minimum_balance < ZERO_DECIMAL:
            raise FeedStockValidationError(
                code='feed_stock_history_inconsistent',
                detail=_(
                    "L'historique du stock est incohérent. Corrigez une ration passée avant d'en ajouter une."
                ),
                available_feed_kg=cls._quantize(available),
                minimum_balance_kg=cls._quantize(state.minimum_balance),
                requested_feed_kg=CycleStoreService._quantize(quantity),
                feed_reference_id=feed_reference.id if feed_reference else None,
            )
        if available < ZERO_DECIMAL:
            raise FeedStockValidationError(
                code='insufficient_feed_stock',
                detail=_("Le stock enregistré est déjà dépassé. Corrigez l’historique avant de continuer."),
                available_feed_kg=CycleStoreService._quantize(available),
                requested_feed_kg=CycleStoreService._quantize(quantity),
                feed_reference_id=feed_reference.id if feed_reference else None,
            )
        if quantity > available:
            raise FeedStockValidationError(
                code='insufficient_feed_stock',
                detail=_(
                    "Stock insuffisant pour cette ration. Disponible : %(available)s kg."
                ) % {'available': CycleStoreService._quantize(available)},
                available_feed_kg=CycleStoreService._quantize(available),
                requested_feed_kg=CycleStoreService._quantize(quantity),
                feed_reference_id=feed_reference.id if feed_reference else None,
            )

    @staticmethod
    @transaction.atomic
    def declare_manual_stock(
        *,
        user: User,
        cycle: ProductionCycle,
        feed_reference: FarmFeedReference,
        quantity_kg: Decimal,
        total_cost_fcfa: Decimal,
        entry_date,
        note: str = '',
        client_uuid=None,
        created_offline: bool = False,
    ) -> CycleFeedStockEntry:
        """Enregistre une déclaration manuelle de stock."""
        CycleStoreService._ensure_cycle_owner(cycle, user)
        if isinstance(entry_date, str):
            entry_date = date.fromisoformat(entry_date)
        if entry_date < cycle.analysis_start_date:
            raise EventBeforeTrackingStartError(
                tracking_start_date=cycle.analysis_start_date,
            )

        if quantity_kg <= ZERO_DECIMAL:
            raise ValueError(_("La quantité doit être strictement positive."))
        if total_cost_fcfa < ZERO_DECIMAL:
            raise ValueError(_("Le montant doit être positif ou nul."))
        if feed_reference.farm_profile_id != cycle.farm_profile_id:
            raise PermissionError(_('Cet aliment appartient à une autre ferme.'))
        if feed_reference.species != cycle.species:
            raise ValueError(_('Cet aliment ne correspond pas à l’espèce du cycle.'))

        cycle = ProductionCycle.objects.select_for_update().get(id=cycle.id)
        existing_entry = None
        if client_uuid:
            existing_entry = CycleFeedStockEntry.objects.select_for_update().filter(
                client_uuid=client_uuid
            ).first()

        if existing_entry:
            if existing_entry.cycle_id != cycle.id:
                raise PermissionError("Ce client_uuid est déjà lié à un autre cycle.")
            if existing_entry.cycle.farm_profile.user_id != user.id:
                raise PermissionError("Ce client_uuid appartient à un autre utilisateur.")
            same_payload = all((
                existing_entry.feed_reference_id == feed_reference.id,
                existing_entry.quantity_kg == CycleStoreService._to_decimal(quantity_kg),
                existing_entry.total_cost_fcfa == CycleStoreService._to_decimal(total_cost_fcfa),
                existing_entry.entry_date == entry_date,
                existing_entry.note == note.strip(),
            ))
            if not same_payload:
                raise StockEntryIdempotencyConflict()
            return existing_entry

        entry = CycleFeedStockEntry.objects.create(
            cycle=cycle,
            feed_reference=feed_reference,
            source=CycleFeedStockEntry.SOURCE_MANUAL,
            entry_kind=CycleFeedStockEntry.ENTRY_KIND_MANUAL_SUPPLY,
            label=feed_reference.name,
            feed_size_mm=feed_reference.pellet_size_mm,
            quantity_kg=CycleStoreService._to_decimal(quantity_kg),
            total_cost_fcfa=CycleStoreService._to_decimal(total_cost_fcfa),
            cost_status=CycleFeedStockEntry.COST_STATUS_KNOWN,
            entry_date=entry_date,
            note=note.strip(),
            product=feed_reference.catalog_product,
            client_uuid=client_uuid,
            created_offline=created_offline,
            synced_at=None if created_offline else timezone.now(),
        )
        BaseService.log_operation(
            'declare_manual_stock',
            {
                'cycle_id': str(cycle.id),
                'entry_id': str(entry.id),
                'quantity_kg': float(entry.quantity_kg),
            },
        )
        return entry

    @staticmethod
    @transaction.atomic
    def declare_opening_stock(
        *,
        user: User,
        cycle: ProductionCycle,
        feed_reference: FarmFeedReference,
        quantity_kg: Decimal,
        cost_status: str,
        total_cost_fcfa: Decimal | None,
        note: str = '',
        client_uuid=None,
        created_offline: bool = False,
    ) -> CycleFeedStockEntry:
        """Record the physical feed remainder observed at the tracking baseline."""
        CycleStoreService._ensure_cycle_owner(cycle, user)
        quantity = CycleStoreService._to_decimal(quantity_kg)
        if quantity <= ZERO_DECIMAL:
            raise ValueError(_("La quantité doit être strictement positive."))
        if cost_status == CycleFeedStockEntry.COST_STATUS_KNOWN:
            if total_cost_fcfa is None:
                raise ValueError(_("Le montant est obligatoire lorsque le coût est connu."))
            normalized_cost = CycleStoreService._to_decimal(total_cost_fcfa)
            if normalized_cost < ZERO_DECIMAL:
                raise ValueError(_("Le montant doit être positif ou nul."))
        elif cost_status == CycleFeedStockEntry.COST_STATUS_UNKNOWN:
            if total_cost_fcfa is not None:
                raise ValueError(_("Un coût inconnu ne doit pas contenir de montant."))
            normalized_cost = None
        else:
            raise ValueError(_("Le statut du coût est invalide."))
        if feed_reference.farm_profile_id != cycle.farm_profile_id:
            raise PermissionError(_('Cet aliment appartient à une autre ferme.'))
        if feed_reference.species != cycle.species:
            raise ValueError(_('Cet aliment ne correspond pas à l’espèce du cycle.'))

        cycle = ProductionCycle.objects.select_for_update().get(id=cycle.id)
        existing_entry = None
        if client_uuid:
            existing_entry = CycleFeedStockEntry.objects.select_for_update().filter(
                client_uuid=client_uuid
            ).first()
        if existing_entry:
            same_payload = all((
                existing_entry.cycle_id == cycle.id,
                existing_entry.feed_reference_id == feed_reference.id,
                existing_entry.quantity_kg == quantity,
                existing_entry.cost_status == cost_status,
                existing_entry.total_cost_fcfa == normalized_cost,
                existing_entry.entry_date == cycle.tracking_start_date,
                existing_entry.note == note.strip(),
                existing_entry.entry_kind == CycleFeedStockEntry.ENTRY_KIND_OPENING_BALANCE,
            ))
            if not same_payload:
                raise StockEntryIdempotencyConflict()
            return existing_entry

        return CycleFeedStockEntry.objects.create(
            cycle=cycle,
            feed_reference=feed_reference,
            source=CycleFeedStockEntry.SOURCE_MANUAL,
            entry_kind=CycleFeedStockEntry.ENTRY_KIND_OPENING_BALANCE,
            label=feed_reference.name,
            feed_size_mm=feed_reference.pellet_size_mm,
            quantity_kg=quantity,
            cost_status=cost_status,
            total_cost_fcfa=normalized_cost,
            entry_date=cycle.tracking_start_date,
            note=note.strip(),
            product=feed_reference.catalog_product,
            client_uuid=client_uuid,
            created_offline=created_offline,
            synced_at=None if created_offline else timezone.now(),
        )

    @staticmethod
    @transaction.atomic
    def classify_legacy_stock(*, user: User, cycle: ProductionCycle, entry_id, feed_reference) -> CycleFeedStockEntry:
        """Associe explicitement une ancienne entrée ambiguë à un aliment connu."""
        CycleStoreService._ensure_cycle_owner(cycle, user)
        cycle = ProductionCycle.objects.select_for_update().get(pk=cycle.pk)
        entry = CycleFeedStockEntry.objects.select_for_update().filter(pk=entry_id, cycle=cycle).first()
        if entry is None:
            raise ValueError(_('Entrée de stock introuvable.'))
        if entry.feed_reference_id is not None:
            if entry.feed_reference_id == feed_reference.id:
                return entry
            raise ValueError(_('Cette entrée de stock est déjà classifiée.'))
        if feed_reference.farm_profile_id != cycle.farm_profile_id or feed_reference.species != cycle.species:
            raise ValueError(_('Cet aliment n’est pas compatible avec le cycle.'))
        all_legacy_entries = list(
            CycleFeedStockEntry.objects.select_for_update()
            .filter(cycle=cycle)
        )
        allocations = CycleStoreService._allocate_legacy_consumption(
            cycle=cycle,
            entries=all_legacy_entries,
        )
        consumed_kg = allocations.get(entry.id, ZERO_DECIMAL)
        if consumed_kg > entry.quantity_kg:
            raise ValueError(_(
                'Les consommations historiques dépassent cette entrée de stock. '
                'Corrigez le reliquat physique avant la classification.'
            ))

        entry.feed_reference = feed_reference
        entry.product = feed_reference.catalog_product
        entry.save(update_fields=['feed_reference', 'product', 'updated_at'])
        # La classification est une capture persistée de l'allocation FIFO.
        # Recalculer les ajustements déjà créés permet de traiter correctement
        # le cas où plusieurs journaux legacy existent avant la classification
        # de la seconde entrée, sans compter un journal deux fois.
        for candidate in all_legacy_entries:
            desired = allocations.get(candidate.id, ZERO_DECIMAL)
            if candidate.id != entry.id and candidate.feed_reference_id is None:
                continue
            adjustment = CycleFeedStockAdjustment.objects.filter(
                stock_entry_id=candidate.id,
                reason=CycleFeedStockAdjustment.REASON_LEGACY_CONSUMPTION,
            ).first()
            if desired <= ZERO_DECIMAL:
                if adjustment is not None:
                    adjustment.delete()
                continue
            if adjustment is None:
                CycleFeedStockAdjustment.objects.create(
                    stock_entry_id=candidate.id,
                    quantity_kg=desired,
                )
            elif adjustment.quantity_kg != desired:
                adjustment.quantity_kg = desired
                adjustment.save(update_fields=['quantity_kg'])
        return entry

    @staticmethod
    @transaction.atomic
    def import_received_order(order: Order) -> list[CycleFeedStockEntry]:
        """Importe automatiquement les aliments d'une commande reçue."""
        if order.production_cycle_id is None:
            return []
        if order.status != 'received':
            return []

        cycle = ProductionCycle.objects.select_for_update().get(id=order.production_cycle_id)
        if order.farm_profile_id != cycle.farm_profile_id:
            raise PermissionError(_("La commande ne correspond pas au cycle indiqué."))

        created_entries: list[CycleFeedStockEntry] = []
        order_items = order.items.select_related('product').all()
        for order_item in order_items:
            if not CycleStoreService._can_import_order_item(order_item):
                logger.info(
                    "Item de commande ignoré pour le Magasin, order_item=%s, order=%s",
                    order_item.id,
                    order.id,
                )
                continue
            if not CycleStoreService._can_import_order_item(order_item, cycle):
                raise ValueError(_(
                    'Un article de cette commande ne correspond pas à l’espèce du cycle.'
                ))

            existing_entry = CycleFeedStockEntry.objects.select_for_update().filter(
                order_item=order_item
            ).first()
            if existing_entry:
                continue

            from .feed_reference_service import FeedReferenceService

            feed_reference = FeedReferenceService.create(
                user=order.user,
                farm_profile=cycle.farm_profile,
                allow_catalog_snapshot=True,
                data={
                    'source': FarmFeedReference.SOURCE_CATALOG,
                    'catalog_product': order_item.product,
                    'name': order_item.product_name,
                    'species': (
                        order_item.product_species_snapshot
                        or order_item.product.species
                    ),
                    'pellet_size_mm': (
                        order_item.product_pellet_size_mm_snapshot
                        if order_item.product_pellet_size_mm_snapshot is not None
                        else order_item.product.pellet_size_mm
                    ),
                    'brand': order_item.product_brand_snapshot or order_item.product.brand,
                    'package_weight_kg': (
                        order_item.product_package_weight_kg_snapshot
                        if order_item.product_package_weight_kg_snapshot is not None
                        else order_item.product.package_weight_kg
                    ),
                    'created_offline': False,
                },
            )

            entry = CycleFeedStockEntry.objects.create(
                cycle=cycle,
                feed_reference=feed_reference,
                source=CycleFeedStockEntry.SOURCE_ORDER,
                entry_kind=CycleFeedStockEntry.ENTRY_KIND_ORDER_RECEIPT,
                label=order_item.product_name or order_item.product.name,
                feed_size_mm=(
                    order_item.product_pellet_size_mm_snapshot
                    if order_item.product_pellet_size_mm_snapshot is not None
                    else order_item.product.pellet_size_mm
                ),
                quantity_kg=CycleStoreService._calculate_order_item_feed_kg(order_item),
                total_cost_fcfa=CycleStoreService._to_decimal(order_item.line_total),
                cost_status=CycleFeedStockEntry.COST_STATUS_KNOWN,
                entry_date=timezone.localdate(),
                note=f"Import automatique depuis la commande {order.order_number}",
                product=order_item.product,
                order=order,
                order_item=order_item,
                created_offline=False,
                synced_at=timezone.now(),
            )
            created_entries.append(entry)

        if created_entries:
            BaseService.log_operation(
                'import_received_order',
                {
                    'order_id': str(order.id),
                    'cycle_id': str(cycle.id),
                    'created_entries': len(created_entries),
                },
            )
        return created_entries
