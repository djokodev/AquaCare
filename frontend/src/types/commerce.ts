/**
 * Types TypeScript pour le module Commerce MAVECAM AquaCare
 *
 * Ce fichier définit tous les types pour :
 * - Produits alimentaires (catalogue MAVECAM)
 * - Commandes et items de commandes
 * - Panier et livraison
 * - Suggestions alimentation intelligentes
 * - Simulation cycles de production
 *
 * @module types/commerce
 */

// ============================================================================
// PRODUITS
// ============================================================================

/**
 * Marques de produits alimentaires disponibles
 */
export type ProductBrand = 'aller_aqua' | 'dibaq';

/**
 * Espèces de poissons ciblées
 */
export type ProductSpecies = 'tilapia' | 'catfish' | 'mixed';

/**
 * Phases d'élevage aquacole
 */
export type ProductPhase = 'larvae' | 'juvenile' | 'growing' | 'fattening' | 'finishing';

/**
 * Produit alimentaire MAVECAM
 * Source backend : apps.commerce.models.Product
 *
 * Note: Les champs nutritionnels (phase, protein_percentage, lipid_percentage)
 * sont optionnels car non-disponibles pour certains produits (ex: DIBAQ)
 * Seules les données du catalogue PDF MAVECAM sont garanties
 */
export interface Product {
  id: string;
  brand: ProductBrand;
  name: string;
  species: ProductSpecies;
  phase: ProductPhase | null; // Optionnel si non-vérifié
  pellet_size_mm: string; // Decimal as string
  protein_percentage: number | null; // Optionnel si non-vérifié
  lipid_percentage: number | null; // Optionnel si non-vérifié
  package_weight_kg: number;
  price_per_package: string; // Decimal as string (FCFA)
  price_per_kg: string; // Decimal as string (calculé backend)
  is_available: boolean;
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

/**
 * Filtres pour recherche produits
 */
export interface ProductFilters {
  species?: ProductSpecies;
  phase?: ProductPhase;
  brand?: ProductBrand;
  search?: string;
}

// ============================================================================
// PANIER
// ============================================================================

/**
 * Item dans le panier utilisateur (frontend uniquement)
 */
export interface CartItem {
  product: Product;
  quantity: number; // Nombre de sacs
}

/**
 * Méthode de livraison
 */
export type DeliveryMethod = 'home' | 'pickup';

/**
 * Localisation retrait en magasin
 */
export type PickupLocation = 'ndokoti' | 'ndogpasi';

/**
 * Preview calcul frais de livraison
 * Endpoint : POST /api/commerce/orders/preview_delivery_fee/
 */
export interface DeliveryFeePreview {
  subtotal: string; // Decimal as string
  delivery_fee: string; // Decimal as string
  total: string; // Decimal as string
  total_bags: number;
  free_delivery_threshold_reached: boolean;
}

// ============================================================================
// COMMANDES
// ============================================================================

/**
 * Statut commande (MVP : uniquement 'confirmed')
 */
export type OrderStatus = 'confirmed';

/**
 * Item dans une commande (ligne de commande)
 * Source backend : apps.commerce.models.OrderItem
 */
export interface OrderItem {
  id: string;
  product: string; // Product UUID
  product_name: string; // Snapshot nom produit (immutable)
  product_brand: ProductBrand;
  product_package_weight: number;
  unit_price: string; // Decimal as string (prix au moment commande)
  quantity: number;
  line_total: string; // Decimal as string (unit_price × quantity)
}

/**
 * Commande utilisateur
 * Source backend : apps.commerce.models.Order
 */
export interface Order {
  id: string;
  order_number: string; // Format: ORD-YYYYMMDD-XXXX
  status: OrderStatus;
  user: string; // User UUID
  user_name: string;
  farm_profile: string; // FarmProfile UUID
  farm_name: string;

  // Livraison
  delivery_method: DeliveryMethod;
  pickup_location?: PickupLocation;

  // Snapshot adresse (immutable - adresse au moment de la commande)
  delivery_name: string;
  delivery_phone: string;
  delivery_region: string;
  delivery_city: string;
  delivery_full_address: string;

  // Montants (immutables après création)
  subtotal: string; // Decimal as string
  delivery_fee: string; // Decimal as string
  total: string; // Decimal as string
  total_bags: number;
  is_free_delivery: boolean;

  // Items commande
  items: OrderItem[];

  // Offline sync
  client_uuid?: string; // UUID généré client-side pour déduplication
  created_offline: boolean;
  synced_at?: string; // ISO datetime

  // Timestamps
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

/**
 * Payload création commande
 * Endpoint : POST /api/commerce/orders/
 */
export interface CreateOrderPayload {
  items: Array<{
    product_id: string;
    quantity: number;
  }>;
  delivery_method: DeliveryMethod;
  pickup_location?: PickupLocation;
  client_uuid?: string; // Généré client-side pour offline
  created_offline?: boolean;
}

/**
 * Statistiques commandes utilisateur
 * Endpoint : GET /api/commerce/orders/statistics/
 */
export interface OrderStatistics {
  total_orders: number;
  total_spent: string; // Decimal as string
  total_bags_ordered: number;
  average_order_value: string; // Decimal as string
  last_order_date?: string; // ISO datetime
  last_order_number?: string;
}

// ============================================================================
// SUGGESTIONS ALIMENTATION INTELLIGENTES
// ============================================================================

/**
 * Produit recommandé dans une suggestion
 */
export interface SuggestedProduct {
  product_id: string;
  product_name: string;
  quantity_bags: number;
  total_kg: number;
  total_price: number;
  brand: ProductBrand;
}

/**
 * Phase d'alimentation dans une suggestion
 */
export interface FeedingPhase {
  phase_name: string; // "alevinage", "pre_grossissement", "grossissement", "finition"
  pellet_size_mm: number;
  weight_range_g: [number, number]; // [poids_min, poids_max]
  days_coverage: number;
  estimated_need_kg: number;
  products: SuggestedProduct[];
  total_price: number;
}

/**
 * Suggestion alimentation pour un cycle actif
 */
export interface CycleSuggestion {
  cycle_id: string;
  cycle_name: string;
  species: string;
  current_phase: string;
  current_avg_weight_g: number;
  days_remaining: number;
  phases: FeedingPhase[];
  summary: {
    total_needed_kg: number;
    total_bags: number;
    total_price: number;
    coverage_days: number; // Durée couverte (jours restants + buffer)
  };
}

/**
 * Analyse qualité suggestions
 */
export interface SuggestionAnalysis {
  total_cycles: number;
  cycles_with_data: number;
  confidence_score: number; // 0-100 (qualité données)
  analysis_period_days: number;
  safety_buffer_days: number;
}

/**
 * Réponse complète suggestions alimentation
 * Endpoint : GET /api/commerce/products/feeding_suggestions/
 */
export interface FeedingSuggestion {
  has_suggestions: boolean;
  suggestion_type: string; // "adaptive"
  suggestions: CycleSuggestion[];
  analysis: SuggestionAnalysis;
  generated_at: string; // ISO datetime
}

// ============================================================================
// SIMULATION CYCLE
// ============================================================================

/**
 * Paramètres simulation cycle
 * Endpoint : POST /api/commerce/products/cycle_simulation/
 */
export interface CycleSimulationParams {
  species: 'tilapia' | 'catfish';
  initial_fish_count: number;
  initial_weight_g?: number; // Défaut : 5g
  target_weight_g?: number; // Défaut : 300g tilapia, 400g catfish
  cycle_duration_days?: number; // Défaut : 120j tilapia, 150j catfish
  survival_rate?: number; // Défaut : 0.85
}

/**
 * Produit dans une phase simulation
 */
export interface SimulatedProduct {
  product_id: string;
  product_name: string;
  package_weight_kg: number;
  quantity_bags: number;
  total_kg: number;
  unit_price: string; // Decimal as string
  total_price: string; // Decimal as string
  brand: ProductBrand;
}

/**
 * Phase alimentation simulée
 */
export interface SimulatedFeedingPhase {
  phase_name: string;
  days_range: [number, number]; // [jour_début, jour_fin]
  weight_range_g: [number, number]; // [poids_min, poids_max]
  pellet_size_mm: number;
  duration_days: number;
  total_consumption_kg: number;
  daily_avg_kg: number;
  products: SimulatedProduct[];
  total_bags: number;
  total_price: string; // Decimal as string
}

/**
 * Résumé simulation cycle
 */
export interface SimulationSummary {
  total_feed_kg: number;
  total_cost_fcfa: number;
  initial_fish_count: number;
  estimated_final_count: number;
  survival_rate: number;
  biomass_gain_kg: number;
  estimated_fcr: number; // Feed Conversion Ratio
  estimated_revenue_fcfa: number;
  estimated_profit_fcfa: number;
  roi_percentage: number;
}

/**
 * Résultat complet simulation cycle
 * Endpoint : POST /api/commerce/products/cycle_simulation/
 */
export interface SimulationResult {
  simulation_type: 'predictive';
  parameters: {
    species: string;
    initial_fish_count: number;
    initial_weight_g: number;
    target_weight_g: number;
    cycle_duration_days: number;
    survival_rate: number;
  };
  feeding_phases: SimulatedFeedingPhase[];
  summary: SimulationSummary;
}

// ============================================================================
// REDUX STATE
// ============================================================================

/**
 * État Redux pour le module Commerce
 */
export interface CommerceState {
  // Produits
  products: {
    items: Product[];
    loading: boolean;
    error: string | null;
    filters: ProductFilters;
  };

  // Panier
  cart: {
    items: CartItem[];
    delivery_method: DeliveryMethod;
    pickup_location?: PickupLocation;
    deliveryPreview: DeliveryFeePreview | null;
    previewLoading: boolean;
  };

  // Commandes
  orders: {
    items: Order[];
    statistics: OrderStatistics | null;
    loading: boolean;
    error: string | null;
  };

  // Suggestions alimentation
  suggestions: {
    data: FeedingSuggestion | null;
    loading: boolean;
    error: string | null;
  };

  // Simulation cycle
  simulation: {
    result: SimulationResult | null;
    loading: boolean;
    error: string | null;
  };
}
