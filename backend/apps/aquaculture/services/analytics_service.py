"""
Service d'analytics et statistiques pour l'aquaculture.

Centralise toutes les analyses de performance, tendances et comparaisons
de cycles de production. Fournit des insights métier pour aide à la décision.

Architecture:
    - Extraction de toutes les méthodes d'analyse de views.py
    - Calculs statistiques indépendants du framework Django
    - Réutilisable pour API, CLI, rapports PDF, etc.

Author: MAVECAM AquaCare Team
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TypedDict

from django.db.models import Avg, F, Max, Min, Sum
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from notifications.services import NotificationService

from ..constants import DEFAULT_FEED_PRICE_PER_KG
from ..domain.calculators import AquacultureCalculator
from ..models import CycleLog, ProductionCycle
from .base import BaseService


class MortalityCause(TypedDict):
    mortality_reason: str | None
    count: int


class MortalityAnalysis(TypedDict):
    total: int
    percentage: float
    by_week: dict[int, int]
    main_causes: list[MortalityCause]
    daily_average: float
    is_abnormal: bool
    peak_week: int | None
    peak_week_count: int
    has_data: bool


class GrowthAnalysisPoint(TypedDict):
    day: int
    date: str
    weight: float
    daily_gain: float
    cumulative_gain: float


class EnvironmentParameterRange(TypedDict):
    min: float | None
    max: float | None


class EnvironmentAverages(TypedDict):
    temperature: float | None
    ph: float | None
    oxygen: float | None
    ammonia: float | None


class EnvironmentSummaryNoData(TypedDict):
    has_data: bool
    message: str


class EnvironmentSummary(TypedDict):
    has_data: bool
    averages: EnvironmentAverages
    ranges: dict[str, EnvironmentParameterRange]
    alerts: list[dict[str, str]]
    measurements_count: int


class CycleCurrentMetrics(TypedDict):
    survival_rate: float
    biomass: float
    average_weight: float
    fcr: float
    daily_growth_rate: float
    specific_growth_rate: float
    stocking_density: float


class CycleFeedMetrics(TypedDict):
    total_consumed: float
    average_daily: float
    cost_estimate: float
    feed_efficiency: float | None


class CycleCostEstimate(TypedDict):
    feed_cost: float
    cost_per_kg: float


class CycleSummary(TypedDict):
    id: str
    name: str
    duration_days: int | None
    survival_rate: float | None
    fcr: float | None
    final_average_weight: float | None
    total_biomass: float | None
    status: str


class HistoricalAverages(TypedDict):
    survival_rate: float
    fcr: float
    final_weight: float
    duration_days: int


class CycleComparison(TypedDict):
    current_cycle: CycleSummary
    previous_cycles: list[CycleSummary]
    historical_averages: HistoricalAverages
    performance_ranking: str
    improvement_suggestions: list[str]


class CycleStatistics(TypedDict):
    cycle_id: str
    cycle_name: str
    days_active: int
    current_metrics: CycleCurrentMetrics
    feed_metrics: CycleFeedMetrics
    mortality_analysis: MortalityAnalysis
    growth_performance: list[GrowthAnalysisPoint]
    environmental_summary: EnvironmentSummary | EnvironmentSummaryNoData
    estimated_costs: CycleCostEstimate


class AnalyticsService(BaseService):
    """
    Service d'analytics aquaculture pour analyses approfondies.

    Responsabilités:
        - Analyse des patterns de mortalité
        - Analyse des courbes de croissance
        - Analyse des conditions environnementales
        - Comparaison de performance entre cycles
        - Génération de recommandations d'amélioration
        - Calcul de rankings et benchmarks

    Utilisé par:
        - ProductionCycleViewSet.statistics()
        - ProductionCycleViewSet.comparison()
        - DashboardView (graphiques et KPIs)
        - Rapports PDF de fin de cycle
    """

    @staticmethod
    def _get_prefetched_logs(cycle: ProductionCycle) -> list[CycleLog] | None:
        """Retourne les logs préféchargés pour un cycle si disponibles."""
        prefetched_logs = getattr(cycle, 'analytics_logs', None)
        if prefetched_logs is None:
            return None
        return list(prefetched_logs)

    # ============================================================================
    # ANALYSE MORTALITÉ
    # ============================================================================

    @staticmethod
    def analyze_mortality(cycle: ProductionCycle) -> MortalityAnalysis:
        """
        Analyse complète des patterns de mortalité pour un cycle.

        Calcule:
            - Total de mortalité et pourcentage
            - Répartition hebdomadaire
            - Principales causes identifiées
            - Moyenne journalière
            - Alertes si mortalité anormale

        Args:
            cycle: Cycle de production à analyser

        Returns:
            Dict contenant:
                - total: Nombre total de morts
                - percentage: Pourcentage de mortalité
                - by_week: Dict {semaine: count}
                - main_causes: List[{reason, count}]
                - daily_average: Moyenne morts par jour
                - is_abnormal: Boolean si >20% mortalité
                - peak_week: Semaine avec plus de mortalité

        Example:
            >>> analysis = AnalyticsService.analyze_mortality(cycle)
            >>> print(f"Mortalité: {analysis['percentage']:.1f}%")
        """
        prefetched_logs = AnalyticsService._get_prefetched_logs(cycle)

        weekly_mortality: dict[int, int] = {}
        if prefetched_logs is not None:
            mortality_logs = [
                log for log in prefetched_logs if log.mortality_count and log.mortality_count > 0
            ]
            total_mortality = sum(int(log.mortality_count or 0) for log in mortality_logs)

            causes: dict[str | None, int] = {}
            for log in mortality_logs:
                week = (log.log_date - cycle.start_date).days // 7 + 1
                weekly_mortality[week] = weekly_mortality.get(week, 0) + int(log.mortality_count)
                cause_key = log.mortality_reason or None
                causes[cause_key] = causes.get(cause_key, 0) + int(log.mortality_count)

            main_causes = [
                {'mortality_reason': reason, 'count': count}
                for reason, count in sorted(causes.items(), key=lambda item: item[1], reverse=True)[:5]
            ]
        else:
            logs = cycle.logs.filter(mortality_count__gt=0)
            total_mortality = logs.aggregate(Sum('mortality_count'))['mortality_count__sum'] or 0

            for log in logs:
                week = (log.log_date - cycle.start_date).days // 7 + 1
                weekly_mortality[week] = weekly_mortality.get(week, 0) + log.mortality_count

            main_causes = list(
                logs.values('mortality_reason').annotate(count=Sum('mortality_count')).order_by('-count')[:5]
            )

        mortality_percentage = (total_mortality / cycle.initial_count * 100) if cycle.initial_count > 0 else 0

        # Calculate daily average
        days_active = cycle.days_active() if cycle.days_active() > 0 else 1
        daily_average = total_mortality / days_active

        # Identify peak week
        peak_week = max(weekly_mortality.items(), key=lambda x: x[1])[0] if weekly_mortality else None
        peak_week_count = weekly_mortality.get(peak_week, 0) if peak_week else 0

        return {
            'total': total_mortality,
            'percentage': float(mortality_percentage),
            'by_week': weekly_mortality,
            'main_causes': main_causes,
            'daily_average': float(daily_average),
            'is_abnormal': mortality_percentage > 20,  # >20% est anormal
            'peak_week': peak_week,
            'peak_week_count': peak_week_count,
            'has_data': total_mortality > 0
        }

    # ============================================================================
    # ANALYSE CROISSANCE
    # ============================================================================

    @staticmethod
    def analyze_growth(cycle: ProductionCycle) -> list[GrowthAnalysisPoint]:
        """
        Analyse l'évolution de la croissance du cycle.

        Génère une série temporelle avec:
            - Poids moyen mesuré
            - Jours écoulés
            - Gain quotidien moyen
            - Date de mesure

        Args:
            cycle: Cycle de production à analyser

        Returns:
            List de dicts contenant pour chaque mesure:
                - day: Jour depuis début cycle
                - date: Date ISO de la mesure
                - weight: Poids moyen en grammes
                - daily_gain: Gain quotidien moyen (g/jour)
                - cumulative_gain: Gain cumulé depuis début

        Example:
            >>> growth_data = AnalyticsService.analyze_growth(cycle)
            >>> for point in growth_data:
            >>>     print(f"Jour {point['day']}: {point['weight']}g")
        """
        prefetched_logs = AnalyticsService._get_prefetched_logs(cycle)
        logs = (
            [log for log in prefetched_logs if log.average_weight is not None]
            if prefetched_logs is not None
            else cycle.logs.filter(average_weight__isnull=False).order_by('log_date')
        )

        growth_data = []
        for log in logs:
            days_elapsed = (log.log_date - cycle.start_date).days
            daily_gain = (
                float(log.average_weight - cycle.initial_average_weight) / days_elapsed
                if days_elapsed > 0
                else 0
            )
            cumulative_gain = float(log.average_weight - cycle.initial_average_weight)

            growth_data.append({
                'day': days_elapsed,
                'date': log.log_date.isoformat(),
                'weight': float(log.average_weight),
                'daily_gain': daily_gain,
                'cumulative_gain': cumulative_gain
            })

        return growth_data

    # ============================================================================
    # ANALYSE ENVIRONNEMENT
    # ============================================================================

    @staticmethod
    def analyze_environment(cycle: ProductionCycle) -> EnvironmentSummary | EnvironmentSummaryNoData:
        """
        Analyse les conditions environnementales d'un cycle.

        Calcule les moyennes, min, max pour:
            - Température de l'eau
            - pH
            - Oxygène dissous
            - Ammoniaque (si mesuré)

        Génère des alertes si valeurs hors limites recommandées.

        Args:
            cycle: Cycle de production à analyser

        Returns:
            Dict contenant:
                - averages: Dict des moyennes par paramètre
                - alerts: List des alertes environnementales
                - measurements_count: Nombre de mesures
                - has_data: Boolean si données disponibles

        Example:
            >>> env_data = AnalyticsService.analyze_environment(cycle)
            >>> if env_data['alerts']:
            >>>     print("Alertes:", env_data['alerts'])
        """
        prefetched_logs = AnalyticsService._get_prefetched_logs(cycle)
        if prefetched_logs is not None:
            logs = [
                log
                for log in prefetched_logs
                if not (
                    log.water_temperature is None
                    and log.ph_level is None
                    and log.dissolved_oxygen is None
                )
            ]
        else:
            logs = cycle.logs.exclude(
                water_temperature__isnull=True,
                ph_level__isnull=True,
                dissolved_oxygen__isnull=True,
            )

        if not logs:
            return {
                'has_data': False,
                'message': _('Aucune donnée environnementale disponible')
            }
        if prefetched_logs is not None:
            temperatures = [float(log.water_temperature) for log in logs if log.water_temperature is not None]
            ph_levels = [float(log.ph_level) for log in logs if log.ph_level is not None]
            oxygens = [float(log.dissolved_oxygen) for log in logs if log.dissolved_oxygen is not None]
            ammonia_levels = [float(log.ammonia_level) for log in logs if log.ammonia_level is not None]

            env_data = {
                'avg_temperature': sum(temperatures) / len(temperatures) if temperatures else None,
                'min_temperature': min(temperatures) if temperatures else None,
                'max_temperature': max(temperatures) if temperatures else None,
                'avg_ph': sum(ph_levels) / len(ph_levels) if ph_levels else None,
                'min_ph': min(ph_levels) if ph_levels else None,
                'max_ph': max(ph_levels) if ph_levels else None,
                'avg_oxygen': sum(oxygens) / len(oxygens) if oxygens else None,
                'min_oxygen': min(oxygens) if oxygens else None,
                'max_oxygen': max(oxygens) if oxygens else None,
                'avg_ammonia': sum(ammonia_levels) / len(ammonia_levels) if ammonia_levels else None,
                'max_ammonia': max(ammonia_levels) if ammonia_levels else None,
            }
            measurements_count = len(logs)
        else:
            env_data = logs.aggregate(
                avg_temperature=Avg('water_temperature'),
                min_temperature=Min('water_temperature'),
                max_temperature=Max('water_temperature'),
                avg_ph=Avg('ph_level'),
                min_ph=Min('ph_level'),
                max_ph=Max('ph_level'),
                avg_oxygen=Avg('dissolved_oxygen'),
                min_oxygen=Min('dissolved_oxygen'),
                max_oxygen=Max('dissolved_oxygen'),
                avg_ammonia=Avg('ammonia_level'),
                max_ammonia=Max('ammonia_level'),
            )
            measurements_count = logs.count()

        # Generate alerts for out-of-range values
        alerts = AquacultureCalculator.check_environmental_alerts(
            cycle.species,
            temperature_c=env_data['avg_temperature'],
            ph=env_data['avg_ph'],
            oxygen_mg_l=env_data['avg_oxygen']
        )

        # Add ammonia alert if available
        if env_data['avg_ammonia'] and env_data['avg_ammonia'] > 1.0:
            alerts.append({
                'parameter': 'ammonia',
                'level': 'warning',
                'message': _('Niveau d\'ammoniaque élevé (>1.0 mg/L)')
            })

        return {
            'has_data': True,
            'averages': {
                'temperature': float(env_data['avg_temperature']) if env_data['avg_temperature'] else None,
                'ph': float(env_data['avg_ph']) if env_data['avg_ph'] else None,
                'oxygen': float(env_data['avg_oxygen']) if env_data['avg_oxygen'] else None,
                'ammonia': float(env_data['avg_ammonia']) if env_data['avg_ammonia'] else None
            },
            'ranges': {
                'temperature': {
                    'min': float(env_data['min_temperature']) if env_data['min_temperature'] else None,
                    'max': float(env_data['max_temperature']) if env_data['max_temperature'] else None
                },
                'ph': {
                    'min': float(env_data['min_ph']) if env_data['min_ph'] else None,
                    'max': float(env_data['max_ph']) if env_data['max_ph'] else None
                },
                'oxygen': {
                    'min': float(env_data['min_oxygen']) if env_data['min_oxygen'] else None,
                    'max': float(env_data['max_oxygen']) if env_data['max_oxygen'] else None
                }
            },
            'alerts': alerts,
            'measurements_count': measurements_count
        }

    # ============================================================================
    # STATISTIQUES CYCLE COMPLET
    # ============================================================================

    @staticmethod
    def get_cycle_statistics(cycle: ProductionCycle) -> CycleStatistics:
        """
        Génère les statistiques complètes pour un cycle.

        Compile toutes les métriques dans un rapport unifié:
            - Métriques courantes (survie, FCR, biomasse, etc.)
            - Métriques d'alimentation
            - Analyse mortalité
            - Analyse croissance
            - Analyse environnement
            - Coûts estimés

        Args:
            cycle: Cycle de production à analyser

        Returns:
            Dict contenant toutes les statistiques compilées

        Example:
            >>> stats = AnalyticsService.get_cycle_statistics(cycle)
            >>> print(f"FCR: {stats['current_metrics']['fcr']}")
        """
        # Calculate cycle duration
        end_date = cycle.end_date or date.today()
        days_active = (end_date - cycle.start_date).days

        # Current metrics
        current_metrics = {
            'survival_rate': float(cycle.survival_rate or AquacultureCalculator.calculate_survival_rate(
                cycle.initial_count, cycle.current_count
            )),
            'biomass': float(cycle.current_biomass),
            'average_weight': float(cycle.current_average_weight),
            'fcr': float(cycle.fcr or 0),
            'daily_growth_rate': float(AquacultureCalculator.calculate_daily_growth_rate(
                cycle.initial_average_weight,
                cycle.current_average_weight,
                days_active
            )),
            'specific_growth_rate': float(AquacultureCalculator.calculate_specific_growth_rate(
                cycle.initial_average_weight,
                cycle.current_average_weight,
                days_active
            )),
            'stocking_density': float(cycle.current_density_kg_m3() or 0)
        }

        # Feed metrics
        feed_metrics = {
            'total_consumed': float(cycle.total_feed_consumed),
            'average_daily': float(cycle.total_feed_consumed / days_active) if days_active > 0 else 0,
            'cost_estimate': float(cycle.total_feed_consumed) * float(DEFAULT_FEED_PRICE_PER_KG),
            'feed_efficiency': float(cycle.fcr) if cycle.fcr else None
        }

        # Analyses
        mortality_analysis = AnalyticsService.analyze_mortality(cycle)
        growth_performance = AnalyticsService.analyze_growth(cycle)
        environmental_summary = AnalyticsService.analyze_environment(cycle)

        return {
            'cycle_id': str(cycle.id),
            'cycle_name': cycle.cycle_name,
            'days_active': days_active,
            'current_metrics': current_metrics,
            'feed_metrics': feed_metrics,
            'mortality_analysis': mortality_analysis,
            'growth_performance': growth_performance,
            'environmental_summary': environmental_summary,
            'estimated_costs': {
                'feed_cost': feed_metrics['cost_estimate'],
                'cost_per_kg': (
                    feed_metrics['cost_estimate'] / float(cycle.current_biomass)
                    if cycle.current_biomass > 0
                    else 0
                ),
            },
        }

    # ============================================================================
    # COMPARAISON DE CYCLES
    # ============================================================================

    @staticmethod
    def compare_with_previous_cycles(
        current_cycle: ProductionCycle,
        limit: int = 3,
    ) -> CycleComparison:
        """
        Compare un cycle avec les cycles précédents de même espèce.

        Génère:
            - Résumé du cycle actuel
            - Liste des cycles précédents (jusqu'à limit)
            - Moyennes historiques
            - Ranking de performance
            - Suggestions d'amélioration

        Args:
            current_cycle: Cycle à comparer
            limit: Nombre de cycles précédents à inclure

        Returns:
            Dict contenant:
                - current_cycle: Résumé cycle actuel
                - previous_cycles: List résumés cycles précédents
                - historical_averages: Moyennes historiques
                - performance_ranking: Classement textuel
                - improvement_suggestions: List de suggestions

        Example:
            >>> comparison = AnalyticsService.compare_with_previous_cycles(cycle, limit=5)
            >>> print(comparison['performance_ranking'])
        """
        # Get previous cycles of same species
        previous_cycles = ProductionCycle.objects.filter(
            farm_profile=current_cycle.farm_profile,
            species=current_cycle.species,
            status='harvested'
        ).exclude(id=current_cycle.id).order_by('-end_date')[:limit]

        # Calculate historical averages
        historical_avg = ProductionCycle.objects.filter(
            farm_profile=current_cycle.farm_profile,
            species=current_cycle.species,
            status='harvested'
        ).aggregate(
            avg_survival_rate=Avg('survival_rate'),
            avg_fcr=Avg('fcr'),
            avg_final_weight=Avg('final_average_weight'),
            avg_duration=Avg(F('end_date') - F('start_date'))
        )

        comparison_data = {
            'current_cycle': AnalyticsService.get_cycle_summary(current_cycle),
            'previous_cycles': [
                AnalyticsService.get_cycle_summary(cycle) for cycle in previous_cycles
            ],
            'historical_averages': {
                'survival_rate': float(historical_avg['avg_survival_rate'] or 0),
                'fcr': float(historical_avg['avg_fcr'] or 0),
                'final_weight': float(historical_avg['avg_final_weight'] or 0),
                'duration_days': historical_avg['avg_duration'].days if historical_avg['avg_duration'] else 0
            },
            'performance_ranking': AnalyticsService.calculate_performance_ranking(
                current_cycle, previous_cycles
            ),
            'improvement_suggestions': AnalyticsService.generate_improvement_suggestions(
                current_cycle, historical_avg
            )
        }

        return comparison_data

    @staticmethod
    def get_cycle_summary(cycle: ProductionCycle) -> CycleSummary:
        """
        Génère un résumé concis d'un cycle pour comparaison.

        Args:
            cycle: Cycle à résumer

        Returns:
            Dict avec métriques clés du cycle
        """
        return {
            'id': str(cycle.id),
            'name': cycle.cycle_name,
            'duration_days': (cycle.end_date - cycle.start_date).days if cycle.end_date else None,
            'survival_rate': float(cycle.survival_rate) if cycle.survival_rate else None,
            'fcr': float(cycle.fcr) if cycle.fcr else None,
            'final_average_weight': float(cycle.final_average_weight) if cycle.final_average_weight else None,
            'total_biomass': float(cycle.final_biomass) if cycle.final_biomass else None,
            'status': cycle.status
        }

    @staticmethod
    def calculate_performance_ranking(
        current_cycle: ProductionCycle,
        previous_cycles: list[ProductionCycle]
    ) -> str:
        """
        Calcule le classement de performance du cycle actuel.

        Compare le taux de survie avec les cycles précédents pour
        déterminer un ranking qualitatif.

        Args:
            current_cycle: Cycle à évaluer
            previous_cycles: Liste des cycles de référence

        Returns:
            str: 'Excellent', 'Bon', 'Moyen', 'À améliorer', ou 'Données insuffisantes'
        """
        if not previous_cycles or not current_cycle.survival_rate:
            return str(_('Données insuffisantes'))

        # Simple ranking based on survival rate
        better_cycles = sum(1 for c in previous_cycles
                          if c.survival_rate and c.survival_rate > current_cycle.survival_rate)

        total_cycles = len(previous_cycles)
        percentile = ((total_cycles - better_cycles) / total_cycles) * 100

        if percentile >= 80:
            return str(_('Excellent'))
        elif percentile >= 60:
            return str(_('Bon'))
        elif percentile >= 40:
            return str(_('Moyen'))
        else:
            return str(_('À améliorer'))

    @staticmethod
    def generate_improvement_suggestions(
        cycle: ProductionCycle,
        historical_avg: dict[str, Decimal | float | int | None],
    ) -> list[str]:
        """
        Génère des suggestions d'amélioration basées sur la performance.

        Compare les métriques du cycle avec les moyennes historiques
        pour identifier les points d'amélioration.

        Args:
            cycle: Cycle à analyser
            historical_avg: Dict des moyennes historiques

        Returns:
            List de suggestions textuelles
        """
        suggestions = []

        # Survival rate comparison
        if cycle.survival_rate and historical_avg['avg_survival_rate']:
            if cycle.survival_rate < historical_avg['avg_survival_rate'] - 5:
                suggestions.append(str(_("Améliorer le suivi sanitaire et la qualité de l'eau")))
            elif cycle.survival_rate > historical_avg['avg_survival_rate'] + 5:
                suggestions.append(str(_("Excellente gestion sanitaire, maintenir les pratiques actuelles")))

        # FCR comparison
        if cycle.fcr and historical_avg['avg_fcr']:
            avg_fcr = Decimal(str(historical_avg['avg_fcr']))
            if cycle.fcr > avg_fcr + Decimal('0.2'):
                suggestions.append(str(_("Optimiser l'alimentation et réduire le gaspillage")))
            elif cycle.fcr < avg_fcr - Decimal('0.2'):
                suggestions.append(str(_("Excellente efficacité alimentaire, stratégie optimale")))

        # Generic suggestion if no specific issues
        if not suggestions:
            suggestions.append(str(_("Performance conforme aux cycles précédents")))

        return suggestions

    # ============================================================================
    # MISE À JOUR MÉTRIQUES CYCLE (pour signals.py)
    # ============================================================================

    @staticmethod
    def update_cycle_metrics_data(cycle: ProductionCycle, new_log=None) -> None:
        """
        Met à jour l'objet CycleMetrics avec les dernières données analytiques.

        Appelé automatiquement par signals après chaque log quotidien.
        Deux modes d'opération :
            - MODE INCRÉMENTAL (new_log fourni) : append du seul nouveau point,
              0 queryset DB supplémentaire. Utilisé après post_save de CycleLog.
            - MODE REBUILD COMPLET (new_log=None) : relit tous les logs depuis la DB.
              Utilisé après suppression de log ou sync offline batch.

        Args:
            cycle: Cycle de production à mettre à jour
            new_log: CycleLog nouvellement créé (mode incrémental) ou None (rebuild)

        Note:
            Gestion robuste des erreurs pour ne pas interrompre l'opération principale.

        PROTECTION CASCADE:
            Utilise get() au lieu de get_or_create() pour éviter de créer un nouveau
            CycleMetrics pour un cycle en cours de suppression.
        """
        from ..models import CycleMetrics

        try:
            # PROTECTION CASCADE : Vérifier que le cycle existe toujours
            if not ProductionCycle.objects.filter(id=cycle.id).exists():
                return

            try:
                metrics = CycleMetrics.objects.get(cycle=cycle)
            except CycleMetrics.DoesNotExist:
                return

            if new_log is not None:
                # ── MODE INCRÉMENTAL : append uniquement le nouveau point ──────────
                if new_log.average_weight:
                    existing = list(metrics.growth_curve_data or [])
                    existing.append({
                        'date': new_log.log_date.isoformat(),
                        'weight': float(new_log.average_weight),
                        'day': (new_log.log_date - cycle.start_date).days
                    })
                    metrics.growth_curve_data = existing

                if new_log.mortality_count and new_log.mortality_count > 0:
                    existing = list(metrics.survival_curve_data or [])
                    prev_count = existing[-1]['count'] if existing else cycle.initial_count
                    current_count = max(0, prev_count - new_log.mortality_count)
                    rate = (current_count / cycle.initial_count * 100) if cycle.initial_count > 0 else 0
                    existing.append({
                        'date': new_log.log_date.isoformat(),
                        'count': current_count,
                        'rate': float(rate)
                    })
                    metrics.survival_curve_data = existing

                if new_log.feed_quantity:
                    existing = list(metrics.cumulative_feed_data or [])
                    prev_cumul = existing[-1]['cumulative'] if existing else 0
                    existing.append({
                        'date': new_log.log_date.isoformat(),
                        'daily': float(new_log.feed_quantity),
                        'cumulative': prev_cumul + float(new_log.feed_quantity)
                    })
                    metrics.cumulative_feed_data = existing

                # Recalcul des taux depuis les champs cycle (déjà mis à jour) — 0 DB
                growth_data = metrics.growth_curve_data or []
                if len(growth_data) >= 2:
                    days_active = cycle.days_active()
                    metrics.daily_growth_rate = AquacultureCalculator.calculate_daily_growth_rate(
                        cycle.initial_average_weight,
                        cycle.current_average_weight,
                        days_active
                    )
                    metrics.specific_growth_rate = AquacultureCalculator.calculate_specific_growth_rate(
                        cycle.initial_average_weight,
                        cycle.current_average_weight,
                        days_active
                    )

                metrics.performance_score = AquacultureCalculator.calculate_performance_score(
                    survival_rate_pct=cycle.survival_rate,
                    fcr=cycle.fcr,
                    daily_growth_rate=metrics.daily_growth_rate,
                    species=cycle.species
                )

                # average_daily_feed depuis la liste en mémoire (0 DB)
                feed_data = metrics.cumulative_feed_data or []
                if feed_data:
                    total_feed = sum(entry.get('daily', 0) for entry in feed_data)
                    metrics.average_daily_feed = Decimal(str(total_feed / len(feed_data)))

                AnalyticsService.log_operation(
                    'update_cycle_metrics_data',
                    {'cycle_id': str(cycle.id), 'mode': 'incremental'},
                    level='debug'
                )

            else:
                # ── MODE REBUILD COMPLET (delete case ou sync batch) ─────────────
                prefetched_logs = AnalyticsService._get_prefetched_logs(cycle)
                growth_data = []
                growth_logs = (
                    [log for log in prefetched_logs if log.average_weight is not None]
                    if prefetched_logs is not None
                    else cycle.logs.filter(average_weight__isnull=False).order_by('log_date')
                )
                for log in growth_logs:
                    growth_data.append({
                        'date': log.log_date.isoformat(),
                        'weight': float(log.average_weight),
                        'day': (log.log_date - cycle.start_date).days
                    })
                metrics.growth_curve_data = growth_data

                survival_data = []
                current_count = cycle.initial_count
                mortality_logs = (
                    [log for log in prefetched_logs if log.mortality_count and log.mortality_count > 0]
                    if prefetched_logs is not None
                    else cycle.logs.filter(mortality_count__gt=0).order_by('log_date')
                )
                for log in mortality_logs:
                    current_count = max(0, current_count - log.mortality_count)
                    survival_rate = (current_count / cycle.initial_count * 100) if cycle.initial_count > 0 else 0
                    survival_data.append({
                        'date': log.log_date.isoformat(),
                        'count': current_count,
                        'rate': float(survival_rate)
                    })
                metrics.survival_curve_data = survival_data

                feed_data = []
                cumulative_feed = 0
                feed_logs = (
                    [log for log in prefetched_logs if log.feed_quantity is not None]
                    if prefetched_logs is not None
                    else cycle.logs.filter(feed_quantity__isnull=False).order_by('log_date')
                )
                for log in feed_logs:
                    cumulative_feed += float(log.feed_quantity)
                    feed_data.append({
                        'date': log.log_date.isoformat(),
                        'daily': float(log.feed_quantity),
                        'cumulative': cumulative_feed
                    })
                metrics.cumulative_feed_data = feed_data

                if len(growth_data) >= 2:
                    days_active = cycle.days_active()
                    metrics.daily_growth_rate = AquacultureCalculator.calculate_daily_growth_rate(
                        cycle.initial_average_weight,
                        cycle.current_average_weight,
                        days_active
                    )
                    metrics.specific_growth_rate = AquacultureCalculator.calculate_specific_growth_rate(
                        cycle.initial_average_weight,
                        cycle.current_average_weight,
                        days_active
                    )

                metrics.performance_score = AquacultureCalculator.calculate_performance_score(
                    survival_rate_pct=cycle.survival_rate,
                    fcr=cycle.fcr,
                    daily_growth_rate=metrics.daily_growth_rate,
                    species=cycle.species
                )

                if feed_logs:
                    total_feed = sum(float(log.feed_quantity) for log in feed_logs)
                    metrics.average_daily_feed = Decimal(str(total_feed / len(feed_logs)))

                AnalyticsService.log_operation(
                    'update_cycle_metrics_data',
                    {
                        'cycle_id': str(cycle.id),
                        'mode': 'rebuild',
                        'growth_points': len(growth_data),
                        'survival_points': len(survival_data),
                        'feed_logs': len(feed_logs)
                    },
                    level='debug'
                )

            metrics.save()

        except Exception as e:
            AnalyticsService.log_operation(
                'update_cycle_metrics_data_error',
                {'cycle_id': str(cycle.id), 'error': str(e)},
                level='error'
            )

    @staticmethod
    def check_and_create_environmental_alerts(log: CycleLog) -> None:
        """
        Vérifie les paramètres environnementaux et crée des notifications si nécessaire.

        Appelé automatiquement par le signal update_cycle_after_log après chaque
        saisie quotidienne. Analyse les paramètres d'eau et densité pour détecter
        les conditions potentiellement dangereuses.

        Paramètres vérifiés:
            - Température de l'eau (min/max par espèce)
            - pH (plage optimale)
            - Oxygène dissous (seuil critique)
            - Densité d'élevage (surcharge)

        Args:
            log: CycleLog contenant les paramètres environnementaux du jour

        Note:
            Délègue à AquacultureCalculator pour calculs et à NotificationService
            pour création des alertes. Gestion robuste des erreurs.

        Example:
            >>> AnalyticsService.check_and_create_environmental_alerts(daily_log)
            # Crée notifications si température < 24°C pour clarias
        """
        try:
            cycle = log.cycle
            alerts = AquacultureCalculator.check_environmental_alerts(
                cycle.species,
                temperature_c=log.water_temperature,
                ph=log.ph_level,
                oxygen_mg_l=log.dissolved_oxygen,
                density_kg_m3=cycle.current_density_kg_m3()
            )

            # Cr?er notifications pour chaque alerte d?tect?e
            for alert_message in alerts:
                NotificationService.create_notification(
                    user=cycle.farm_profile.user,
                    notification_type='water_quality_alert',
                    title=str(_('Alerte param?tres environnementaux')),
                    message=alert_message,
                    content_object=cycle,
                    priority='high',
                    channels=['in_app', 'push'],
                    scheduled_for=timezone.now()
                )

            if alerts:
                AnalyticsService.log_operation(
                    'environmental_alerts_created',
                    {
                        'cycle_id': str(cycle.id),
                        'log_date': str(log.log_date),
                        'alerts_count': len(alerts)
                    },
                    level='warning'
                )

        except Exception as e:
            AnalyticsService.log_operation(
                'check_environmental_alerts_error',
                {'log_id': str(log.id) if log.id else 'unknown', 'error': str(e)},
                level='error'
            )
