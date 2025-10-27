/**
 * Helpers d'interprétation métier pour affichage frontend.
 *
 *   RÈGLE IMPORTANTE :
 * Ces fonctions N'effectuent PAS de calculs métier.
 * Elles INTERPRÈTENT des valeurs déjà calculées par le backend.
 * Logique LÉGÈRE d'affichage seulement (badges, couleurs, messages).
 */

export type FCRInterpretation = 'excellent' | 'bon' | 'acceptable' | 'nécessite amélioration';
export type SurvivalRateInterpretation = 'excellent' | 'bon' | 'moyen' | 'faible';
export type PerformanceLevel = 'excellent' | 'bon' | 'moyen' | 'faible';

/**
 * Interprète un FCR selon standards MAVECAM.
 *
 * @param fcr - FCR calculé par backend
 * @returns Interprétation textuelle
 *
 * Références:
 * - FCR < 1.2 = excellent (efficacité >83%)
 * - FCR 1.2-1.5 = bon (efficacité 67-83%)
 * - FCR 1.5-2.0 = acceptable (efficacité 50-67%)
 * - FCR > 2.0 = nécessite amélioration (efficacité <50%)
 */
export const interpretFCR = (
  fcr: number | null | undefined
): FCRInterpretation | null => {
  if (fcr === null || fcr === undefined) return null;

  if (fcr <= 1.2) return 'excellent';
  if (fcr <= 1.5) return 'bon';
  if (fcr <= 2.0) return 'acceptable';
  return 'nécessite amélioration';
};

/**
 * Interprète un taux de survie selon standards aquaculture.
 *
 * @param survivalRate - Taux en % (calculé par backend)
 * @returns Interprétation textuelle
 *
 * Références:
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
 * Vérifie si densité est optimale pour l'espèce.
 *
 * @param density - Densité en kg/m³ (calculée par backend)
 * @param species - Espèce ('tilapia' ou 'clarias')
 * @returns true si densité optimale
 *
 * Plages optimales MAVECAM:
 * - Tilapia: 100-300 kg/m³
 * - Clarias: 200-500 kg/m³
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
 * Interprète un score de performance global.
 *
 * @param score - Score 0-100 (calculé par backend)
 * @returns Interprétation textuelle
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
 * Retourne la couleur associée à une interprétation FCR.
 *
 * @param interpretation - Interprétation FCR
 * @returns Couleur hexadécimale
 */
export const getFCRColor = (
  interpretation: FCRInterpretation | null
): string => {
  const colors = {
    'excellent': '#059669',         // Vert MAVECAM
    'bon': '#10b981',              // Vert clair
    'acceptable': '#f59e0b',       // Orange
    'nécessite amélioration': '#dc2626' // Rouge
  };

  return interpretation ? colors[interpretation] : '#64748b'; // Gris par défaut
};

/**
 * Retourne la couleur associée à une interprétation taux survie.
 *
 * @param interpretation - Interprétation survie
 * @returns Couleur hexadécimale
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

  return interpretation ? colors[interpretation] : '#64748b'; // Gris par défaut
};

/**
 * Retourne la couleur associée à un niveau de performance.
 *
 * @param level - Niveau de performance
 * @returns Couleur hexadécimale
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

  return level ? colors[level] : '#64748b'; // Gris par défaut
};

/**
 * Génère un message de recommandation basé sur FCR.
 *
 * @param fcr - FCR calculé par backend
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
    'nécessite amélioration': 'FCR élevé. Consultez un technicien MAVECAM.'
  };

  return interpretation ? recommendations[interpretation] : 'Données insuffisantes';
};

/**
 * Génère un message de recommandation basé sur taux survie.
 *
 * @param survivalRate - Taux en % (calculé par backend)
 * @returns Message de recommandation
 */
export const getSurvivalRateRecommendation = (
  survivalRate: number | null | undefined
): string => {
  const interpretation = interpretSurvivalRate(survivalRate);

  const recommendations = {
    'excellent': 'Taux de survie excellent ! Bonnes pratiques.',
    'bon': 'Taux de survie satisfaisant.',
    'moyen': 'Taux de survie moyen. Surveillance recommandée.',
    'faible': 'Taux de survie faible. Contactez MAVECAM.'
  };

  return interpretation ? recommendations[interpretation] : 'Données insuffisantes';
};
