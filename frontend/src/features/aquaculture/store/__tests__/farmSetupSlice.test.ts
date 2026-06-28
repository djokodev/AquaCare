import farmSetupReducer, {
  clearCycleSimulation,
  completeFarmSetup,
  runCycleSimulation,
} from '@/features/aquaculture/store/farmSetupSlice';
import type { CycleSimulationResult } from '@/features/aquaculture/types/farmSetup';

describe('features/aquaculture/store/farmSetupSlice', () => {
  const initialState = {
    cycleSimulation: {
      result: null,
      loading: false,
      error: null,
    },
  };

  const simulationResult: CycleSimulationResult = {
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

  it('clearCycleSimulation nettoie la simulation courante', () => {
    const state = {
      cycleSimulation: {
        result: simulationResult,
        loading: true,
        error: 'Erreur',
      },
    };

    expect(farmSetupReducer(state, clearCycleSimulation())).toEqual(initialState);
  });

  it('gere runCycleSimulation pending', () => {
    const state = farmSetupReducer(initialState, { type: runCycleSimulation.pending.type });

    expect(state.cycleSimulation.loading).toBe(true);
    expect(state.cycleSimulation.error).toBeNull();
  });

  it('gere runCycleSimulation fulfilled', () => {
    const state = farmSetupReducer(initialState, {
      type: runCycleSimulation.fulfilled.type,
      payload: simulationResult,
    });

    expect(state.cycleSimulation.loading).toBe(false);
    expect(state.cycleSimulation.result).toEqual(simulationResult);
    expect(state.cycleSimulation.error).toBeNull();
  });

  it('gere runCycleSimulation rejected', () => {
    const state = farmSetupReducer(initialState, {
      type: runCycleSimulation.rejected.type,
      payload: 'Erreur simulation',
    });

    expect(state.cycleSimulation.loading).toBe(false);
    expect(state.cycleSimulation.error).toBe('Erreur simulation');
  });

  it('ne stocke pas directement completeFarmSetup dans ce slice', () => {
    const state = farmSetupReducer(initialState, {
      type: completeFarmSetup.fulfilled.type,
      payload: { id: 'farm-1' },
    });

    expect(state).toEqual(initialState);
  });
});
