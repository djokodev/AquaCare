import farmSetupReducer, {
  clearAnnualSimulation,
  completeFarmSetup,
  runAnnualSimulation,
} from '@/features/aquaculture/store/farmSetupSlice';
import type { AnnualSimulationResult } from '@/features/aquaculture/types/farmSetup';

describe('features/aquaculture/store/farmSetupSlice', () => {
  const initialState = {
    annualSimulation: {
      result: null,
      loading: false,
      error: null,
    },
  };

  const simulationResult: AnnualSimulationResult = {
    species: 'tilapia',
    num_cycles: 1,
    annual_production_target_kg: 500,
    cycles_per_year_derived: 1,
    technical_pause_days: 14,
    other_costs_rate_pct: 5,
    annual_revenue_fcfa: 1400000,
    annual_feed_cost_fcfa: 450000,
    annual_fingerlings_cost_fcfa: 75000,
    annual_other_costs_fcfa: 25000,
    annual_total_cost_fcfa: 560000,
    aquacare_fee_fcfa: 10000,
    annual_net_profit_fcfa: 840000,
    annual_roi_pct: 150,
    cycle_production_kg: 500,
    cycle_revenue_fcfa: 1400000,
    cycle_feed_cost_fcfa: 450000,
    cycle_fingerlings_cost_fcfa: 75000,
    cycle_other_costs_fcfa: 25000,
    cycle_aquacare_fee_fcfa: 10000,
    cycle_total_cost_fcfa: 560000,
    cycle_net_profit_fcfa: 840000,
    cycle_roi_pct: 150,
    annual_projection_production_kg: 500,
    annual_projection_revenue_fcfa: 1400000,
    annual_projection_net_profit_fcfa: 840000,
    annual_projection_aquacare_fee_fcfa: 10000,
    production_per_cycle_kg: 500,
    cycle_duration_days: 180,
    feed_bags_per_cycle: 30,
    initial_fish_count_per_cycle: 1500,
    cycles_breakdown: [],
  };

  it('clearAnnualSimulation nettoie la simulation courante', () => {
    const state = {
      annualSimulation: {
        result: simulationResult,
        loading: true,
        error: 'Erreur',
      },
    };

    expect(farmSetupReducer(state, clearAnnualSimulation())).toEqual(initialState);
  });

  it('gere runAnnualSimulation pending', () => {
    const state = farmSetupReducer(initialState, { type: runAnnualSimulation.pending.type });

    expect(state.annualSimulation.loading).toBe(true);
    expect(state.annualSimulation.error).toBeNull();
  });

  it('gere runAnnualSimulation fulfilled', () => {
    const state = farmSetupReducer(initialState, {
      type: runAnnualSimulation.fulfilled.type,
      payload: simulationResult,
    });

    expect(state.annualSimulation.loading).toBe(false);
    expect(state.annualSimulation.result).toEqual(simulationResult);
    expect(state.annualSimulation.error).toBeNull();
  });

  it('gere runAnnualSimulation rejected', () => {
    const state = farmSetupReducer(initialState, {
      type: runAnnualSimulation.rejected.type,
      payload: 'Erreur simulation',
    });

    expect(state.annualSimulation.loading).toBe(false);
    expect(state.annualSimulation.error).toBe('Erreur simulation');
  });

  it('ne stocke pas directement completeFarmSetup dans ce slice', () => {
    const state = farmSetupReducer(initialState, {
      type: completeFarmSetup.fulfilled.type,
      payload: { id: 'farm-1' },
    });

    expect(state).toEqual(initialState);
  });
});
