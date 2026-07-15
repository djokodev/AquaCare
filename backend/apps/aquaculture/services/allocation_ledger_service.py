"""Canonical chronological replay for allocation stock and historical snapshots."""

from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal

from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from ..domain.calculators import AquacultureCalculator
from ..domain.exceptions import BusinessRuleViolation
from ..models import CycleUnitAllocation, FinalHarvestOperation, ProductionCycle


class AllocationLedgerService:
    """Replays every event that changes the living stock of one allocation."""

    @staticmethod
    def _at(value: date | datetime, fallback_time: time) -> datetime:
        if isinstance(value, datetime):
            return value
        return timezone.make_aware(
            datetime.combine(value, fallback_time),
            timezone.get_current_timezone(),
        )

    @classmethod
    def session_started_at(cls, allocation: CycleUnitAllocation) -> datetime:
        """Return the first real arrival, falling back only for legacy empty sessions."""
        arrivals = list(allocation.calibration_operations_in.all())
        if arrivals:
            return min(operation.calibrated_at for operation in arrivals)
        return cls._at(allocation.cycle.start_date, time.min)

    @classmethod
    def session_closed_at(cls, allocation: CycleUnitAllocation) -> datetime | None:
        """Return the business closure datetime used by session interval resolution."""
        if allocation.status != CycleUnitAllocation.STATUS_HARVESTED:
            return None
        if allocation.final_harvested_at is not None:
            return allocation.final_harvested_at
        # Legacy rows only contain a date.  Their real closing hour is unknown;
        # returning None prevents a fabricated technical/server timestamp from
        # silently resolving a historical calibration to the wrong session.
        if allocation.final_harvest_date is not None:
            return None
        raise BusinessRuleViolation(_("Une session récoltée doit avoir une date de clôture."))

    @classmethod
    def replay(
        cls,
        allocation: CycleUnitAllocation,
        *,
        as_of: date | datetime | None = None,
        daily_logs=None,
        partial_harvests=None,
        incoming_operations=None,
        outgoing_operations=None,
        include_final_harvest: bool = True,
        strictly_before_as_of: bool = False,
    ) -> dict:
        events = []
        incoming_operations = (
            allocation.calibration_operations_in.all()
            if incoming_operations is None
            else incoming_operations
        )
        outgoing_operations = (
            allocation.calibration_operations_out.all()
            if outgoing_operations is None
            else outgoing_operations
        )
        daily_logs = allocation.daily_logs.all() if daily_logs is None else daily_logs
        partial_harvests = allocation.unit_partial_harvests.all() if partial_harvests is None else partial_harvests
        for operation in incoming_operations:
            events.append((operation.calibrated_at, operation.created_at, str(operation.id), 'incoming', operation))
        for operation in outgoing_operations:
            events.append((operation.calibrated_at, operation.created_at, str(operation.id), 'outgoing', operation))
        for log in daily_logs:
            events.append((cls._at(log.log_date, log.log_time or time.min), log.created_at, str(log.id), 'log', log))
        for harvest in partial_harvests:
            local_created_at = timezone.localtime(harvest.created_at)
            events.append((
                cls._at(harvest.harvest_date, local_created_at.time().replace(tzinfo=None)),
                harvest.created_at,
                str(harvest.id),
                'partial_harvest',
                harvest,
            ))
        if (
            include_final_harvest
            and
            allocation.status == CycleUnitAllocation.STATUS_HARVESTED
            and allocation.final_harvest_date is not None
        ):
            harvested_at = cls.session_closed_at(allocation)
            # The end-of-day fallback is only used to rebuild aggregate legacy
            # metrics. It is never exposed by ``session_closed_at`` and can
            # therefore never resolve a historical calibration session.
            harvested_at = harvested_at or cls._at(allocation.final_harvest_date, time.max)
            try:
                final_event = allocation.final_harvest_operation
            except FinalHarvestOperation.DoesNotExist:
                final_event = allocation
            events.append((
                harvested_at,
                getattr(final_event, 'created_at', harvested_at),
                str(final_event.id),
                'final_harvest',
                final_event,
            ))
        events.sort(key=lambda item: (item[0], item[1], item[2]))

        cutoff = None
        if as_of is not None:
            cutoff = as_of if isinstance(as_of, datetime) else cls._at(as_of, time.max)
        if allocation.cycle.cycle_kind == ProductionCycle.CYCLE_KIND_CALIBRATION:
            count = 0
            biomass = Decimal('0.00')
            introduced_count = 0
            introduced_biomass = Decimal('0.00')
        else:
            count = allocation.initial_fish_count
            biomass = Decimal(str(allocation.initial_biomass_kg))
            introduced_count = allocation.initial_fish_count
            introduced_biomass = Decimal(str(allocation.initial_biomass_kg))

        mortality_count = 0
        partial_harvest_count = 0
        partial_harvest_biomass = Decimal('0.00')
        final_harvest_count = 0
        final_harvest_biomass = Decimal('0.00')
        incoming_count = 0
        incoming_biomass = Decimal('0.00')
        outgoing_count = 0
        outgoing_biomass = Decimal('0.00')
        movement_snapshots = {}
        applied_events = []

        for event_at, _created_at, event_id, event_type, event in events:
            if cutoff is not None and (
                event_at > cutoff or (strictly_before_as_of and event_at >= cutoff)
            ):
                continue
            before_count = count
            before_biomass = biomass
            before_weight = (
                before_biomass * Decimal('1000') / Decimal(before_count)
                if before_count > 0 else Decimal('0')
            ).quantize(Decimal('0.01'))

            if event_type == 'incoming':
                count += event.transferred_count
                biomass += event.transferred_biomass_kg
                introduced_count += event.transferred_count
                introduced_biomass += event.transferred_biomass_kg
                incoming_count += event.transferred_count
                incoming_biomass += event.transferred_biomass_kg
            elif event_type == 'outgoing':
                count -= event.transferred_count
                biomass -= event.transferred_biomass_kg
                outgoing_count += event.transferred_count
                outgoing_biomass += event.transferred_biomass_kg
                if count <= 0 or biomass <= 0:
                    raise BusinessRuleViolation(
                        _("Un calibrage doit laisser un effectif et une biomasse strictement positifs dans la source.")
                    )
            elif event_type == 'log':
                mortality = event.mortality_count or 0
                count -= mortality
                mortality_count += mortality
                average_weight = (
                    Decimal(str(event.average_weight))
                    if event.average_weight is not None
                    else before_weight
                )
                biomass = AquacultureCalculator.calculate_biomass(count, average_weight)
            elif event_type == 'partial_harvest':
                count -= event.count_harvested
                biomass -= Decimal(str(event.total_weight_kg))
                partial_harvest_count += event.count_harvested
                partial_harvest_biomass += Decimal(str(event.total_weight_kg))
            elif event_type == 'final_harvest':
                declared_count = getattr(event, 'declared_fish_count', None)
                if declared_count is None:
                    declared_count = event.final_fish_count if event.final_fish_count is not None else before_count
                reconciliation_status = getattr(
                    event,
                    'reconciliation_status',
                    FinalHarvestOperation.STATUS_RECONCILED,
                )
                if (
                    reconciliation_status == FinalHarvestOperation.STATUS_RECONCILED
                    and declared_count != before_count
                ):
                    raise BusinessRuleViolation(
                        _("Une opération antidatée invalide l'effectif de la récolte finale enregistrée.")
                    )
                final_harvest_count += declared_count
                declared_biomass = getattr(event, 'declared_biomass_kg', None)
                if declared_biomass is None:
                    declared_biomass = event.final_biomass_kg or before_biomass
                final_harvest_biomass += Decimal(str(declared_biomass))
                count = 0
                biomass = Decimal('0.00')

            if count < 0 or biomass < 0:
                raise BusinessRuleViolation(_("La chronologie de l'allocation produit un stock négatif."))
            if count == 0:
                biomass = Decimal('0.00')
            biomass = biomass.quantize(Decimal('0.01'))
            after_weight = (
                biomass * Decimal('1000') / Decimal(count) if count > 0 else Decimal('0')
            ).quantize(Decimal('0.01'))
            if event_type in {'incoming', 'outgoing'}:
                movement_snapshots[event_id] = {
                    'count_before': before_count,
                    'count_after': count,
                    'average_weight_before_g': before_weight,
                    'average_weight_after_g': after_weight,
                    'biomass_before_kg': before_biomass.quantize(Decimal('0.01')),
                    'biomass_after_kg': biomass,
                }
            applied_events.append((event_at, event_type, event))

        biological_survivors = max(0, introduced_count - mortality_count)
        return {
            'current_count': count,
            'current_biomass_kg': biomass,
            'current_average_weight_g': (
                biomass * Decimal('1000') / Decimal(count) if count > 0 else Decimal('0')
            ).quantize(Decimal('0.01')),
            'introduced_count': introduced_count,
            'introduced_biomass_kg': introduced_biomass.quantize(Decimal('0.01')),
            'mortality_count': mortality_count,
            'partial_harvest_count': partial_harvest_count,
            'partial_harvest_biomass_kg': partial_harvest_biomass.quantize(Decimal('0.01')),
            'final_harvest_count': final_harvest_count,
            'final_harvest_biomass_kg': final_harvest_biomass.quantize(Decimal('0.01')),
            'harvested_count': partial_harvest_count + final_harvest_count,
            'harvested_biomass_kg': (partial_harvest_biomass + final_harvest_biomass).quantize(Decimal('0.01')),
            'incoming_count': incoming_count,
            'incoming_biomass_kg': incoming_biomass.quantize(Decimal('0.01')),
            'outgoing_count': outgoing_count,
            'outgoing_biomass_kg': outgoing_biomass.quantize(Decimal('0.01')),
            'biological_survival_rate_pct': (
                Decimal(biological_survivors) / Decimal(introduced_count) * Decimal('100')
            ).quantize(Decimal('0.01')) if introduced_count else None,
            'stock_remaining_rate_pct': (
                Decimal(count) / Decimal(introduced_count) * Decimal('100')
            ).quantize(Decimal('0.01')) if introduced_count else None,
            'movement_snapshots': movement_snapshots,
            'events': applied_events,
        }
