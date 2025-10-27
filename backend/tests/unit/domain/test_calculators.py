"""
Tests unitaires pour AquacultureCalculator (domain/calculators.py).

Coverage cible : >90% (calculs critiques)
"""
import pytest
from decimal import Decimal
from datetime import date, timedelta

from apps.aquaculture.domain.calculators import AquacultureCalculator


class TestBiomassCalculations:
    """Tests des calculs de biomasse."""

    def test_calculate_biomass_normal(self):
        """Test calcul biomasse avec valeurs normales."""
        result = AquacultureCalculator.calculate_biomass(1000, Decimal('250'))
        assert result == Decimal('250.00')

    def test_calculate_biomass_zero_count(self):
        """Test calcul biomasse avec effectif zéro."""
        result = AquacultureCalculator.calculate_biomass(0, Decimal('250'))
        assert result == Decimal('0')

    def test_calculate_biomass_zero_weight(self):
        """Test calcul biomasse avec poids zéro."""
        result = AquacultureCalculator.calculate_biomass(1000, Decimal('0'))
        assert result == Decimal('0')

    def test_calculate_biomass_negative_count(self):
        """Test calcul biomasse avec effectif négatif."""
        result = AquacultureCalculator.calculate_biomass(-100, Decimal('250'))
        assert result == Decimal('0')

    def test_calculate_biomass_rounding(self):
        """Test arrondi correct de la biomasse."""
        result = AquacultureCalculator.calculate_biomass(333, Decimal('33.33'))
        assert result == Decimal('11.10')  # 333 * 33.33 / 1000 = 11.09889


class TestSurvivalRateCalculations:
    """Tests du calcul de taux de survie."""

    def test_survival_rate_100_percent(self):
        """Test survie 100%."""
        result = AquacultureCalculator.calculate_survival_rate(1000, 1000)
        assert result == Decimal('100.00')

    def test_survival_rate_50_percent(self):
        """Test survie 50%."""
        result = AquacultureCalculator.calculate_survival_rate(1000, 500)
        assert result == Decimal('50.00')

    def test_survival_rate_zero_initial(self):
        """Test survie avec effectif initial zéro."""
        result = AquacultureCalculator.calculate_survival_rate(0, 0)
        assert result == Decimal('0')

    def test_survival_rate_negative_current(self):
        """Test survie avec effectif actuel négatif (correction automatique)."""
        result = AquacultureCalculator.calculate_survival_rate(1000, -50)
        assert result == Decimal('0')


class TestFCRCalculations:
    """Tests du calcul FCR (Feed Conversion Ratio)."""

    def test_fcr_optimal(self):
        """Test FCR optimal (1.2)."""
        result = AquacultureCalculator.calculate_fcr(
            Decimal('120'), Decimal('100')
        )
        assert result == Decimal('1.20')

    def test_fcr_poor(self):
        """Test FCR médiocre (3.0)."""
        result = AquacultureCalculator.calculate_fcr(
            Decimal('300'), Decimal('100')
        )
        assert result == Decimal('3.00')

    def test_fcr_zero_weight_gain(self):
        """Test FCR avec gain de poids zéro."""
        result = AquacultureCalculator.calculate_fcr(
            Decimal('100'), Decimal('0')
        )
        assert result == Decimal('0')

    def test_fcr_zero_feed(self):
        """Test FCR avec aliment zéro."""
        result = AquacultureCalculator.calculate_fcr(
            Decimal('0'), Decimal('100')
        )
        assert result == Decimal('0')


class TestGrowthRateCalculations:
    """Tests des calculs de taux de croissance."""

    def test_daily_growth_rate_normal(self):
        """Test taux croissance journalière normal."""
        result = AquacultureCalculator.calculate_daily_growth_rate(
            Decimal('50'), Decimal('120'), 45
        )
        # (120 - 50) / 45 = 1.56 g/jour
        assert result == Decimal('1.56')

    def test_daily_growth_rate_zero_days(self):
        """Test croissance avec zéro jours."""
        result = AquacultureCalculator.calculate_daily_growth_rate(
            Decimal('50'), Decimal('120'), 0
        )
        assert result == Decimal('0')

    def test_daily_growth_rate_negative_growth(self):
        """Test croissance négative (perte de poids)."""
        result = AquacultureCalculator.calculate_daily_growth_rate(
            Decimal('120'), Decimal('50'), 45
        )
        assert result == Decimal('0')

    def test_specific_growth_rate_normal(self):
        """Test SGR (Specific Growth Rate) normal."""
        result = AquacultureCalculator.calculate_specific_growth_rate(
            Decimal('50'), Decimal('120'), 45
        )
        # SGR = [(ln(120) - ln(50)) / 45] * 100 ≈ 1.95 %/jour
        assert Decimal('1.90') < result < Decimal('2.00')

    def test_specific_growth_rate_zero_initial(self):
        """Test SGR avec poids initial zéro."""
        result = AquacultureCalculator.calculate_specific_growth_rate(
            Decimal('0'), Decimal('120'), 45
        )
        assert result == Decimal('0')


class TestStockingDensity:
    """Tests des calculs de densité d'élevage."""

    def test_stocking_density_normal(self):
        """Test densité normale."""
        result = AquacultureCalculator.calculate_stocking_density(
            Decimal('250'), Decimal('2.5')
        )
        assert result == Decimal('100.00')  # kg/m³

    def test_stocking_density_zero_volume(self):
        """Test densité avec volume zéro."""
        result = AquacultureCalculator.calculate_stocking_density(
            Decimal('250'), Decimal('0')
        )
        assert result == Decimal('0')


class TestFeedingRecommendations:
    """Tests des recommandations d'alimentation."""

    def test_suggest_daily_feed_amount(self):
        """Test calcul quantité journalière d'aliment."""
        result = AquacultureCalculator.suggest_daily_feed_amount(
            Decimal('250'), Decimal('3')
        )
        # 250 kg * 3% = 7.5 kg/jour
        assert result == Decimal('7.50')

    def test_get_feeding_recommendations_juvenile(self):
        """Test recommandations pour poissons juvéniles (20g)."""
        recommendations = AquacultureCalculator.get_feeding_recommendations(
            Decimal('20')
        )
        assert 'size_mm' in recommendations
        assert 'protein_pct' in recommendations
        assert 'feeding_rate_pct' in recommendations
        assert recommendations['protein_pct'] >= 35  # Haute protéine pour juvéniles

    def test_get_feeding_recommendations_adult(self):
        """Test recommandations pour adultes (300g)."""
        recommendations = AquacultureCalculator.get_feeding_recommendations(
            Decimal('300')
        )
        assert recommendations['feeding_rate_pct'] < 5  # Taux plus bas pour adultes

    def test_get_meals_per_day_alevin(self):
        """Test nombre de repas pour alevins."""
        meals = AquacultureCalculator.get_meals_per_day(Decimal('5'))
        assert meals >= 3  # Alevins nécessitent feeding fréquent

    def test_get_meals_per_day_adult(self):
        """Test nombre de repas pour adultes."""
        meals = AquacultureCalculator.get_meals_per_day(Decimal('300'))
        assert meals >= 1  # Au minimum 1 repas


class TestGrowthStages:
    """Tests de détermination des stades de croissance."""

    def test_growth_stage_alevin(self):
        """Test stade alevin."""
        stage = AquacultureCalculator.get_growth_stage('tilapia', Decimal('5'))
        assert stage == 'alevin'

    def test_growth_stage_juvenile(self):
        """Test stade juvénile."""
        stage = AquacultureCalculator.get_growth_stage('clarias', Decimal('30'))
        assert stage == 'juvenile'

    def test_growth_stage_croissance(self):
        """Test stade croissance."""
        stage = AquacultureCalculator.get_growth_stage('tilapia', Decimal('100'))
        assert stage == 'croissance'

    def test_growth_stage_finition(self):
        """Test stade finition."""
        stage = AquacultureCalculator.get_growth_stage('clarias', Decimal('250'))
        assert stage == 'finition'


class TestEnvironmentalAlerts:
    """Tests des alertes environnementales."""

    def test_check_environmental_alerts_all_optimal(self):
        """Test sans alertes (paramètres optimaux)."""
        alerts = AquacultureCalculator.check_environmental_alerts(
            'tilapia',
            temperature_c=Decimal('28'),
            ph=Decimal('7.5'),
            oxygen_mg_l=Decimal('6.0'),
            density_kg_m3=Decimal('80')
        )
        assert len(alerts) == 0

    def test_check_environmental_alerts_temperature_low(self):
        """Test alerte température basse."""
        alerts = AquacultureCalculator.check_environmental_alerts(
            'tilapia',
            temperature_c=Decimal('18')
        )
        assert len(alerts) > 0
        assert any('Température' in alert for alert in alerts)

    def test_check_environmental_alerts_temperature_high(self):
        """Test alerte température élevée."""
        alerts = AquacultureCalculator.check_environmental_alerts(
            'clarias',
            temperature_c=Decimal('36')
        )
        assert len(alerts) > 0

    def test_check_environmental_alerts_ph_low(self):
        """Test alerte pH bas."""
        alerts = AquacultureCalculator.check_environmental_alerts(
            'tilapia',
            ph=Decimal('5.5')
        )
        assert len(alerts) > 0
        assert any('pH' in alert for alert in alerts)

    def test_check_environmental_alerts_oxygen_low(self):
        """Test alerte oxygène bas."""
        alerts = AquacultureCalculator.check_environmental_alerts(
            'clarias',
            oxygen_mg_l=Decimal('2.5')  # Sous le seuil de 3.0 pour clarias
        )
        assert len(alerts) > 0
        assert any('Oxygène' in alert or 'oxygène' in alert.lower() for alert in alerts)


class TestPerformanceScore:
    """Tests du calcul de score de performance."""

    def test_performance_score_excellent(self):
        """Test score excellent (tous paramètres optimaux)."""
        score = AquacultureCalculator.calculate_performance_score(
            survival_rate_pct=Decimal('95'),
            fcr=Decimal('1.1'),
            daily_growth_rate=Decimal('2.5'),
            species='clarias'
        )
        assert score >= Decimal('90')  # Score très élevé

    def test_performance_score_poor(self):
        """Test score médiocre."""
        score = AquacultureCalculator.calculate_performance_score(
            survival_rate_pct=Decimal('60'),
            fcr=Decimal('3.0'),
            daily_growth_rate=Decimal('0.8'),
            species='tilapia'
        )
        assert score < Decimal('50')  # Score bas

    def test_performance_score_none_values(self):
        """Test score avec valeurs None."""
        score = AquacultureCalculator.calculate_performance_score(
            survival_rate_pct=None,
            fcr=None,
            daily_growth_rate=None,
            species='tilapia'
        )
        assert score == Decimal('0')


class TestWeeklyFeedingPlan:
    """Tests du calcul de plan d'alimentation hebdomadaire."""

    def test_calculate_weekly_feeding_plan(self):
        """Test génération plan hebdomadaire complet."""
        plan = AquacultureCalculator.calculate_weekly_feeding_plan(
            current_biomass_kg=Decimal('250'),
            current_weight_g=Decimal('150'),
            current_count=2000,
            species='tilapia',
            week_number=6
        )

        assert 'week_number' in plan
        assert plan['week_number'] == 6
        assert 'daily_feed_amount' in plan
        assert 'meals_per_day' in plan
        assert 'total_week_feed' in plan
        assert 'projected_weight_g' in plan
        assert plan['projected_weight_g'] > Decimal('150')  # Croissance attendue


class TestHarvestProjection:
    """Tests de projection de date de récolte."""

    def test_project_harvest_date_normal(self):
        """Test projection normale."""
        start_date = date(2025, 1, 1)
        projected = AquacultureCalculator.project_harvest_date(
            start_date=start_date,
            current_weight_g=Decimal('100'),
            target_weight_g=Decimal('250'),
            current_growth_rate=Decimal('2.0'),
            species='clarias'
        )
        # (250 - 100) / 2.0 = 75 jours supplémentaires
        expected_days = 75  # Approximativement
        assert (projected - date.today()).days > 0

    def test_project_harvest_date_zero_growth(self):
        """Test projection avec croissance nulle (fallback)."""
        start_date = date(2025, 1, 1)
        projected = AquacultureCalculator.project_harvest_date(
            start_date=start_date,
            current_weight_g=Decimal('100'),
            target_weight_g=Decimal('250'),
            current_growth_rate=Decimal('0'),
            species='clarias'
        )
        # Devrait utiliser durée standard (120 jours pour clarias)
        expected = start_date + timedelta(days=120)
        assert projected == expected

    def test_project_harvest_date_target_reached(self):
        """Test projection quand objectif déjà atteint."""
        start_date = date(2025, 1, 1)
        projected = AquacultureCalculator.project_harvest_date(
            start_date=start_date,
            current_weight_g=Decimal('250'),
            target_weight_g=Decimal('200'),
            current_growth_rate=Decimal('2.0'),
            species='tilapia'
        )
        # Devrait utiliser durée standard
        expected = start_date + timedelta(days=180)
        assert projected == expected
