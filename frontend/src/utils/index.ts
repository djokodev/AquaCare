/**
 * Point d'entrée centralisé pour tous les utilitaires frontend.
 *
 * Architecture:
 * - formatters: Fonctions de formatage d'affichage uniquement
 * - validators: Validations UX légères (la vraie validation est backend)
 */

// Formatters généraux
export {
  formatNumber,
  formatPercentage,
  formatDate,
  formatDateTime,
  formatDaysSince,
  formatCurrency,
} from './formatters';

// Formatters aquaculture spécifiques
export {
  formatBiomass,
  formatDensity,
  formatFCR,
  formatSurvivalRate,
  formatDailyGrowthRate,
  formatSpecificGrowthRate,
  formatFeedAmount,
  formatPerformanceScore,
} from './formatters';

// Interpreters (logique légère d'affichage)
export {
  interpretFCR,
  interpretSurvivalRate,
  isDensityOptimal,
  interpretPerformanceScore,
  getFCRColor,
  getSurvivalRateColor,
  getPerformanceLevelColor,
  getFCRRecommendation,
  getSurvivalRateRecommendation,
} from './interpreters';

// Types interpreters
export type {
  FCRInterpretation,
  SurvivalRateInterpretation,
  PerformanceLevel,
} from './interpreters';

// Validators
export {
  isValidCameroonPhone,
  isValidEmail,
  isInRange,
  isPositive,
  isNotEmpty,
  isFutureDate,
  isPastDate,
  isValidTemperature,
  isValidPH,
  isValidOxygen,
  isValidFishWeight,
  isValidFishCount,
} from './validators';
