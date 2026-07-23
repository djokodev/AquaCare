"""Service métier du Magasin de cycle."""

from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Any, TypedDict

from accounts.models import User
from commerce.models import Order, OrderItem
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from ..domain.exceptions import FeedStockValidationError, StockEntryIdempotencyConflict
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


class CycleStorePayload(TypedDict):
    cycle_id: str
    summary: CycleStoreSummary
    status: str
    calculation_status: str
    calculation_source: str
    calculated_at: datetime
    calculation_warnings: list[str]
    stock_items: list[CycleStoreStockItem]
    pending_orders: list[CycleStorePendingOrder]
    stock_tracking_started_at: date | None
    unclassified_entries: list[dict[str, str]]


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
        state = FeedStockLedgerService.calculate(
            cycle=cycle,
            feed_reference=feed_reference,
            at_date=log_date,
            existing_log=existing_log,
            reservations=reservations,
        )
        return state.balance_at_date, state.tracking_started_at

    @staticmethod
    def _allocate_legacy_consumption(
        *,
        cycle: ProductionCycle,
        entries: list[CycleFeedStockEntry],
    ) -> dict[Any, Decimal]:
        """Alloue les rations legacy aux entrées compatibles en FIFO chronologique."""
        allocations = {entry.id: ZERO_DECIMAL for entry in entries}
        entries_by_identity: dict[
            tuple[str, Decimal | None],
            list[CycleFeedStockEntry],
        ] = {}
        for entry in entries:
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

        logs = (
            CycleStoreService._get_consumption_queryset(cycle)
            .filter(feed_reference__isnull=True, feed_quantity__gt=0)
            .order_by("log_date", "created_at", "id")
        )
        remaining_by_entry = {
            entry.id: CycleStoreService._to_decimal(entry.quantity_kg)
            for entry in entries
        }
        for log in logs:
            identity = CycleStoreService._feed_identity(
                log.feed_type,
                log.feed_size_mm,
            )
            remaining_consumption = CycleStoreService._to_decimal(log.feed_quantity)
            for entry in entries_by_identity.get(identity, []):
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
            item['quantity_consumed_kg'] += (
                adjustments.get(entry.id, ZERO_DECIMAL)
                if entry.feed_reference_id
                else legacy_allocations.get(entry.id, ZERO_DECIMAL)
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
        for item in grouped.values():
            if item['_feed_reference'] is not None:
                available, _tracking_date = CycleStoreService.get_available_feed_quantity(
                    cycle=cycle,
                    feed_reference=item['_feed_reference'],
                    log_date=timezone.localdate(),
                )
                item['quantity_consumed_kg'] = item['quantity_added_kg'] - available
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
        feed_expenses_fcfa = sum((entry.total_cost_fcfa for entry in entries), ZERO_DECIMAL)
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
        estimated_feed_remaining_kg = sum(
            (
                CycleStoreService._to_decimal(item['quantity_available_kg'])
                for item in stock_items
            ),
            ZERO_DECIMAL,
        )
        from .cycle_feed_recommendation_service import CycleFeedRecommendationService

        recommendation = CycleFeedRecommendationService.build(cycle)
        recommendation_summary = recommendation['summary']
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
            'calculation_warnings': recommendation['warnings'],
            'summary': {
                'manual_feed_kg': str(CycleStoreService._quantize(manual_feed_kg)),
                'received_order_feed_kg': str(CycleStoreService._quantize(received_order_feed_kg)),
                'total_feed_added_kg': str(CycleStoreService._quantize(total_feed_added_kg)),
                'feed_consumed_kg': str(CycleStoreService._quantize(total_cycle_feed_consumed_kg)),
                'estimated_feed_remaining_kg': str(CycleStoreService._quantize(estimated_feed_remaining_kg)),
                'feed_expenses_fcfa': str(CycleStoreService._quantize(feed_expenses_fcfa)),
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
            'pending_orders': [CycleStoreService._format_pending_order(order) for order in pending_orders],
            'stock_tracking_started_at': stock_tracking_started_at,
            'unclassified_entries': [
                {
                    'id': str(entry.id),
                    'label': entry.label,
                    'quantity_kg': str(CycleStoreService._quantize(entry.quantity_kg)),
                    'quantity_added_kg': str(CycleStoreService._quantize(entry.quantity_kg)),
                    'historical_consumption_kg': str(
                        CycleStoreService._quantize(
                            legacy_allocations.get(entry.id, ZERO_DECIMAL)
                        )
                    ),
                    'quantity_available_kg': str(
                        CycleStoreService._quantize(
                            entry.quantity_kg
                            - legacy_allocations.get(entry.id, ZERO_DECIMAL)
                        )
                    ),
                }
                for entry in unclassified_entries
            ],
        }

    @staticmethod
    def validate_daily_feed_quantity(
        *,
        cycle: ProductionCycle,
        feed_quantity: Decimal | None,
        log_date: date,
        cycle_unit_allocation=None,
        existing_log: CycleLog | None = None,
        feed_reference: FarmFeedReference | None = None,
        reserved_feed_kg: Decimal = ZERO_DECIMAL,
        reserved_feed_events: list[FeedStockReservation] | None = None,
    ) -> None:
        """Valide une ration par référence sous le verrou du cycle appelant."""
        quantity = CycleStoreService._to_decimal(feed_quantity)
        if quantity <= ZERO_DECIMAL:
            return

        if feed_reference is None:
            raise FeedStockValidationError(
                code='feed_reference_required',
                detail=_("Sélectionnez l’aliment distribué."),
                requested_feed_kg=CycleStoreService._quantize(quantity),
            )
        if feed_reference.farm_profile_id != cycle.farm_profile_id:
            raise FeedStockValidationError(
                code='feed_reference_mismatch',
                detail=_("Cet aliment appartient à une autre ferme."),
                requested_feed_kg=CycleStoreService._quantize(quantity),
                feed_reference_id=feed_reference.id,
            )
        if feed_reference.species != cycle.species:
            raise FeedStockValidationError(
                code='feed_reference_mismatch',
                detail=_("Cet aliment ne correspond pas à l’espèce du cycle."),
                requested_feed_kg=CycleStoreService._quantize(quantity),
                feed_reference_id=feed_reference.id,
            )

        stock_entries = CycleFeedStockEntry.objects.filter(
            cycle=cycle,
            feed_reference=feed_reference,
        )
        tracking_started_at = stock_entries.order_by('entry_date').values_list(
            'entry_date', flat=True
        ).first()
        if tracking_started_at is None:
            raise FeedStockValidationError(
                code='feed_stock_item_unavailable',
                detail=_("Sélectionnez un aliment disponible dans votre stock."),
                requested_feed_kg=CycleStoreService._quantize(quantity),
                feed_reference_id=feed_reference.id,
            )
        if log_date < tracking_started_at:
            raise FeedStockValidationError(
                code='feed_log_before_stock_tracking',
                detail=_(
                    "Cette ration précède le début du suivi du stock d'aliment."
                ),
                requested_feed_kg=CycleStoreService._quantize(quantity),
                feed_reference_id=feed_reference.id,
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
        state = FeedStockLedgerService.calculate(
            cycle=cycle,
            feed_reference=feed_reference,
            at_date=log_date,
            existing_log=existing_log,
            reservations=reservations,
        )
        available = min(state.balance_at_date, state.future_headroom)
        if available < ZERO_DECIMAL:
            raise FeedStockValidationError(
                code='insufficient_feed_stock',
                detail=_("Le stock enregistré est déjà dépassé. Corrigez l’historique avant de continuer."),
                available_feed_kg=CycleStoreService._quantize(available),
                requested_feed_kg=CycleStoreService._quantize(quantity),
                feed_reference_id=feed_reference.id,
            )
        if quantity > available:
            raise FeedStockValidationError(
                code='insufficient_feed_stock',
                detail=_(
                    "Stock insuffisant pour cette ration. Disponible : %(available)s kg."
                ) % {'available': CycleStoreService._quantize(available)},
                available_feed_kg=CycleStoreService._quantize(available),
                requested_feed_kg=CycleStoreService._quantize(quantity),
                feed_reference_id=feed_reference.id,
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
            label=feed_reference.name,
            feed_size_mm=feed_reference.pellet_size_mm,
            quantity_kg=CycleStoreService._to_decimal(quantity_kg),
            total_cost_fcfa=CycleStoreService._to_decimal(total_cost_fcfa),
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
            CycleFeedStockEntry.objects.select_for_update().filter(
                cycle=cycle,
                feed_reference__isnull=True,
            )
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
        if consumed_kg > ZERO_DECIMAL:
            CycleFeedStockAdjustment.objects.get_or_create(
                stock_entry=entry,
                defaults={'quantity_kg': consumed_kg},
            )
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
                data={
                    'source': FarmFeedReference.SOURCE_CATALOG,
                    'catalog_product': order_item.product,
                    'name': order_item.product_name,
                    'species': order_item.product_species_snapshot,
                    'pellet_size_mm': order_item.product_pellet_size_mm_snapshot,
                    'brand': order_item.product_brand_snapshot,
                    'package_weight_kg': order_item.product_package_weight_kg_snapshot,
                    'created_offline': False,
                },
            )

            entry = CycleFeedStockEntry.objects.create(
                cycle=cycle,
                feed_reference=feed_reference,
                source=CycleFeedStockEntry.SOURCE_ORDER,
                label=order_item.product_name or order_item.product.name,
                feed_size_mm=(
                    order_item.product_pellet_size_mm_snapshot
                    if order_item.product_pellet_size_mm_snapshot is not None
                    else order_item.product.pellet_size_mm
                ),
                quantity_kg=CycleStoreService._calculate_order_item_feed_kg(order_item),
                total_cost_fcfa=CycleStoreService._to_decimal(order_item.line_total),
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
