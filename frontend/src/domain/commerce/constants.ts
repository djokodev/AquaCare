/**
 * Commerce UI constants.
 * Backend remains the source of truth for business calculations.
 */

import { DeliveryMethod, PickupLocation, ProductPhase } from '@/types/commerce';

export const DELIVERY_METHODS: Array<{ value: DeliveryMethod; labelKey: string }> = [
  { value: 'home', labelKey: 'homeDelivery' },
  { value: 'pickup', labelKey: 'pickupStore' },
];

export const PICKUP_LOCATIONS: Array<{ value: PickupLocation; label: string }> = [
  { value: 'ndokoti', label: 'Ndokoti' },
  { value: 'ndogpasi', label: 'Ndogpasi' },
];

export const FREE_DELIVERY_THRESHOLD = 20;
export const DELIVERY_FEE_FCFA = 3000;

export const PRODUCT_BRANDS = [
  { value: 'dibaq', label: 'DIBAQ' },
] as const;

export const PRODUCT_SPECIES = [
  { value: 'tilapia', labelKey: 'tilapia' },
  { value: 'catfish', labelKey: 'catfish' },
] as const;

export const PRODUCT_PHASES: Array<{ value: ProductPhase; labelKey: string }> = [
  { value: 'alevinage', labelKey: 'alevinage' },
  { value: 'pre_grossissement', labelKey: 'pre_grossissement' },
  { value: 'grossissement', labelKey: 'grossissement' },
];

export const CYCLE_SIMULATION_DEFAULTS = {
  tilapia: {
    initial_weight_g: 5,
    target_weight_g: 350,
    cycle_duration_days: 180,
    survival_rate: 0.95,
    selling_price_per_kg_fcfa: 2800,
  },
  catfish: {
    initial_weight_g: 5,
    target_weight_g: 400,
    cycle_duration_days: 120,
    survival_rate: 0.95,
    selling_price_per_kg_fcfa: 2000,
  },
};

export const FCR_TARGET = {
  tilapia: 1.8,
  catfish: 1.9,
};

export const MARKET_PRICE_PER_KG = {
  tilapia: 2800,
  catfish: 2000,
};
