// Types basÃ©s sur votre API Django accounts

export interface User {
  id: string;
  phone_number: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  business_name?: string;
  account_type: 'individual' | 'company';
  age_group?: string;
  activity_type?: string;
  region?: string;
  department?: string;
  district?: string;
  city?: string;
  neighborhood?: string;
  legal_status?: string;
  promoter_name?: string;
  intervention_zone?: string;
  language_preference: 'fr' | 'en';
  is_verified: boolean;
  is_active: boolean;
  date_joined: string;
  full_name?: string;
  login_name?: string;
  display_name: string;
  is_individual: boolean;
  is_company: boolean;
}

export interface FarmProfile {
  id: string;
  farm_name: string;
  certification_status: 'pending' | 'certified' | 'suspended' | 'rejected';
  certification_status_display?: string;
  total_ponds: number;
  total_area_m2?: number;
  water_source?: string;
  main_species?: string;
  annual_production_kg?: number;
  default_feed_price_per_kg?: number;
  latitude?: number | null;
  longitude?: number | null;
  location_address?: string;
  is_certified: boolean;
  // Farm setup fields
  annual_production_target_kg?: number | null;
  num_cycles_per_year?: 2 | 3 | null;
  setup_infrastructure_type?: 'etang' | 'cage_flottante' | 'bac_hors_sol' | 'bac_en_sol' | null;
  setup_unit_count?: number | null;
  setup_unit_volume_m3?: number | null;
  setup_unit_surface_m2?: number | null;
  setup_species?: 'tilapia' | 'clarias' | 'autre' | null;
  fingerlings_cost_per_unit_fcfa?: number | null;
  planned_selling_price_per_kg_fcfa?: number | null;
  farm_setup_completed?: boolean;
  created_at: string;
  updated_at: string;
}

// Farm setup form data
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

// Annual simulation input
export interface AnnualSimulationInput {
  species: 'tilapia' | 'clarias';
  annual_production_target_kg: number;
  num_cycles: 2 | 3;
  start_date?: string;
  selling_price_per_kg_fcfa?: number;
  fingerlings_cost_per_unit_fcfa?: number;
  other_costs_fcfa_per_year?: number;
}

// Annual simulation result
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

// Feed status for a cycle
export interface FeedProductStatus {
  product_id: string;
  product_name: string;
  package_weight_kg: number;
  bags_ordered: number;
}

export interface CycleFeedStatus {
  total_bags_needed: number;
  total_feed_needed_kg: number;
  bags_by_product: FeedProductStatus[];
  total_bags_ordered: number;
  total_feed_consumed_kg: number;
  bags_consumed_equivalent: number;
  bags_remaining_to_order: number;
}

export interface LoginRequest {
  login_name?: string;
  phone_number?: string;
  password: string;
}

export interface RegisterRequest {
  phone_number: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  business_name?: string;
  account_type: 'individual' | 'company';
  age_group?: string;
  activity_type?: string;
  region?: string;
  department?: string;
  district?: string;
  city?: string;
  neighborhood?: string;
  legal_status?: string;
  promoter_name?: string;
  intervention_zone?: string;
  language_preference: 'fr' | 'en';
  password: string;
  password_confirm: string;
}

export interface AuthResponse {
  user: User;
  tokens: {
    access: string;
    refresh: string;
  };
  message: string;
}

export interface ApiError {
  message: string;
  details?: Record<string, string[]>;
}



