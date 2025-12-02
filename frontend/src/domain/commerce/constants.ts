/**
 * Constantes Commerce MAVECAM AquaCare
 *
 * Constantes mÃ©tier pour le module Commerce.
 * UtilisÃ©es pour affichage UI uniquement - backend a les vraies rÃ¨gles.
 *
 * @module domain/commerce/constants
 */

import { DeliveryMethod, PickupLocation } from '../../types/commerce';

// ============================================================================
// LIVRAISON
// ============================================================================

/**
 * MÃ©thodes de livraison disponibles
 */
export const DELIVERY_METHODS: Array<{ value: DeliveryMethod; labelKey: string }> = [
  { value: 'home', labelKey: 'homeDelivery' },
  { value: 'pickup', labelKey: 'pickupStore' },
];

/**
 * Localisations retrait en magasin MAVECAM (Douala)
 */
export const PICKUP_LOCATIONS: Array<{ value: PickupLocation; label: string }> = [
  { value: 'ndokoti', label: 'Ndokoti' },
  { value: 'ndogpasi', label: 'Ndogpasi' },
];

/**
 * Seuil livraison gratuite (Douala uniquement)
 * @constant {number} 20 sacs
 */
export const FREE_DELIVERY_THRESHOLD = 20;

/**
 * Frais livraison standard (FCFA)
 * @constant {number} 3000 FCFA
 */
export const DELIVERY_FEE_FCFA = 3000;

// ============================================================================
// MARQUES & ESPÃˆCES
// ============================================================================

/**
 * Marques produits alimentaires disponibles
 */
export const PRODUCT_BRANDS = [
  { value: 'aller_aqua', label: 'Aller Aqua' },
  { value: 'dibaq', label: 'DIBAQ' },
];

/**
 * EspÃ¨ces cibles produits
 * Note: Certains produits sont compatibles avec les deux espÃ¨ces,
 * mais backend filtre uniquement par tilapia/catfish
 */
export const PRODUCT_SPECIES = [
  { value: 'tilapia', labelKey: 'tilapia' },
  { value: 'catfish', labelKey: 'catfish' },
];

/**
 * Phases d'Ã©levage aquacole
 */
export const PRODUCT_PHASES = [
  { value: 'larvae', labelKey: 'larvaePhase' },
  { value: 'juvenile', labelKey: 'juvenilePhase' },
  { value: 'growing', labelKey: 'growingPhase' },
  { value: 'fattening', labelKey: 'fatteningPhase' },
  { value: 'finishing', labelKey: 'finishingPhase' },
];

// ============================================================================
// SIMULATION CYCLE - VALEURS PAR DÃ‰FAUT
// ============================================================================

/**
 * Valeurs par dÃ©faut simulation cycle
 * Backend calcule les vraies projections - ces valeurs sont pour UI uniquement
 */
export const CYCLE_SIMULATION_DEFAULTS = {
  tilapia: {
    initial_weight_g: 5,
    target_weight_g: 300,
    cycle_duration_days: 120,
    survival_rate: 0.85,
  },
  catfish: {
    initial_weight_g: 5,
    target_weight_g: 400,
    cycle_duration_days: 150,
    survival_rate: 0.85,
  },
};

/**
 * FCR cible MAVECAM (Feed Conversion Ratio)
 * Objectif qualitÃ© aliments MAVECAM
 */
export const FCR_TARGET = {
  tilapia: 1.8, // kg aliment / kg gain biomasse
  catfish: 1.9,
};

/**
 * Prix marchÃ© camerounais (FCFA/kg) - indicatif uniquement
 * Backend a les vrais prix actualisÃ©s
 */
export const MARKET_PRICE_PER_KG = {
  tilapia: 2500,
  catfish: 2800,
};




