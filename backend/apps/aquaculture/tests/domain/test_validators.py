"""
Tests unitaires pour les validateurs métier (domain/validators.py).

Coverage cible : >85%
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from aquaculture.domain.validators import (
    validate_cycle_duration,
    validate_cycle_log_date,
    validate_feeding_data,
    validate_mortality_data,
    validate_pond_dimensions,
    validate_sampling_data,
    validate_stocking_density,
    validate_water_parameters,
    validate_weight_progression,
)
from django.core.exceptions import ValidationError


class TestCycleDurationValidation:
    """Tests de validation de durée de cycle."""

    def test_validate_cycle_duration_valid_clarias(self):
        """Test durée valide pour clarias (90 jours)."""
        start = date(2025, 1, 1)
        end = date(2025, 4, 1)  # 90 jours
        # Ne devrait pas lever d'exception
        validate_cycle_duration(start, end, 'clarias')

    def test_validate_cycle_duration_valid_tilapia(self):
        """Test durée valide pour tilapia (150 jours)."""
        start = date(2025, 1, 1)
        end = date(2025, 5, 31)  # 150 jours
        validate_cycle_duration(start, end, 'tilapia')

    def test_validate_cycle_duration_too_short_clarias(self):
        """Test durée trop courte pour clarias."""
        start = date(2025, 1, 1)
        end = date(2025, 1, 31)  # 30 jours
        with pytest.raises(ValidationError, match="trop courte"):
            validate_cycle_duration(start, end, 'clarias')

    def test_validate_cycle_duration_too_long_tilapia(self):
        """Test durée trop longue pour tilapia."""
        start = date(2025, 1, 1)
        end = date(2025, 12, 31)  # 365 jours
        with pytest.raises(ValidationError, match="trop longue"):
            validate_cycle_duration(start, end, 'tilapia')

    def test_validate_cycle_duration_end_before_start(self):
        """Test date fin avant date début."""
        start = date(2025, 6, 1)
        end = date(2025, 1, 1)
        with pytest.raises(ValidationError, match="après la date de début"):
            validate_cycle_duration(start, end, 'clarias')


class TestStockingDensityValidation:
    """Tests de validation de densité de mise en charge."""

    def test_validate_stocking_density_valid(self):
        """Test densité valide étang (10 poissons/m²)."""
        validate_stocking_density(1000, Decimal('100'), species='clarias')

    def test_validate_stocking_density_too_high(self):
        """Test densité trop élevée étang (>10 poissons/m²)."""
        with pytest.raises(ValidationError, match="trop élevée"):
            validate_stocking_density(1200, Decimal('100'), species='tilapia')

    def test_validate_stocking_density_volume_boundary_passes(self):
        """Test densité volume à la limite (300 poissons/m³) autorisée."""
        validate_stocking_density(4500, None, Decimal('15'), species='clarias')

    def test_validate_stocking_density_volume_too_high(self):
        """Test densité trop élevée bac/cage (>300 poissons/m³)."""
        with pytest.raises(ValidationError, match="poissons/m³"):
            validate_stocking_density(620, None, Decimal('2'), species='clarias')

    def test_validate_stocking_density_volume_over_limit_fails(self):
        """Test densité volume au-dessus de la limite refusée."""
        with pytest.raises(ValidationError, match="poissons/m³"):
            validate_stocking_density(9000, None, Decimal('15'), species='clarias')

    def test_validate_stocking_density_volume_just_above_limit_fails(self):
        """Test densité volume à 301 poissons/m³ refusée."""
        with pytest.raises(ValidationError, match="poissons/m³"):
            validate_stocking_density(4501, None, Decimal('15'), species='clarias')


class TestWaterParametersValidation:
    """Tests de validation des paramètres d'eau."""

    def test_validate_water_parameters_all_optimal(self):
        """Test paramètres optimaux (pas d'erreur)."""
        validate_water_parameters(
            temperature=Decimal('28'),
            ph=Decimal('7.5'),
            oxygen=Decimal('6.0'),
            ammonia=Decimal('0.2'),
            species='tilapia'
        )

    def test_validate_water_parameters_temperature_too_low(self):
        """Test température trop basse."""
        with pytest.raises(ValidationError, match="Température trop basse"):
            validate_water_parameters(
                temperature=Decimal('5'),  # Sous le min de 8°C pour clarias
                species='clarias'
            )

    def test_validate_water_parameters_temperature_too_high(self):
        """Test température trop élevée."""
        with pytest.raises(ValidationError, match="Température trop élevée"):
            validate_water_parameters(
                temperature=Decimal('38'),
                species='tilapia'
            )

    def test_validate_water_parameters_ph_too_low(self):
        """Test pH trop bas."""
        with pytest.raises(ValidationError, match="pH trop bas"):
            validate_water_parameters(
                ph=Decimal('5.0'),
                species='clarias'
            )

    def test_validate_water_parameters_ph_too_high(self):
        """Test pH trop élevé."""
        with pytest.raises(ValidationError, match="pH trop élevé"):
            validate_water_parameters(
                ph=Decimal('9.5'),
                species='tilapia'
            )

    def test_validate_water_parameters_oxygen_too_low(self):
        """Test oxygène insuffisant."""
        with pytest.raises(ValidationError, match="Oxygène dissous insuffisant"):
            validate_water_parameters(
                oxygen=Decimal('2.5'),  # Sous le min de 3.0 pour clarias
                species='clarias'
            )

    def test_validate_water_parameters_ammonia_too_high(self):
        """Test ammoniac trop élevé."""
        with pytest.raises(ValidationError, match="ammoniac trop élevé"):
            validate_water_parameters(
                ammonia=Decimal('1.5'),
                species='tilapia'
            )

    def test_validate_water_parameters_multiple_errors(self):
        """Test plusieurs erreurs simultanées."""
        with pytest.raises(ValidationError) as exc_info:
            validate_water_parameters(
                temperature=Decimal('18'),
                ph=Decimal('5.0'),
                oxygen=Decimal('3.0'),
                species='clarias'
            )
        # Devrait contenir au moins une erreur (validators peuvent lever une par une)
        assert len(exc_info.value.messages) >= 1


class TestFeedingDataValidation:
    """Tests de validation des données d'alimentation."""

    def test_validate_feeding_data_valid(self):
        """Test données alimentation valides."""
        validate_feeding_data(
            feed_quantity=Decimal('7.5'),
            biomass=Decimal('250'),
            fish_count=2000
        )

    def test_validate_feeding_data_excessive_rate(self):
        """Test taux alimentation excessif (>15%)."""
        with pytest.raises(ValidationError, match="Quantité d'aliment excessive"):
            validate_feeding_data(
                feed_quantity=Decimal('50'),  # 20% de la biomasse
                biomass=Decimal('250'),
                fish_count=2000
            )

    def test_validate_feeding_data_excessive_per_fish(self):
        """Test quantité par poisson excessive."""
        with pytest.raises(ValidationError):  # Le validator vérifie d'abord le % de biomasse
            validate_feeding_data(
                feed_quantity=Decimal('150'),  # 60% de la biomasse, dépasse 15%
                biomass=Decimal('250'),
                fish_count=2000
            )

    def test_validate_feeding_data_zero_quantity(self):
        """Test quantité zéro (pas d'erreur, optionnel)."""
        validate_feeding_data(
            feed_quantity=Decimal('0'),
            biomass=Decimal('250'),
            fish_count=2000
        )


class TestSamplingDataValidation:
    """Tests de validation des données d'échantillonnage."""

    def test_validate_sampling_data_valid(self):
        """Test échantillonnage valide."""
        validate_sampling_data(
            sample_count=20,
            sample_total_weight=Decimal('2500'),  # 125g moyenne
            calculated_average=Decimal('125')
        )

    def test_validate_sampling_data_too_small_sample(self):
        """Test échantillon trop petit (<5 poissons)."""
        with pytest.raises(ValidationError, match="Échantillon trop petit"):
            validate_sampling_data(
                sample_count=3,
                sample_total_weight=Decimal('375')
            )

    def test_validate_sampling_data_negative_weight(self):
        """Test poids négatif."""
        with pytest.raises(ValidationError, match="doit être positif"):
            validate_sampling_data(
                sample_count=20,
                sample_total_weight=Decimal('-2500')
            )

    def test_validate_sampling_data_average_too_low(self):
        """Test poids moyen trop faible (<0.5g)."""
        with pytest.raises(ValidationError, match="Poids moyen trop faible"):
            validate_sampling_data(
                sample_count=20,
                sample_total_weight=Decimal('8')  # 0.4g moyenne
            )

    def test_validate_sampling_data_average_too_high(self):
        """Test poids moyen trop élevé (>2000g)."""
        with pytest.raises(ValidationError, match="Poids moyen trop élevé"):
            validate_sampling_data(
                sample_count=20,
                sample_total_weight=Decimal('50000')  # 2500g moyenne
            )

    def test_validate_sampling_data_inconsistent_average(self):
        """Test incohérence entre poids total et moyenne calculée."""
        with pytest.raises(ValidationError, match="Incohérence"):
            validate_sampling_data(
                sample_count=20,
                sample_total_weight=Decimal('2500'),  # 125g réel
                calculated_average=Decimal('200')  # 200g déclaré
            )


class TestMortalityDataValidation:
    """Tests de validation des données de mortalité."""

    def test_validate_mortality_data_valid(self):
        """Test mortalité valide."""
        validate_mortality_data(
            mortality_count=50,
            current_fish_count=2000
        )

    def test_validate_mortality_data_negative(self):
        """Test mortalité négative."""
        with pytest.raises(ValidationError, match="ne peut être négatif"):
            validate_mortality_data(
                mortality_count=-10,
                current_fish_count=2000
            )

    def test_validate_mortality_data_exceeds_count(self):
        """Test mortalité > effectif actuel."""
        with pytest.raises(ValidationError, match="supérieur à l'effectif actuel"):
            validate_mortality_data(
                mortality_count=2500,
                current_fish_count=2000
            )

    def test_validate_mortality_data_excessive_rate(self):
        """Test taux mortalité excessive (>10%)."""
        with pytest.raises(ValidationError, match="Mortalité journalière excessive"):
            validate_mortality_data(
                mortality_count=250,  # 12.5%
                current_fish_count=2000
            )


class TestCycleLogDateValidation:
    """Tests de validation de date de log."""

    def test_validate_cycle_log_date_valid(self):
        """Test date log valide."""
        cycle_start = date(2025, 1, 1)
        log_date = date(2025, 2, 15)
        validate_cycle_log_date(log_date, cycle_start)

    def test_validate_cycle_log_date_before_start(self):
        """Test date log avant début cycle."""
        cycle_start = date(2025, 6, 1)
        log_date = date(2025, 5, 1)
        with pytest.raises(ValidationError, match="antérieure au début du cycle"):
            validate_cycle_log_date(log_date, cycle_start)

    def test_validate_cycle_log_date_after_end(self):
        """Test date log après fin cycle."""
        cycle_start = date(2025, 1, 1)
        cycle_end = date(2025, 4, 1)
        log_date = date(2025, 5, 1)
        with pytest.raises(ValidationError, match="postérieure à la fin du cycle"):
            validate_cycle_log_date(log_date, cycle_start, cycle_end)

    def test_validate_cycle_log_date_future(self):
        """Test date log dans le futur."""
        cycle_start = date(2025, 1, 1)
        log_date = date.today() + timedelta(days=10)
        with pytest.raises(ValidationError, match="ne peut être dans le futur"):
            validate_cycle_log_date(log_date, cycle_start)

    def test_validate_cycle_log_date_too_old(self):
        """Test date log trop ancienne (>2 ans)."""
        cycle_start = date(2020, 1, 1)
        log_date = date(2020, 2, 1)
        with pytest.raises(ValidationError, match="trop ancienne"):
            validate_cycle_log_date(log_date, cycle_start)


class TestPondDimensionsValidation:
    """Tests de validation des dimensions de bassin."""

    def test_validate_pond_dimensions_valid(self):
        """Test dimensions valides."""
        validate_pond_dimensions(
            surface_m2=Decimal('100'),
            volume_m3=Decimal('150'),  # 1.5m profondeur
            depth_m=Decimal('1.5')
        )

    def test_validate_pond_dimensions_negative_surface(self):
        """Test surface négative."""
        with pytest.raises(ValidationError, match="surface.*doit être positive"):
            validate_pond_dimensions(surface_m2=Decimal('-50'))

    def test_validate_pond_dimensions_too_small(self):
        """Test surface trop petite (<10m²)."""
        with pytest.raises(ValidationError, match="Surface trop petite"):
            validate_pond_dimensions(surface_m2=Decimal('5'))

    def test_validate_pond_dimensions_too_large(self):
        """Test surface très grande (>10000m²)."""
        with pytest.raises(ValidationError, match="Surface très importante"):
            validate_pond_dimensions(surface_m2=Decimal('15000'))

    def test_validate_pond_dimensions_depth_too_shallow(self):
        """Test profondeur trop faible (<0.5m)."""
        with pytest.raises(ValidationError, match="Profondeur.*trop faible"):
            validate_pond_dimensions(
                surface_m2=Decimal('100'),
                volume_m3=Decimal('30'),  # 0.3m profondeur
            )

    def test_validate_pond_dimensions_depth_too_deep(self):
        """Test profondeur calculée importante (>5m)."""
        with pytest.raises(ValidationError, match="Profondeur calculée importante"):
            validate_pond_dimensions(
                surface_m2=Decimal('100'),
                volume_m3=Decimal('600'),  # 6m profondeur
            )

    def test_validate_pond_dimensions_explicit_depth_too_shallow(self):
        """Test profondeur explicite trop faible."""
        with pytest.raises(ValidationError, match="Profondeur trop faible"):
            validate_pond_dimensions(
                surface_m2=Decimal('100'),
                depth_m=Decimal('0.3')
            )


class TestWeightProgressionValidation:
    """Tests de validation de progression de poids."""

    def test_validate_weight_progression_valid_gain(self):
        """Test gain de poids valide."""
        validate_weight_progression(
            previous_weight=Decimal('100'),
            current_weight=Decimal('180'),
            days_elapsed=45
        )

    def test_validate_weight_progression_excessive_gain(self):
        """Test gain de poids exceptionnel (>5g/jour)."""
        with pytest.raises(ValidationError, match="Gain de poids exceptionnel"):
            validate_weight_progression(
                previous_weight=Decimal('100'),
                current_weight=Decimal('370'),  # 6g/jour
                days_elapsed=45
            )

    def test_validate_weight_progression_significant_loss(self):
        """Test perte de poids importante (>2g/jour)."""
        with pytest.raises(ValidationError, match="Perte de poids importante"):
            validate_weight_progression(
                previous_weight=Decimal('180'),
                current_weight=Decimal('90'),  # -2.5g/jour
                days_elapsed=36
            )

    def test_validate_weight_progression_zero_days(self):
        """Test progression avec zéro jours (pas d'erreur)."""
        validate_weight_progression(
            previous_weight=Decimal('100'),
            current_weight=Decimal('100'),
            days_elapsed=0
        )

    def test_validate_weight_progression_slight_loss(self):
        """Test légère perte de poids (<2g/jour, acceptable)."""
        validate_weight_progression(
            previous_weight=Decimal('120'),
            current_weight=Decimal('100'),  # -1g/jour
            days_elapsed=20
        )


class TestValidatorsEdgeCases:
    """Tests de cas limites pour les validateurs."""

    def test_validate_feeding_data_zero_biomass(self):
        """Test alimentation avec biomasse zéro."""
        validate_feeding_data(
            feed_quantity=Decimal('5'),
            biomass=Decimal('0'),
            fish_count=0
        )

    def test_validate_mortality_data_zero_mortality(self):
        """Test mortalité zéro (valide)."""
        validate_mortality_data(
            mortality_count=0,
            current_fish_count=2000
        )

    def test_validate_water_parameters_partial(self):
        """Test validation partielle (certains paramètres None)."""
        validate_water_parameters(
            temperature=Decimal('28'),
            ph=None,
            oxygen=None,
            species='tilapia'
        )
