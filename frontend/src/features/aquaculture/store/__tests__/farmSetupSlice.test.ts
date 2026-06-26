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
    num_cycles: 2,
    annual_production_target_kg: 1000,
    annual_revenue_fcfa: 2800000,
    annual_feed_cost_fcfa: 900000,
    annual_fingerlings_cost_fcfa: 150000,
    annual_other_costs_fcfa: 50000,
    annual_total_cost_fcfa: 1100000,
    aquacare_fee_fcfa: 20000,
    annual_net_profit_fcfa: 1700000,
    annual_roi_pct: 154.5,
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
