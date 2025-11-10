/**
 * ═══════════════════════════════════════════════════════════════════════
 *                    ESTIMATEURS TEMPORAIRES UX UNIQUEMENT
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ⚠️ RÈGLE CRITIQUE - ARCHITECTURE FRONTEND
 *
 * Ce fichier contient des ESTIMATIONS TEMPORAIRES pour améliorer l'UX.
 * Ces fonctions ne doivent JAMAIS être utilisées pour de la logique métier.
 *
 * USAGE AUTORISÉ ✅ :
 * - Affichage estimation PENDANT saisie formulaire (feedback immédiat)
 * - Mode offline temporaire (avant sync backend)
 * - Indicateurs visuels "en cours de saisie"
 *
 * USAGE INTERDIT ❌ :
 * - Calculs métier définitifs
 * - Prises de décision business
 * - Statistiques ou rapports
 * - Stockage en base de données
 *
 * SOURCE DE VÉRITÉ :
 * Backend Django (apps/aquaculture/domain/calculators.py)
 *
 * SYNCHRONISATION :
 * Toutes ces estimations sont ÉCRASÉES par les calculs backend lors :
 * - Création cycle : backend calcule biomasse/densité officielles
 * - Sauvegarde log : backend recalcule poids moyen
 * - Sync offline : backend remplace TOUTES les estimations
 *
 * ═══════════════════════════════════════════════════════════════════════
 */

/**
 * Estime la biomasse totale (mode offline temporaire).
 * Backend recalcule avec AquacultureCalculator.calculate_biomass()
 *
 * @param fishCount - Nombre de poissons
 * @param averageWeight - Poids moyen en grammes
 * @returns Biomasse estimée en kg
 */
export const estimateBiomass = (
  fishCount: number,
  averageWeight: number
): number => {
  if (fishCount <= 0 || averageWeight <= 0) return 0;
  return (fishCount * averageWeight) / 1000;
};

/**
 * Estime le taux de survie (mode offline temporaire).
 * Backend recalcule avec AquacultureCalculator.calculate_survival_rate()
 *
 * @param initialCount - Nombre initial de poissons
 * @param currentCount - Nombre actuel de poissons
 * @returns Taux de survie estimé en %
 */
export const estimateSurvivalRate = (
  initialCount: number,
  currentCount: number
): number => {
  if (initialCount <= 0) return 0;
  if (currentCount < 0) return 0;
  return (currentCount / initialCount) * 100;
};

/**
 * Estime la densité d'élevage (mode offline temporaire).
 * Backend recalcule avec AquacultureCalculator.calculate_stocking_density()
 *
 * @param biomassKg - Biomasse en kg
 * @param volumeM3 - Volume en m³
 * @returns Densité estimée en kg/m³
 */
export const estimateDensity = (
  biomassKg: number,
  volumeM3: number
): number => {
  if (volumeM3 <= 0 || biomassKg <= 0) return 0;
  return biomassKg / volumeM3;
};

/**
 * Estime le nombre de jours écoulés depuis une date.
 *
 * @param startDate - Date de départ (ISO 8601)
 * @returns Nombre de jours écoulés
 */
export const estimateDaysElapsed = (startDate: string): number => {
  try {
    const start = new Date(startDate);
    if (isNaN(start.getTime())) return 0;
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - start.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  } catch (error) {
    return 0;
  }
};

/**
 * Estime le poids projeté d'un poisson après N jours.
 * Utilise une croissance linéaire simplifiée (mode offline).
 * Backend utilise des formules scientifiques complexes.
 *
 * @param currentWeight - Poids actuel en grammes
 * @param growthRatePerDay - Taux de croissance en g/jour
 * @param days - Nombre de jours de projection
 * @returns Poids projeté en grammes
 */
export const estimateProjectedWeight = (
  currentWeight: number,
  growthRatePerDay: number,
  days: number
): number => {
  if (currentWeight <= 0 || days <= 0) return currentWeight;
  return currentWeight + (growthRatePerDay * days);
};

/**
 * Estime la quantité d'aliment journalière simplifiée.
 * Backend utilise les tables Skretting/Aller Aqua officielles.
 *
 * @param biomassKg - Biomasse en kg
 * @param feedingRatePercent - Taux d'alimentation en %
 * @returns Quantité journalière estimée en kg
 */
export const estimateDailyFeed = (
  biomassKg: number,
  feedingRatePercent: number
): number => {
  if (biomassKg <= 0 || feedingRatePercent <= 0) return 0;
  return biomassKg * (feedingRatePercent / 100);
};

/**
 * Estime la densité d'élevage (mode offline temporaire).
 * Gère densité volumétrique (kg/m³) et superficielle (kg/m²).
 * Backend recalcule avec AquacultureCalculator.calculate_stocking_density()
 *
 * @param biomassKg - Biomasse en kg
 * @param volumeM3 - Volume en m³ (optionnel)
 * @param surfaceM2 - Surface en m² (optionnel)
 * @returns Objet avec valeur et unité
 */
export const estimateDensityWithUnit = (
  biomassKg: number,
  volumeM3?: number,
  surfaceM2?: number
): { value: number; unit: string } => {
  // Priorité au volume (plus précis)
  if (volumeM3 && volumeM3 > 0) {
    return {
      value: biomassKg / volumeM3,
      unit: 'kg/m³'
    };
  }

  // Fallback surface
  if (surfaceM2 && surfaceM2 > 0) {
    return {
      value: biomassKg / surfaceM2,
      unit: 'kg/m²'
    };
  }

  return { value: 0, unit: 'kg/m²' };
};

/**
 * Estime le poids moyen depuis un échantillon (mode offline temporaire).
 * Backend recalcule lors de la sauvegarde du log.
 *
 * @param sampleTotalWeightGrams - Poids total échantillon en grammes
 * @param sampleCount - Nombre de poissons dans l'échantillon
 * @returns Poids moyen en grammes
 */
export const estimateAverageWeight = (
  sampleTotalWeightGrams: number,
  sampleCount: number
): number => {
  if (sampleCount <= 0) return 0;
  return sampleTotalWeightGrams / sampleCount;
};
