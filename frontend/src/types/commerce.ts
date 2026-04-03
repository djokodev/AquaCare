/**
 * Type definitions for the Commerce module.
 */

// Products
export type ProductBrand = 'dibaq';
export type ProductSpecies = 'tilapia' | 'catfish' | 'mixed';
export type ProductPhase =
  | 'alevinage'
  | 'pre_grossissement'
  | 'grossissement'
  | 'larvae'
  | 'juvenile'
  | 'growing'
  | 'fattening'
  | 'finishing';

export interface Product {
  id: string;
  brand: ProductBrand;
  name: string;
  species: ProductSpecies;
  phase: ProductPhase | null;
  pellet_size_mm: string;
  protein_percentage: number | null;
  lipid_percentage: number | null;
  package_weight_kg: number;
  price_per_package: string;
  price_per_kg: string;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductFilters {
  species?: ProductSpecies;
  phase?: ProductPhase;
  brand?: ProductBrand;
  search?: string;
}

// Cart
export interface CartItem {
  product: Product;
  quantity: number;
}

export type DeliveryMethod = 'home' | 'pickup';
export type PickupLocation = 'ndokoti' | 'ndogpasi';

export interface DeliveryFeePreview {
  subtotal: string;
  delivery_fee: string;
  total: string;
  total_bags: number;
  free_delivery_threshold_reached: boolean;
}

// Orders
export type OrderStatus = 'confirmed' | 'delivered' | 'received';

export interface OrderItem {
  id: string;
  product: string;
  product_name: string;
  product_brand: ProductBrand;
  product_package_weight: number;
  unit_price: string;
  quantity: number;
  line_total: string;
}

export interface Order {
  id: string;
  order_number: string;
  status: OrderStatus;
  user: string;
  user_name: string;
  farm_profile: string;
  farm_name: string;
  delivery_method: DeliveryMethod;
  pickup_location?: PickupLocation;
  delivery_name: string;
  delivery_phone: string;
  delivery_region: string;
  delivery_city: string;
  delivery_full_address: string;
  subtotal: string;
  delivery_fee: string;
  total: string;
  total_bags: number;
  is_free_delivery: boolean;
  items: OrderItem[];
  client_uuid?: string;
  created_offline: boolean;
  synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderPayload {
  items: Array<{
    product_id: string;
    quantity: number;
  }>;
  delivery_method: DeliveryMethod;
  pickup_location?: PickupLocation;
  client_uuid?: string;
  created_offline?: boolean;
}

export interface OrderStatistics {
  total_orders: number;
  total_spent: string;
  total_bags_ordered: number;
  average_order_value: string;
  last_order_date?: string;
  last_order_number?: string;
}

// Feeding suggestions
export interface SuggestedProduct {
  product_id: string;
  product_name: string;
  quantity_bags: number;
  total_kg: number;
  total_price: number;
  brand: ProductBrand;
}

export interface FeedingPhase {
  phase_name: string;
  pellet_size_mm: number;
  weight_range_g: [number, number];
  days_coverage: number;
  estimated_need_kg: number;
  products: SuggestedProduct[];
  total_price: number;
}

export interface CycleSuggestion {
  cycle_id: string;
  cycle_name: string;
  species: string;
  current_phase: string;
  current_avg_weight_g: number;
  days_remaining: number;
  avg_daily_consumption_kg: number;
  phases: FeedingPhase[];
  summary: {
    total_needed_kg: number;
    total_bags: number;
    total_price: number;
    coverage_days: number;
  };
}

export interface SuggestionAnalysis {
  total_cycles: number;
  cycles_with_data: number;
  confidence_score: number;
  analysis_period_days: number;
  safety_buffer_days: number;
}

export interface FeedingSuggestion {
  has_suggestions: boolean;
  suggestion_type: string;
  message?: string;
  suggestions: CycleSuggestion[];
  analysis: SuggestionAnalysis | Record<string, never>;
  generated_at?: string;
}

// Cycle simulation
export interface CycleSimulationParams {
  species: 'tilapia' | 'catfish';
  initial_fish_count: number;
  initial_weight_g?: number;
  target_weight_g?: number;
  cycle_duration_days?: number;
  survival_rate?: number;
  selling_price_per_kg_fcfa?: number;
  fingerlings_cost_fcfa?: number;
  other_costs_fcfa?: number;
}

export interface SimulatedProduct {
  product_id: string;
  product_name: string;
  package_weight_kg: number;
  quantity_bags: number;
  total_kg: number;
  unit_price: number;
  total_price: number;
  brand: ProductBrand;
}

export interface SimulatedFeedingPhase {
  phase_name: string;
  days_range: [number, number];
  weight_range_g: [number, number];
  pellet_size_mm: number;
  duration_days: number;
  total_consumption_kg: number;
  daily_avg_kg: number;
  products: SimulatedProduct[];
  total_bags: number;
  total_price: number;
}

export interface SimulationSummary {
  total_feed_kg: number;
  feed_cost_fcfa: number;
  fingerlings_cost_fcfa: number;
  other_costs_fcfa: number;
  total_cost_fcfa: number;
  initial_fish_count: number;
  estimated_final_count: number;
  survival_rate: number;
  biomass_gain_kg: number;
  estimated_fcr: number;
  estimated_revenue_fcfa: number;
  estimated_profit_fcfa: number;
  roi_percentage: number;
}

export interface SimulationResult {
  simulation_type: 'predictive';
  parameters: {
    species: string;
    initial_fish_count: number;
    initial_weight_g: number;
    target_weight_g: number;
    cycle_duration_days: number;
    survival_rate: number;
    selling_price_per_kg_fcfa: number;
    fingerlings_cost_fcfa: number;
    other_costs_fcfa: number;
  };
  feeding_phases: SimulatedFeedingPhase[];
  summary: SimulationSummary;
}

// Redux
export interface CommerceState {
  products: {
    items: Product[];
    loading: boolean;
    error: string | null;
    filters: ProductFilters;
  };
  cart: {
    items: CartItem[];
    delivery_method: DeliveryMethod;
    pickup_location?: PickupLocation;
    deliveryPreview: DeliveryFeePreview | null;
    previewLoading: boolean;
  };
  orders: {
    items: Order[];
    statistics: OrderStatistics | null;
    loading: boolean;
    error: string | null;
  };
  suggestions: {
    data: FeedingSuggestion | null;
    loading: boolean;
    error: string | null;
  };
  simulation: {
    result: SimulationResult | null;
    loading: boolean;
    error: string | null;
  };
}
