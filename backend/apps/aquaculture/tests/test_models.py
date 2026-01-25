"""
Tests unitaires pour les modèles aquacoles.
"""
import pytest
from decimal import Decimal
from datetime import date, timedelta
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone

from aquaculture.models import (
    ProductionCycle, CycleLog, FeedingPlan, SanitaryLog,
    NutritionalGuide, CycleMetrics
)


@pytest.mark.django_db
class TestProductionCycle:
    """Tests pour le modèle ProductionCycle."""
    
    def test_create_production_cycle(self, farm_profile):
        """Test création d'un cycle de production."""
        cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name="Test Cycle Clarias Q1",
            species="clarias",
            pond_identifier="Bassin A",
            pond_surface_m2=Decimal('100'),
            start_date=date.today(),
            initial_count=1000,
            initial_average_weight=Decimal('10'),
            initial_biomass=Decimal('10'),  # sera recalculé
            current_count=1000,
            current_average_weight=Decimal('10'),
            current_biomass=Decimal('10')
        )
        
        assert cycle.id is not None
        assert cycle.cycle_name == "Test Cycle Clarias Q1"
        assert cycle.species == "clarias"
        assert cycle.initial_count == 1000
        assert cycle.status == "active"
    
    def test_cycle_str_representation(self, farm_profile):
        """Test représentation string du cycle."""
        cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name="Cycle Test",
            species="tilapia",
            pond_identifier="Bassin B",
            pond_surface_m2=Decimal('50'),
            start_date=date.today(),
            initial_count=500,
            initial_average_weight=Decimal('15'),
            initial_biomass=Decimal('7.5'),
            current_count=500,
            current_average_weight=Decimal('15'),
            current_biomass=Decimal('7.5')
        )
        
        assert str(cycle) == "Cycle Test - Tilapia"
    
    def test_days_active_calculation(self, farm_profile):
        """Test calcul jours actifs."""
        start_date = date.today() - timedelta(days=30)
        cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name="Cycle 30 jours",
            species="clarias",
            pond_identifier="Bassin C",
            pond_surface_m2=Decimal('75'),
            start_date=start_date,
            initial_count=750,
            initial_average_weight=Decimal('12'),
            initial_biomass=Decimal('9'),
            current_count=750,
            current_average_weight=Decimal('12'),
            current_biomass=Decimal('9')
        )
        
        assert cycle.days_active() == 30
    
    def test_current_density_calculation(self, farm_profile):
        """Test calcul densité actuelle."""
        cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name="Cycle Densité",
            species="tilapia",
            pond_identifier="Bassin D",
            pond_surface_m2=Decimal('100'),
            pond_volume_m3=Decimal('200'),  # 2m de profondeur
            start_date=date.today(),
            initial_count=1000,
            initial_average_weight=Decimal('20'),
            initial_biomass=Decimal('20'),
            current_count=1000,
            current_average_weight=Decimal('20'),
            current_biomass=Decimal('20')
        )
        
        density = cycle.current_density_kg_m3()
        assert density == Decimal('0.10')  # 20kg / 200m³
    
    def test_cycle_without_volume(self, farm_profile):
        """Test cycle sans volume défini."""
        cycle = ProductionCycle.objects.create(
            farm_profile=farm_profile,
            cycle_name="Cycle Sans Volume",
            species="clarias",
            pond_identifier="Bassin E",
            pond_surface_m2=Decimal('50'),
            start_date=date.today(),
            initial_count=500,
            initial_average_weight=Decimal('8'),
            initial_biomass=Decimal('4'),
            current_count=500,
            current_average_weight=Decimal('8'),
            current_biomass=Decimal('4')
        )
        
        assert cycle.current_density_kg_m3() is None


@pytest.mark.django_db
class TestCycleLog:
    """Tests pour le modèle CycleLog."""
    
    def test_create_cycle_log(self, production_cycle):
        """Test création d'un log quotidien."""
        log = CycleLog.objects.create(
            cycle=production_cycle,
            log_date=date.today(),
            mortality_count=5,
            feed_quantity=Decimal('2.5'),
            water_temperature=Decimal('27.5'),
            ph_level=Decimal('7.2'),
            observations="Poissons actifs"
        )
        
        assert log.id is not None
        assert log.cycle == production_cycle
        assert log.mortality_count == 5
        assert log.feed_quantity == Decimal('2.5')
    
    def test_log_str_representation(self, production_cycle):
        """Test représentation string du log."""
        log_date = date.today()
        log = CycleLog.objects.create(
            cycle=production_cycle,
            log_date=log_date
        )
        
        expected = f"{production_cycle.cycle_name} - {log_date}"
        assert str(log) == expected
    
    def test_unique_log_per_day(self, production_cycle):
        """Test contrainte unicité log par jour."""
        today = date.today()
        
        # Premier log
        CycleLog.objects.create(
            cycle=production_cycle,
            log_date=today,
            mortality_count=2
        )
        
        # Deuxième log même jour -> erreur
        with pytest.raises(IntegrityError):
            CycleLog.objects.create(
                cycle=production_cycle,
                log_date=today,
                mortality_count=3
            )
    
    def test_sampling_data_validation(self, production_cycle):
        """Test validation données échantillonnage."""
        log = CycleLog(
            cycle=production_cycle,
            log_date=date.today(),
            sample_count=20,
            sample_total_weight=Decimal('1000')  # 20 poissons, 1000g total
        )
        
        # La validation devrait calculer average_weight = 50g
        log.clean()
        assert log.average_weight == Decimal('50')
    
    def test_sampling_inconsistency_validation(self, production_cycle):
        """Test validation incohérence échantillonnage."""
        log = CycleLog(
            cycle=production_cycle,
            log_date=date.today(),
            sample_count=20,
            sample_total_weight=Decimal('1000'),  # Moyenne calculée = 50g
            average_weight=Decimal('80')  # Mais saisie manuelle = 80g (écart > 10%)
        )
        
        with pytest.raises(ValidationError):
            log.clean()


@pytest.mark.django_db
class TestFeedingPlan:
    """Tests pour le modèle FeedingPlan."""
    
    def test_create_feeding_plan(self, production_cycle):
        """Test création plan d'alimentation."""
        plan = FeedingPlan.objects.create(
            cycle=production_cycle,
            week_number=1,
            estimated_fish_count=1000,
            average_weight=Decimal('15'),
            biomass=Decimal('15'),
            daily_feed_amount=Decimal('1.2'),
            feeding_rate=Decimal('8'),
            meals_per_day=4,
            feed_per_meal=Decimal('0.3'),
            recommended_feed_type="Starter 1.0mm",
            feed_size_mm=Decimal('1.0'),
            protein_percentage=45,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=6)
        )
        
        assert plan.id is not None
        assert plan.week_number == 1
        assert plan.meals_per_day == 4
        assert plan.is_active is True
    
    def test_feeding_plan_str(self, production_cycle):
        """Test représentation string du plan."""
        plan = FeedingPlan.objects.create(
            cycle=production_cycle,
            week_number=3,
            estimated_fish_count=800,
            average_weight=Decimal('50'),
            biomass=Decimal('40'),
            daily_feed_amount=Decimal('2.0'),
            feeding_rate=Decimal('5'),
            meals_per_day=3,
            feed_per_meal=Decimal('0.67'),
            recommended_feed_type="Superior 2-3mm",
            feed_size_mm=Decimal('2.5'),
            protein_percentage=38,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=6)
        )
        
        expected = f"{production_cycle.cycle_name} - Semaine 3"
        assert str(plan) == expected
    
    def test_unique_plan_per_week(self, production_cycle):
        """Test contrainte unicité plan par semaine."""
        # Premier plan semaine 2
        FeedingPlan.objects.create(
            cycle=production_cycle,
            week_number=2,
            estimated_fish_count=900,
            average_weight=Decimal('25'),
            biomass=Decimal('22.5'),
            daily_feed_amount=Decimal('1.6'),
            feeding_rate=Decimal('7'),
            meals_per_day=3,
            feed_per_meal=Decimal('0.53'),
            recommended_feed_type="Starter 1.8mm",
            feed_size_mm=Decimal('1.8'),
            protein_percentage=42,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=6)
        )
        
        # Deuxième plan même semaine -> erreur
        with pytest.raises(IntegrityError):
            FeedingPlan.objects.create(
                cycle=production_cycle,
                week_number=2,
                estimated_fish_count=900,
                average_weight=Decimal('26'),
                biomass=Decimal('23.4'),
                daily_feed_amount=Decimal('1.7'),
                feeding_rate=Decimal('7'),
                meals_per_day=3,
                feed_per_meal=Decimal('0.57'),
                recommended_feed_type="Starter 1.8mm",
                feed_size_mm=Decimal('1.8'),
                protein_percentage=42,
                start_date=date.today() + timedelta(days=7),
                end_date=date.today() + timedelta(days=13)
            )


@pytest.mark.django_db
class TestSanitaryLog:
    """Tests pour le modèle SanitaryLog."""
    
    def test_create_sanitary_log(self, production_cycle):
        """Test création log sanitaire."""
        log = SanitaryLog.objects.create(
            cycle=production_cycle,
            event_date=date.today(),
            event_type="disease",
            symptoms="Nage erratique, perte d'appétit",
            affected_count=50,
            treatment_applied="Changement d'eau partiel",
            notes="Surveillance renforcée"
        )
        
        assert log.id is not None
        assert log.event_type == "disease"
        assert log.affected_count == 50
        assert log.resolved is False
    
    def test_sanitary_log_str(self, production_cycle):
        """Test représentation string du log sanitaire."""
        event_date = date.today()
        log = SanitaryLog.objects.create(
            cycle=production_cycle,
            event_date=event_date,
            event_type="treatment",
            symptoms="Traitement préventif"
        )
        
        expected = f"{production_cycle.cycle_name} - Traitement ({event_date})"
        assert str(log) == expected


@pytest.mark.django_db
class TestNutritionalGuide:
    """Tests pour le modèle NutritionalGuide."""
    
    def test_create_nutritional_guide(self):
        """Test création guide nutritionnel."""
        guide = NutritionalGuide.objects.create(
            species="clarias",
            growth_stage="alevin",
            min_weight=Decimal('2'),
            max_weight=Decimal('10'),
            feeding_rate_percentage=Decimal('8'),
            protein_requirement=45,
            meals_per_day=4,
            feed_size_mm=Decimal('1.0'),
            recommended_products=["Starter Premium 1.0mm"],
            expected_fcr=Decimal('0.9'),
            feeding_notes="Alimentation fréquente requise"
        )
        
        assert guide.id is not None
        assert guide.species == "clarias"
        assert guide.growth_stage == "alevin"
        assert guide.feeding_rate_percentage == Decimal('8')
    
    def test_nutritional_guide_str(self):
        """Test représentation string du guide."""
        guide = NutritionalGuide.objects.create(
            species="tilapia",
            growth_stage="croissance",
            min_weight=Decimal('50'),
            max_weight=Decimal('150'),
            feeding_rate_percentage=Decimal('5'),
            protein_requirement=38,
            meals_per_day=3,
            feed_size_mm=Decimal('2.5'),
            expected_fcr=Decimal('1.0')
        )
        
        assert str(guide) == "Tilapia - Croissance (50-150g)"
    
    def test_unique_species_stage(self):
        """Test contrainte unicité espèce/stade."""
        # Premier guide
        NutritionalGuide.objects.create(
            species="clarias",
            growth_stage="juvenile",
            min_weight=Decimal('10'),
            max_weight=Decimal('50'),
            feeding_rate_percentage=Decimal('7'),
            protein_requirement=42,
            meals_per_day=3,
            feed_size_mm=Decimal('1.8'),
            expected_fcr=Decimal('0.9')
        )
        
        # Deuxième guide même espèce/stade -> erreur
        with pytest.raises(IntegrityError):
            NutritionalGuide.objects.create(
                species="clarias",
                growth_stage="juvenile",
                min_weight=Decimal('8'),
                max_weight=Decimal('45'),
                feeding_rate_percentage=Decimal('7.5'),
                protein_requirement=40,
                meals_per_day=3,
                feed_size_mm=Decimal('1.8'),
                expected_fcr=Decimal('1.0')
            )


@pytest.mark.django_db
class TestCycleMetrics:
    """Tests pour le modèle CycleMetrics."""
    
    def test_create_cycle_metrics(self, production_cycle):
        """Test création métriques cycle."""
        # CycleMetrics is automatically created by signals when ProductionCycle is created
        metrics = production_cycle.metrics
        
        # Update the metrics with test data
        metrics.growth_curve_data = [
            {"date": "2024-01-01", "weight": 10.0},
            {"date": "2024-01-15", "weight": 25.0},
            {"date": "2024-01-30", "weight": 45.0}
        ]
        metrics.daily_growth_rate = Decimal('1.5')
        metrics.specific_growth_rate = Decimal('3.2')
        metrics.performance_score = Decimal('85.5')
        metrics.save()
        
        assert metrics.id is not None
        assert metrics.cycle == production_cycle
        assert len(metrics.growth_curve_data) == 3
        assert metrics.performance_score == Decimal('85.5')
    
    def test_cycle_metrics_str(self, production_cycle):
        """Test représentation string des métriques."""
        # CycleMetrics is automatically created by signals when ProductionCycle is created
        metrics = production_cycle.metrics
        
        expected = f"Métriques - {production_cycle.cycle_name}"
        assert str(metrics) == expected
