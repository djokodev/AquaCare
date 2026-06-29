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
    stock_tracking_started_at: date | None


class CycleStorePayload(TypedDict):
    cycle_id: str
    summary: CycleStoreSummary
    status: str
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
        product = order_item.product
        package_weight = getattr(product, 'package_weight_kg', None)
        if package_weight is None:
            return False
        try:
            return Decimal(str(package_weight)) > ZERO_DECIMAL and order_item.quantity > 0
        except (TypeError, ValueError):
            return False

    @staticmethod
    def _calculate_order_item_feed_kg(order_item: OrderItem) -> Decimal:
        product = order_item.product
        if not CycleStoreService._can_import_order_item(order_item):
            return ZERO_DECIMAL
        return CycleStoreService._to_decimal(product.package_weight_kg) * CycleStoreService._to_decimal(
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
                'stock_tracking_started_at': stock_tracking_started_at,
            },
            'status': status,
            'pending_orders': [CycleStoreService._format_pending_order(order) for order in pending_orders],
            'stock_tracking_started_at': stock_tracking_started_at,
        }

    @staticmethod
    @transaction.atomic
    def declare_manual_stock(
        *,
        user: User,
        cycle: ProductionCycle,
        label: str,
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
            raise ValueError("La quantité doit être strictement positive.")
        if total_cost_fcfa < ZERO_DECIMAL:
            raise ValueError("Le montant doit être positif ou nul.")
        if not label or not label.strip():
            raise ValueError("Le nom de l'aliment est requis.")

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
                label=order_item.product.name,
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
