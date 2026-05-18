"""
Service métier pour la construction des données du dashboard aquaculture.
"""
import logging
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from django.core.cache import cache
from django.utils import timezone
from notifications.models import Notification

from ..domain.calculators import AquacultureCalculator
from ..models import CycleLog, FeedingPlan, ProductionCycle, SanitaryLog

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DashboardCycleContext:
    """Vue pre-calculee des logs utiles pour un cycle du dashboard."""

    cycle: ProductionCycle
    logs: list[CycleLog]
    growth_logs: list[CycleLog]
    mortality_logs: list[CycleLog]
    feed_logs: list[CycleLog]
    environmental_logs: list[CycleLog]
    latest_log: CycleLog | None


class DashboardService:
    """Construit les données agrégées du dashboard aquaculture."""

    CACHE_TTL_SECONDS = 60

    @staticmethod
    def build_dashboard_data(
        user,
        cycle_id: str | None = None,
        *,
        lightweight: bool = False,
    ) -> dict[str, Any]:
        """
        Construit les données complètes du dashboard.

        Returns None if cycle_id is provided but not found (caller should return 400).
        """
        cache_key = f"dashboard:{user.id}"
        if cycle_id:
            cache_key = f"dashboard:{user.id}:{cycle_id}"
        if lightweight:
            cache_key = f"{cache_key}:lite"
        cached = cache.get(cache_key)
        if cached:
            return cached

        cycle_scope = None
        thirty_days_ago = date.today() - timedelta(days=30)

        active_cycles_query = ProductionCycle.objects.filter(
            farm_profile__user=user,
            status='active',
        )

        if lightweight:
            active_cycles = active_cycles_query.for_api()
        else:
            active_cycles = active_cycles_query.with_dashboard_logs(thirty_days_ago)

        if cycle_id:
            cycle_scope = active_cycles.filter(id=cycle_id).first()
            if cycle_scope is None:
                return None  # Signal to view: cycle not found
            active_cycles = active_cycles.filter(id=cycle_scope.id)

        active_cycles_list = list(active_cycles)
        fcr_values = [float(cycle.fcr) for cycle in active_cycles_list if cycle.fcr is not None]
        survival_values = [
            float(cycle.survival_rate) for cycle in active_cycles_list if cycle.survival_rate is not None
        ]

        if lightweight:
            recent_logs = []
            current_plans = []
            pending_notifications = []
            active_issues = []
            growth_chart_data: list[dict[str, Any]] = []
            mortality_chart_data: list[dict[str, Any]] = []
            feed_consumption_chart_data: list[dict[str, Any]] = []
            environmental_alerts: list[dict[str, Any]] = []
            feeding_recommendations: dict[str, Any] = {}
        else:
            cycle_contexts = DashboardService._build_cycle_contexts(active_cycles_list)
            recent_logs = DashboardService._get_recent_logs(user, cycle_scope)
            current_plans = DashboardService._get_current_plans(user, cycle_scope)
            pending_notifications = DashboardService._get_pending_notifications(user)
            active_issues = DashboardService._get_active_issues(user, cycle_scope)
            growth_chart_data = DashboardService._prepare_growth_chart_data(cycle_contexts)
            mortality_chart_data = DashboardService._prepare_mortality_chart_data(cycle_contexts)
            feed_consumption_chart_data = DashboardService._prepare_feed_chart_data(cycle_contexts)
            environmental_alerts = DashboardService._build_environmental_alerts(cycle_contexts)
            feeding_recommendations = DashboardService._get_feeding_recommendations(cycle_contexts)

        dashboard_data = {
            'active_cycles_count': len(active_cycles_list),
            'total_biomass': sum(float(cycle.current_biomass or 0) for cycle in active_cycles_list),
            'total_fish_count': sum(c.current_count for c in active_cycles_list),
            'average_fcr': (sum(fcr_values) / len(fcr_values)) if fcr_values else 0,
            'average_survival_rate': (
                sum(survival_values) / len(survival_values)
            ) if survival_values else 0,

            '_querysets': {
                'active_cycles_list': active_cycles_list,
                'recent_logs': recent_logs,
                'current_plans': current_plans,
                'pending_notifications': pending_notifications,
                'active_issues': active_issues,
            },

            'growth_chart_data': growth_chart_data,
            'mortality_chart_data': mortality_chart_data,
            'feed_consumption_chart_data': feed_consumption_chart_data,

            'environmental_alerts': environmental_alerts,
            'feeding_recommendations': feeding_recommendations,
        }

        cache.set(cache_key, dashboard_data, timeout=DashboardService.CACHE_TTL_SECONDS)
        return dashboard_data

    @staticmethod
    def _get_recent_logs(user, cycle_scope):
        recent_date = date.today() - timedelta(days=7)
        filters = {'cycle__farm_profile__user': user, 'log_date__gte': recent_date}
        if cycle_scope:
            filters['cycle_id'] = cycle_scope.id
        return CycleLog.objects.for_api().filter(**filters).order_by('-log_date')[:20]

    @staticmethod
    def _get_current_plans(user, cycle_scope):
        filters = {
            'cycle__farm_profile__user': user,
            'is_active': True,
            'start_date__lte': date.today(),
            'end_date__gte': date.today(),
        }
        if cycle_scope:
            filters['cycle_id'] = cycle_scope.id
        return FeedingPlan.objects.for_api().filter(**filters)

    @staticmethod
    def _get_pending_notifications(user):
        return Notification.objects.filter(
            user=user, is_read=False, scheduled_for__lte=timezone.now()
        ).order_by('scheduled_for')[:10]

    @staticmethod
    def _get_active_issues(user, cycle_scope):
        filters = {'cycle__farm_profile__user': user, 'resolved': False}
        if cycle_scope:
            filters['cycle_id'] = cycle_scope.id
        return SanitaryLog.objects.for_api().filter(**filters)[:5]

    @staticmethod
    def _build_cycle_contexts(cycles: list[ProductionCycle]) -> list[DashboardCycleContext]:
        """Construit une vue memoisee des logs utiles pour chaque cycle."""
        contexts: list[DashboardCycleContext] = []
        for cycle in cycles:
            logs = list(getattr(cycle, 'prefetched_logs', []))
            growth_logs: list[CycleLog] = []
            mortality_logs: list[CycleLog] = []
            feed_logs: list[CycleLog] = []
            environmental_logs: list[CycleLog] = []

            for log in logs:
                if log.average_weight is not None and len(growth_logs) < 30:
                    growth_logs.append(log)
                if log.mortality_count and log.mortality_count > 0:
                    mortality_logs.append(log)
                if log.feed_quantity is not None:
                    feed_logs.append(log)
                if (
                    log.water_temperature is not None
                    or log.ph_level is not None
                    or log.dissolved_oxygen is not None
                ):
                    environmental_logs.append(log)

            contexts.append(
                DashboardCycleContext(
                    cycle=cycle,
                    logs=logs,
                    growth_logs=growth_logs,
                    mortality_logs=mortality_logs,
                    feed_logs=feed_logs,
                    environmental_logs=environmental_logs,
                    latest_log=logs[-1] if logs else None,
                )
            )

        return contexts

    @staticmethod
    def _prepare_growth_chart_data(cycle_contexts: list[DashboardCycleContext]) -> list[dict]:
        chart_data = []
        for context in cycle_contexts:
            if context.growth_logs:
                chart_data.append({
                    'cycle_name': context.cycle.cycle_name,
                    'cycle_id': str(context.cycle.id),
                    'data': [
                        {
                            'date': log.log_date.isoformat(),
                            'weight': float(log.average_weight),
                            'day': (log.log_date - context.cycle.start_date).days
                        } for log in context.growth_logs
                    ],
                })
        return chart_data

    @staticmethod
    def _prepare_mortality_chart_data(cycle_contexts: list[DashboardCycleContext]) -> list[dict]:
        chart_data = []
        for context in cycle_contexts:
            if context.mortality_logs:
                cumulative_mortality = 0
                mortality_series = []
                for log in context.mortality_logs:
                    cumulative_mortality += log.mortality_count
                    mortality_series.append({
                        'date': log.log_date.isoformat(),
                        'daily': log.mortality_count,
                        'cumulative': cumulative_mortality,
                        'percentage': (cumulative_mortality / context.cycle.initial_count * 100),
                    })
                chart_data.append({
                    'cycle_name': context.cycle.cycle_name,
                    'cycle_id': str(context.cycle.id),
                    'data': mortality_series,
                })
        return chart_data

    @staticmethod
    def _prepare_feed_chart_data(cycle_contexts: list[DashboardCycleContext]) -> list[dict]:
        chart_data = []
        for context in cycle_contexts:
            if context.feed_logs:
                cumulative_feed = 0
                feed_series = []
                for log in context.feed_logs:
                    cumulative_feed += float(log.feed_quantity)
                    feed_series.append({
                        'date': log.log_date.isoformat(),
                        'daily': float(log.feed_quantity),
                        'cumulative': cumulative_feed,
                    })
                chart_data.append({
                    'cycle_name': context.cycle.cycle_name,
                    'cycle_id': str(context.cycle.id),
                    'data': feed_series,
                })
        return chart_data

    @staticmethod
    def _build_environmental_alerts(cycle_contexts: list[DashboardCycleContext]) -> list[dict]:
        environmental_alerts = []
        for context in cycle_contexts:
            latest_log = context.environmental_logs[-1] if context.environmental_logs else None
            if latest_log:
                alerts = AquacultureCalculator.check_environmental_alerts(
                    context.cycle.species,
                    temperature_c=latest_log.water_temperature,
                    ph=latest_log.ph_level,
                    oxygen_mg_l=latest_log.dissolved_oxygen,
                    density_kg_m3=context.cycle.current_density_kg_m3(),
                )
                environmental_alerts.extend(alerts)
        return environmental_alerts

    @staticmethod
    def _get_feeding_recommendations(cycle_contexts: list[DashboardCycleContext]) -> dict:
        recommendations = {}
        for context in cycle_contexts:
            latest_log = context.latest_log
            if latest_log and latest_log.average_weight:
                feeding_rec = AquacultureCalculator.get_feeding_recommendations(
                    latest_log.average_weight
                )
                recommendations[str(context.cycle.id)] = {
                    'cycle_name': context.cycle.cycle_name,
                    'current_weight': float(latest_log.average_weight),
                    'recommended_rate': feeding_rec['feeding_rate_pct'],
                    'recommended_size': feeding_rec['size_mm'],
                    'recommended_protein': feeding_rec['protein_pct'],
                    'meals_per_day': AquacultureCalculator.get_meals_per_day(latest_log.average_weight),
                }
        return recommendations
