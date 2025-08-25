"""
Tests unitaires pour les calculateurs aquacoles.
Tests basés sur les formules scientifiques des guides techniques.
"""
import pytest
from decimal import Decimal
from datetime import date, timedelta

from apps.aquaculture.calculators import AquacultureCalculator


class TestAquacultureCalculator:
    """Tests pour la classe AquacultureCalculator."""
    
    def test_calculate_biomass(self):
        """Test calcul de biomasse."""
        # Test calcul normal
        result = AquacultureCalculator.calculate_biomass(1000, Decimal('50'))
        assert result == Decimal('50.00')
        
        # Test avec zéro poissons
        result = AquacultureCalculator.calculate_biomass(0, Decimal('50'))
        assert result == Decimal('0')
        
        # Test avec poids zéro
        result = AquacultureCalculator.calculate_biomass(1000, Decimal('0'))
        assert result == Decimal('0')
        
        # Test avec valeurs décimales
        result = AquacultureCalculator.calculate_biomass(850, Decimal('125.5'))
        assert result == Decimal('106.68')
    
    def test_calculate_survival_rate(self):
        """Test calcul taux de survie."""
        # Test survie parfaite
        result = AquacultureCalculator.calculate_survival_rate(1000, 1000)
        assert result == Decimal('100.00')
        
        # Test survie partielle
        result = AquacultureCalculator.calculate_survival_rate(1000, 850)
        assert result == Decimal('85.00')
        
        # Test mortalité totale
        result = AquacultureCalculator.calculate_survival_rate(1000, 0)
        assert result == Decimal('0.00')
        
        # Test avec effectif initial zéro
        result = AquacultureCalculator.calculate_survival_rate(0, 100)
        assert result == Decimal('0')
        
        # Test avec effectif négatif (corrigé à 0)
        result = AquacultureCalculator.calculate_survival_rate(1000, -10)
        assert result == Decimal('0.00')
    
    def test_calculate_fcr(self):
        """Test calcul FCR (Feed Conversion Ratio)."""
        # Test FCR excellent
        result = AquacultureCalculator.calculate_fcr(Decimal('45'), Decimal('50'))
        assert result == Decimal('0.90')
        
        # Test FCR correct
        result = AquacultureCalculator.calculate_fcr(Decimal('100'), Decimal('80'))
        assert result == Decimal('1.25')
        
        # Test avec gain de poids zéro
        result = AquacultureCalculator.calculate_fcr(Decimal('100'), Decimal('0'))
        assert result == Decimal('0')
        
        # Test avec aliment zéro
        result = AquacultureCalculator.calculate_fcr(Decimal('0'), Decimal('50'))
        assert result == Decimal('0')
    
    def test_calculate_daily_growth_rate(self):
        """Test calcul taux de croissance journalier."""
        # Test croissance normale
        result = AquacultureCalculator.calculate_daily_growth_rate(
            Decimal('10'), Decimal('100'), 45
        )
        assert result == Decimal('2.00')
        
        # Test sans croissance
        result = AquacultureCalculator.calculate_daily_growth_rate(
            Decimal('50'), Decimal('50'), 30
        )
        assert result == Decimal('0')
        
        # Test croissance négative
        result = AquacultureCalculator.calculate_daily_growth_rate(
            Decimal('100'), Decimal('50'), 30
        )
        assert result == Decimal('0')
        
        # Test avec durée zéro
        result = AquacultureCalculator.calculate_daily_growth_rate(
            Decimal('10'), Decimal('50'), 0
        )
        assert result == Decimal('0')
    
    def test_calculate_specific_growth_rate(self):
        """Test calcul taux de croissance spécifique (SGR)."""
        # Test SGR normal (de 10g à 100g en 60 jours)
        result = AquacultureCalculator.calculate_specific_growth_rate(
            Decimal('10'), Decimal('100'), 60
        )
        # ln(100) - ln(10) = ln(10) = 2.3026, donc SGR = 2.3026/60*100 = 3.84
        assert abs(result - Decimal('3.84')) < Decimal('0.1')
        
        # Test avec poids identiques
        result = AquacultureCalculator.calculate_specific_growth_rate(
            Decimal('50'), Decimal('50'), 30
        )
        assert result == Decimal('0')
        
        # Test avec durée zéro
        result = AquacultureCalculator.calculate_specific_growth_rate(
            Decimal('10'), Decimal('50'), 0
        )
        assert result == Decimal('0')
        
        # Test avec poids initial zéro ou négatif
        result = AquacultureCalculator.calculate_specific_growth_rate(
            Decimal('0'), Decimal('50'), 30
        )
        assert result == Decimal('0')
    
    def test_calculate_condition_factor(self):
        """Test calcul facteur de condition."""
        # Test facteur normal
        result = AquacultureCalculator.calculate_condition_factor(
            Decimal('125'), Decimal('10')
        )
        assert result == Decimal('12.50')  # 125/(10^3)*100 = 12.5
        
        # Test avec longueur zéro
        result = AquacultureCalculator.calculate_condition_factor(
            Decimal('125'), Decimal('0')
        )
        assert result == Decimal('0')
        
        # Test avec poids zéro
        result = AquacultureCalculator.calculate_condition_factor(
            Decimal('0'), Decimal('10')
        )
        assert result == Decimal('0')
    
    def test_calculate_stocking_density(self):
        """Test calcul densité d'élevage."""
        # Test densité normale
        result = AquacultureCalculator.calculate_stocking_density(
            Decimal('150'), Decimal('2')
        )
        assert result == Decimal('75.00')
        
        # Test avec volume zéro
        result = AquacultureCalculator.calculate_stocking_density(
            Decimal('150'), Decimal('0')
        )
        assert result == Decimal('0')
        
        # Test avec biomasse zéro
        result = AquacultureCalculator.calculate_stocking_density(
            Decimal('0'), Decimal('2')
        )
        assert result == Decimal('0')
    
    def test_suggest_daily_feed_amount(self):
        """Test suggestion quantité alimentation journalière."""
        # Test avec 5% de la biomasse
        result = AquacultureCalculator.suggest_daily_feed_amount(
            Decimal('100'), Decimal('5')
        )
        assert result == Decimal('5.00')
        
        # Test avec taux zéro
        result = AquacultureCalculator.suggest_daily_feed_amount(
            Decimal('100'), Decimal('0')
        )
        assert result == Decimal('0')
        
        # Test avec biomasse zéro
        result = AquacultureCalculator.suggest_daily_feed_amount(
            Decimal('0'), Decimal('5')
        )
        assert result == Decimal('0')
    
    def test_get_growth_stage(self):
        """Test détermination stade de croissance."""
        # Test alevin
        stage = AquacultureCalculator.get_growth_stage('tilapia', Decimal('8'))
        assert stage == 'alevin'
        
        # Test juvénile
        stage = AquacultureCalculator.get_growth_stage('clarias', Decimal('25'))
        assert stage == 'juvenile'
        
        # Test croissance
        stage = AquacultureCalculator.get_growth_stage('tilapia', Decimal('100'))
        assert stage == 'croissance'
        
        # Test finition
        stage = AquacultureCalculator.get_growth_stage('clarias', Decimal('300'))
        assert stage == 'finition'
    
    def test_get_feeding_recommendations(self):
        """Test récupération recommandations alimentation."""
        # Test pour alevin
        rec = AquacultureCalculator.get_feeding_recommendations(Decimal('5'))
        assert rec['size_mm'] == 1.0
        assert rec['protein_pct'] == 45
        assert rec['feeding_rate_pct'] == 8
        
        # Test pour juvénile
        rec = AquacultureCalculator.get_feeding_recommendations(Decimal('30'))
        assert rec['size_mm'] == 1.8
        assert rec['protein_pct'] == 42
        assert rec['feeding_rate_pct'] == 7
        
        # Test pour très gros poisson (hors tableau)
        rec = AquacultureCalculator.get_feeding_recommendations(Decimal('1500'))
        assert rec['size_mm'] == 6.0
        assert rec['protein_pct'] == 30
        assert rec['feeding_rate_pct'] == 2
    
    def test_get_meals_per_day(self):
        """Test nombre de repas par jour."""
        # Test petit poisson
        meals = AquacultureCalculator.get_meals_per_day(Decimal('15'))
        assert meals == 4
        
        # Test poisson moyen
        meals = AquacultureCalculator.get_meals_per_day(Decimal('100'))
        assert meals == 3
        
        # Test gros poisson
        meals = AquacultureCalculator.get_meals_per_day(Decimal('300'))
        assert meals == 2
        
        # Test très gros poisson
        meals = AquacultureCalculator.get_meals_per_day(Decimal('800'))
        assert meals == 1
    
    def test_calculate_weekly_feeding_plan(self):
        """Test génération plan alimentation hebdomadaire."""
        plan = AquacultureCalculator.calculate_weekly_feeding_plan(
            current_biomass_kg=Decimal('100'),
            current_weight_g=Decimal('50'),
            current_count=2000,
            species='clarias',
            week_number=5
        )
        
        assert plan['week_number'] == 5
        assert plan['estimated_fish_count'] == 2000
        assert plan['average_weight'] == Decimal('50')
        assert plan['biomass'] == Decimal('100')
        assert plan['daily_feed_amount'] > Decimal('0')
        assert plan['meals_per_day'] >= 1
        assert plan['feed_per_meal'] > Decimal('0')
        assert plan['protein_percentage'] > 0
        assert 'recommended_feed_type' in plan
    
    def test_check_environmental_alerts(self):
        """Test vérification alertes environnementales."""
        # Test sans alertes
        alerts = AquacultureCalculator.check_environmental_alerts(
            'clarias',
            temperature_c=Decimal('28'),
            ph=Decimal('7.0'),
            oxygen_mg_l=Decimal('6'),
            density_kg_m3=Decimal('100')
        )
        assert len(alerts) == 0
        
        # Test avec température trop basse
        alerts = AquacultureCalculator.check_environmental_alerts(
            'clarias',
            temperature_c=Decimal('5')
        )
        assert len(alerts) == 1
        assert 'Température trop basse' in alerts[0]
        
        # Test avec pH trop élevé
        alerts = AquacultureCalculator.check_environmental_alerts(
            'tilapia',
            ph=Decimal('10')
        )
        assert len(alerts) == 1
        assert 'pH trop élevé' in alerts[0]
        
        # Test avec oxygène insuffisant
        alerts = AquacultureCalculator.check_environmental_alerts(
            'tilapia',
            oxygen_mg_l=Decimal('2')
        )
        assert len(alerts) == 1
        assert 'Oxygène insuffisant' in alerts[0]
        
        # Test avec densité excessive
        alerts = AquacultureCalculator.check_environmental_alerts(
            'clarias',
            density_kg_m3=Decimal('200')
        )
        assert len(alerts) == 1
        assert 'Densité excessive' in alerts[0]
    
    def test_calculate_performance_score(self):
        """Test calcul score de performance."""
        # Test performance excellente
        score = AquacultureCalculator.calculate_performance_score(
            survival_rate_pct=Decimal('95'),
            fcr=Decimal('1.0'),
            daily_growth_rate=Decimal('3.0'),
            species='clarias'
        )
        assert score >= Decimal('90')
        
        # Test performance moyenne
        score = AquacultureCalculator.calculate_performance_score(
            survival_rate_pct=Decimal('75'),
            fcr=Decimal('2.0'),
            daily_growth_rate=Decimal('1.5'),
            species='tilapia'
        )
        assert Decimal('50') <= score <= Decimal('80')
        
        # Test performance faible
        score = AquacultureCalculator.calculate_performance_score(
            survival_rate_pct=Decimal('50'),
            fcr=Decimal('3.0'),
            daily_growth_rate=Decimal('0.5'),
            species='clarias'
        )
        assert score <= Decimal('50')
        
        # Test avec valeurs manquantes
        score = AquacultureCalculator.calculate_performance_score(
            survival_rate_pct=None,
            fcr=None,
            daily_growth_rate=None,
            species='tilapia'
        )
        assert score == Decimal('0.0')
    
    def test_project_harvest_date(self):
        """Test projection date de récolte."""
        start_date = date(2024, 1, 1)
        
        # Test avec croissance normale
        harvest_date = AquacultureCalculator.project_harvest_date(
            start_date=start_date,
            current_weight_g=Decimal('100'),
            target_weight_g=Decimal('500'),
            current_growth_rate=Decimal('2.0'),
            species='clarias'
        )
        
        # Devrait être environ 200 jours après le début
        # (400g à gagner / 2g par jour = 200 jours)
        expected_days = 200
        actual_days = (harvest_date - start_date).days
        
        # Ajuster pour les jours déjà écoulés
        days_elapsed = (date.today() - start_date).days
        if days_elapsed > 0:
            expected_days += days_elapsed
        
        # Tolérance de quelques jours
        assert abs(actual_days - expected_days) <= 5
        
        # Test avec croissance nulle (utilise durée standard)
        harvest_date = AquacultureCalculator.project_harvest_date(
            start_date=start_date,
            current_weight_g=Decimal('100'),
            target_weight_g=Decimal('500'),
            current_growth_rate=Decimal('0'),
            species='clarias'
        )
        
        # Devrait être 120 jours (standard pour Clarias)
        expected_date = start_date + timedelta(days=120)
        assert harvest_date == expected_date