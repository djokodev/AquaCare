"""
Tests unitaires pour les Value Objects (domain/value_objects.py).

Coverage cible : >95% (objets critiques)
"""
from decimal import Decimal

import pytest
from aquaculture.domain.value_objects import FCR, Biomass, GrowthRate, SurvivalRate, WaterQuality


class TestBiomassValueObject:
    """Tests de l'objet valeur Biomass."""

    def test_biomass_creation_from_fish_data(self):
        """Test création Biomass depuis données poissons."""
        biomass = Biomass.from_fish_data(1000, Decimal('250'))
        assert biomass.kg == Decimal('250.00')
        assert biomass.fish_count == 1000
        assert biomass.average_weight_g == Decimal('250')

    def test_biomass_immutability(self):
        """Test immutabilité de Biomass."""
        biomass = Biomass.from_fish_data(1000, Decimal('250'))
        with pytest.raises(AttributeError):
            biomass.kg = Decimal('300')

    def test_biomass_invalid_negative_kg(self):
        """Test rejet biomasse négative."""
        with pytest.raises(ValueError, match="biomasse ne peut être négative"):
            Biomass(kg=Decimal('-10'), fish_count=1000, average_weight_g=Decimal('250'))

    def test_biomass_invalid_negative_count(self):
        """Test rejet effectif négatif."""
        with pytest.raises(ValueError, match="nombre de poissons"):
            Biomass(kg=Decimal('250'), fish_count=-100, average_weight_g=Decimal('250'))

    def test_biomass_inconsistent_data(self):
        """Test rejet données incohérentes."""
        with pytest.raises(ValueError, match="Incohérence biomasse"):
            Biomass(kg=Decimal('500'), fish_count=1000, average_weight_g=Decimal('250'))

    def test_biomass_density_per_m2(self):
        """Test calcul densité par m²."""
        biomass = Biomass.from_fish_data(1000, Decimal('250'))
        density = biomass.density_per_m2(Decimal('100'))
        assert density == Decimal('2.50')  # 250 kg / 100 m²

    def test_biomass_density_per_m3(self):
        """Test calcul densité par m³."""
        biomass = Biomass.from_fish_data(1000, Decimal('250'))
        density = biomass.density_per_m3(Decimal('2.5'))
        assert density == Decimal('100.00')  # 250 kg / 2.5 m³

    def test_biomass_subtract_mortality(self):
        """Test déduction mortalité."""
        biomass = Biomass.from_fish_data(1000, Decimal('250'))
        new_biomass = biomass.subtract_mortality(100)
        assert new_biomass.fish_count == 900
        assert new_biomass.kg == Decimal('225.00')  # 900 * 250 / 1000

    def test_biomass_update_weight(self):
        """Test mise à jour poids moyen."""
        biomass = Biomass.from_fish_data(1000, Decimal('250'))
        new_biomass = biomass.update_weight(Decimal('300'))
        assert new_biomass.average_weight_g == Decimal('300')
        assert new_biomass.kg == Decimal('300.00')  # 1000 * 300 / 1000

    def test_biomass_zero_fish(self):
        """Test biomasse avec zéro poisson."""
        biomass = Biomass.from_fish_data(0, Decimal('250'))
        assert biomass.kg == Decimal('0')
        assert biomass.fish_count == 0


class TestFCRValueObject:
    """Tests de l'objet valeur FCR."""

    def test_fcr_creation_from_data(self):
        """Test création FCR depuis données."""
        fcr = FCR.from_data(Decimal('120'), Decimal('100'))
        assert fcr.value == Decimal('1.20')
        assert fcr.feed_consumed_kg == Decimal('120')
        assert fcr.weight_gain_kg == Decimal('100')

    def test_fcr_immutability(self):
        """Test immutabilité FCR."""
        fcr = FCR.from_data(Decimal('120'), Decimal('100'))
        with pytest.raises(AttributeError):
            fcr.value = Decimal('2.0')

    def test_fcr_invalid_negative(self):
        """Test rejet FCR négatif."""
        with pytest.raises(ValueError, match="FCR ne peut être négatif"):
            FCR(value=Decimal('-1'), feed_consumed_kg=Decimal('120'), weight_gain_kg=Decimal('100'))

    def test_fcr_inconsistent_data(self):
        """Test rejet données incohérentes."""
        with pytest.raises(ValueError, match="Incohérence FCR"):
            FCR(value=Decimal('2.0'), feed_consumed_kg=Decimal('120'), weight_gain_kg=Decimal('100'))

    def test_fcr_interpretation_excellent(self):
        """Test interprétation FCR excellent."""
        fcr = FCR.from_data(Decimal('110'), Decimal('100'))
        assert fcr.interpretation() == 'excellent'

    def test_fcr_interpretation_bon(self):
        """Test interprétation FCR bon."""
        fcr = FCR.from_data(Decimal('140'), Decimal('100'))
        assert fcr.interpretation() == 'bon'

    def test_fcr_interpretation_acceptable(self):
        """Test interprétation FCR acceptable."""
        fcr = FCR.from_data(Decimal('180'), Decimal('100'))
        assert fcr.interpretation() == 'acceptable'

    def test_fcr_interpretation_ameliorer(self):
        """Test interprétation FCR à améliorer."""
        fcr = FCR.from_data(Decimal('250'), Decimal('100'))
        assert fcr.interpretation() == 'ameliorer'

    def test_fcr_efficiency_percentage(self):
        """Test calcul efficacité en pourcentage."""
        fcr = FCR.from_data(Decimal('120'), Decimal('100'))
        efficiency = fcr.efficiency_percentage()
        # (100 / 120) * 100 = 83.3%
        assert Decimal('83.0') < efficiency < Decimal('83.5')

    def test_fcr_from_data_zero_gain(self):
        """Test FCR impossible avec gain zéro."""
        fcr = FCR.from_data(Decimal('120'), Decimal('0'))
        assert fcr is None


class TestSurvivalRateValueObject:
    """Tests de l'objet valeur SurvivalRate."""

    def test_survival_rate_creation(self):
        """Test création SurvivalRate."""
        survival = SurvivalRate.from_counts(1000, 850)
        assert survival.percentage == Decimal('85.00')
        assert survival.initial_count == 1000
        assert survival.current_count == 850

    def test_survival_rate_immutability(self):
        """Test immutabilité SurvivalRate."""
        survival = SurvivalRate.from_counts(1000, 850)
        with pytest.raises(AttributeError):
            survival.percentage = Decimal('90')

    def test_survival_rate_invalid_percentage_over_100(self):
        """Test rejet pourcentage > 100."""
        with pytest.raises(ValueError, match="entre 0 et 100"):
            SurvivalRate(percentage=Decimal('150'), initial_count=1000, current_count=1000)

    def test_survival_rate_current_exceeds_initial(self):
        """Test rejet effectif actuel > initial."""
        with pytest.raises(ValueError, match="ne peut dépasser l'effectif initial"):
            SurvivalRate(percentage=Decimal('100'), initial_count=1000, current_count=1500)

    def test_survival_rate_interpretation_excellent(self):
        """Test interprétation excellent (≥90%)."""
        survival = SurvivalRate.from_counts(1000, 950)
        assert survival.interpretation() == 'excellent'

    def test_survival_rate_interpretation_bon(self):
        """Test interprétation bon (80-90%)."""
        survival = SurvivalRate.from_counts(1000, 850)
        assert survival.interpretation() == 'bon'

    def test_survival_rate_interpretation_acceptable(self):
        """Test interprétation acceptable (70-80%)."""
        survival = SurvivalRate.from_counts(1000, 750)
        assert survival.interpretation() == 'acceptable'

    def test_survival_rate_interpretation_problematique(self):
        """Test interprétation problématique (<70%)."""
        survival = SurvivalRate.from_counts(1000, 600)
        assert survival.interpretation() == 'problematique'

    def test_survival_rate_mortality_count(self):
        """Test calcul nombre de morts."""
        survival = SurvivalRate.from_counts(1000, 850)
        assert survival.mortality_count() == 150

    def test_survival_rate_mortality_percentage(self):
        """Test calcul taux de mortalité."""
        survival = SurvivalRate.from_counts(1000, 850)
        assert survival.mortality_percentage() == Decimal('15.00')

    def test_survival_rate_from_counts_zero_initial(self):
        """Test SurvivalRate avec effectif initial zéro."""
        survival = SurvivalRate.from_counts(0, 0)
        assert survival.percentage == Decimal('0')


class TestWaterQualityValueObject:
    """Tests de l'objet valeur WaterQuality."""

    def test_water_quality_creation(self):
        """Test création WaterQuality."""
        quality = WaterQuality(
            temperature_c=Decimal('28'),
            ph=Decimal('7.5'),
            dissolved_oxygen_mg_l=Decimal('6.0'),
            ammonia_ppm=Decimal('0.2')
        )
        assert quality.temperature_c == Decimal('28')
        assert quality.ph == Decimal('7.5')

    def test_water_quality_immutability(self):
        """Test immutabilité WaterQuality."""
        quality = WaterQuality(
            temperature_c=Decimal('28'),
            ph=Decimal('7.5'),
            dissolved_oxygen_mg_l=Decimal('6.0')
        )
        with pytest.raises(AttributeError):
            quality.temperature_c = Decimal('30')

    def test_water_quality_invalid_negative_temperature(self):
        """Test rejet température négative."""
        with pytest.raises(ValueError, match="température ne peut être négative"):
            WaterQuality(
                temperature_c=Decimal('-5'),
                ph=Decimal('7.5'),
                dissolved_oxygen_mg_l=Decimal('6.0')
            )

    def test_water_quality_invalid_ph_over_14(self):
        """Test rejet pH > 14."""
        with pytest.raises(ValueError, match="pH doit être entre 0 et 14"):
            WaterQuality(
                temperature_c=Decimal('28'),
                ph=Decimal('15'),
                dissolved_oxygen_mg_l=Decimal('6.0')
            )

    def test_water_quality_get_alerts_optimal(self):
        """Test aucune alerte avec paramètres optimaux."""
        quality = WaterQuality(
            temperature_c=Decimal('28'),
            ph=Decimal('7.5'),
            dissolved_oxygen_mg_l=Decimal('6.0')
        )
        alerts = quality.get_alerts_for_species('tilapia')
        assert len(alerts) == 0

    def test_water_quality_get_alerts_temperature_low(self):
        """Test alerte température basse."""
        quality = WaterQuality(
            temperature_c=Decimal('18'),
            ph=Decimal('7.5'),
            dissolved_oxygen_mg_l=Decimal('6.0')
        )
        alerts = quality.get_alerts_for_species('tilapia')
        assert len(alerts) > 0

    def test_water_quality_is_optimal(self):
        """Test vérification optimale."""
        quality = WaterQuality(
            temperature_c=Decimal('28'),
            ph=Decimal('7.5'),
            dissolved_oxygen_mg_l=Decimal('6.0')
        )
        assert quality.is_optimal_for_species('tilapia') is True

    def test_water_quality_critical_parameters_all_ok(self):
        """Test paramètres critiques OK."""
        quality = WaterQuality(
            temperature_c=Decimal('28'),
            ph=Decimal('7.5'),
            dissolved_oxygen_mg_l=Decimal('6.0'),
            ammonia_ppm=Decimal('0.2')
        )
        critical = quality.critical_parameters()
        assert critical['temperature'] is False
        assert critical['ph'] is False
        assert critical['oxygen'] is False
        assert critical['ammonia'] is False

    def test_water_quality_critical_temperature(self):
        """Test température critique."""
        quality = WaterQuality(
            temperature_c=Decimal('38'),
            ph=None,
            dissolved_oxygen_mg_l=None
        )
        critical = quality.critical_parameters()
        assert critical['temperature'] is True

    def test_water_quality_critical_oxygen(self):
        """Test oxygène critique."""
        quality = WaterQuality(
            temperature_c=None,
            ph=None,
            dissolved_oxygen_mg_l=Decimal('2.5')
        )
        critical = quality.critical_parameters()
        assert critical['oxygen'] is True


class TestGrowthRateValueObject:
    """Tests de l'objet valeur GrowthRate."""

    def test_growth_rate_creation(self):
        """Test création GrowthRate."""
        growth = GrowthRate.from_weights(
            Decimal('50'), Decimal('120'), 45
        )
        assert growth is not None
        assert growth.daily_growth_rate_g == Decimal('1.56')
        assert growth.initial_weight_g == Decimal('50')
        assert growth.current_weight_g == Decimal('120')
        assert growth.days_elapsed == 45

    def test_growth_rate_immutability(self):
        """Test immutabilité GrowthRate."""
        growth = GrowthRate.from_weights(
            Decimal('50'), Decimal('120'), 45
        )
        with pytest.raises(AttributeError):
            growth.daily_growth_rate_g = Decimal('2.0')

    def test_growth_rate_invalid_negative_days(self):
        """Test rejet jours négatifs."""
        with pytest.raises(ValueError, match="nombre de jours"):
            GrowthRate(
                daily_growth_rate_g=Decimal('1.5'),
                specific_growth_rate_pct=Decimal('2.0'),
                initial_weight_g=Decimal('50'),
                current_weight_g=Decimal('120'),
                days_elapsed=-10
            )

    def test_growth_rate_from_weights_no_growth(self):
        """Test GrowthRate impossible sans croissance."""
        growth = GrowthRate.from_weights(
            Decimal('120'), Decimal('50'), 45
        )
        assert growth is None

    def test_growth_rate_from_weights_zero_days(self):
        """Test GrowthRate impossible avec zéro jours."""
        growth = GrowthRate.from_weights(
            Decimal('50'), Decimal('120'), 0
        )
        assert growth is None

    def test_growth_rate_interpretation_clarias_excellent(self):
        """Test interprétation croissance excellente pour clarias."""
        growth = GrowthRate.from_weights(
            Decimal('50'), Decimal('162.5'), 45  # 2.5 g/jour
        )
        assert growth.interpretation_for_species('clarias') == 'excellent'

    def test_growth_rate_interpretation_tilapia_bon(self):
        """Test interprétation croissance bonne pour tilapia."""
        growth = GrowthRate.from_weights(
            Decimal('50'), Decimal('117.5'), 45  # 1.5 g/jour
        )
        assert growth.interpretation_for_species('tilapia') == 'bon'

    def test_growth_rate_projected_weight(self):
        """Test projection de poids futur."""
        growth = GrowthRate.from_weights(
            Decimal('50'), Decimal('120'), 45
        )
        # Croissance: 1.56 g/jour
        # Projection à jour 60: 120 + (1.56 * 15) = 143.4g
        projected = growth.projected_weight_at_day(60)
        assert Decimal('143') < projected < Decimal('144')

    def test_growth_rate_projected_weight_past_day(self):
        """Test projection jour passé retourne poids actuel."""
        growth = GrowthRate.from_weights(
            Decimal('50'), Decimal('120'), 45
        )
        projected = growth.projected_weight_at_day(30)
        assert projected == Decimal('120')


class TestValueObjectsEquality:
    """Tests d'égalité des Value Objects."""

    def test_biomass_equality(self):
        """Test égalité par valeur pour Biomass."""
        bio1 = Biomass.from_fish_data(1000, Decimal('250'))
        bio2 = Biomass.from_fish_data(1000, Decimal('250'))
        assert bio1 == bio2
        assert bio1 is not bio2  # Instances différentes

    def test_fcr_equality(self):
        """Test égalité par valeur pour FCR."""
        fcr1 = FCR.from_data(Decimal('120'), Decimal('100'))
        fcr2 = FCR.from_data(Decimal('120'), Decimal('100'))
        assert fcr1 == fcr2
        assert fcr1 is not fcr2

    def test_survival_rate_equality(self):
        """Test égalité par valeur pour SurvivalRate."""
        sr1 = SurvivalRate.from_counts(1000, 850)
        sr2 = SurvivalRate.from_counts(1000, 850)
        assert sr1 == sr2
        assert sr1 is not sr2
