/**
 * Constantes mÃ©tier pour l'aquaculture.
 *
 * Ces constantes sont utilisÃ©es pour la validation UX et l'affichage.
 * Les rÃ¨gles mÃ©tier RÃ‰ELLES sont dans le backend Django.
 */

/**
 * EspÃ¨ces de poissons supportÃ©es.
 */
export const FISH_SPECIES = {
  TILAPIA: 'tilapia',
  CLARIAS: 'clarias',
} as const;

export type FishSpecies = typeof FISH_SPECIES[keyof typeof FISH_SPECIES];

/**
 * Plages optimales de paramÃ¨tres environnementaux (pour affichage UX).
 * Les valeurs officielles sont dans backend constants.py
 */
export const OPTIMAL_RANGES = {
  temperature: {
    min: 24,
    max: 30,
    unit: 'Â°C',
  },
  ph: {
    min: 6.5,
    max: 8.5,
    unit: '',
  },
  oxygen: {
    min: 4,
    max: 8,
    unit: 'mg/L',
  },
  density: {
    clarias: {
      max: 150,
      unit: 'kg/mÂ³',
    },
    tilapia: {
      max: 100,
      unit: 'kg/mÂ³',
    },
  },
} as const;

/**
 * DurÃ©es typiques de cycle (en jours).
 */
export const CYCLE_DURATIONS = {
  clarias: {
    min: 90,
    typical: 120,
    max: 150,
  },
  tilapia: {
    min: 150,
    typical: 180,
    max: 210,
  },
} as const;

/**
 * Defaults de planification cycle-first utilisés par l'UX.
 */
export const CYCLE_PLANNING_DEFAULTS = {
  expected_survival_rate_pct: 95,
  other_costs_rate_pct: 5,
  technical_pause_days: 14,
} as const;

/**
 * Stades de croissance.
 */
export const GROWTH_STAGES = {
  ALEVIN: 'alevin',        // < 10g
  JUVENILE: 'juvenile',    // 10-50g
  CROISSANCE: 'croissance', // 50-150g
  FINITION: 'finition',    // > 150g
} as const;

export type GrowthStage = typeof GROWTH_STAGES[keyof typeof GROWTH_STAGES];

/**
 * Types de notification.
 */
export const NOTIFICATION_TYPES = {
  FEEDING: 'feeding',
  ENVIRONMENTAL_ALERT: 'environmental_alert',
  HARVEST_DUE: 'harvest_due',
  SANITARY_EVENT: 'sanitary_event',
  SYSTEM: 'system',
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];

/**
 * Niveaux de sÃ©vÃ©ritÃ©.
 */
export const SEVERITY_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
} as const;

export type SeverityLevel = typeof SEVERITY_LEVELS[keyof typeof SEVERITY_LEVELS];

/**
 * Statuts de cycle de production.
 */
export const CYCLE_STATUS = {
  ACTIVE: 'active',
  HARVESTED: 'harvested',
  FAILED: 'failed',
} as const;

export type CycleStatus = typeof CYCLE_STATUS[keyof typeof CYCLE_STATUS];

/**
 * Objectifs de performance AquaCare (pour affichage).
 */
export const PERFORMANCE_TARGETS = {
  fcr: {
    excellent: 1.2,
    good: 1.5,
    acceptable: 2.0,
  },
  survivalRate: {
    excellent: 90,
    good: 80,
    acceptable: 70,
  },
  dailyGrowth: {
    clarias: {
      excellent: 2.5,
      good: 2.0,
      acceptable: 1.5,
    },
    tilapia: {
      excellent: 2.0,
      good: 1.5,
      acceptable: 1.0,
    },
  },
} as const;

/**
 * Limites de saisie pour validation UX.
 */
export const INPUT_LIMITS = {
  fishCount: {
    min: 1,
    max: 1000000,
  },
  fishWeight: {
    min: 0.1,
    max: 5000, // grammes
  },
  temperature: {
    min: 15,
    max: 35,
  },
  ph: {
    min: 4,
    max: 10,
  },
  oxygen: {
    min: 0,
    max: 20,
  },
  mortality: {
    min: 0,
    max: 1000000, // nombre de poissons
  },
} as const;



