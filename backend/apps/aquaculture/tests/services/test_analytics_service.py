"""
Tests unitaires pour AnalyticsService.

Coverage cible : >60%
"""
import pytest
from decimal import Decimal
from datetime import date, timedelta

from apps.aquaculture.services.analytics_service import AnalyticsService
from apps.aquaculture.models import CycleMetrics
from tests.fixtures.factories import ProductionCycleFactory
from apps.aquaculture.services.log_service import CycleLogService


@pytest.mark.django_db
class TestAnalyticsServiceMortalityAnalysis:
    """Tests d'analyse de mortalité."""

    def test_analyze_mortality_with_data(self):
        """Test analyse mortalité avec logs."""
        cycle = ProductionCycleFactory(
            initial_count=1000,
            start_date=date.today() - timedelta(days=30)
        )

        # Créer logs mortalité
        CycleLogService.create_log(cycle, {'mortality_count': 10, 'log_date': date.today() - timedelta(days=5)})
        CycleLogService.create_log(cycle, {'mortality_count': 5, 'log_date': date.today() - timedelta(days=3)})
        CycleLogService.create_log(cycle, {'mortality_count': 8, 'log_date': date.today()})

        analysis = AnalyticsService.analyze_mortality(cycle)

        assert analysis['total'] == 23
        assert analysis['percentage'] > 0
        assert 'by_week' in analysis
        assert 'daily_average' in analysis

    def test_analyze_mortality_no_data(self):
        """Test analyse sans mortalité."""
        cycle = ProductionCycleFactory()

        analysis = AnalyticsService.analyze_mortality(cycle)

        assert analysis['total'] == 0
        assert analysis['percentage'] == 0


@pytest.mark.django_db
class TestAnalyticsServiceUpdateMetrics:
    """Tests de mise à jour métriques."""

    def test_update_cycle_metrics_data_success(self):
        """Test mise à jour métriques cycle."""
        cycle = ProductionCycleFactory(start_date=date.today() - timedelta(days=20))

        # Créer logs avec croissance
        CycleLogService.create_log(cycle, {
            'log_date': date.today() - timedelta(days=10),
            'average_weight': Decimal('100')
        })
        CycleLogService.create_log(cycle, {
            'log_date': date.today(),
            'average_weight': Decimal('150')
        })

        # Mettre à jour métriques
        AnalyticsService.update_cycle_metrics_data(cycle)

        # Vérifier création/mise à jour CycleMetrics
        metrics = CycleMetrics.objects.get(cycle=cycle)
        assert metrics is not None
        assert len(metrics.growth_curve_data) == 2
        assert metrics.growth_curve_data[0]['weight'] == 100
        assert metrics.growth_curve_data[1]['weight'] == 150

    def test_update_metrics_handles_empty_cycle(self):
        """Test gestion cycle sans logs."""
        cycle = ProductionCycleFactory()

        # Ne devrait pas échouer
        AnalyticsService.update_cycle_metrics_data(cycle)

        metrics = CycleMetrics.objects.get(cycle=cycle)
        assert metrics.growth_curve_data == []


@pytest.mark.django_db
class TestAnalyticsServiceComparison:
    """Tests de comparaison cycles."""

    def test_compare_cycles_performance(self):
        """Test comparaison performance entre cycles."""
        current_cycle = ProductionCycleFactory(
            status='harvested',
            fcr=Decimal('1.5'),
            survival_rate=Decimal('85')
        )
        # Créer cycle antérieur pour comparaison
        ProductionCycleFactory(
            farm_profile=current_cycle.farm_profile,
            status='harvested',
            fcr=Decimal('2.0'),
            survival_rate=Decimal('90'),
            start_date=date.today() - timedelta(days=200)
        )

        comparison = AnalyticsService.compare_with_previous_cycles(
            current_cycle,
            limit=5
        )

        assert 'current_cycle' in comparison
        assert 'previous_cycles' in comparison
        assert 'historical_averages' in comparison
        assert 'performance_ranking' in comparison
