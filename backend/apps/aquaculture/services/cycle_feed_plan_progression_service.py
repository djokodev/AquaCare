"""Progression monotone du plan alimentaire, persistée pendant les mutations."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from ..models import CycleFeedPlan, CycleLog, ProductionCycle


class CycleFeedPlanProgressionService:
    """Enregistre la phase maximale observée sans jamais la diminuer."""

    @staticmethod
    def _decimal(value: object) -> Decimal | None:
        if value in (None, ""):
            return None
        parsed = value if isinstance(value, Decimal) else Decimal(str(value))
        return parsed if parsed > 0 else None

    @classmethod
    @transaction.atomic
    def record_progress_from_weight(
        cls,
        *,
        cycle: ProductionCycle,
        observed_weight: Decimal | None,
    ) -> CycleFeedPlan | None:
        weight = cls._decimal(observed_weight)
        if weight is None:
            return CycleFeedPlan.objects.filter(cycle=cycle).first()

        locked_cycle = ProductionCycle.objects.select_for_update().get(pk=cycle.pk)
        from .cycle_feed_recommendation_service import (
            CycleFeedRecommendationService,
        )

        plan = CycleFeedRecommendationService.ensure_plan(locked_cycle)
        if plan is None:
            return None
        locked_plan = CycleFeedPlan.objects.select_for_update().get(pk=plan.pk)
        phases = CycleFeedRecommendationService._normalized_plan_phases(locked_plan)
        if not phases:
            return locked_plan
        reached = (
            CycleFeedRecommendationService._current_phase_index(phases, weight) + 1
        )
        if reached > locked_plan.highest_reached_phase_sequence:
            locked_plan.highest_reached_phase_sequence = reached
            locked_plan.save(update_fields=["highest_reached_phase_sequence"])
        return locked_plan

    @classmethod
    def record_progress_from_log(cls, log: CycleLog) -> CycleFeedPlan | None:
        observed_weight = cls._decimal(log.average_weight)
        if observed_weight is None and log.sample_count and log.sample_total_weight:
            observed_weight = Decimal(log.sample_total_weight) / Decimal(log.sample_count)
        return cls.record_progress_from_weight(
            cycle=log.cycle,
            observed_weight=observed_weight,
        )

    @classmethod
    def record_progress_from_history(
        cls,
        cycle: ProductionCycle,
    ) -> CycleFeedPlan | None:
        observations = [
            cls._decimal(cycle.initial_average_weight),
            cls._decimal(cycle.current_average_weight),
        ]
        observations.extend(
            cls._decimal(value)
            for value in cycle.logs.filter(average_weight__gt=0).values_list(
                "average_weight",
                flat=True,
            )
        )
        sample_rows = cycle.logs.filter(
            sample_count__gt=0,
            sample_total_weight__gt=0,
        ).values_list("sample_count", "sample_total_weight")
        observations.extend(
            Decimal(total_weight) / Decimal(sample_count)
            for sample_count, total_weight in sample_rows
        )
        known = [weight for weight in observations if weight is not None]
        return cls.record_progress_from_weight(
            cycle=cycle,
            observed_weight=max(known) if known else None,
        )
