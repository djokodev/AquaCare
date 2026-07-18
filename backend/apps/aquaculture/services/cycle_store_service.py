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

from ..domain.exceptions import FeedStockValidationError
from ..models import CycleFeedStockEntry, CycleLog, ProductionCycle
from .base import BaseService

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
    total_feed_needed_kg: str
    feed_need_remaining_kg: str
    secured_feed_kg: str
    feed_to_secure_kg: str
    stock_tracking_started_at: date | None


class CycleStoreStockItem(TypedDict):
    label: str
    feed_size_mm: str | None
    quantity_added_kg: str
    quantity_consumed_kg: str
    quantity_available_kg: str


class CycleStorePayload(TypedDict):
    cycle_id: str
    summary: CycleStoreSummary
    status: str
    stock_items: list[CycleStoreStockItem]
    pending_orders: list[CycleStorePendingOrder]
    stock_tracking_started_at: date | None


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
    def _can_import_order_item(order_item: OrderItem) -> bool:
        package_weight = order_item.product_package_weight_kg_snapshot
        if package_weight is None:
            package_weight = getattr(order_item.product, 'package_weight_kg', None)
        if package_weight is None:
            return False
        try:
            return Decimal(str(package_weight)) > ZERO_DECIMAL and order_item.quantity > 0
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
        if cycle.unit_allocations.exists():
            queryset = CycleLog.objects.filter(
                cycle=cycle,
                cycle_unit_allocation__isnull=False,
            )
        else:
            queryset = CycleLog.objects.filter(
                cycle=cycle,
                cycle_unit_allocation__isnull=True,
            )
        if since_date is not None:
            queryset = queryset.filter(log_date__gte=since_date)
        return queryset

    @staticmethod
    def _build_stock_items(
        *,
        cycle: ProductionCycle,
        entries: list[CycleFeedStockEntry],
        stock_tracking_started_at: date | None,
    ) -> list[CycleStoreStockItem]:
        grouped: dict[tuple[str, Decimal | None], dict[str, Any]] = {}
        for entry in entries:
            size = CycleStoreService._entry_feed_size(entry)
            identity = CycleStoreService._feed_identity(entry.label, size)
            item = grouped.setdefault(
                identity,
                {
                    'label': entry.label.strip(),
                    'feed_size_mm': size,
                    'quantity_added_kg': ZERO_DECIMAL,
                    'quantity_consumed_kg': ZERO_DECIMAL,
                },
            )
            item['quantity_added_kg'] += entry.quantity_kg

        if stock_tracking_started_at is not None:
            logs = CycleStoreService._get_consumption_queryset(
                cycle,
                stock_tracking_started_at,
            ).exclude(feed_quantity__isnull=True)
            for log in logs.only('feed_quantity', 'feed_type', 'feed_size_mm'):
                identity = CycleStoreService._feed_identity(log.feed_type, log.feed_size_mm)
                if identity in grouped:
                    grouped[identity]['quantity_consumed_kg'] += CycleStoreService._to_decimal(
                        log.feed_quantity
                    )

        result: list[CycleStoreStockItem] = []
        for item in grouped.values():
            available = max(
                item['quantity_added_kg'] - item['quantity_consumed_kg'],
                ZERO_DECIMAL,
            )
            result.append({
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
        entries = list(cycle.feed_stock_entries.for_api().order_by('entry_date', 'created_at'))
        pending_orders = list(
            Order.objects.with_details()
            .filter(production_cycle=cycle)
            .exclude(status='received')
            .order_by('-created_at')
        )

        manual_entries = [entry for entry in entries if entry.source == CycleFeedStockEntry.SOURCE_MANUAL]
        received_entries = [entry for entry in entries if entry.source == CycleFeedStockEntry.SOURCE_ORDER]
        stock_tracking_started_at = CycleStoreService._get_stock_tracking_started_at(entries)

        manual_feed_kg = sum((entry.quantity_kg for entry in manual_entries), ZERO_DECIMAL)
        received_order_feed_kg = sum((entry.quantity_kg for entry in received_entries), ZERO_DECIMAL)
        total_feed_added_kg = manual_feed_kg + received_order_feed_kg
        feed_expenses_fcfa = sum((entry.total_cost_fcfa for entry in entries), ZERO_DECIMAL)
        feed_consumed_kg = CycleStoreService._calculate_feed_consumed_kg(cycle, stock_tracking_started_at)
        estimated_feed_remaining_kg = total_feed_added_kg - feed_consumed_kg

        pending_order_amount_fcfa = sum((order.total for order in pending_orders), ZERO_DECIMAL)
        pending_order_feed_kg = sum(
            (CycleStoreService._calculate_pending_order_feed_kg(order) for order in pending_orders),
            ZERO_DECIMAL,
        )
        from .cycle_feed_service import CycleFeedService

        total_feed_needed_kg = CycleStoreService._to_decimal(
            CycleFeedService.compute_total_feed_needed_kg(cycle)
        )
        total_cycle_feed_consumed_kg = CycleStoreService._to_decimal(
            cycle.total_feed_consumed
        )
        feed_need_remaining_kg = max(
            total_feed_needed_kg - total_cycle_feed_consumed_kg,
            ZERO_DECIMAL,
        )
        available_stock_kg = max(estimated_feed_remaining_kg, ZERO_DECIMAL)
        secured_feed_kg = available_stock_kg + pending_order_feed_kg
        feed_to_secure_kg = max(feed_need_remaining_kg - secured_feed_kg, ZERO_DECIMAL)
        stock_items = CycleStoreService._build_stock_items(
            cycle=cycle,
            entries=entries,
            stock_tracking_started_at=stock_tracking_started_at,
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
            'summary': {
                'manual_feed_kg': str(CycleStoreService._quantize(manual_feed_kg)),
                'received_order_feed_kg': str(CycleStoreService._quantize(received_order_feed_kg)),
                'total_feed_added_kg': str(CycleStoreService._quantize(total_feed_added_kg)),
                'feed_consumed_kg': str(CycleStoreService._quantize(feed_consumed_kg)),
                'estimated_feed_remaining_kg': str(CycleStoreService._quantize(estimated_feed_remaining_kg)),
                'feed_expenses_fcfa': str(CycleStoreService._quantize(feed_expenses_fcfa)),
                'pending_orders_count': pending_orders_count,
                'pending_order_amount_fcfa': str(CycleStoreService._quantize(pending_order_amount_fcfa)),
                'pending_order_feed_kg': str(CycleStoreService._quantize(pending_order_feed_kg)),
                'total_feed_needed_kg': str(CycleStoreService._quantize(total_feed_needed_kg)),
                'feed_need_remaining_kg': str(CycleStoreService._quantize(feed_need_remaining_kg)),
                'secured_feed_kg': str(CycleStoreService._quantize(secured_feed_kg)),
                'feed_to_secure_kg': str(CycleStoreService._quantize(feed_to_secure_kg)),
                'stock_tracking_started_at': stock_tracking_started_at,
            },
            'status': status,
            'stock_items': stock_items,
            'pending_orders': [CycleStoreService._format_pending_order(order) for order in pending_orders],
            'stock_tracking_started_at': stock_tracking_started_at,
        }

    @staticmethod
    def validate_daily_feed_quantity(
        *,
        cycle: ProductionCycle,
        feed_quantity: Decimal | None,
        log_date: date,
        cycle_unit_allocation=None,
        existing_log: CycleLog | None = None,
        feed_type: str | None = None,
        feed_size_mm: Decimal | None = None,
    ) -> None:
        """Valide une ration contre le stock connu, y compris lors d'un upsert."""
        quantity = CycleStoreService._to_decimal(feed_quantity)
        if quantity <= ZERO_DECIMAL:
            return

        payload = CycleStoreService.get_store_payload(cycle)
        tracking_started_at = payload['stock_tracking_started_at']
        if tracking_started_at is None:
            raise FeedStockValidationError(
                code='feed_stock_not_started',
                detail=_(
                    "Déclarez d'abord votre stock d'aliment avant d'enregistrer une ration."
                ),
            )
        if log_date < tracking_started_at:
            raise FeedStockValidationError(
                code='feed_log_before_stock_tracking',
                detail=_(
                    "Cette ration précède le début du suivi du stock d'aliment."
                ),
            )

        if existing_log is None:
            scope = {
                'cycle': cycle,
                'log_date': log_date,
            }
            if cycle_unit_allocation is None:
                scope['cycle_unit_allocation__isnull'] = True
            else:
                scope['cycle_unit_allocation'] = cycle_unit_allocation
            existing_log = CycleLog.objects.filter(**scope).first()

        remaining = CycleStoreService._to_decimal(
            payload['summary']['estimated_feed_remaining_kg']
        )
        previous_quantity = ZERO_DECIMAL
        if (
            existing_log is not None
            and existing_log.feed_quantity is not None
            and existing_log.log_date >= tracking_started_at
        ):
            previous_quantity = existing_log.feed_quantity

        available_for_replacement = remaining + previous_quantity
        requested_identity = CycleStoreService._feed_identity(feed_type, feed_size_mm)
        stock_item = next(
            (
                item for item in payload['stock_items']
                if CycleStoreService._feed_identity(
                    item['label'], item['feed_size_mm']
                ) == requested_identity
            ),
            None,
        )
        if stock_item is None:
            raise FeedStockValidationError(
                code='feed_stock_item_unavailable',
                detail=_("Sélectionnez un aliment disponible dans votre stock."),
            )
        item_available = CycleStoreService._to_decimal(stock_item['quantity_available_kg'])
        if existing_log is not None and CycleStoreService._feed_identity(
            existing_log.feed_type,
            existing_log.feed_size_mm,
        ) == requested_identity:
            item_available += previous_quantity
        available_for_replacement = min(available_for_replacement, item_available)
        if quantity > available_for_replacement:
            raise FeedStockValidationError(
                code='insufficient_feed_stock',
                detail=_(
                    "Stock insuffisant pour cette ration. Disponible : %(available)s kg."
                ) % {'available': CycleStoreService._quantize(max(available_for_replacement, ZERO_DECIMAL))},
                available_feed_kg=CycleStoreService._quantize(
                    max(available_for_replacement, ZERO_DECIMAL)
                ),
            )

    @staticmethod
    @transaction.atomic
    def declare_manual_stock(
        *,
        user: User,
        cycle: ProductionCycle,
        label: str,
        quantity_kg: Decimal,
        feed_size_mm: Decimal,
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
        if not label or not label.strip():
            raise ValueError(_("Le nom de l'aliment est requis."))
        if feed_size_mm < Decimal('0.1') or feed_size_mm > Decimal('20'):
            raise ValueError(_("La granulométrie doit être comprise entre 0,1 et 20 mm."))

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
            return existing_entry

        entry = CycleFeedStockEntry.objects.create(
            cycle=cycle,
            source=CycleFeedStockEntry.SOURCE_MANUAL,
            label=label.strip(),
            feed_size_mm=CycleStoreService._normalize_feed_size(feed_size_mm),
            quantity_kg=CycleStoreService._to_decimal(quantity_kg),
            total_cost_fcfa=CycleStoreService._to_decimal(total_cost_fcfa),
            entry_date=entry_date,
            note=note.strip(),
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
    def import_received_order(order: Order) -> list[CycleFeedStockEntry]:
        """Importe automatiquement les aliments d'une commande reçue."""
        if order.production_cycle_id is None:
            return []
        if order.status != 'received':
            return []

        cycle = ProductionCycle.objects.select_for_update().get(id=order.production_cycle_id)
        if order.farm_profile_id != cycle.farm_profile_id:
            raise PermissionError("La commande ne correspond pas au cycle indiqué.")

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

            existing_entry = CycleFeedStockEntry.objects.select_for_update().filter(
                order_item=order_item
            ).first()
            if existing_entry:
                continue

            entry = CycleFeedStockEntry.objects.create(
                cycle=cycle,
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
