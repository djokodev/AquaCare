"""
Tests unitaires pour AnnualSimulationService.

Teste la logique métier pure (sans HTTP) :
- Calcul frais AquaCare (20 FCFA/kg)
- Structure du résultat
- Valeurs par défaut par espèce
- Décomposition par cycle (breakdown)
- Cas limites

Ces tests complètent les tests d'intégration (test_api_endpoints.py::TestAnnualSimulationView)
en vérifiant les calculs à la source, indépendamment du transport HTTP.
"""
from datetime import date

import pytest
from accounts.services.annual_simulation_service import (
    AQUACARE_FEE_PER_KG,
    AnnualSimulationService,
)


@pytest.mark.django_db
class TestAnnualSimulationServiceStructure:
    """Vérifie que la structure du résultat est complète et stable."""

    REQUIRED_KEYS = {
        'species',
        'num_cycles',
        'annual_production_target_kg',
        'cycles_per_year_derived',
        'technical_pause_days',
        'other_costs_rate_pct',
        'annual_revenue_fcfa',
        'annual_feed_cost_fcfa',
        'annual_fingerlings_cost_fcfa',
        'annual_other_costs_fcfa',
        'annual_total_cost_fcfa',
        'aquacare_fee_fcfa',
        'annual_net_profit_fcfa',
        'annual_roi_pct',
        'cycle_production_kg',
        'cycle_revenue_fcfa',
        'cycle_feed_cost_fcfa',
        'cycle_fingerlings_cost_fcfa',
        'cycle_other_costs_fcfa',
        'cycle_aquacare_fee_fcfa',
        'cycle_total_cost_fcfa',
        'cycle_net_profit_fcfa',
        'cycle_roi_pct',
        'annual_projection_production_kg',
        'annual_projection_revenue_fcfa',
        'annual_projection_net_profit_fcfa',
        'annual_projection_aquacare_fee_fcfa',
        'production_per_cycle_kg',
        'cycle_duration_days',
        'feed_bags_per_cycle',
        'initial_fish_count_per_cycle',
        'cycles_breakdown',
    }

    def test_result_contains_all_required_keys(self):
        """Le résultat doit exposer tous les champs documentés."""
        result = AnnualSimulationService.simulate(
            species='tilapia',
            annual_production_target_kg=1000,
            num_cycles=2,
        )
        assert self.REQUIRED_KEYS.issubset(result.keys())

    def test_cycle_first_defaults_are_exposed(self):
        """La simulation doit exposer les nouveaux champs cycle-first."""
        result = AnnualSimulationService.simulate(
            species='clarias',
            annual_production_target_kg=1000,
            num_cycles=2,
        )

        assert result['technical_pause_days'] == 14
        assert result['other_costs_rate_pct'] == 5.0
        assert result['cycles_per_year_derived'] == 2

    @pytest.mark.parametrize('num_cycles', [2, 3])
    def test_cycles_breakdown_length_matches_num_cycles(self, num_cycles):
        """Le nombre d'entrées dans cycles_breakdown = num_cycles."""
        result = AnnualSimulationService.simulate(
            species='tilapia',
            annual_production_target_kg=900,
            num_cycles=num_cycles,
        )
        assert len(result['cycles_breakdown']) == num_cycles

    @pytest.mark.parametrize('species', ['tilapia', 'clarias'])
    def test_species_normalized_in_result(self, species):
        """L'espèce retournée doit être normalisée."""
        result = AnnualSimulationService.simulate(
            species=species,
            annual_production_target_kg=500,
            num_cycles=2,
        )
        assert result['species'] == species


@pytest.mark.django_db
class TestAquacareFeeCalculation:
    """Vérifie que le tarif AquaCare (20 FCFA/kg) est calculé correctement."""

    @pytest.mark.parametrize('target_kg,expected_fee', [
        (500, 10_000),
        (1000, 20_000),
        (2000, 40_000),
        (100, 2_000),
    ])
    def test_aquacare_fee_is_exactly_20_fcfa_per_kg(self, target_kg, expected_fee):
        """aquacare_fee_fcfa = 20 × annual_production_target_kg, toujours."""
        result = AnnualSimulationService.simulate(
            species='tilapia',
            annual_production_target_kg=target_kg,
            num_cycles=2,
        )
        assert result['aquacare_fee_fcfa'] == expected_fee

    def test_aquacare_fee_constant_equals_20(self):
        """La constante AQUACARE_FEE_PER_KG ne doit pas être modifiée sans décision."""
        from decimal import Decimal
        assert AQUACARE_FEE_PER_KG == Decimal('20')


@pytest.mark.django_db
class TestProductionDistribution:
    """Vérifie la distribution de la production entre cycles."""

    def test_production_per_cycle_equals_target_divided_by_cycles(self):
        """production_per_cycle_kg = annual_target / num_cycles."""
        result = AnnualSimulationService.simulate(
            species='tilapia',
            annual_production_target_kg=1200,
            num_cycles=3,
        )
        assert result['production_per_cycle_kg'] == pytest.approx(400.0)

    def test_annual_target_matches_input(self):
        """La cible annuelle retournée doit correspondre à l'entrée."""
        result = AnnualSimulationService.simulate(
            species='clarias',
            annual_production_target_kg=750,
            num_cycles=2,
        )
        assert result['annual_production_target_kg'] == 750


@pytest.mark.django_db
class TestRevenueCalculation:
    """Vérifie les calculs de revenu avec prix personnalisés."""

    def test_revenue_with_custom_selling_price(self):
        """annual_revenue = annual_target × selling_price."""
        result = AnnualSimulationService.simulate(
            species='tilapia',
            annual_production_target_kg=1000,
            num_cycles=2,
            selling_price_per_kg_fcfa=2000,
        )
        assert result['annual_revenue_fcfa'] == pytest.approx(2_000_000)

    def test_other_costs_included_in_total(self):
        """L'override legacy des autres charges reste respecté."""
        result_no_costs = AnnualSimulationService.simulate(
            species='tilapia',
            annual_production_target_kg=500,
            num_cycles=2,
            other_costs_fcfa_per_year=0,
        )
        result_with_costs = AnnualSimulationService.simulate(
            species='tilapia',
            annual_production_target_kg=500,
            num_cycles=2,
            other_costs_fcfa_per_year=50_000,
        )
        assert result_no_costs['annual_other_costs_fcfa'] == pytest.approx(70_000)
        assert result_with_costs['annual_other_costs_fcfa'] == pytest.approx(50_000)
        assert result_with_costs['annual_total_cost_fcfa'] < result_no_costs['annual_total_cost_fcfa']


@pytest.mark.django_db
class TestCyclesBreakdownDates:
    """Vérifie la décomposition par cycle et les dates estimées."""

    def test_breakdown_cycle_nums_are_sequential(self):
        """Les numéros de cycles doivent être 1, 2 (ou 1, 2, 3)."""
        result = AnnualSimulationService.simulate(
            species='tilapia',
            annual_production_target_kg=600,
            num_cycles=3,
        )
        cycle_nums = [c['cycle_num'] for c in result['cycles_breakdown']]
        assert cycle_nums == [1, 2, 3]

    def test_breakdown_start_date_used_for_first_cycle(self):
        """La date de démarrage fournie s'applique au premier cycle."""
        start = date(2026, 4, 1)
        result = AnnualSimulationService.simulate(
            species='tilapia',
            annual_production_target_kg=500,
            num_cycles=2,
            start_date=start,
        )
        assert result['cycles_breakdown'][0]['start_date_estimate'] == '2026-04-01'

    def test_second_cycle_starts_after_first_ends(self):
        """Le 2ème cycle commence après la fin du 1er (+ pause inter-cycle)."""
        start = date(2026, 4, 1)
        result = AnnualSimulationService.simulate(
            species='tilapia',
            annual_production_target_kg=600,
            num_cycles=2,
            start_date=start,
        )
        first_end = date.fromisoformat(result['cycles_breakdown'][0]['end_date_estimate'])
        second_start = date.fromisoformat(result['cycles_breakdown'][1]['start_date_estimate'])
        assert second_start > first_end


@pytest.mark.django_db
class TestSpeciesDefaults:
    """Vérifie que les defaults par espèce sont cohérents."""

    def test_tilapia_cycle_duration_is_180_days(self):
        """Tilapia : durée de cycle validée DT = 180 jours."""
        result = AnnualSimulationService.simulate(
            species='tilapia',
            annual_production_target_kg=500,
            num_cycles=2,
        )
        assert result['cycle_duration_days'] == 180

    def test_clarias_cycle_duration_is_120_days(self):
        """Clarias (silure) : durée de cycle validée DT = 120 jours."""
        result = AnnualSimulationService.simulate(
            species='clarias',
            annual_production_target_kg=500,
            num_cycles=2,
        )
        assert result['cycle_duration_days'] == 120

    def test_unknown_species_falls_back_to_tilapia(self):
        """Espèce inconnue → fallback tilapia (durée 180 jours)."""
        result = AnnualSimulationService.simulate(
            species='carpe',
            annual_production_target_kg=300,
            num_cycles=2,
        )
        assert result['cycle_duration_days'] == 180
        assert result['species'] == 'tilapia'
