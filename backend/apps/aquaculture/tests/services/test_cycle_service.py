"""
Tests unitaires pour ProductionCycleService.

Couvre :
- Création de cycles avec validations
- Récolte avec calculs métriques
- Recalcul complet des métriques
- Validation règles métier
- Gestion d'erreurs
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from aquaculture.domain.exceptions import (
    BusinessRuleViolation,
    CycleAlreadyHarvestedError,
    InvalidDensityError,
    InvalidHarvestDataError,
)
from aquaculture.models import CycleLog
from aquaculture.services import ProductionCycleService

from tests.fixtures.factories import FarmProfileFactory


@pytest.mark.django_db
class TestProductionCycleService:
    """Tests du service de gestion des cycles de production."""

    def test_create_cycle_calculates_initial_biomass(self):
        """Vérifie que la biomasse initiale est calculée correctement."""
        farm_profile = FarmProfileFactory()

        cycle_data = {
            'cycle_name': 'Test Cycle Tilapia',
            'species': 'tilapia',
            'pond_identifier': 'Bassin A1',
            'pond_surface_m2': Decimal('500.00'),
            'pond_volume_m3': Decimal('600.00'),
            'start_date': date.today(),
            'initial_count': 5000,
            'initial_average_weight': Decimal('15.50'),
        }

        cycle = ProductionCycleService.create_cycle(farm_profile, cycle_data)

        # Biomasse = (count * weight_g) / 1000 = (5000 * 15.5) / 1000 = 77.5 kg
        assert cycle.initial_biomass == Decimal('77.50')
        assert cycle.current_biomass == Decimal('77.50')
        assert cycle.current_count == 5000
        assert cycle.current_average_weight == Decimal('15.50')
        assert cycle.status == 'active'
        assert cycle.total_feed_consumed == Decimal('0')

    def test_create_cycle_validates_max_density_tilapia(self):
        """Vérifie que la densité maximale en bassin est respectée."""
        farm_profile = FarmProfileFactory()

        cycle_data = {
            'cycle_name': 'Test Overcrowded Tilapia',
            'species': 'tilapia',
            'pond_identifier': 'Bassin B',
            'pond_surface_m2': Decimal('100.00'),  # Petit bassin
            'pond_volume_m3': Decimal('120.00'),
            'start_date': date.today(),
            'initial_count': 35000,  # 350 poissons/m² (> 10 max en bassin)
            'initial_average_weight': Decimal('10.00'),
        }

        with pytest.raises(InvalidDensityError) as exc_info:
            ProductionCycleService.create_cycle(farm_profile, cycle_data)

        assert "Densité initiale trop élevée" in str(exc_info.value)
        assert "350" in str(exc_info.value)  # Densité calculée
        assert "10" in str(exc_info.value)  # Max autorisé en bassin

    def test_create_cycle_validates_max_density_clarias(self):
        """Vérifie que la densité maximale en bassin est respectée."""
        farm_profile = FarmProfileFactory()

        cycle_data = {
            'cycle_name': 'Test Overcrowded Clarias',
            'species': 'clarias',
            'pond_identifier': 'Bassin C',
            'pond_surface_m2': Decimal('100.00'),
            'start_date': date.today(),
            'initial_count': 60000,  # 600 poissons/m² (> 10 max en bassin)
            'initial_average_weight': Decimal('8.00'),
        }

        with pytest.raises(InvalidDensityError) as exc_info:
            ProductionCycleService.create_cycle(farm_profile, cycle_data)

        assert "Densité initiale trop élevée" in str(exc_info.value)
        assert "10" in str(exc_info.value)  # Max autorisé en bassin

    def test_create_cycle_validates_max_volume_density_tilapia(self):
        """Vérifie que la densité maximale en volume est respectée."""
        farm_profile = FarmProfileFactory()

        cycle_data = {
            'cycle_name': 'Test Overcrowded Volume Tilapia',
            'species': 'tilapia',
            'pond_identifier': 'Cage A',
            'infrastructure_type': 'bac_hors_sol',
            'pond_volume_m3': Decimal('15.00'),
            'start_date': date.today(),
            'initial_count': 9000,  # 600 poissons/m³ (> 300 max)
            'initial_average_weight': Decimal('10.00'),
        }

        with pytest.raises(InvalidDensityError) as exc_info:
            ProductionCycleService.create_cycle(farm_profile, cycle_data)

        assert "Densité initiale trop élevée" in str(exc_info.value)
        assert "300" in str(exc_info.value)

    def test_create_cycle_validates_volume_density_boundary_passes(self):
        """Vérifie que 300 poissons/m³ est accepté."""
        farm_profile = FarmProfileFactory()

        cycle_data = {
            'cycle_name': 'Test Volume Boundary',
            'species': 'clarias',
            'pond_identifier': 'Cage B',
            'infrastructure_type': 'cage_flottante',
            'pond_volume_m3': Decimal('15.00'),
            'start_date': date.today(),
            'initial_count': 4500,  # 300 poissons/m³, limite autorisée
            'initial_average_weight': Decimal('10.00'),
        }

        cycle = ProductionCycleService.create_cycle(farm_profile, cycle_data)

        assert cycle.initial_count == 4500

    def test_create_cycle_validates_volume_density_just_above_boundary(self):
        """Vérifie que 301 poissons/m³ est refusé."""
        farm_profile = FarmProfileFactory()

        cycle_data = {
            'cycle_name': 'Test Volume Boundary Fail',
            'species': 'clarias',
            'pond_identifier': 'Cage C',
            'infrastructure_type': 'cage_flottante',
            'pond_volume_m3': Decimal('15.00'),
            'start_date': date.today(),
            'initial_count': 4501,  # 300.07 poissons/m³
            'initial_average_weight': Decimal('10.00'),
        }

        with pytest.raises(InvalidDensityError):
            ProductionCycleService.create_cycle(farm_profile, cycle_data)

    def test_create_cycle_validates_minimum_weight(self):
        """Vérifie que le poids minimum initial est respecté."""
        farm_profile = FarmProfileFactory()

        cycle_data = {
            'cycle_name': 'Test Low Weight',
            'species': 'tilapia',
            'pond_identifier': 'Bassin D',
            'pond_surface_m2': Decimal('200.00'),
            'start_date': date.today(),
            'initial_count': 1000,
            'initial_average_weight': Decimal('0.3'),  # < 0.5g minimum tilapia
        }

        with pytest.raises(BusinessRuleViolation) as exc_info:
            ProductionCycleService.create_cycle(farm_profile, cycle_data)

        assert "Poids initial trop faible" in str(exc_info.value)

    def test_harvest_cycle_calculates_final_metrics(self):
        """Vérifie que les métriques finales sont calculées lors de la récolte."""
        cycle = self._create_test_cycle()

        # Simuler consommation aliment
        cycle.total_feed_consumed = Decimal('150.00')
        cycle.save()

        harvested = ProductionCycleService.harvest_cycle(
            cycle=cycle,
            harvest_date=date.today(),
            final_count=4850,  # 97% survie
            final_average_weight=Decimal('285.00'),
            harvest_notes='Excellente croissance'
        )

        # Vérifier métriques
        assert harvested.status == 'harvested'
        assert harvested.end_date == date.today()
        assert harvested.final_count == 4850
        assert harvested.final_average_weight == Decimal('285.00')

        # Vérifier taux de survie : (4850 / 5000) * 100 = 97%
        assert harvested.survival_rate == Decimal('97.00')

        # Vérifier biomasse finale : (4850 * 285) / 1000 = 1382.25 kg
        assert harvested.final_biomass == Decimal('1382.25')

        # Vérifier FCR calculé
        assert harvested.fcr is not None
        # FCR = feed / weight_gain = 150 / (1382.25 - 75) ≈ 0.11
        assert harvested.fcr > 0

    def test_harvest_cycle_raises_error_if_already_harvested(self):
        """Vérifie qu'on ne peut pas récolter un cycle déjà finalisé."""
        cycle = self._create_test_cycle()
        cycle.status = 'harvested'
        cycle.end_date = date.today() - timedelta(days=10)
        cycle.save()

        with pytest.raises(CycleAlreadyHarvestedError) as exc_info:
            ProductionCycleService.harvest_cycle(
                cycle=cycle,
                harvest_date=date.today(),
                final_count=4850,
                final_average_weight=Decimal('285.00'),
            )

        assert "déjà été récolté" in str(exc_info.value)

    def test_harvest_cycle_validates_date_after_start(self):
        """Vérifie que la date de récolte doit être après la date de début."""
        cycle = self._create_test_cycle()

        invalid_date = cycle.start_date - timedelta(days=10)

        with pytest.raises(InvalidHarvestDataError) as exc_info:
            ProductionCycleService.harvest_cycle(
                cycle=cycle,
                harvest_date=invalid_date,
                final_count=4850,
                final_average_weight=Decimal('285.00'),
            )

        assert "ne peut être avant le début du cycle" in str(exc_info.value)

    def test_harvest_cycle_validates_final_count_not_exceeds_current(self):
        """Vérifie que l'effectif final ne peut dépasser l'effectif actuel."""
        cycle = self._create_test_cycle()
        cycle.current_count = 4500  # Mortalités antérieures
        cycle.save()

        with pytest.raises(InvalidHarvestDataError) as exc_info:
            ProductionCycleService.harvest_cycle(
                cycle=cycle,
                harvest_date=date.today(),
                final_count=4800,  # > 4500 actuel
                final_average_weight=Decimal('285.00'),
            )

        assert "ne peut dépasser l'effectif actuel" in str(exc_info.value)

    def test_harvest_cycle_validates_minimum_commercial_weight(self):
        """Vérifie que le poids final respecte le minimum commercial."""
        cycle = self._create_test_cycle()

        with pytest.raises(InvalidHarvestDataError) as exc_info:
            ProductionCycleService.harvest_cycle(
                cycle=cycle,
                harvest_date=date.today(),
                final_count=4850,
                final_average_weight=Decimal('150.00'),  # < 250g minimum clarias
            )

        assert "inférieur au minimum commercial" in str(exc_info.value)

    def test_recalculate_all_metrics_from_logs(self):
        """Vérifie que le recalcul complet des métriques fonctionne."""
        cycle = self._create_test_cycle()

        # Créer plusieurs logs
        CycleLog.objects.create(
            cycle=cycle,
            log_date=cycle.start_date + timedelta(days=10),
            mortality_count=50,
            average_weight=Decimal('25.00'),
            feed_quantity=Decimal('10.00'),
        )

        CycleLog.objects.create(
            cycle=cycle,
            log_date=cycle.start_date + timedelta(days=20),
            mortality_count=30,
            average_weight=Decimal('45.00'),
            feed_quantity=Decimal('15.00'),
        )

        CycleLog.objects.create(
            cycle=cycle,
            log_date=cycle.start_date + timedelta(days=30),
            average_weight=Decimal('75.00'),
            feed_quantity=Decimal('20.00'),
        )

        # Recalculer métriques
        updated_cycle = ProductionCycleService.recalculate_all_metrics(cycle)

        # Vérifier mortalité cumulée : 50 + 30 = 80
        assert updated_cycle.current_count == 5000 - 80

        # Vérifier poids moyen (dernier enregistré)
        assert updated_cycle.current_average_weight == Decimal('75.00')

        # Vérifier aliment cumulé
        assert updated_cycle.total_feed_consumed == Decimal('45.00')

        # Vérifier biomasse recalculée
        # (4920 * 75) / 1000 = 369 kg
        assert updated_cycle.current_biomass == Decimal('369.00')

        # Vérifier taux de survie
        # (4920 / 5000) * 100 = 98.4%
        assert updated_cycle.survival_rate == Decimal('98.40')

    def test_recalculate_handles_no_logs(self):
        """Vérifie que le recalcul fonctionne sans logs."""
        cycle = self._create_test_cycle()

        updated_cycle = ProductionCycleService.recalculate_all_metrics(cycle)

        # Doit retourner aux valeurs initiales
        assert updated_cycle.current_count == cycle.initial_count
        assert updated_cycle.current_average_weight == cycle.initial_average_weight
        assert updated_cycle.current_biomass == cycle.initial_biomass
        assert updated_cycle.total_feed_consumed == Decimal('0')

    def test_update_current_metrics_after_log(self):
        """Vérifie la mise à jour optimiste après ajout d'un log via signal."""
        cycle = self._create_test_cycle()

        # Créer un log - le signal post_save va automatiquement appeler le service
        CycleLog.objects.create(
            cycle=cycle,
            log_date=cycle.start_date + timedelta(days=15),
            mortality_count=100,
            average_weight=Decimal('30.00'),
            feed_quantity=Decimal('12.50'),
        )

        # Recharger le cycle depuis la DB pour voir les changements du signal
        cycle.refresh_from_db()

        # Vérifier mortalité appliquée
        assert cycle.current_count == 4900

        # Vérifier poids mis à jour
        assert cycle.current_average_weight == Decimal('30.00')

        # Vérifier aliment ajouté
        assert cycle.total_feed_consumed == Decimal('12.50')

        # Vérifier biomasse recalculée
        # (4900 * 30) / 1000 = 147 kg
        assert cycle.current_biomass == Decimal('147.00')

    def test_create_cycle_allows_valid_density(self):
        """Vérifie qu'une densité valide passe la validation."""
        farm_profile = FarmProfileFactory()

        cycle_data = {
            'cycle_name': 'Test Valid Density',
            'species': 'tilapia',
            'pond_identifier': 'Bassin Valid',
            'pond_surface_m2': Decimal('1000.00'),
            'start_date': date.today(),
            'initial_count': 10000,  # 10 poissons/m² (max en bassin)
            'initial_average_weight': Decimal('12.00'),
        }

        cycle = ProductionCycleService.create_cycle(farm_profile, cycle_data)

        assert cycle is not None
        assert cycle.status == 'active'

    # =================== HELPERS ===================

    def _create_test_cycle(self):
        """Helper pour créer un cycle de test."""
        farm_profile = FarmProfileFactory()
        cycle_data = {
            'cycle_name': 'Test Cycle Clarias',
            'species': 'clarias',
            'pond_identifier': 'Bassin Test',
            'pond_surface_m2': Decimal('500.00'),
            'pond_volume_m3': Decimal('600.00'),
            'start_date': date.today() - timedelta(days=60),
            'initial_count': 5000,
            'initial_average_weight': Decimal('15.00'),
        }
        return ProductionCycleService.create_cycle(farm_profile, cycle_data)
