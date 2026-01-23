"""
Tests unitaires pour CycleSimulationService.
Coverage: Simulation prédictive de cycles aquacoles.
"""
import pytest
from decimal import Decimal

from apps.commerce.services import CycleSimulationService
from commerce.models import Product


@pytest.mark.django_db
class TestCycleSimulationService:
    """Tests pour CycleSimulationService."""

    @pytest.fixture
    def tilapia_products(self):
        """Créer produits tilapia pour tests."""
        Product.objects.create(
            name="ALLER AQUA TILAPIA 2MM 20KG",
            brand="aller_aqua",
            species="tilapia",
            phase="alevinage",
            pellet_size_mm=Decimal("2.0"),
            protein_percentage=Decimal("45.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("30000.00")
        )
        Product.objects.create(
            name="ALLER AQUA TILAPIA 3MM 20KG",
            brand="aller_aqua",
            species="tilapia",
            phase="pre_grossissement",
            pellet_size_mm=Decimal("3.0"),
            protein_percentage=Decimal("32.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("28000.00")
        )
        Product.objects.create(
            name="ALLER AQUA TILAPIA 4.5MM 20KG",
            brand="aller_aqua",
            species="tilapia",
            phase="grossissement",
            pellet_size_mm=Decimal("4.5"),
            protein_percentage=Decimal("30.0"),
            lipid_percentage=10,
            package_weight_kg=Decimal("20.0"),
            price_per_package=Decimal("27000.00")
        )

    def test_simulate_cycle_basic(self, tilapia_products):
        """Test simulation basique avec paramètres par défaut."""
        result = CycleSimulationService.simulate_cycle(
            species='tilapia',
            initial_fish_count=1000
        )

        # Vérifier structure réponse
        assert result['simulation_type'] == 'predictive'
        assert 'parameters' in result
        assert 'feeding_phases' in result
        assert 'summary' in result

        # Vérifier paramètres
        params = result['parameters']
        assert params['species'] == 'tilapia'
        assert params['initial_fish_count'] == 1000
        assert params['initial_weight_g'] == 5.0  # Défaut
        assert params['target_weight_g'] == 300.0  # Défaut tilapia
        assert params['cycle_duration_days'] == 120  # Défaut tilapia
        assert params['survival_rate'] == 0.85  # Défaut

        # Vérifier phases (tilapia = 3 phases)
        assert len(result['feeding_phases']) == 3

        # Vérifier summary
        summary = result['summary']
        assert 'total_feed_kg' in summary
        assert 'total_cost_fcfa' in summary
        assert 'estimated_fcr' in summary
        assert 'estimated_revenue_fcfa' in summary
        assert 'estimated_profit_fcfa' in summary
        assert summary['initial_fish_count'] == 1000
        assert summary['estimated_final_count'] == 850  # 1000 × 0.85

    def test_simulate_cycle_custom_params(self, tilapia_products):
        """Test simulation avec paramètres personnalisés."""
        result = CycleSimulationService.simulate_cycle(
            species='tilapia',
            initial_fish_count=500,
            initial_weight_g=10.0,
            target_weight_g=250.0,
            cycle_duration_days=90,
            survival_rate=0.90
        )

        params = result['parameters']
        assert params['initial_fish_count'] == 500
        assert params['initial_weight_g'] == 10.0
        assert params['target_weight_g'] == 250.0
        assert params['cycle_duration_days'] == 90
        assert params['survival_rate'] == 0.90

        summary = result['summary']
        assert summary['estimated_final_count'] == 450  # 500 × 0.90

    def test_simulate_cycle_multi_granulometry(self, tilapia_products):
        """Test que la simulation suggère plusieurs granulométries."""
        result = CycleSimulationService.simulate_cycle(
            species='tilapia',
            initial_fish_count=1000
        )

        phases = result['feeding_phases']

        # Tilapia : doit avoir 3 phases (2mm, 3mm, 4.5mm)
        assert len(phases) == 3

        # Vérifier progression granulométrie
        pellet_sizes = [phase['pellet_size_mm'] for phase in phases]
        assert 2.0 in pellet_sizes  # Alevinage
        assert 3.0 in pellet_sizes  # Pré-grossissement
        assert 4.5 in pellet_sizes  # Grossissement

        # Vérifier que chaque phase a des produits
        for phase in phases:
            assert 'products' in phase
            assert len(phase['products']) > 0
            assert phase['total_price'] > 0
            # total_consumption_kg est un Decimal
            assert phase['total_consumption_kg'] > 0

    def test_simulate_cycle_cost_calculation(self, tilapia_products):
        """Test calcul des coûts."""
        result = CycleSimulationService.simulate_cycle(
            species='tilapia',
            initial_fish_count=1000
        )

        summary = result['summary']

        # Vérifier que coût > 0
        assert summary['total_cost_fcfa'] > 0

        # Vérifier que revenu > coût (profitable)
        assert summary['estimated_revenue_fcfa'] > summary['total_cost_fcfa']

        # Vérifier profit cohérent
        expected_profit = summary['estimated_revenue_fcfa'] - summary['total_cost_fcfa']
        assert abs(summary['estimated_profit_fcfa'] - expected_profit) < 1  # Tolérance arrondi

        # Vérifier ROI > 0
        assert summary['roi_percentage'] > 0

    def test_simulate_cycle_fcr_realistic(self, tilapia_products):
        """Test que le FCR est réaliste."""
        result = CycleSimulationService.simulate_cycle(
            species='tilapia',
            initial_fish_count=1000
        )

        fcr = result['summary']['estimated_fcr']

        # FCR tilapia doit être positif et raisonnable (< 3.0)
        # Note : La simulation peut donner des FCR très optimistes car basée sur formules théoriques
        assert fcr > 0
        assert fcr < 3.0
