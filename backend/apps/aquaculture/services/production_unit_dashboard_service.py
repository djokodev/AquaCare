"""Service métier pour le mini-dashboard d'une allocation de cycle par unité."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from django.utils import timezone

from ..models import CycleLog, CycleUnitAllocation, SanitaryLog


class ProductionUnitDashboardService:
    """Construit les données opérationnelles d'une allocation de cycle."""

    RECENT_LOGS_LIMIT = 5
    RECENT_SANITARY_LIMIT = 5
    ZERO_DECIMAL = Decimal('0')
    HUNDRED_DECIMAL = Decimal('100')
    BIOMASS_QUANTIZE = Decimal('0.01')

    @staticmethod
    def build_dashboard_payload(allocation: CycleUnitAllocation) -> dict[str, Any]:
        """Retourne les indicateurs opérationnels d'une allocation de cycle."""
        daily_logs = list(
            CycleLog.objects.select_related('cycle', 'cycle_unit_allocation__production_unit').filter(
                cycle_unit_allocation=allocation
            )
            .order_by('-log_date', '-log_time')
        )
        sanitary_logs = list(
            SanitaryLog.objects.select_related('cycle', 'cycle_unit_allocation__production_unit').filter(
                cycle_unit_allocation=allocation
            )
            .order_by('-event_date', '-created_at')
        )

        return ProductionUnitDashboardService.build_dashboard_payload_from_logs(
            allocation=allocation,
            daily_logs=daily_logs,
            sanitary_logs=sanitary_logs,
        )

    @staticmethod
    def build_dashboard_payload_from_logs(
        *,
        allocation: CycleUnitAllocation,
        daily_logs: list[CycleLog],
        sanitary_logs: list[SanitaryLog],
    ) -> dict[str, Any]:
        """Construit le payload à partir de listes de logs déjà chargées."""
        summary = ProductionUnitDashboardService._build_summary(allocation, daily_logs, sanitary_logs)

        return {
            'allocation': allocation,
            'summary': summary,
            'recent_daily_logs': daily_logs[: ProductionUnitDashboardService.RECENT_LOGS_LIMIT],
            'recent_sanitary_logs': sanitary_logs[: ProductionUnitDashboardService.RECENT_SANITARY_LIMIT],
        }

    @staticmethod
    def _build_summary(
        allocation: CycleUnitAllocation,
        daily_logs: list[CycleLog],
        sanitary_logs: list[SanitaryLog],
    ) -> dict[str, Any]:
        total_mortality_count = sum((log.mortality_count or 0) for log in daily_logs)
        estimated_current_fish_count = max(allocation.initial_fish_count - total_mortality_count, 0)

        mortality_rate_pct = ProductionUnitDashboardService.ZERO_DECIMAL
        if allocation.initial_fish_count > 0:
            mortality_rate_pct = (
                Decimal(total_mortality_count)
                / Decimal(allocation.initial_fish_count)
                * ProductionUnitDashboardService.HUNDRED_DECIMAL
            ).quantize(ProductionUnitDashboardService.BIOMASS_QUANTIZE)

        total_feed_consumed_kg = sum(
            (
                log.feed_quantity or ProductionUnitDashboardService.ZERO_DECIMAL
                for log in daily_logs
            ),
            ProductionUnitDashboardService.ZERO_DECIMAL,
        )
        total_feed_consumed_kg = total_feed_consumed_kg.quantize(ProductionUnitDashboardService.BIOMASS_QUANTIZE)

        latest_average_weight_g = next(
            (log.average_weight for log in daily_logs if log.average_weight is not None),
            None,
        )

        if latest_average_weight_g is not None:
            estimated_current_biomass_kg = (
                Decimal(estimated_current_fish_count)
                * Decimal(latest_average_weight_g)
                / Decimal('1000')
            ).quantize(ProductionUnitDashboardService.BIOMASS_QUANTIZE)
        else:
            estimated_current_biomass_kg = allocation.current_biomass_kg or allocation.initial_biomass_kg

        last_daily_log_date = daily_logs[0].log_date if daily_logs else None
        today = timezone.localdate()
        days_since_last_log = (
            (today - last_daily_log_date).days if isinstance(last_daily_log_date, date) else None
        )
        has_today_daily_log = any(log.log_date == today for log in daily_logs)

        active_sanitary_issues_count = sum(1 for log in sanitary_logs if not log.resolved)
        last_sanitary_event_date = sanitary_logs[0].event_date if sanitary_logs else None

        return {
            'estimated_current_fish_count': estimated_current_fish_count,
            'total_mortality_count': total_mortality_count,
            'mortality_rate_pct': mortality_rate_pct,
            'total_feed_consumed_kg': total_feed_consumed_kg,
            'latest_average_weight_g': latest_average_weight_g,
            'estimated_current_biomass_kg': estimated_current_biomass_kg,
            'last_daily_log_date': last_daily_log_date,
            'days_since_last_log': days_since_last_log,
            'has_today_daily_log': has_today_daily_log,
            'active_sanitary_issues_count': active_sanitary_issues_count,
            'last_sanitary_event_date': last_sanitary_event_date,
            'has_unresolved_sanitary_issue': active_sanitary_issues_count > 0,
        }
