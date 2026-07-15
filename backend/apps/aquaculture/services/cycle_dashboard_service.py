"""Service métier pour le dashboard global d'un cycle de production."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import Prefetch
from django.utils import timezone

from ..constants import DEFAULT_FEED_PRICE_PER_KG
from ..domain.calculators import AquacultureCalculator
from ..domain.dashboard_metrics import (
    calculate_cycle_days_remaining,
    calculate_cycle_progress_pct,
    estimate_market_value_fcfa,
)
from ..models import CycleLog, CycleUnitAllocation, ProductionCycle, SanitaryLog
from .farm_production_plan_service import FarmProductionPlanService
from .production_unit_dashboard_service import ProductionUnitDashboardService


class CycleDashboardService:
    """Construit les données agrégées d'un cycle à partir de ses unités."""

    ZERO_DECIMAL = Decimal('0')
    BIOMASS_QUANTIZE = Decimal('0.01')

    @staticmethod
    def _build_business_metrics(
        cycle: ProductionCycle,
        *,
        biomass_kg: Decimal | None,
        feed_consumed_kg: Decimal,
    ) -> dict[str, Any]:
        plan = FarmProductionPlanService.get_plan_data(cycle.farm_profile)
        feed_price = plan['default_feed_price_per_kg'] or DEFAULT_FEED_PRICE_PER_KG
        feed_cost = AquacultureCalculator.calculate_feed_cost(feed_consumed_kg, feed_price)
        today = timezone.localdate()
        return {
            'estimated_market_value_fcfa': estimate_market_value_fcfa(
                biomass_kg,
                cycle.planned_selling_price_per_kg_fcfa,
            ),
            'direct_production_cost_fcfa': (
                feed_cost + (cycle.fingerlings_cost_fcfa or CycleDashboardService.ZERO_DECIMAL)
            ).quantize(CycleDashboardService.BIOMASS_QUANTIZE),
            'cycle_progress_pct': calculate_cycle_progress_pct(
                start_date=cycle.start_date,
                planned_duration_days=cycle.planned_cycle_duration_days,
                status=cycle.status,
                as_of=today,
            ),
            'days_remaining': calculate_cycle_days_remaining(
                start_date=cycle.start_date,
                planned_duration_days=cycle.planned_cycle_duration_days,
                planned_harvest_date=cycle.planned_harvest_date,
                status=cycle.status,
                as_of=today,
            ),
        }

    @staticmethod
    def build_dashboard_payload(cycle: ProductionCycle) -> dict[str, Any]:
        """Retourne le dashboard global du cycle courant."""
        unit_allocations = list(
            cycle.unit_allocations.select_related('production_unit', 'cycle')
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
        total_initial_fish_count = 0
        total_estimated_current_fish_count = 0
        total_mortality_count = 0
        total_feed_consumed_kg = CycleDashboardService.ZERO_DECIMAL
        total_estimated_current_biomass_kg = CycleDashboardService.ZERO_DECIMAL
        units_with_today_log_count = 0
        units_with_active_sanitary_issue_count = 0
        units_missing_today_log_count = 0
        last_daily_log_date = None
        last_sanitary_event_date = None

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
            total_initial_fish_count += allocation.initial_fish_count
            total_estimated_current_fish_count += allocation.current_fish_count
            total_mortality_count += summary['total_mortality_count']
            total_feed_consumed_kg += summary['total_feed_consumed_kg'] or CycleDashboardService.ZERO_DECIMAL
            total_estimated_current_biomass_kg += (
                Decimal(str(allocation.current_biomass_kg or CycleDashboardService.ZERO_DECIMAL))
            )

            if summary['has_today_daily_log']:
                units_with_today_log_count += 1
            else:
                units_missing_today_log_count += 1
            if summary['has_unresolved_sanitary_issue']:
                units_with_active_sanitary_issue_count += 1

            allocation_last_daily_log_date = summary['last_daily_log_date']
            if allocation_last_daily_log_date and (
                last_daily_log_date is None or allocation_last_daily_log_date > last_daily_log_date
            ):
                last_daily_log_date = allocation_last_daily_log_date

            allocation_last_sanitary_event_date = summary['last_sanitary_event_date']
            if allocation_last_sanitary_event_date and (
                last_sanitary_event_date is None or allocation_last_sanitary_event_date > last_sanitary_event_date
            ):
                last_sanitary_event_date = allocation_last_sanitary_event_date

        mortality_rate_pct = CycleDashboardService.ZERO_DECIMAL
        if total_initial_fish_count > 0:
            mortality_rate_pct = (
                Decimal(total_mortality_count) / Decimal(total_initial_fish_count) * Decimal('100')
            ).quantize(CycleDashboardService.BIOMASS_QUANTIZE)

        business_metrics = CycleDashboardService._build_business_metrics(
            cycle,
            biomass_kg=total_estimated_current_biomass_kg,
            feed_consumed_kg=total_feed_consumed_kg,
        )
        return {
            'cycle': cycle,
            'summary': {
                'total_allocations': len(unit_allocations),
                'total_initial_fish_count': total_initial_fish_count,
                'total_estimated_current_fish_count': total_estimated_current_fish_count,
                'total_mortality_count': total_mortality_count,
                'mortality_rate_pct': mortality_rate_pct,
                'total_feed_consumed_kg': total_feed_consumed_kg.quantize(CycleDashboardService.BIOMASS_QUANTIZE),
                'estimated_current_biomass_kg': total_estimated_current_biomass_kg.quantize(
                    CycleDashboardService.BIOMASS_QUANTIZE
                ),
                'units_with_today_log_count': units_with_today_log_count,
                'units_with_sanitary_issue_count': units_with_active_sanitary_issue_count,
                'units_with_active_sanitary_issue_count': units_with_active_sanitary_issue_count,
                'units_missing_today_log_count': units_missing_today_log_count,
                'last_daily_log_date': last_daily_log_date,
                'last_sanitary_event_date': last_sanitary_event_date,
                'has_allocations': True,
                'data_source': 'unit_allocations',
                **business_metrics,
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
        total_initial_fish_count = cycle.initial_count or 0
        mortality_rate_pct = CycleDashboardService.ZERO_DECIMAL
        if total_initial_fish_count > 0:
            mortality_rate_pct = (
                Decimal(total_mortality_count) / Decimal(total_initial_fish_count) * Decimal('100')
            ).quantize(CycleDashboardService.BIOMASS_QUANTIZE)
        total_feed_consumed_kg = sum(
            (log.feed_quantity or CycleDashboardService.ZERO_DECIMAL for log in daily_logs),
            CycleDashboardService.ZERO_DECIMAL,
        ).quantize(CycleDashboardService.BIOMASS_QUANTIZE)
        active_sanitary_issues_count = sum(1 for log in sanitary_logs if not log.resolved)

        estimated_biomass = cycle.current_biomass if cycle.current_biomass is not None else cycle.initial_biomass
        business_metrics = CycleDashboardService._build_business_metrics(
            cycle,
            biomass_kg=estimated_biomass,
            feed_consumed_kg=total_feed_consumed_kg,
        )
        return {
            'cycle': cycle,
            'summary': {
                'total_allocations': 0,
                'total_initial_fish_count': total_initial_fish_count,
                'total_estimated_current_fish_count': cycle.current_count,
                'total_mortality_count': total_mortality_count,
                'mortality_rate_pct': mortality_rate_pct,
                'total_feed_consumed_kg': total_feed_consumed_kg,
                'estimated_current_biomass_kg': estimated_biomass.quantize(
                    CycleDashboardService.BIOMASS_QUANTIZE
                ),
                'units_with_today_log_count': 0,
                'units_with_sanitary_issue_count': active_sanitary_issues_count,
                'units_with_active_sanitary_issue_count': active_sanitary_issues_count,
                'units_missing_today_log_count': 0,
                'last_daily_log_date': daily_logs[0].log_date if daily_logs else None,
                'last_sanitary_event_date': sanitary_logs[0].event_date if sanitary_logs else None,
                'has_allocations': False,
                'data_source': 'legacy_cycle',
                **business_metrics,
            },
            'allocations': [],
        }
