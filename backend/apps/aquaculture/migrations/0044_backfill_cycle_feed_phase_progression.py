"""Backfill monotone depuis le maximum des pesées historiques connues."""

from decimal import Decimal, InvalidOperation

from django.db import migrations


def _decimal(value):
    if value in (None, ""):
        return None
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _sequence_for_weight(phases, weight):
    for sequence, phase in enumerate(phases, start=1):
        weight_range = (
            phase.get("planned_weight_range_g")
            or phase.get("weight_range_g")
            or []
        )
        if not weight_range:
            continue
        upper = _decimal(weight_range[-1])
        if upper is not None and weight <= upper:
            return sequence
    return len(phases) if phases else 0


def backfill_progression(apps, schema_editor):
    CycleFeedPlan = apps.get_model("aquaculture", "CycleFeedPlan")
    CycleLog = apps.get_model("aquaculture", "CycleLog")

    for plan in CycleFeedPlan.objects.select_related("cycle").iterator():
        cycle = plan.cycle
        weights = [
            _decimal(cycle.initial_average_weight),
            _decimal(cycle.current_average_weight),
        ]
        logs = CycleLog.objects.filter(cycle_id=cycle.id).values_list(
            "average_weight",
            "sample_count",
            "sample_total_weight",
        )
        for average_weight, sample_count, sample_total_weight in logs:
            weights.append(_decimal(average_weight))
            if sample_count and sample_total_weight:
                weights.append(
                    Decimal(str(sample_total_weight)) / Decimal(sample_count)
                )
        known = [weight for weight in weights if weight is not None]
        if not known:
            continue
        reached = _sequence_for_weight(plan.phases or [], max(known))
        if reached > plan.highest_reached_phase_sequence:
            CycleFeedPlan.objects.filter(pk=plan.pk).update(
                highest_reached_phase_sequence=reached
            )


class Migration(migrations.Migration):
    dependencies = [
        ("aquaculture", "0043_safe_legacy_feed_classification_repair"),
    ]

    operations = [
        migrations.RunPython(
            backfill_progression,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
