export interface FarmSetupData {
  setup_species: 'tilapia' | 'clarias' | 'autre';
  setup_infrastructure_type: 'etang' | 'cage_flottante' | 'bac_hors_sol' | 'bac_en_sol';
  setup_unit_count: number;
  setup_unit_volume_m3?: number;
  setup_unit_surface_m2?: number;
  annual_production_target_kg: number;
  num_cycles_per_year: 2 | 3;
  fingerlings_cost_per_unit_fcfa?: number;
  planned_selling_price_per_kg_fcfa?: number;
}

export interface AnnualSimulationInput {
  species: 'tilapia' | 'clarias';
  annual_production_target_kg: number;
  num_cycles: 2 | 3;
  start_date?: string;
  selling_price_per_kg_fcfa?: number;
  fingerlings_cost_per_unit_fcfa?: number;
  other_costs_fcfa_per_year?: number;
  target_harvest_weight_g?: number;
  expected_survival_rate_pct?: number;
  total_fingerlings_count?: number;
}

export interface CycleBreakdown {
  cycle_num: number;
  production_kg: number;
  start_date_estimate: string;
  end_date_estimate: string;
  duration_days: number;
  feed_bags_total: number;
  feed_cost_fcfa: number;
  fingerlings_cost_fcfa: number;
  initial_fish_count: number;
}

export interface AnnualSimulationResult {
  species: string;
  num_cycles: number;
  annual_production_target_kg: number;
  annual_revenue_fcfa: number;
  annual_feed_cost_fcfa: number;
  annual_fingerlings_cost_fcfa: number;
  annual_other_costs_fcfa: number;
  annual_total_cost_fcfa: number;
  aquacare_fee_fcfa: number;
  annual_net_profit_fcfa: number;
  annual_roi_pct: number;
  production_per_cycle_kg: number;
  cycle_duration_days: number;
  feed_bags_per_cycle: number;
  initial_fish_count_per_cycle: number;
  cycles_breakdown: CycleBreakdown[];
}
