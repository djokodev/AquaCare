/**
 * Helpers d'interprï¿½tation mï¿½tier pour affichage frontend.
 *
 * ï¿½ Rï¿½GLE IMPORTANTE :
 * Ces fonctions N'effectuent PAS de calculs mï¿½tier.
 * Elles INTERPRï¿½TENT des valeurs dï¿½jï¿½ calculï¿½es par le backend.
 * Logique Lï¿½Gï¿½RE d'affichage seulement (badges, couleurs, messages).
 */

export type FCRInterpretation = 'excellent' | 'bon' | 'acceptable' | 'necessite amelioration';
export type SurvivalRateInterpretation = 'excellent' | 'bon' | 'moyen' | 'faible';
export type PerformanceLevel = 'excellent' | 'bon' | 'moyen' | 'faible';

/**
 * Interprï¿½te un FCR selon standards MAVECAM.
 *
 * @param fcr - FCR calculï¿½ par backend
 * @returns Interprï¿½tation textuelle
 *
 * Rï¿½fï¿½rences:
 * - FCR < 1.2 = excellent (efficacitï¿½ >83%)
 * - FCR 1.2-1.5 = bon (efficacitï¿½ 67-83%)
 * - FCR 1.5-2.0 = acceptable (efficacitï¿½ 50-67%)
 * - FCR > 2.0 = nï¿½cessite amï¿½lioration (efficacitï¿½ <50%)
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
 * Interprï¿½te un taux de survie selon standards aquaculture.
 *
 * @param survivalRate - Taux en % (calculï¿½ par backend)
 * @returns Interprï¿½tation textuelle
 *
 * Rï¿½fï¿½rences:
 * - e85% = excellent
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
 * Vï¿½rifie si densitï¿½ est optimale pour l'espï¿½ce.
 *
 * @param density - Densitï¿½ en kg/mï¿½ (calculï¿½e par backend)
 * @param species - Espï¿½ce ('tilapia' ou 'clarias')
 * @returns true si densitï¿½ optimale
 *
 * Plages optimales MAVECAM:
 * - Tilapia: 100-300 kg/mï¿½
 * - Clarias: 200-500 kg/mï¿½
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
 * Interprï¿½te un score de performance global.
 *
 * @param score - Score 0-100 (calculï¿½ par backend)
 * @returns Interprï¿½tation textuelle
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
 * Retourne la couleur associï¿½e ï¿½ une interprï¿½tation FCR.
 *
 * @param interpretation - Interprï¿½tation FCR
 * @returns Couleur hexadï¿½cimale
 */
export const getFCRColor = (
  interpretation: FCRInterpretation | null
): string => {
  const colors = {
    'excellent': '#059669',         // Vert MAVECAM
    'bon': '#10b981',              // Vert clair
    'acceptable': '#f59e0b',       // Orange
    'necessite amelioration': '#dc2626' // Rouge
  };

  return interpretation ? colors[interpretation] : '#64748b'; // Gris par dï¿½faut
};

/**
 * Retourne la couleur associï¿½e ï¿½ une interprï¿½tation taux survie.
 *
 * @param interpretation - Interprï¿½tation survie
 * @returns Couleur hexadï¿½cimale
 */
export const getSurvivalRateColor = (
  interpretation: SurvivalRateInterpretation | null
): string => {
  const colors = {
    'excellent': '#059669',  // Vert MAVECAM
    'bon': '#10b981',       // Vert clair
    'moyen': '#f59e0b',     // Orange
    'faible': '#dc2626'     // Rouge
  };

  return interpretation ? colors[interpretation] : '#64748b'; // Gris par dï¿½faut
};

/**
 * Retourne la couleur associï¿½e ï¿½ un niveau de performance.
 *
 * @param level - Niveau de performance
 * @returns Couleur hexadï¿½cimale
 */
export const getPerformanceLevelColor = (
  level: PerformanceLevel | null
): string => {
  const colors = {
    'excellent': '#059669',  // Vert MAVECAM
    'bon': '#10b981',       // Vert clair
    'moyen': '#f59e0b',     // Orange
    'faible': '#dc2626'     // Rouge
  };

  return level ? colors[level] : '#64748b'; // Gris par dï¿½faut
};

/**
 * Gï¿½nï¿½re un message de recommandation basï¿½ sur FCR.
 *
 * @param fcr - FCR calculï¿½ par backend
 * @returns Message de recommandation
 */
export const getFCRRecommendation = (
  fcr: number | null | undefined
): string => {
  const interpretation = interpretFCR(fcr);

  const recommendations = {
    'excellent': 'FCR optimal ! Continuez cette gestion.',
    'bon': 'FCR satisfaisant. Maintenir ce niveau.',
    'acceptable': 'FCR acceptable. Optimisation possible.',
    'necessite amelioration': 'FCR eleve. Consultez un technicien MAVECAM.'
  };

  return interpretation ? recommendations[interpretation] : 'Donnees insuffisantes';
};

/**
 * Gï¿½nï¿½re un message de recommandation basï¿½ sur taux survie.
 *
 * @param survivalRate - Taux en % (calculï¿½ par backend)
 * @returns Message de recommandation
 */
export const getSurvivalRateRecommendation = (
  survivalRate: number | null | undefined
): string => {
  const interpretation = interpretSurvivalRate(survivalRate);

  const recommendations = {
    'excellent': 'Taux de survie excellent ! Bonnes pratiques.',
    'bon': 'Taux de survie satisfaisant.',
    'moyen': 'Taux de survie moyen. Surveillance recommandï¿½e.',
    'faible': 'Taux de survie faible. Contactez MAVECAM.'
  };

  return interpretation ? recommendations[interpretation] : 'Donnees insuffisantes';
};




