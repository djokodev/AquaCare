/**
 * Constantes aquaculture pour les calculs financiers
 * Valeurs validées par expert MAVECAM - Janvier 2026
 *
 * @module constants/aquaculture
 */

export const AQUACULTURE_CONSTANTS = {
  /**
   * Prix de vente du poisson au kg (FCFA)
   * Source: Prix moyen vente en gros au Cameroun
   */
  FISH_SALE_PRICE_PER_KG: 1800,

  /**
   * Prix moyen de l'aliment au kg (FCFA)
   * Source: Moyenne DIBAQ + Aller Aqua (phase grossissement)
   */
  FEED_PRICE_PER_KG: 1250,

  /**
   * FCR baseline (sans suivi professionnel)
   * Le poisson mange 1.3 kg pour produire 1 kg de poids
   */
  FCR_BASELINE: 1.3,

  /**
   * FCR optimisé (objectif avec AquaCare)
   * Le poisson mange 0.7 kg pour produire 1 kg de poids
   */
  FCR_OPTIMIZED: 0.7,
};

/**
 * Calcule la valeur estimée du stock de poissons
 * @param biomassKg Biomasse totale en kg
 * @returns Valeur en FCFA
 */
export const calculateStockValue = (biomassKg: number): number => {
  if (biomassKg <= 0) return 0;
  return Math.round(biomassKg * AQUACULTURE_CONSTANTS.FISH_SALE_PRICE_PER_KG);
};

/**
 * Calcule l'économie d'aliment réalisée vs baseline
 * @param biomassKg Biomasse totale en kg
 * @param currentFcr FCR actuel du cycle
 * @returns Économie en FCFA (0 si pas d'économie)
 */
export const calculateFeedSavings = (biomassKg: number, currentFcr: number): number => {
  if (biomassKg <= 0 || currentFcr <= 0) return 0;

  // Aliment qui aurait été nécessaire avec FCR baseline
  const feedBaseline = biomassKg * AQUACULTURE_CONSTANTS.FCR_BASELINE;
  // Aliment réellement consommé avec FCR actuel
  const feedActual = biomassKg * currentFcr;
  // Aliment économisé
  const feedSaved = feedBaseline - feedActual;

  if (feedSaved <= 0) return 0;

  return Math.round(feedSaved * AQUACULTURE_CONSTANTS.FEED_PRICE_PER_KG);
};
