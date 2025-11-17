/**
 * Estimateurs Commerce MAVECAM AquaCare
 *
 * ⚠️ RÈGLE FONDAMENTALE FRONTEND :
 * Ces estimations sont TEMPORAIRES et JETABLES.
 * Backend recalcule TOUT avec formules officielles.
 * Utilisées UNIQUEMENT pour feedback UX immédiat.
 *
 * @module domain/commerce/estimators
 */

import { CartItem } from '../../types/commerce';
import { DELIVERY_FEE_FCFA, FREE_DELIVERY_THRESHOLD } from './constants';

// ============================================================================
// ESTIMATEURS PANIER (UX Temporaire uniquement)
// ============================================================================

/**
 * Estime le prix total panier (sans frais livraison)
 *
 * ⚠️ BACKEND RECALCULE : API preview_delivery_fee retourne subtotal officiel
 *
 * @param items - Items dans le panier
 * @returns Montant estimé en FCFA
 *
 * @example
 * const items = [
 *   { product: { price_per_package: "20500" }, quantity: 2 },
 *   { product: { price_per_package: "30000" }, quantity: 3 },
 * ];
 * const total = estimateTotalPrice(items); // 131000 (UX feedback temporaire)
 */
export const estimateTotalPrice = (items: CartItem[]): number => {
  return items.reduce((total, item) => {
    const price = parseFloat(item.product.price_per_package);
    return total + price * item.quantity;
  }, 0);
};

/**
 * Compte le nombre total de sacs dans le panier
 *
 * @param items - Items dans le panier
 * @returns Nombre total de sacs
 */
export const estimateTotalBags = (items: CartItem[]): number => {
  return items.reduce((total, item) => total + item.quantity, 0);
};

/**
 * Estime les frais de livraison selon règles MAVECAM
 *
 * ⚠️ BACKEND RECALCULE : API preview_delivery_fee retourne frais officiels
 *
 * Règles MAVECAM :
 * - Pickup (retrait magasin) : 0 FCFA
 * - Douala + >= 20 sacs : 0 FCFA (livraison gratuite)
 * - Tous autres cas : 3,000 FCFA
 *
 * @param deliveryMethod - 'home' ou 'pickup'
 * @param region - Région utilisateur (depuis profil)
 * @param totalBags - Nombre total sacs
 * @returns Montant estimé frais livraison en FCFA
 *
 * @example
 * // Retrait magasin
 * estimateDeliveryFee('pickup', 'littoral', 10); // 0 FCFA
 *
 * // Douala, 25 sacs
 * estimateDeliveryFee('home', 'littoral', 25); // 0 FCFA (livraison gratuite)
 *
 * // Douala, 10 sacs
 * estimateDeliveryFee('home', 'littoral', 10); // 3000 FCFA
 *
 * // Yaoundé, 50 sacs
 * estimateDeliveryFee('home', 'centre', 50); // 3000 FCFA
 */
export const estimateDeliveryFee = (
  deliveryMethod: 'home' | 'pickup',
  region: string,
  totalBags: number
): number => {
  // Règle 1 : Retrait en magasin = GRATUIT
  if (deliveryMethod === 'pickup') {
    return 0;
  }

  // Règle 2 : Douala + >= 20 sacs = GRATUIT
  if (region === 'littoral' && totalBags >= FREE_DELIVERY_THRESHOLD) {
    return 0;
  }

  // Règle 3 : Tous les autres cas = 3,000 FCFA
  return DELIVERY_FEE_FCFA;
};

/**
 * Vérifie si seuil livraison gratuite est atteint
 *
 * @param deliveryMethod - 'home' ou 'pickup'
 * @param region - Région utilisateur
 * @param totalBags - Nombre total sacs
 * @returns true si livraison gratuite
 */
export const isFreeDelivery = (
  deliveryMethod: 'home' | 'pickup',
  region: string,
  totalBags: number
): boolean => {
  return estimateDeliveryFee(deliveryMethod, region, totalBags) === 0;
};

/**
 * Calcule combien de sacs manquants pour livraison gratuite (Douala uniquement)
 *
 * @param region - Région utilisateur
 * @param totalBags - Nombre total sacs actuels
 * @returns Nombre sacs manquants (0 si déjà atteint ou pas Douala)
 *
 * @example
 * bagsNeededForFreeDelivery('littoral', 15); // 5 sacs manquants
 * bagsNeededForFreeDelivery('littoral', 25); // 0 (déjà atteint)
 * bagsNeededForFreeDelivery('centre', 10); // 0 (pas applicable Yaoundé)
 */
export const bagsNeededForFreeDelivery = (region: string, totalBags: number): number => {
  // Seulement applicable à Douala (littoral)
  if (region !== 'littoral') {
    return 0;
  }

  // Déjà atteint
  if (totalBags >= FREE_DELIVERY_THRESHOLD) {
    return 0;
  }

  return FREE_DELIVERY_THRESHOLD - totalBags;
};

// ============================================================================
// ESTIMATEURS SUGGESTIONS (UX Temporaire uniquement)
// ============================================================================

/**
 * Estime besoin alimentaire quotidien selon biomasse
 *
 * ⚠️ BACKEND CALCULE : Backend utilise formules scientifiques réelles
 * Cette fonction est UNIQUEMENT pour feedback UX temporaire
 *
 * Taux approximatif : 3-4% biomasse/jour (simplifié)
 * Backend utilise taux variable selon poids poisson
 *
 * @param biomassKg - Biomasse totale en kg
 * @param days - Nombre de jours à couvrir
 * @returns Besoin estimé en kg
 *
 * @example
 * estimateFeedNeed(100, 30); // ~105 kg pour 30 jours (UX feedback)
 */
export const estimateFeedNeed = (biomassKg: number, days: number): number => {
  const dailyFeedingRate = 0.035; // 3.5% simplifié (backend a taux réels)
  const dailyFeed = biomassKg * dailyFeedingRate;
  return Math.round(dailyFeed * days);
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  estimateTotalPrice,
  estimateTotalBags,
  estimateDeliveryFee,
  isFreeDelivery,
  bagsNeededForFreeDelivery,
  estimateFeedNeed,
};
