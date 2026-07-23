"""Ledger chronologique canonique du stock alimentaire d'un cycle."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID

from django.db.models import QuerySet
from django.utils import timezone

from ..models import (
    CycleFeedStockAdjustment,
    CycleFeedStockEntry,
    CycleLog,
    FarmFeedReference,
    ProductionCycle,
)

ZERO_DECIMAL = Decimal("0")
QUANTIZE_KG = Decimal("0.01")


@dataclass(frozen=True)
class FeedStockReservation:
    """Consommation non persistée à intégrer au ledger pendant une transaction."""

    log_date: date
    quantity_kg: Decimal
    event_id: str


@dataclass(frozen=True)
class FeedStockLedgerState:
    """Résultat d'un calcul de disponibilité chronologique."""

    tracking_started_at: date | None
    balance_at_date: Decimal
    current_balance: Decimal
    future_headroom: Decimal
    minimum_balance: Decimal


@dataclass(frozen=True)
class _LedgerEvent:
    event_date: date
    order: int
    created_at: datetime
    event_id: str
    quantity_delta: Decimal

    @property
    def sort_key(self) -> tuple[date, int, datetime, str]:
        return (self.event_date, self.order, self.created_at, self.event_id)


class FeedStockLedgerService:
    """Calcule un stock par référence sans utiliser de stock futur."""

    ENTRY_ORDER = 0
    ADJUSTMENT_ORDER = 1
    CONSUMPTION_ORDER = 2
    RESERVATION_ORDER = 3

    @staticmethod
    def _decimal(value: object) -> Decimal:
        if value is None:
            return ZERO_DECIMAL
        return value if isinstance(value, Decimal) else Decimal(str(value))

    @staticmethod
    def _quantize(value: Decimal) -> Decimal:
        return value.quantize(QUANTIZE_KG)

    @staticmethod
    def _event_datetime(value: datetime | None, event_date: date) -> datetime:
        if value is not None:
            return value
        return timezone.make_aware(datetime.combine(event_date, time.min))

    @staticmethod
    def consumption_queryset(cycle: ProductionCycle) -> QuerySet[CycleLog]:
        """Retourne les seules rations faisant autorité pour le stock du cycle."""
        if cycle.unit_allocations.exists():
            return CycleLog.objects.filter(
                cycle=cycle,
                cycle_unit_allocation__isnull=False,
            )
        return CycleLog.objects.filter(
            cycle=cycle,
            cycle_unit_allocation__isnull=True,
        )

    @classmethod
    def calculate(
        cls,
        *,
        cycle: ProductionCycle,
        feed_reference: FarmFeedReference,
        at_date: date | None = None,
        existing_log: CycleLog | None = None,
        reservations: Iterable[FeedStockReservation] = (),
    ) -> FeedStockLedgerState:
        """Construit la timeline, entrées avant ajustements puis consommations.

        Une entrée est disponible au début de sa ``entry_date``. Les ajustements
        historiques sont appliqués juste après l'entrée concernée, puis les
        rations persistées et enfin les réservations du batch courant.
        """
        reference_entries = list(
            CycleFeedStockEntry.objects.filter(
                cycle=cycle,
                feed_reference=feed_reference,
            )
            .select_related("historical_adjustment")
            .order_by("entry_date", "created_at", "id")
        )
        tracking_started_at = (
            reference_entries[0].entry_date if reference_entries else None
        )
        if tracking_started_at is None:
            return FeedStockLedgerState(
                tracking_started_at=None,
                balance_at_date=ZERO_DECIMAL,
                current_balance=ZERO_DECIMAL,
                future_headroom=ZERO_DECIMAL,
                minimum_balance=ZERO_DECIMAL,
            )

        events: list[_LedgerEvent] = []
        for entry in reference_entries:
            created_at = cls._event_datetime(entry.created_at, entry.entry_date)
            events.append(
                _LedgerEvent(
                    event_date=entry.entry_date,
                    order=cls.ENTRY_ORDER,
                    created_at=created_at,
                    event_id=str(entry.id),
                    quantity_delta=cls._decimal(entry.quantity_kg),
                )
            )
            try:
                adjustment: CycleFeedStockAdjustment | None = (
                    entry.historical_adjustment
                )
            except CycleFeedStockAdjustment.DoesNotExist:
                adjustment = None
            if adjustment is not None:
                events.append(
                    _LedgerEvent(
                        event_date=entry.entry_date,
                        order=cls.ADJUSTMENT_ORDER,
                        created_at=cls._event_datetime(
                            adjustment.created_at,
                            entry.entry_date,
                        ),
                        event_id=str(adjustment.id),
                        quantity_delta=-cls._decimal(adjustment.quantity_kg),
                    )
                )

        logs = (
            cls.consumption_queryset(cycle)
            .filter(
                feed_reference=feed_reference,
                feed_quantity__gt=0,
                log_date__gte=tracking_started_at,
            )
            .order_by("log_date", "created_at", "id")
        )
        if existing_log is not None:
            logs = logs.exclude(pk=existing_log.pk)
        for log in logs:
            events.append(
                _LedgerEvent(
                    event_date=log.log_date,
                    order=cls.CONSUMPTION_ORDER,
                    created_at=cls._event_datetime(log.created_at, log.log_date),
                    event_id=str(log.id),
                    quantity_delta=-cls._decimal(log.feed_quantity),
                )
            )

        for reservation in reservations:
            events.append(
                _LedgerEvent(
                    event_date=reservation.log_date,
                    order=cls.RESERVATION_ORDER,
                    created_at=cls._event_datetime(None, reservation.log_date),
                    event_id=reservation.event_id,
                    quantity_delta=-cls._decimal(reservation.quantity_kg),
                )
            )

        effective_date = at_date or timezone.localdate()
        balance = ZERO_DECIMAL
        balance_at_date = ZERO_DECIMAL
        minimum_balance: Decimal | None = None
        future_headroom: Decimal | None = None
        for event in sorted(events, key=lambda item: item.sort_key):
            balance += event.quantity_delta
            minimum_balance = (
                balance if minimum_balance is None else min(minimum_balance, balance)
            )
            if event.event_date <= effective_date:
                balance_at_date = balance
            # Les entrées d'une même journée sont toutes disponibles avant les
            # consommations. Un solde intermédiaire entre deux entrées positives
            # ne constitue donc pas une limite de ration.
            if (
                event.event_date >= effective_date
                and event.quantity_delta < ZERO_DECIMAL
            ):
                future_headroom = (
                    balance
                    if future_headroom is None
                    else min(future_headroom, balance)
                )

        if future_headroom is None:
            future_headroom = balance_at_date
        if minimum_balance is None:
            minimum_balance = ZERO_DECIMAL
        return FeedStockLedgerState(
            tracking_started_at=tracking_started_at,
            balance_at_date=cls._quantize(balance_at_date),
            current_balance=cls._quantize(balance),
            future_headroom=cls._quantize(future_headroom),
            minimum_balance=cls._quantize(minimum_balance),
        )

    @staticmethod
    def reservation(
        *,
        log_date: date,
        quantity_kg: Decimal,
        event_id: UUID | str,
    ) -> FeedStockReservation:
        return FeedStockReservation(
            log_date=log_date,
            quantity_kg=quantity_kg,
            event_id=str(event_id),
        )
