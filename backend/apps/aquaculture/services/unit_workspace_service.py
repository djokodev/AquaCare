"""
Fiche unité de l'admin : état actuel de l'unité (bac, étang, cage), son
journal quotidien, ses événements sanitaires et son historique de cycles.

Les indicateurs de l'unité viennent de ProductionUnitDashboardService, le
même calcul que l'écran « Dashboard de l'unité » de l'application.
"""

from __future__ import annotations

from typing import Any

from django.urls import NoReverseMatch, reverse

from ..models import CycleLog, CycleUnitAllocation, ProductionUnit, SanitaryLog
from .production_unit_dashboard_service import ProductionUnitDashboardService

JOURNAL_LIMIT = 30
SANITARY_LIMIT = 10


def _safe_reverse(name: str, *args) -> str:
    try:
        return reverse(name, args=args)
    except NoReverseMatch:
        return ''


class UnitWorkspaceService:
    @staticmethod
    def build(unit: ProductionUnit, *, can_view_logs: bool, can_view_sanitary: bool) -> dict[str, Any]:
        allocations = list(
            CycleUnitAllocation.objects.filter(production_unit=unit)
            .select_related('cycle')
            .order_by('-created_at')
        )
        current = next((a for a in allocations if a.status == CycleUnitAllocation.STATUS_ACTIVE), None)
        current_payload = None
        if current is not None:
            dashboard = ProductionUnitDashboardService.build_dashboard_payload(current)
            summary = dashboard['summary']
            current_payload = {
                'cycle_name': current.cycle.cycle_name,
                'cycle_url': _safe_reverse('admin:aquaculture_productioncycle_change', current.cycle_id),
                'species': current.cycle.get_species_display(),
                'fish_count': summary['estimated_current_fish_count'],
                'initial_fish_count': current.initial_fish_count,
                'mortality_count': summary['total_mortality_count'],
                'mortality_rate_pct': summary['mortality_rate_pct'],
                'biomass_kg': summary['estimated_current_biomass_kg'],
                'average_weight_g': summary['latest_average_weight_g'],
                'feed_kg': summary['total_feed_consumed_kg'],
                'market_value_fcfa': summary['estimated_market_value_fcfa'],
                'last_log_date': summary['last_daily_log_date'],
                'days_since_last_log': summary['days_since_last_log'],
                'has_today_log': summary['has_today_daily_log'],
                'active_sanitary_issues': summary['active_sanitary_issues_count'],
            }

        journal = []
        if can_view_logs:
            logs = CycleLog.objects.filter(cycle_unit_allocation__production_unit=unit).order_by(
                '-log_date', '-log_time'
            )[:JOURNAL_LIMIT]
            journal = [
                {
                    'date': log.log_date,
                    'mortality': log.mortality_count or 0,
                    'mortality_reason': log.mortality_reason or '',
                    'average_weight_g': log.average_weight,
                    'feed_kg': log.feed_quantity,
                    'feed_size_mm': log.feed_size_mm,
                    'water_temperature': log.water_temperature,
                    'dissolved_oxygen': log.dissolved_oxygen,
                    'ph_level': log.ph_level,
                    'observations': (log.observations or '')[:140],
                    'url': _safe_reverse('admin:aquaculture_cyclelog_change', log.pk),
                }
                for log in logs
            ]

        sanitary = []
        if can_view_sanitary:
            events = SanitaryLog.objects.filter(cycle_unit_allocation__production_unit=unit).order_by(
                '-event_date', '-created_at'
            )[:SANITARY_LIMIT]
            sanitary = [
                {
                    'date': event.event_date,
                    'type': event.get_event_type_display(),
                    'affected_count': event.affected_count,
                    'treatment': (event.treatment_applied or '')[:140],
                    'resolved': event.resolved,
                    'url': _safe_reverse('admin:aquaculture_sanitarylog_change', event.pk),
                }
                for event in events
            ]

        history = [
            {
                'cycle_name': allocation.cycle.cycle_name,
                'cycle_url': _safe_reverse('admin:aquaculture_productioncycle_change', allocation.cycle_id),
                'start_date': allocation.cycle.start_date,
                'initial_fish_count': allocation.initial_fish_count,
                'current_fish_count': allocation.current_fish_count,
                'status': allocation.get_status_display(),
                'is_current': allocation is current,
            }
            for allocation in allocations
        ]

        farm = unit.farm_profile
        return {
            'unit': {
                'name': unit.name,
                'type': unit.get_unit_type_display(),
                'dimension': unit.display_dimension or '',
                'status': unit.get_status_display(),
                'capacity': unit.recommended_capacity,
            },
            'farm': {
                'name': farm.farm_name,
                'url': _safe_reverse('admin:accounts_farmprofile_supervision', farm.pk),
            },
            'current': current_payload,
            'journal': journal,
            'sanitary': sanitary,
            'history': history,
            'can_view_logs': can_view_logs,
            'can_view_sanitary': can_view_sanitary,
        }
