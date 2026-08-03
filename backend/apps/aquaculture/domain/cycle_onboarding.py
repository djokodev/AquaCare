"""Pure rules for separating declared history from the AquaCare baseline."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.utils.translation import gettext_lazy as _

from .calculators import AquacultureCalculator

BASELINE_BIOMASS_TOLERANCE_PCT = Decimal('10')
BIOMASS_QUANTUM_KG = Decimal('0.01')


@dataclass(frozen=True)
class CycleOnboardingRuleViolation(ValueError):
    code: str
    detail: Any
    context: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.detail


@dataclass(frozen=True)
class TrackingBaseline:
    tracking_start_date: date
    fish_count: int
    average_weight_g: Decimal
    biomass_kg: Decimal
    biomass_source: str
    calculated_biomass_kg: Decimal


def resolve_tracking_baseline(
    *,
    onboarding_mode: str,
    start_date: date,
    initial_count: int,
    initial_average_weight: Decimal | None,
    tracking_baseline: dict[str, Any] | None,
    today: date,
) -> TrackingBaseline:
    """Validate and normalize the immutable starting point for tracked events."""
    if onboarding_mode == 'new':
        if initial_average_weight is None:
            raise CycleOnboardingRuleViolation(
                code='new_cycle_initial_weight_required',
                detail=_('Le poids moyen initial est obligatoire pour un nouveau cycle.'),
            )
        calculated = AquacultureCalculator.calculate_biomass(
            initial_count,
            initial_average_weight,
        )
        return TrackingBaseline(
            tracking_start_date=start_date,
            fish_count=initial_count,
            average_weight_g=initial_average_weight,
            biomass_kg=calculated,
            biomass_source='calculated',
            calculated_biomass_kg=calculated,
        )

    if onboarding_mode != 'ongoing':
        raise CycleOnboardingRuleViolation(
            code='invalid_onboarding_mode',
            detail=_("Le mode d'entrée dans le suivi est invalide."),
        )
    if not tracking_baseline:
        raise CycleOnboardingRuleViolation(
            code='ongoing_cycle_tracking_baseline_required',
            detail=_("La situation au démarrage du suivi AquaCare est obligatoire."),
        )

    tracking_start_date = tracking_baseline['tracking_start_date']
    fish_count = int(tracking_baseline['fish_count'])
    average_weight_g = Decimal(str(tracking_baseline['average_weight_g']))
    declared_biomass = tracking_baseline.get('biomass_kg')

    if tracking_start_date < start_date:
        raise CycleOnboardingRuleViolation(
            code='ongoing_cycle_tracking_date_before_start',
            detail=_("La date de suivi ne peut pas précéder le début réel de l'élevage."),
        )
    if tracking_start_date > today:
        raise CycleOnboardingRuleViolation(
            code='ongoing_cycle_tracking_date_in_future',
            detail=_('La date de suivi ne peut pas être future.'),
        )
    if fish_count <= 0:
        raise CycleOnboardingRuleViolation(
            code='ongoing_cycle_current_count_required',
            detail=_("L'effectif présent doit être strictement positif."),
        )
    if fish_count > initial_count:
        raise CycleOnboardingRuleViolation(
            code='ongoing_cycle_current_count_exceeds_initial',
            detail=_("L'effectif présent ne peut pas dépasser l'effectif historique initial."),
        )
    if average_weight_g <= 0:
        raise CycleOnboardingRuleViolation(
            code='ongoing_cycle_current_weight_required',
            detail=_('Le poids moyen observé doit être strictement positif.'),
        )

    calculated = AquacultureCalculator.calculate_biomass(fish_count, average_weight_g)
    if declared_biomass is None:
        return TrackingBaseline(
            tracking_start_date=tracking_start_date,
            fish_count=fish_count,
            average_weight_g=average_weight_g,
            biomass_kg=calculated,
            biomass_source='calculated',
            calculated_biomass_kg=calculated,
        )

    declared = Decimal(str(declared_biomass))
    if declared <= 0:
        raise CycleOnboardingRuleViolation(
            code='ongoing_cycle_biomass_inconsistent',
            detail=_('La biomasse mesurée doit être strictement positive.'),
        )
    difference_pct = (
        abs(declared - calculated) / calculated * Decimal('100')
        if calculated > 0
        else Decimal('100')
    )
    if difference_pct > BASELINE_BIOMASS_TOLERANCE_PCT:
        raise CycleOnboardingRuleViolation(
            code='ongoing_cycle_biomass_inconsistent',
            detail=_('La biomasse mesurée dépasse la tolérance de 10 %.'),
            context={
                'declared_biomass_kg': declared,
                'calculated_biomass_kg': calculated,
                'difference_pct': difference_pct.quantize(
                    Decimal('0.01'),
                    rounding=ROUND_HALF_UP,
                ),
                'tolerance_pct': BASELINE_BIOMASS_TOLERANCE_PCT,
            },
        )
    return TrackingBaseline(
        tracking_start_date=tracking_start_date,
        fish_count=fish_count,
        average_weight_g=average_weight_g,
        biomass_kg=declared,
        biomass_source='declared',
        calculated_biomass_kg=calculated,
    )


def distribute_biomass_by_allocation(
    *,
    total_biomass_kg: Decimal,
    allocations: list[dict[str, Any]],
) -> dict[str, Decimal]:
    """Split a total exactly, assigning any rounding remainder deterministically."""
    ordered = sorted(
        allocations,
        key=lambda item: item['production_unit_local_id'],
    )
    total_count = sum(int(item['fish_count']) for item in ordered)
    if total_count <= 0:
        return {}

    result: dict[str, Decimal] = {}
    allocated = Decimal('0')
    for index, allocation in enumerate(ordered):
        local_id = allocation['production_unit_local_id']
        if index == len(ordered) - 1:
            share = total_biomass_kg - allocated
        else:
            share = (
                total_biomass_kg
                * Decimal(int(allocation['fish_count']))
                / Decimal(total_count)
            ).quantize(BIOMASS_QUANTUM_KG, rounding=ROUND_HALF_UP)
            allocated += share
        result[local_id] = share
    return result


def validate_tracked_event_date(*, cycle, event_date: date) -> None:
    """Reject operational events that predate the tracked baseline."""
    minimum_date = cycle.analysis_start_date
    if minimum_date and event_date < minimum_date:
        raise CycleOnboardingRuleViolation(
            code='event_before_tracking_start',
            detail=_("Un événement suivi ne peut pas précéder le démarrage du suivi AquaCare."),
            context={'tracking_start_date': minimum_date},
        )
