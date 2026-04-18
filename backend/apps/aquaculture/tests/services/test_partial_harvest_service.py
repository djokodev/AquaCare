"""
Tests unitaires pour la fonctionnalité de récolte partielle.

Couvre :
- Récolte partielle réussie (décrement count, création record)
- Récoltes partielles multiples cumulatives
- Déduplication offline via client_uuid
- Validations métier (effectif, poids, statut, date)
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from aquaculture.domain.exceptions import (
    CycleNotActiveError,
    InsufficientFishCountError,
    InvalidHarvestDataError,
)
from aquaculture.models import PartialHarvest
from aquaculture.services import ProductionCycleService

from tests.fixtures.factories import FarmProfileFactory


@pytest.mark.django_db
class TestPartialHarvestService:
    """Tests du service de récolte partielle."""

    def test_partial_harvest_decrements_current_count(self):
        """Le current_count du cycle diminue du nombre récolté."""
        cycle = self._create_test_cycle()
        initial_count = cycle.current_count

        updated_cycle, partial = ProductionCycleService.partial_harvest_cycle(
            cycle=cycle,
            harvest_date=date.today(),
            count_harvested=50,
            average_weight_g=Decimal('350.00'),
        )

        assert updated_cycle.current_count == initial_count - 50
        assert updated_cycle.status == 'active'

    def test_partial_harvest_creates_record(self):
        """Un enregistrement PartialHarvest est créé avec les bonnes valeurs."""
        cycle = self._create_test_cycle()

        updated_cycle, partial = ProductionCycleService.partial_harvest_cycle(
            cycle=cycle,
            harvest_date=date.today(),
            count_harvested=100,
            average_weight_g=Decimal('400.00'),
            sale_price_fcfa_per_kg=Decimal('1800.00'),
            notes='Première vente client Douala',
        )

        assert partial.cycle == updated_cycle
        assert partial.count_harvested == 100
        assert partial.average_weight_g == Decimal('400.00')
        assert partial.sale_price_fcfa_per_kg == Decimal('1800.00')
        assert partial.notes == 'Première vente client Douala'
        # total_weight_kg = 100 * 400 / 1000 = 40 kg
        assert partial.total_weight_kg == Decimal('40.000')

    def test_partial_harvest_recalculates_biomass(self):
        """La biomasse courante est recalculée après récolte partielle."""
        cycle = self._create_test_cycle()
        # cycle: 5000 poissons, poids moyen 15g → biomasse = 75 kg
        # On récolte 200 poissons à 350g (clarias mature)
        # Nouvelle biomasse = (5000-200) * 15 / 1000 = 72 kg

        updated_cycle, _ = ProductionCycleService.partial_harvest_cycle(
            cycle=cycle,
            harvest_date=date.today(),
            count_harvested=200,
            average_weight_g=Decimal('350.00'),
        )

        expected_biomass = Decimal('4800') * cycle.current_average_weight / Decimal('1000')
        assert updated_cycle.current_biomass == expected_biomass

    def test_multiple_partial_harvests_cumulate(self):
        """Plusieurs récoltes partielles diminuent le count cumulativement."""
        cycle = self._create_test_cycle()
        initial_count = cycle.current_count  # 5000

        # Première récolte : 100 poissons
        cycle, _ = ProductionCycleService.partial_harvest_cycle(
            cycle=cycle,
            harvest_date=date.today(),
            count_harvested=100,
            average_weight_g=Decimal('300.00'),
        )
        assert cycle.current_count == initial_count - 100

        # Deuxième récolte : 50 poissons
        cycle.refresh_from_db()
        cycle, _ = ProductionCycleService.partial_harvest_cycle(
            cycle=cycle,
            harvest_date=date.today(),
            count_harvested=50,
            average_weight_g=Decimal('310.00'),
        )
        assert cycle.current_count == initial_count - 150

        # Vérifier 2 enregistrements créés
        assert PartialHarvest.objects.filter(cycle=cycle).count() == 2

    def test_partial_harvest_fails_if_cycle_not_active(self):
        """Récolte partielle impossible sur un cycle récolté ou planifié."""
        cycle = self._create_test_cycle()
        cycle.status = 'harvested'
        cycle.save()

        with pytest.raises(CycleNotActiveError):
            ProductionCycleService.partial_harvest_cycle(
                cycle=cycle,
                harvest_date=date.today(),
                count_harvested=50,
                average_weight_g=Decimal('300.00'),
            )

    def test_partial_harvest_fails_if_count_exceeds_current(self):
        """Impossible de récolter plus que l'effectif disponible."""
        cycle = self._create_test_cycle()

        with pytest.raises(InsufficientFishCountError) as exc_info:
            ProductionCycleService.partial_harvest_cycle(
                cycle=cycle,
                harvest_date=date.today(),
                count_harvested=cycle.current_count + 1,
                average_weight_g=Decimal('300.00'),
            )

        assert "supérieur à l'effectif disponible" in str(exc_info.value)

    def test_partial_harvest_fails_below_minimum_weight_clarias(self):
        """Poids minimum commercial clarias : 250g."""
        cycle = self._create_test_cycle()

        with pytest.raises(InvalidHarvestDataError) as exc_info:
            ProductionCycleService.partial_harvest_cycle(
                cycle=cycle,
                harvest_date=date.today(),
                count_harvested=50,
                average_weight_g=Decimal('200.00'),  # < 250g pour clarias
            )

        assert "minimum commercial" in str(exc_info.value)

    def test_partial_harvest_fails_below_minimum_weight_tilapia(self):
        """Poids minimum commercial tilapia : 200g."""
        cycle = self._create_test_cycle(species='tilapia')

        with pytest.raises(InvalidHarvestDataError) as exc_info:
            ProductionCycleService.partial_harvest_cycle(
                cycle=cycle,
                harvest_date=date.today(),
                count_harvested=50,
                average_weight_g=Decimal('150.00'),  # < 200g pour tilapia
            )

        assert "minimum commercial" in str(exc_info.value)

    def test_partial_harvest_deduplication_via_client_uuid(self):
        """Un client_uuid déjà enregistré retourne l'existant sans doublon."""
        import uuid
        cycle = self._create_test_cycle()
        client_uuid = uuid.uuid4()

        # Première création
        _, partial1 = ProductionCycleService.partial_harvest_cycle(
            cycle=cycle,
            harvest_date=date.today(),
            count_harvested=50,
            average_weight_g=Decimal('300.00'),
            client_uuid=client_uuid,
        )

        count_before = cycle.current_count
        cycle.refresh_from_db()

        # Deuxième appel avec même UUID → retourne l'existant, pas de doublon
        _, partial2 = ProductionCycleService.partial_harvest_cycle(
            cycle=cycle,
            harvest_date=date.today(),
            count_harvested=50,
            average_weight_g=Decimal('300.00'),
            client_uuid=client_uuid,
        )

        assert partial1.id == partial2.id
        assert PartialHarvest.objects.filter(client_uuid=client_uuid).count() == 1
        # Le count ne doit pas avoir été décrémenté une deuxième fois
        cycle.refresh_from_db()
        assert cycle.current_count == count_before

    def test_partial_harvest_fails_with_date_before_start(self):
        """La date de récolte partielle ne peut être avant le début du cycle."""
        cycle = self._create_test_cycle()

        with pytest.raises(InvalidHarvestDataError):
            ProductionCycleService.partial_harvest_cycle(
                cycle=cycle,
                harvest_date=cycle.start_date - timedelta(days=1),
                count_harvested=50,
                average_weight_g=Decimal('300.00'),
            )

    def test_cycle_remains_active_after_partial_harvest(self):
        """Le cycle reste actif après une récolte partielle."""
        cycle = self._create_test_cycle()

        updated_cycle, _ = ProductionCycleService.partial_harvest_cycle(
            cycle=cycle,
            harvest_date=date.today(),
            count_harvested=100,
            average_weight_g=Decimal('350.00'),
        )

        updated_cycle.refresh_from_db()
        assert updated_cycle.status == 'active'
        assert updated_cycle.end_date is None

    # =================== HELPER ===================

    def _create_test_cycle(self, species='clarias'):
        """Helper : crée un cycle actif de test."""
        farm_profile = FarmProfileFactory()
        cycle_data = {
            'cycle_name': f'Test Cycle {species.capitalize()} Partial',
            'species': species,
            'pond_identifier': 'Bassin Test',
            'pond_surface_m2': Decimal('500.00'),
            'pond_volume_m3': Decimal('600.00'),
            'start_date': date.today() - timedelta(days=90),
            'initial_count': 5000,
            'initial_average_weight': Decimal('15.00'),
        }
        return ProductionCycleService.create_cycle(farm_profile, cycle_data)
