"""Service métier pour le dashboard global d'un cycle de production."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import Prefetch

from ..models import CycleLog, CycleUnitAllocation, ProductionCycle, SanitaryLog
from .production_unit_dashboard_service import ProductionUnitDashboardService


class CycleDashboardService:
    """Construit les données agrégées d'un cycle à partir de ses unités."""

    ZERO_DECIMAL = Decimal('0')
    BIOMASS_QUANTIZE = Decimal('0.01')

    @staticmethod
    def build_dashboard_payload(cycle: ProductionCycle) -> dict[str, Any]:
        """Retourne le dashboard global du cycle courant."""
        unit_allocations = list(
            cycle.unit_allocations.select_related('production_unit')
            .prefetch_related(
                Prefetch(
                    'daily_logs',
                    queryset=CycleLog.objects.select_related(
                        'cycle',
                        'cycle_unit_allocation__production_unit',
                    ).order_by('-log_date', '-log_time'),
                    to_attr='prefetched_daily_logs',
                ),
                Prefetch(
                    'sanitary_logs',
                    queryset=SanitaryLog.objects.select_related(
                        'cycle',
                        'cycle_unit_allocation__production_unit',
                    ).order_by('-event_date', '-created_at'),
                    to_attr='prefetched_sanitary_logs',
                ),
            )
        )

        if unit_allocations:
            return CycleDashboardService._build_unit_dashboard_payload(cycle, unit_allocations)

        return CycleDashboardService._build_legacy_dashboard_payload(cycle)

    @staticmethod
    def _build_unit_dashboard_payload(
        cycle: ProductionCycle,
        unit_allocations: list[CycleUnitAllocation],
    ) -> dict[str, Any]:
        allocations_payload: list[dict[str, Any]] = []
        total_estimated_current_fish_count = 0
        total_mortality_count = 0
        total_feed_consumed_kg = CycleDashboardService.ZERO_DECIMAL
        total_estimated_current_biomass_kg = CycleDashboardService.ZERO_DECIMAL
        units_with_sanitary_issue_count = 0
        units_missing_today_log_count = 0

        for allocation in unit_allocations:
            daily_logs = list(getattr(allocation, 'prefetched_daily_logs', allocation.daily_logs.all()))
            sanitary_logs = list(getattr(allocation, 'prefetched_sanitary_logs', allocation.sanitary_logs.all()))

            payload = ProductionUnitDashboardService.build_dashboard_payload_from_logs(
                allocation=allocation,
                daily_logs=daily_logs,
                sanitary_logs=sanitary_logs,
            )
            allocations_payload.append(payload)

            summary = payload['summary']
            total_estimated_current_fish_count += summary['estimated_current_fish_count']
            total_mortality_count += summary['total_mortality_count']
            total_feed_consumed_kg += summary['total_feed_consumed_kg'] or CycleDashboardService.ZERO_DECIMAL
            total_estimated_current_biomass_kg += (
                summary['estimated_current_biomass_kg'] or CycleDashboardService.ZERO_DECIMAL
            )

            if summary['has_unresolved_sanitary_issue']:
                units_with_sanitary_issue_count += 1
            if not summary['has_today_daily_log']:
                units_missing_today_log_count += 1

        return {
            'cycle': cycle,
            'summary': {
                'total_allocations': len(unit_allocations),
                'total_estimated_current_fish_count': total_estimated_current_fish_count,
                'total_mortality_count': total_mortality_count,
                'total_feed_consumed_kg': total_feed_consumed_kg.quantize(CycleDashboardService.BIOMASS_QUANTIZE),
                'estimated_current_biomass_kg': total_estimated_current_biomass_kg.quantize(
                    CycleDashboardService.BIOMASS_QUANTIZE
                ),
                'units_with_sanitary_issue_count': units_with_sanitary_issue_count,
                'units_missing_today_log_count': units_missing_today_log_count,
                'has_allocations': True,
                'data_source': 'unit_allocations',
            },
            'allocations': allocations_payload,
        }

    @staticmethod
    def _build_legacy_dashboard_payload(cycle: ProductionCycle) -> dict[str, Any]:
        daily_logs = list(
            CycleLog.objects.select_related('cycle', 'cycle_unit_allocation__production_unit')
            .filter(cycle=cycle, cycle_unit_allocation__isnull=True)
            .order_by('-log_date', '-log_time')
        )
        sanitary_logs = list(
            SanitaryLog.objects.select_related('cycle', 'cycle_unit_allocation__production_unit')
            .filter(cycle=cycle, cycle_unit_allocation__isnull=True)
            .order_by('-event_date', '-created_at')
        )

        total_mortality_count = sum((log.mortality_count or 0) for log in daily_logs)
        total_feed_consumed_kg = sum(
            (log.feed_quantity or CycleDashboardService.ZERO_DECIMAL for log in daily_logs),
            CycleDashboardService.ZERO_DECIMAL,
        ).quantize(CycleDashboardService.BIOMASS_QUANTIZE)
        active_sanitary_issues_count = sum(1 for log in sanitary_logs if not log.resolved)

        return {
            'cycle': cycle,
            'summary': {
                'total_allocations': 0,
                'total_estimated_current_fish_count': cycle.current_count,
                'total_mortality_count': total_mortality_count,
                'total_feed_consumed_kg': total_feed_consumed_kg,
                'estimated_current_biomass_kg': (cycle.current_biomass or cycle.initial_biomass).quantize(
                    CycleDashboardService.BIOMASS_QUANTIZE
                ),
                'units_with_sanitary_issue_count': active_sanitary_issues_count,
                'units_missing_today_log_count': 0,
                'has_allocations': False,
                'data_source': 'legacy_cycle',
            },
            'allocations': [],
        }
