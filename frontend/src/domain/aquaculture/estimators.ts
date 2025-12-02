/**
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 *                    ESTIMATEURS TEMPORAIRES UX UNIQUEMENT
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 *
 * âš ï¸ RÃˆGLE CRITIQUE - ARCHITECTURE FRONTEND
 *
 * Ce fichier contient des ESTIMATIONS TEMPORAIRES pour amÃ©liorer l'UX.
 * Ces fonctions ne doivent JAMAIS Ãªtre utilisÃ©es pour de la logique mÃ©tier.
 *
 * USAGE AUTORISÃ‰ âœ… :
 * - Affichage estimation PENDANT saisie formulaire (feedback immÃ©diat)
 * - Mode offline temporaire (avant sync backend)
 * - Indicateurs visuels "en cours de saisie"
 *
 * USAGE INTERDIT âŒ :
 * - Calculs mÃ©tier dÃ©finitifs
 * - Prises de dÃ©cision business
 * - Statistiques ou rapports
 * - Stockage en base de donnÃ©es
 *
 * SOURCE DE VÃ‰RITÃ‰ :
 * Backend Django (apps/aquaculture/domain/calculators.py)
 *
 * SYNCHRONISATION :
 * Toutes ces estimations sont Ã‰CRASÃ‰ES par les calculs backend lors :
 * - CrÃ©ation cycle : backend calcule biomasse/densitÃ© officielles
 * - Sauvegarde log : backend recalcule poids moyen
 * - Sync offline : backend remplace TOUTES les estimations
 *
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 */

/**
 * Estime la biomasse totale (mode offline temporaire).
 * Backend recalcule avec AquacultureCalculator.calculate_biomass()
 *
 * @param fishCount - Nombre de poissons
 * @param averageWeight - Poids moyen en grammes
 * @returns Biomasse estimÃ©e en kg
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
 * @returns Taux de survie estimÃ© en %
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
 * Estime la densitÃ© d'Ã©levage (mode offline temporaire).
 * Backend recalcule avec AquacultureCalculator.calculate_stocking_density()
 *
 * @param biomassKg - Biomasse en kg
 * @param volumeM3 - Volume en mÂ³
 * @returns DensitÃ© estimÃ©e en kg/mÂ³
 */
export const estimateDensity = (
  biomassKg: number,
  volumeM3: number
): number => {
  if (volumeM3 <= 0 || biomassKg <= 0) return 0;
  return biomassKg / volumeM3;
};

/**
 * Estime le nombre de jours Ã©coulÃ©s depuis une date.
 *
 * @param startDate - Date de dÃ©part (ISO 8601)
 * @returns Nombre de jours Ã©coulÃ©s
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
 * Estime le poids projetÃ© d'un poisson aprÃ¨s N jours.
 * Utilise une croissance linÃ©aire simplifiÃ©e (mode offline).
 * Backend utilise des formules scientifiques complexes.
 *
 * @param currentWeight - Poids actuel en grammes
 * @param growthRatePerDay - Taux de croissance en g/jour
 * @param days - Nombre de jours de projection
 * @returns Poids projetÃ© en grammes
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
 * Estime la quantitÃ© d'aliment journaliÃ¨re simplifiÃ©e.
 * Backend utilise les tables Skretting/Aller Aqua officielles.
 *
 * @param biomassKg - Biomasse en kg
 * @param feedingRatePercent - Taux d'alimentation en %
 * @returns QuantitÃ© journaliÃ¨re estimÃ©e en kg
 */
export const estimateDailyFeed = (
  biomassKg: number,
  feedingRatePercent: number
): number => {
  if (biomassKg <= 0 || feedingRatePercent <= 0) return 0;
  return biomassKg * (feedingRatePercent / 100);
};

/**
 * Estime la densitÃ© d'Ã©levage (mode offline temporaire).
 * GÃ¨re densitÃ© volumÃ©trique (kg/mÂ³) et superficielle (kg/mÂ²).
 * Backend recalcule avec AquacultureCalculator.calculate_stocking_density()
 *
 * @param biomassKg - Biomasse en kg
 * @param volumeM3 - Volume en mÂ³ (optionnel)
 * @param surfaceM2 - Surface en mÂ² (optionnel)
 * @returns Objet avec valeur et unitÃ©
 */
export const estimateDensityWithUnit = (
  biomassKg: number,
  volumeM3?: number,
  surfaceM2?: number
): { value: number; unit: string } => {
  // PrioritÃ© au volume (plus prÃ©cis)
  if (volumeM3 && volumeM3 > 0) {
    return {
      value: biomassKg / volumeM3,
      unit: 'kg/mÂ³'
    };
  }

  // Fallback surface
  if (surfaceM2 && surfaceM2 > 0) {
    return {
      value: biomassKg / surfaceM2,
      unit: 'kg/mÂ²'
    };
  }

  return { value: 0, unit: 'kg/mÂ²' };
};

/**
 * Estime le poids moyen depuis un Ã©chantillon (mode offline temporaire).
 * Backend recalcule lors de la sauvegarde du log.
 *
 * @param sampleTotalWeightGrams - Poids total Ã©chantillon en grammes
 * @param sampleCount - Nombre de poissons dans l'Ã©chantillon
 * @returns Poids moyen en grammes
 */
export const estimateAverageWeight = (
  sampleTotalWeightGrams: number,
  sampleCount: number
): number => {
  if (sampleCount <= 0) return 0;
  return sampleTotalWeightGrams / sampleCount;
};




