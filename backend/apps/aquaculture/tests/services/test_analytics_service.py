"""
Tests unitaires pour AnalyticsService.

Coverage cible : >60%
"""
import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from aquaculture.models import CycleMetrics, CycleUnitAllocation, ProductionUnit
from aquaculture.services.analytics_service import AnalyticsService
from aquaculture.services.calibration_service import CalibrationService
from aquaculture.services.cycle_service import ProductionCycleService
from aquaculture.services.log_service import CycleLogService
from django.utils import timezone

from tests.fixtures.factories import ProductionCycleFactory


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

    def test_allocation_curve_replays_transfers_and_harvests(self):
        cycle = ProductionCycleFactory(
            initial_count=1000,
            initial_average_weight=Decimal('100.00'),
            initial_biomass=Decimal('100.00'),
            current_count=1000,
            current_average_weight=Decimal('100.00'),
            current_biomass=Decimal('100.00'),
            start_date=date.today() - timedelta(days=1),
        )
        source_unit = ProductionUnit.objects.create(
            farm_profile=cycle.farm_profile,
            name='Unité analytics source',
            unit_type='tank',
            volume_m3=Decimal('10.00'),
        )
        source = CycleUnitAllocation.objects.create(
            cycle=cycle,
            production_unit=source_unit,
            initial_fish_count=1000,
            current_fish_count=1000,
            initial_biomass_kg=Decimal('100.00'),
            current_biomass_kg=Decimal('100.00'),
        )
        tank = ProductionUnit.objects.create(
            farm_profile=cycle.farm_profile,
            name='Bac analytics destination',
            unit_type='tank',
            purpose=ProductionUnit.PURPOSE_CALIBRATION,
            volume_m3=Decimal('10.00'),
        )
        calibrated_at = timezone.now() - timedelta(hours=2)
        first, _, _ = CalibrationService.calibrate(
            source_allocation=source,
            destination_production_unit=tank,
            user=cycle.farm_profile.user,
            client_uuid=uuid.uuid4(),
            calibrated_at=calibrated_at,
            transferred_count=200,
            transferred_average_weight_g=Decimal('150.00'),
        )

        source_curve = AnalyticsService._build_allocation_survival_curve(cycle)
        destination_curve = AnalyticsService._build_allocation_survival_curve(
            first.destination_allocation.cycle
        )
        assert source_curve[-1]['count'] == 1000
        assert source_curve[-1]['stock_count'] == 800
        assert source_curve[-1]['biological_survival_rate'] == 100.0
        assert destination_curve[-1]['count'] == 200
        assert destination_curve[-1]['stock_count'] == 200

        CalibrationService.calibrate(
            source_allocation=source,
            destination_production_unit=tank,
            user=cycle.farm_profile.user,
            client_uuid=uuid.uuid4(),
            calibrated_at=calibrated_at + timedelta(minutes=10),
            transferred_count=100,
            transferred_average_weight_g=Decimal('150.00'),
        )
        _, destination, _ = ProductionCycleService.partial_harvest_cycle_unit_allocation(
            first.destination_allocation,
            harvest_date=timezone.localdate(),
            count_harvested=50,
            average_weight_g=Decimal('250.00'),
        )
        curve_after_partial = AnalyticsService._build_allocation_survival_curve(destination.cycle)
        assert [point['count'] for point in curve_after_partial][-3:] == [200, 300, 300]
        assert [point['stock_count'] for point in curve_after_partial][-3:] == [200, 300, 250]

        ProductionCycleService.harvest_cycle_unit_allocation(
            destination,
            harvest_date=timezone.localdate(),
            final_harvested_at=timezone.now(),
            client_uuid=uuid.uuid4(),
            final_count=250,
            final_average_weight=Decimal('300.00'),
        )
        final_curve = AnalyticsService._build_allocation_survival_curve(destination.cycle)
        assert final_curve[-1]['count'] == 300
        assert final_curve[-1]['stock_count'] == 0
        assert final_curve[-1]['biological_survival_rate'] == 100.0


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
