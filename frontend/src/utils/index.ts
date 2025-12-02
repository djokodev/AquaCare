/**
 * Point d'entrÃ©e centralisÃ© pour tous les utilitaires frontend.
 *
 * Architecture:
 * - formatters: Fonctions de formatage d'affichage uniquement
 * - validators: Validations UX lÃ©gÃ¨res (la vraie validation est backend)
 */

// Formatters gÃ©nÃ©raux
export {
  formatNumber,
  formatPercentage,
  formatDate,
  formatDateTime,
  formatDaysSince,
  formatCurrency,
} from './formatters';

// Formatters aquaculture spÃ©cifiques
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

// Interpreters (logique lÃ©gÃ¨re d'affichage)
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




