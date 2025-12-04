/**
 * Helpers d'interpretation metier pour affichage frontend.
 *
 * REGLE IMPORTANTE :
 * Ces fonctions n'effectuent PAS de calculs metier.
 * Elles interpretent des valeurs deja calculees par le backend.
 * Logique legere d'affichage seulement (badges, couleurs, messages).
 */

export type FCRInterpretation = 'excellent' | 'bon' | 'acceptable' | 'necessite amelioration';
export type SurvivalRateInterpretation = 'excellent' | 'bon' | 'moyen' | 'faible';
export type PerformanceLevel = 'excellent' | 'bon' | 'moyen' | 'faible';

/**
 * Interprete un FCR selon standards MAVECAM.
 *
 * @param fcr - FCR calcule par backend
 * @returns Interpretation textuelle
 *
 * References:
 * - FCR < 1.2 = excellent (efficacite >83%)
 * - FCR 1.2-1.5 = bon (efficacite 67-83%)
 * - FCR 1.5-2.0 = acceptable (efficacite 50-67%)
 * - FCR > 2.0 = necessite amelioration (efficacite <50%)
 */
export const interpretFCR = (
  fcr: number | null | undefined
): FCRInterpretation | null => {
  if (fcr === null || fcr === undefined) return null;

  if (fcr <= 1.2) return 'excellent';
  if (fcr <= 1.5) return 'bon';
  if (fcr <= 2.0) return 'acceptable';
  return 'necessite amelioration';
};

/**
 * Interprete un taux de survie selon standards aquaculture.
 *
 * @param survivalRate - Taux en % (calcule par backend)
 * @returns Interpretation textuelle
 *
 * References:
 * - >=85% = excellent
 * - 70-85% = bon
 * - 50-70% = moyen
 * - <50% = faible
 */
export const interpretSurvivalRate = (
  survivalRate: number | null | undefined
): SurvivalRateInterpretation | null => {
  if (survivalRate === null || survivalRate === undefined) return null;

  if (survivalRate >= 85) return 'excellent';
  if (survivalRate >= 70) return 'bon';
  if (survivalRate >= 50) return 'moyen';
  return 'faible';
};

/**
 * Verifie si densite est optimale pour l'espece.
 *
 * @param density - Densite en kg/m3 (calculee par backend)
 * @param species - Espece ('tilapia' ou 'clarias')
 * @returns true si densite optimale
 *
 * Plages optimales MAVECAM:
 * - Tilapia: 100-300 kg/m3
 * - Clarias: 200-500 kg/m3
 */
export const isDensityOptimal = (
  density: number | null | undefined,
  species: 'tilapia' | 'clarias'
): boolean => {
  if (density === null || density === undefined) return false;

  const optimalRanges = {
    tilapia: { min: 100, max: 300 },
    clarias: { min: 200, max: 500 },
  };

  const range = optimalRanges[species];
  return density >= range.min && density <= range.max;
};

/**
 * Interprete un score de performance global.
 *
 * @param score - Score 0-100 (calcule par backend)
 * @returns Interpretation textuelle
 */
export const interpretPerformanceScore = (
  score: number | null | undefined
): PerformanceLevel | null => {
  if (score === null || score === undefined) return null;

  if (score >= 80) return 'excellent';
  if (score >= 60) return 'bon';
  if (score >= 40) return 'moyen';
  return 'faible';
};

/**
 * Retourne la couleur associee a une interpretation FCR.
 *
 * @param interpretation - Interpretation FCR
 * @returns Couleur hexadecimale
 */
export const getFCRColor = (
  interpretation: FCRInterpretation | null
): string => {
  const colors = {
    excellent: '#059669', // Vert MAVECAM
    bon: '#10b981', // Vert clair
    acceptable: '#f59e0b', // Orange
    'necessite amelioration': '#dc2626', // Rouge
  };

  return interpretation ? colors[interpretation] : '#64748b'; // Gris par defaut
};

/**
 * Retourne la couleur associee a une interpretation taux survie.
 *
 * @param interpretation - Interpretation survie
 * @returns Couleur hexadecimale
 */
export const getSurvivalRateColor = (
  interpretation: SurvivalRateInterpretation | null
): string => {
  const colors = {
    excellent: '#059669', // Vert MAVECAM
    bon: '#10b981', // Vert clair
    moyen: '#f59e0b', // Orange
    faible: '#dc2626', // Rouge
  };

  return interpretation ? colors[interpretation] : '#64748b'; // Gris par defaut
};

/**
 * Retourne la couleur associee a un niveau de performance.
 *
 * @param level - Niveau de performance
 * @returns Couleur hexadecimale
 */
export const getPerformanceLevelColor = (
  level: PerformanceLevel | null
): string => {
  const colors = {
    excellent: '#059669', // Vert MAVECAM
    bon: '#10b981', // Vert clair
    moyen: '#f59e0b', // Orange
    faible: '#dc2626', // Rouge
  };

  return level ? colors[level] : '#64748b'; // Gris par defaut
};

/**
 * Genere un message de recommandation base sur FCR.
 *
 * @param fcr - FCR calcule par backend
 * @returns Message de recommandation
 */
export const getFCRRecommendation = (
  fcr: number | null | undefined
): string => {
  const interpretation = interpretFCR(fcr);

  const recommendations = {
    excellent: 'FCR optimal ! Continuez cette gestion.',
    bon: 'FCR satisfaisant. Maintenir ce niveau.',
    acceptable: 'FCR acceptable. Optimisation possible.',
    'necessite amelioration': 'FCR eleve. Consultez un technicien MAVECAM.',
  };

  return interpretation ? recommendations[interpretation] : 'Donnees insuffisantes';
};

/**
 * Genere un message de recommandation base sur taux survie.
 *
 * @param survivalRate - Taux en % (calcule par backend)
 * @returns Message de recommandation
 */
export const getSurvivalRateRecommendation = (
  survivalRate: number | null | undefined
): string => {
  const interpretation = interpretSurvivalRate(survivalRate);

  const recommendations = {
    excellent: 'Taux de survie excellent ! Bonnes pratiques.',
    bon: 'Taux de survie satisfaisant.',
    moyen: 'Taux de survie moyen. Surveillance recommandee.',
    faible: 'Taux de survie faible. Contactez MAVECAM.',
  };

  return interpretation ? recommendations[interpretation] : 'Donnees insuffisantes';
};
