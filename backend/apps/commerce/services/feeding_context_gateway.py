"""Gateway commerce pour lire le contexte aquaculture utilise par les suggestions."""

from __future__ import annotations

from datetime import date
from typing import Any

from .contracts import CycleLogReadModel, ProductionCycleReadModel


class FeedingContextGateway:
    """Encapsule les acces lecture aux cycles et logs aquaculture."""

    @staticmethod
    def get_active_cycles(
        *,
        user_id: Any,
        farm_profile_id: str | None = None,
        cycle_id: str | None = None,
    ) -> list[ProductionCycleReadModel]:
        from aquaculture.models import ProductionCycle

        cycles_query = ProductionCycle.objects.filter(
            farm_profile__user__id=user_id,
            status='active',
        )
        if farm_profile_id:
            cycles_query = cycles_query.filter(farm_profile__id=farm_profile_id)
        if cycle_id:
            cycles_query = cycles_query.filter(id=cycle_id)
        cycles: list[ProductionCycleReadModel] = list(cycles_query.select_related('farm_profile'))
        return cycles

    @staticmethod
    def get_recent_feed_logs(
        *,
        cycle: ProductionCycleReadModel,
        start_date: date,
        end_date: date,
    ) -> list[CycleLogReadModel]:
        from aquaculture.models import CycleLog

        logs: list[CycleLogReadModel] = list(
            CycleLog.objects.filter(
                cycle=cycle,
                log_date__gte=start_date,
                log_date__lte=end_date,
                feed_quantity__isnull=False,
                feed_quantity__gt=0,
            ).order_by('log_date')
        )
        return logs
