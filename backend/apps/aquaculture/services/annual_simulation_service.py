"""
Service aquaculture de simulation annuelle de production piscicole AquaCare.

Calcule pour un pisciculteur, AVANT tout démarrage, la rentabilité de son
exploitation sur l'année complète, en se basant sur ses objectifs et sa capacité.
Réutilise CycleSimulationService pour les calculs par cycle.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, TypedDict

# CycleSimulationService importé en lazy pour éviter les imports circulaires
# (accounts → commerce → accounts via les modèles Django).

# Tarif d'accompagnement AquaCare (FCFA par kg produit)
AQUACARE_FEE_PER_KG = Decimal('20')

# Defaults par espèce
SPECIES_DEFAULTS = {
    'tilapia': {
        'target_weight_g': 350.0,
        'duration_days': 180,
        'selling_price_fcfa': 2800.0,
        'fingerlings_cost_per_unit': 50.0,
    },
    'clarias': {
        'target_weight_g': 400.0,
        'duration_days': 120,
        'selling_price_fcfa': 2000.0,
        'fingerlings_cost_per_unit': 75.0,
    },
}

DEFAULT_SURVIVAL_RATE = 0.95  # 95% avec accompagnement AquaCare — validé DT
INITIAL_WEIGHT_G = 5.0


@dataclass(frozen=True)
class ResolvedSimulationInputs:
    """Paramètres finaux après application des defaults par espèce."""

    species: str
    selling_price: float
    fingerlings_cost_unit: float
    target_weight_g: float
    survival_rate: float
    duration_days: int


class CycleBreakdown(TypedDict):
    cycle_num: int
    production_kg: float
    start_date_estimate: str
    end_date_estimate: str
    duration_days: int
    feed_bags_total: int
    feed_cost_fcfa: float
    fingerlings_cost_fcfa: float
    initial_fish_count: int


class AnnualSimulationResult(TypedDict):
    # Paramètres utilisés
    species: str
    num_cycles: int
    annual_production_target_kg: float
    # Résumé annuel
    annual_revenue_fcfa: float
    annual_feed_cost_fcfa: float
    annual_fingerlings_cost_fcfa: float
    annual_other_costs_fcfa: float
    annual_total_cost_fcfa: float
    aquacare_fee_fcfa: float
    annual_net_profit_fcfa: float
    annual_roi_pct: float
    # Détail par cycle
    production_per_cycle_kg: float
    cycle_duration_days: int
    feed_bags_per_cycle: int
    initial_fish_count_per_cycle: int
    cycles_breakdown: list[CycleBreakdown]


class AnnualSimulationService:
    """
    Calcule la simulation de production annuelle.

    Usage:
        result = AnnualSimulationService.simulate(
            species='tilapia',
            annual_production_target_kg=1000,
            num_cycles=2,
            start_date=date(2026, 4, 1),
            selling_price_per_kg_fcfa=1800,
            fingerlings_cost_per_unit_fcfa=50,
            other_costs_fcfa_per_year=0,
        )
    """

    @staticmethod
    def simulate(
        species: str,
        annual_production_target_kg: float,
        num_cycles: int,
        start_date: date | None = None,
        selling_price_per_kg_fcfa: float | None = None,
        fingerlings_cost_per_unit_fcfa: float | None = None,
        other_costs_fcfa_per_year: float = 0,
        target_harvest_weight_g: float | None = None,
        expected_survival_rate_pct: float | None = None,
        total_fingerlings_count: int | None = None,
    ) -> AnnualSimulationResult:
        """
        Simule la production annuelle en réutilisant CycleSimulationService.

        Args:
            species: 'tilapia' | 'clarias'
            annual_production_target_kg: Production cible sur l'année (kg)
            num_cycles: 2 ou 3 cycles
            start_date: Date de démarrage du 1er cycle
            selling_price_per_kg_fcfa: Prix de vente (FCFA/kg)
            fingerlings_cost_per_unit_fcfa: Coût par alevin
            other_costs_fcfa_per_year: Autres charges annuelles (FCFA)

        Returns:
            AnnualSimulationResult: Simulation complète annuelle
        """
        effective_num_cycles = AnnualSimulationService._normalize_num_cycles(num_cycles)
        resolved_inputs = AnnualSimulationService._resolve_inputs(
            species=species,
            selling_price_per_kg_fcfa=selling_price_per_kg_fcfa,
            fingerlings_cost_per_unit_fcfa=fingerlings_cost_per_unit_fcfa,
            target_harvest_weight_g=target_harvest_weight_g,
            expected_survival_rate_pct=expected_survival_rate_pct,
        )
        effective_start = start_date or date.today()

        # Production par cycle
        production_per_cycle_kg = annual_production_target_kg / effective_num_cycles
        initial_fish_count = AnnualSimulationService._calculate_initial_fish_count(
            production_per_cycle_kg=production_per_cycle_kg,
            target_weight_g=resolved_inputs.target_weight_g,
            survival_rate=resolved_inputs.survival_rate,
            total_fingerlings_count=total_fingerlings_count,
            num_cycles=effective_num_cycles,
        )

        # Coût alevins par cycle
        fingerlings_cost_per_cycle = (
            initial_fish_count * resolved_inputs.fingerlings_cost_unit
        )
        cycle_sim = AnnualSimulationService._simulate_reference_cycle(
            resolved_inputs=resolved_inputs,
            initial_fish_count=initial_fish_count,
            fingerlings_cost_fcfa=fingerlings_cost_per_cycle,
            other_costs_fcfa=other_costs_fcfa_per_year / effective_num_cycles,
        )

        feed_cost_per_cycle = cycle_sim['summary']['feed_cost_fcfa']
        total_feed_bags_per_cycle = sum(
            p['quantity_bags']
            for phase in cycle_sim['feeding_phases']
            for p in phase['products']
        )

        # Détail par cycle avec dates estimées
        cycles_breakdown = AnnualSimulationService._build_cycles_breakdown(
            num_cycles=effective_num_cycles,
            production_per_cycle_kg=production_per_cycle_kg,
            duration_days=resolved_inputs.duration_days,
            feed_bags_per_cycle=total_feed_bags_per_cycle,
            feed_cost_per_cycle=feed_cost_per_cycle,
            fingerlings_cost_per_cycle=fingerlings_cost_per_cycle,
            initial_fish_count=initial_fish_count,
            start_date=effective_start,
        )
        annual_summary = AnnualSimulationService._build_annual_summary(
            num_cycles=effective_num_cycles,
            annual_production_target_kg=annual_production_target_kg,
            selling_price=resolved_inputs.selling_price,
            feed_cost_per_cycle=feed_cost_per_cycle,
            fingerlings_cost_per_cycle=fingerlings_cost_per_cycle,
            other_costs_fcfa_per_year=other_costs_fcfa_per_year,
        )

        return {
            'species': resolved_inputs.species,
            'num_cycles': effective_num_cycles,
            'annual_production_target_kg': annual_production_target_kg,
            **annual_summary,
            'production_per_cycle_kg': round(production_per_cycle_kg, 2),
            'cycle_duration_days': resolved_inputs.duration_days,
            'feed_bags_per_cycle': total_feed_bags_per_cycle,
            'initial_fish_count_per_cycle': initial_fish_count,
            'cycles_breakdown': cycles_breakdown,
        }

    @staticmethod
    def _normalize_num_cycles(num_cycles: int) -> int:
        """Retourne le nombre de cycles supporté, 2 par défaut."""
        return num_cycles if num_cycles in (2, 3) else 2

    @staticmethod
    def _normalize_species(species: str) -> str:
        s = (species or '').lower()
        if s in ('clarias', 'silure'):
            return 'clarias'
        return 'tilapia'

    @staticmethod
    def _resolve_inputs(
        species: str,
        selling_price_per_kg_fcfa: float | None,
        fingerlings_cost_per_unit_fcfa: float | None,
        target_harvest_weight_g: float | None,
        expected_survival_rate_pct: float | None,
    ) -> ResolvedSimulationInputs:
        """Applique les valeurs par défaut par espèce aux paramètres optionnels."""
        normalized = AnnualSimulationService._normalize_species(species)
        defaults = SPECIES_DEFAULTS.get(normalized, SPECIES_DEFAULTS['tilapia'])
        survival_rate = (
            (expected_survival_rate_pct / 100.0)
            if expected_survival_rate_pct is not None
            else DEFAULT_SURVIVAL_RATE
        )

        return ResolvedSimulationInputs(
            species=normalized,
            selling_price=selling_price_per_kg_fcfa or defaults['selling_price_fcfa'],
            fingerlings_cost_unit=(
                fingerlings_cost_per_unit_fcfa
                or defaults['fingerlings_cost_per_unit']
            ),
            target_weight_g=target_harvest_weight_g or defaults['target_weight_g'],
            survival_rate=survival_rate,
            duration_days=defaults['duration_days'],
        )

    @staticmethod
    def _calculate_initial_fish_count(
        production_per_cycle_kg: float,
        target_weight_g: float,
        survival_rate: float,
        total_fingerlings_count: int | None,
        num_cycles: int,
    ) -> int:
        """
        Estime le nombre initial d'alevins par cycle.

        production = final_count * target_weight_g / 1000
        final_count = initial_count * survival_rate
        """
        if total_fingerlings_count is not None:
            return math.ceil(total_fingerlings_count / num_cycles)

        final_count_per_cycle = math.ceil(
            (production_per_cycle_kg * 1000) / target_weight_g
        )
        return math.ceil(final_count_per_cycle / survival_rate)

    @staticmethod
    def _simulate_reference_cycle(
        resolved_inputs: ResolvedSimulationInputs,
        initial_fish_count: int,
        fingerlings_cost_fcfa: float,
        other_costs_fcfa: float,
    ) -> dict[str, Any]:
        """Lance la simulation d'un cycle type via le catalogue commerce."""
        from commerce.services.cycle_simulation_service import CycleSimulationService  # noqa: PLC0415

        return CycleSimulationService.simulate_cycle(
            species=resolved_inputs.species,
            initial_fish_count=initial_fish_count,
            target_weight_g=resolved_inputs.target_weight_g,
            cycle_duration_days=resolved_inputs.duration_days,
            survival_rate=resolved_inputs.survival_rate,
            selling_price_per_kg_fcfa=resolved_inputs.selling_price,
            fingerlings_cost_fcfa=fingerlings_cost_fcfa,
            other_costs_fcfa=other_costs_fcfa,
        )

    @staticmethod
    def _build_annual_summary(
        num_cycles: int,
        annual_production_target_kg: float,
        selling_price: float,
        feed_cost_per_cycle: float,
        fingerlings_cost_per_cycle: float,
        other_costs_fcfa_per_year: float,
    ) -> dict[str, float]:
        """Agrège les coûts et revenus annuels."""
        annual_feed_cost = feed_cost_per_cycle * num_cycles
        annual_fingerlings_cost = fingerlings_cost_per_cycle * num_cycles
        annual_other_costs = float(other_costs_fcfa_per_year)
        annual_revenue = selling_price * annual_production_target_kg
        aquacare_fee = float(AQUACARE_FEE_PER_KG * Decimal(str(annual_production_target_kg)))
        annual_total_cost = (
            annual_feed_cost
            + annual_fingerlings_cost
            + annual_other_costs
            + aquacare_fee
        )
        annual_net_profit = annual_revenue - annual_total_cost
        annual_roi_pct = (
            annual_net_profit / annual_total_cost * 100
            if annual_total_cost > 0
            else 0
        )

        return {
            'annual_revenue_fcfa': round(annual_revenue, 2),
            'annual_feed_cost_fcfa': round(annual_feed_cost, 2),
            'annual_fingerlings_cost_fcfa': round(annual_fingerlings_cost, 2),
            'annual_other_costs_fcfa': round(annual_other_costs, 2),
            'annual_total_cost_fcfa': round(annual_total_cost, 2),
            'aquacare_fee_fcfa': round(aquacare_fee, 2),
            'annual_net_profit_fcfa': round(annual_net_profit, 2),
            'annual_roi_pct': round(annual_roi_pct, 1),
        }

    @staticmethod
    def _build_cycles_breakdown(
        num_cycles: int,
        production_per_cycle_kg: float,
        duration_days: int,
        feed_bags_per_cycle: int,
        feed_cost_per_cycle: float,
        fingerlings_cost_per_cycle: float,
        initial_fish_count: int,
        start_date: date,
    ) -> list[CycleBreakdown]:
        """Construit la liste des cycles avec dates estimées."""
        breakdown = []
        current_start = start_date

        # Pause inter-cycle (nettoyage + repos du bassin) : 14 jours
        inter_cycle_gap_days = 14

        for i in range(1, num_cycles + 1):
            end_date = current_start + timedelta(days=duration_days - 1)
            breakdown.append({
                'cycle_num': i,
                'production_kg': round(production_per_cycle_kg, 2),
                'start_date_estimate': current_start.isoformat(),
                'end_date_estimate': end_date.isoformat(),
                'duration_days': duration_days,
                'feed_bags_total': feed_bags_per_cycle,
                'feed_cost_fcfa': round(feed_cost_per_cycle, 2),
                'fingerlings_cost_fcfa': round(fingerlings_cost_per_cycle, 2),
                'initial_fish_count': initial_fish_count,
            })
            current_start = end_date + timedelta(days=inter_cycle_gap_days + 1)

        return breakdown
