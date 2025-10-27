/**
 * Point d'entrée de la couche Domain frontend.
 *
 * Architecture:
 * - estimators: Calculs offline TEMPORAIRES (backend recalcule tout)
 * - constants: Constantes métier pour UX (règles métier dans backend)
 *
 * RÈGLE CRITIQUE:
 * Le backend est la SEULE source de vérité pour les calculs métier.
 * Les estimators sont uniquement pour feedback UX offline temporaire.
 */

// Estimators (calculs offline temporaires)
export {
  estimateBiomass,
  estimateSurvivalRate,
  estimateDensity,
  estimateDensityWithUnit,
  estimateAverageWeight,
  estimateDaysElapsed,
  estimateProjectedWeight,
  estimateDailyFeed,
} from './estimators';

// Constants métier
export {
  FISH_SPECIES,
  OPTIMAL_RANGES,
  CYCLE_DURATIONS,
  GROWTH_STAGES,
  NOTIFICATION_TYPES,
  SEVERITY_LEVELS,
  CYCLE_STATUS,
  PERFORMANCE_TARGETS,
  INPUT_LIMITS,
} from './constants';

// Types
export type {
  FishSpecies,
  GrowthStage,
  NotificationType,
  SeverityLevel,
  CycleStatus,
} from './constants';
