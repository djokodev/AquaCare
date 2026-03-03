"""
Service métier pour la construction des données du dashboard aquaculture.
"""
import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from django.core.cache import cache
from django.db.models import Avg, Sum, Q, Prefetch
from django.utils import timezone

from notifications.models import Notification

from ..models import ProductionCycle, CycleLog, FeedingPlan, SanitaryLog
from ..domain.calculators import AquacultureCalculator

logger = logging.getLogger(__name__)


class DashboardService:
    """Construit les données agrégées du dashboard aquaculture."""

    CACHE_TTL_SECONDS = 60

    @staticmethod
    def build_dashboard_data(user, farm_profile, cycle_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Construit les données complètes du dashboard.

        Returns None if cycle_id is provided but not found (caller should return 400).
        """
        cache_key = f"dashboard:{user.id}"
        if cycle_id:
            cache_key = f"dashboard:{user.id}:{cycle_id}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        cycle_scope = None
        thirty_days_ago = date.today() - timedelta(days=30)

        active_cycles = ProductionCycle.objects.filter(
            farm_profile=farm_profile,
            status='active'
        ).select_related('farm_profile', 'metrics').prefetch_related(
            Prefetch(
                'logs',
                queryset=CycleLog.objects.filter(
                    log_date__gte=thirty_days_ago
                ).order_by('log_date'),
                to_attr='prefetched_logs'
            )
        )

        if cycle_id:
            cycle_scope = active_cycles.filter(id=cycle_id).first()
            if cycle_scope is None:
                return None  # Signal to view: cycle not found
            active_cycles = active_cycles.filter(id=cycle_scope.id)

        active_cycles_list = list(active_cycles)

        recent_logs = DashboardService._get_recent_logs(farm_profile, cycle_scope)
        current_plans = DashboardService._get_current_plans(farm_profile, cycle_scope)
        pending_notifications = DashboardService._get_pending_notifications(user)
        active_issues = DashboardService._get_active_issues(farm_profile, cycle_scope)

        stats = active_cycles.aggregate(
            total_biomass=Sum('current_biomass'),
            avg_fcr=Avg('fcr', filter=Q(fcr__isnull=False)),
            avg_survival=Avg('survival_rate', filter=Q(survival_rate__isnull=False)),
        )

        dashboard_data = {
            'active_cycles_count': len(active_cycles_list),
            'total_biomass': float(stats['total_biomass'] or 0),
            'total_fish_count': sum(c.current_count for c in active_cycles_list),
            'average_fcr': float(stats['avg_fcr'] or 0),
            'average_survival_rate': float(stats['avg_survival'] or 0),

            '_querysets': {
                'active_cycles_list': active_cycles_list,
                'recent_logs': recent_logs,
                'current_plans': current_plans,
                'pending_notifications': pending_notifications,
                'active_issues': active_issues,
            },

            'growth_chart_data': DashboardService._prepare_growth_chart_data(active_cycles_list),
            'mortality_chart_data': DashboardService._prepare_mortality_chart_data(active_cycles_list),
            'feed_consumption_chart_data': DashboardService._prepare_feed_chart_data(active_cycles_list),

            'environmental_alerts': DashboardService._build_environmental_alerts(active_cycles_list),
            'feeding_recommendations': DashboardService._get_feeding_recommendations(active_cycles_list),
        }

        cache.set(cache_key, dashboard_data, timeout=DashboardService.CACHE_TTL_SECONDS)
        return dashboard_data

    @staticmethod
    def _get_recent_logs(farm_profile, cycle_scope):
        recent_date = date.today() - timedelta(days=7)
        filters = {'cycle__farm_profile': farm_profile, 'log_date__gte': recent_date}
        if cycle_scope:
            filters['cycle_id'] = cycle_scope.id
        return CycleLog.objects.filter(**filters).select_related('cycle').order_by('-log_date')[:20]

    @staticmethod
    def _get_current_plans(farm_profile, cycle_scope):
        filters = {
            'cycle__farm_profile': farm_profile,
            'is_active': True,
            'start_date__lte': date.today(),
            'end_date__gte': date.today(),
        }
        if cycle_scope:
            filters['cycle_id'] = cycle_scope.id
        return FeedingPlan.objects.filter(**filters).select_related('cycle')

    @staticmethod
    def _get_pending_notifications(user):
        return Notification.objects.filter(
            user=user, is_read=False, scheduled_for__lte=timezone.now()
        ).order_by('scheduled_for')[:10]

    @staticmethod
    def _get_active_issues(farm_profile, cycle_scope):
        filters = {'cycle__farm_profile': farm_profile, 'resolved': False}
        if cycle_scope:
            filters['cycle_id'] = cycle_scope.id
        return SanitaryLog.objects.filter(**filters).select_related('cycle')[:5]

    @staticmethod
    def _prepare_growth_chart_data(cycles) -> List[Dict]:
        chart_data = []
        for cycle in cycles:
            logs = [l for l in cycle.prefetched_logs if l.average_weight is not None][:30]
            if logs:
                chart_data.append({
                    'cycle_name': cycle.cycle_name,
                    'cycle_id': str(cycle.id),
                    'data': [
                        {
                            'date': log.log_date.isoformat(),
                            'weight': float(log.average_weight),
                            'day': (log.log_date - cycle.start_date).days
                        } for log in logs
                    ]
                })
        return chart_data

    @staticmethod
    def _prepare_mortality_chart_data(cycles) -> List[Dict]:
        chart_data = []
        for cycle in cycles:
            logs = [l for l in cycle.prefetched_logs if l.mortality_count and l.mortality_count > 0]
            if logs:
                cumulative_mortality = 0
                mortality_series = []
                for log in logs:
                    cumulative_mortality += log.mortality_count
                    mortality_series.append({
                        'date': log.log_date.isoformat(),
                        'daily': log.mortality_count,
                        'cumulative': cumulative_mortality,
                        'percentage': (cumulative_mortality / cycle.initial_count * 100)
                    })
                chart_data.append({
                    'cycle_name': cycle.cycle_name,
                    'cycle_id': str(cycle.id),
                    'data': mortality_series
                })
        return chart_data

    @staticmethod
    def _prepare_feed_chart_data(cycles) -> List[Dict]:
        chart_data = []
        for cycle in cycles:
            logs = [l for l in cycle.prefetched_logs if l.feed_quantity is not None]
            if logs:
                cumulative_feed = 0
                feed_series = []
                for log in logs:
                    cumulative_feed += float(log.feed_quantity)
                    feed_series.append({
                        'date': log.log_date.isoformat(),
                        'daily': float(log.feed_quantity),
                        'cumulative': cumulative_feed
                    })
                chart_data.append({
                    'cycle_name': cycle.cycle_name,
                    'cycle_id': str(cycle.id),
                    'data': feed_series
                })
        return chart_data

    @staticmethod
    def _build_environmental_alerts(cycles) -> List[Dict]:
        environmental_alerts = []
        for cycle in cycles:
            env_logs = [
                l for l in cycle.prefetched_logs
                if l.water_temperature is not None or l.ph_level is not None or l.dissolved_oxygen is not None
            ]
            latest_log = env_logs[-1] if env_logs else None
            if latest_log:
                alerts = AquacultureCalculator.check_environmental_alerts(
                    cycle.species,
                    temperature_c=latest_log.water_temperature,
                    ph=latest_log.ph_level,
                    oxygen_mg_l=latest_log.dissolved_oxygen,
                    density_kg_m3=cycle.current_density_kg_m3()
                )
                environmental_alerts.extend(alerts)
        return environmental_alerts

    @staticmethod
    def _get_feeding_recommendations(cycles) -> Dict:
        recommendations = {}
        for cycle in cycles:
            latest_log = cycle.prefetched_logs[-1] if cycle.prefetched_logs else None
            if latest_log and latest_log.average_weight:
                feeding_rec = AquacultureCalculator.get_feeding_recommendations(
                    latest_log.average_weight
                )
                recommendations[str(cycle.id)] = {
                    'cycle_name': cycle.cycle_name,
                    'current_weight': float(latest_log.average_weight),
                    'recommended_rate': feeding_rec['feeding_rate_pct'],
                    'recommended_size': feeding_rec['size_mm'],
                    'recommended_protein': feeding_rec['protein_pct'],
                    'meals_per_day': AquacultureCalculator.get_meals_per_day(latest_log.average_weight)
                }
        return recommendations
