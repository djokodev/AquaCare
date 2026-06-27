"""Tests unitaires pour AnnualSimulationService côté aquaculture."""

from __future__ import annotations

import pytest
from aquaculture.services.annual_simulation_service import AnnualSimulationService


@pytest.mark.django_db
class TestAnnualSimulationServiceCycleFirstMetrics:
    """Vérifie les nouveaux champs cycle-first exposés par la simulation."""

    @pytest.mark.parametrize(
        (
            "species, expected_cycles, expected_cycle_revenue, "
            "expected_cycle_other_costs, expected_cycle_aquacare_fee, "
            "expected_annual_other_costs"
        ),
        [
            ("clarias", 2, 1_000_000, 50_000, 10_000, 100_000),
            ("tilapia", 1, 1_400_000, 70_000, 10_000, 140_000),
        ],
    )
    def test_cycle_first_metrics_and_annual_projection(
        self,
        species,
        expected_cycles,
        expected_cycle_revenue,
        expected_cycle_other_costs,
        expected_cycle_aquacare_fee,
        expected_annual_other_costs,
    ):
        result = AnnualSimulationService.simulate(
            species=species,
            annual_production_target_kg=1000,
            num_cycles=2,
        )

        assert result["technical_pause_days"] == 14
        assert result["other_costs_rate_pct"] == 5.0
        assert result["cycles_per_year_derived"] == expected_cycles
        assert result["cycle_production_kg"] == pytest.approx(500.0)
        assert result["cycle_revenue_fcfa"] == pytest.approx(expected_cycle_revenue)
        assert result["cycle_other_costs_fcfa"] == pytest.approx(expected_cycle_other_costs)
        assert result["cycle_aquacare_fee_fcfa"] == pytest.approx(expected_cycle_aquacare_fee)
        assert result["annual_other_costs_fcfa"] == pytest.approx(expected_annual_other_costs)
        assert result["cycle_total_cost_fcfa"] == pytest.approx(
            result["cycle_feed_cost_fcfa"]
            + result["cycle_fingerlings_cost_fcfa"]
            + result["cycle_other_costs_fcfa"]
            + result["cycle_aquacare_fee_fcfa"]
        )
        assert result["cycle_net_profit_fcfa"] == pytest.approx(
            result["cycle_revenue_fcfa"] - result["cycle_total_cost_fcfa"]
        )
        assert result["annual_projection_production_kg"] == pytest.approx(
            result["cycle_production_kg"] * expected_cycles
        )
        assert result["annual_projection_revenue_fcfa"] == pytest.approx(
            result["cycle_revenue_fcfa"] * expected_cycles
        )
        assert result["annual_projection_net_profit_fcfa"] == pytest.approx(
            result["cycle_net_profit_fcfa"] * expected_cycles
        )
        assert result["annual_projection_aquacare_fee_fcfa"] == pytest.approx(
            result["cycle_aquacare_fee_fcfa"] * expected_cycles
        )

    def test_legacy_annual_fields_remain_available(self):
        result = AnnualSimulationService.simulate(
            species="tilapia",
            annual_production_target_kg=1000,
            num_cycles=2,
        )

        assert result["annual_production_target_kg"] == 1000
        assert "annual_revenue_fcfa" in result
        assert "annual_feed_cost_fcfa" in result
        assert "annual_other_costs_fcfa" in result
        assert "annual_total_cost_fcfa" in result
        assert "aquacare_fee_fcfa" in result
        assert "production_per_cycle_kg" in result
