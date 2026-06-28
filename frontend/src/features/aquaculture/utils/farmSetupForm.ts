import {
  DEFAULT_EXPECTED_SURVIVAL_RATE_PCT,
  TECHNICAL_PAUSE_BETWEEN_CYCLES_DAYS,
  HARVEST_DENSITY_POND_KG_PER_M2,
  HARVEST_DENSITY_TANK_KG_PER_M3,
  STOCKING_DENSITY_POND_PER_M2,
  STOCKING_DENSITY_TANK_PER_M3,
} from '@/constants/aquaculture';
import { CYCLE_SIMULATION_DEFAULTS } from '@/domain/commerce/constants';
import {
  getProductionUnitsCompatibilitySummary,
  getTotalProductionUnitsCapacity,
  normalizeProductionUnitType,
} from '@/features/aquaculture/utils/productionUnits';
import type { ProductionUnitDraft } from '@/features/aquaculture/types/productionUnits';
import type {
  CycleSimulationInput,
  FarmSetupData,
} from '@/features/aquaculture/types/farmSetup';

export type FarmSetupSpecies = 'tilapia' | 'clarias' | 'autre';
export type FarmSetupInfraType = 'etang' | 'cage_flottante' | 'bac_hors_sol' | 'bac_en_sol';

export interface FarmSetupFormState {
  species: FarmSetupSpecies | '';
  infraType: FarmSetupInfraType | '';
  unitCount: string;
  unitVolume: string;
  unitSurface: string;
  annualTarget: string;
  startDate: string;
  fingerlingsPrice: string;
  sellingPrice: string;
  otherCosts: string;
  fingerlingsCount: string;
  harvestWeight: string;
  survivalRate: string;
  productionUnits: ProductionUnitDraft[];
}

export type FarmSetupFormErrors = Partial<Record<keyof FarmSetupFormState, string>>;

export interface StockingDensityPreview {
  density: number;
  max: number;
  unit: string;
  isOk: boolean;
}

export interface FingerlingsCoherencePreview {
  count: number;
  maxCycle: number;
  level: 'ok' | 'warn' | 'error';
}

export interface FingerlingsCapacityStatusPreview {
  level: 'ok' | 'warn' | 'error';
  key:
    | 'createFarmCapacityHighlyUnderused'
    | 'createFarmCapacityUnderused'
    | 'createFarmCapacityConsistent'
    | 'createFarmCapacityReached'
    | 'createFarmCapacityOver';
  maxCycle: number;
}

export interface FingerlingsSuggestionPreview {
  value: number;
}

export const DEFAULT_CYCLE_SURVIVAL_RATE_PCT = DEFAULT_EXPECTED_SURVIVAL_RATE_PCT;

export const sanitizePositiveIntegerInput = (value: string): string => {
  const digitsOnly = value.replace(/\D+/g, '');
  if (!digitsOnly) {
    return '';
  }

  return digitsOnly.replace(/^0+(?=\d)/, '');
};

const toFloat = (value: string): number => parseFloat(value) || 0;
const toInt = (value: string): number => parseInt(value, 10) || 0;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const parseStrictNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseStrictInteger = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const isValidISODate = (value: string): boolean => {
  if (!ISO_DATE_REGEX.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

export const todayISO = (): string => new Date().toISOString().split('T')[0];

export const getSimulationSpecies = (species: FarmSetupFormState['species']): 'tilapia' | 'clarias' =>
  species === 'clarias' ? 'clarias' : 'tilapia';

export const getSpeciesHarvestWeightDefault = (species: FarmSetupFormState['species']): number =>
  species === 'clarias' ? 400 : 350;

export const getCompatibilityCyclesPerYear = (
  form: FarmSetupFormState
): 1 | 2 | 3 => {
  const speciesKey = form.species === 'clarias' ? 'catfish' : 'tilapia';
  const cycleDurationDays = CYCLE_SIMULATION_DEFAULTS[speciesKey].cycle_duration_days;
  const periodDays = cycleDurationDays + TECHNICAL_PAUSE_BETWEEN_CYCLES_DAYS;
  const derived = periodDays > 0 ? Math.floor(365 / periodDays) : 1;
  return Math.min(3, Math.max(1, derived)) as 1 | 2 | 3;
};

export const getCycleProductionEstimate = (form: FarmSetupFormState): number | null => {
  const count = toInt(form.fingerlingsCount);
  if (!count) return null;

  const survivalRate = toFloat(form.survivalRate || String(DEFAULT_CYCLE_SURVIVAL_RATE_PCT)) / 100;
  const harvestWeightG = toFloat(
    form.harvestWeight || String(getSpeciesHarvestWeightDefault(form.species))
  );
  if (!survivalRate || !harvestWeightG) return null;

  return (count * survivalRate * harvestWeightG) / 1000;
};

const getInfrastructureCapacityCount = (form: FarmSetupFormState): number | null => {
  if (form.productionUnits.length > 0) {
    return getTotalProductionUnitsCapacity(form.productionUnits);
  }

  const units = toFloat(form.unitCount);
  if (!form.infraType || !units) return null;

  if (form.infraType === 'etang') {
    const surface = toFloat(form.unitSurface);
    if (!surface) return null;
    return units * surface * STOCKING_DENSITY_POND_PER_M2;
  }

  const volume = toFloat(form.unitVolume);
  if (!volume) return null;
  return units * volume * STOCKING_DENSITY_TANK_PER_M3;
};

const getInfrastructureFootprint = (form: FarmSetupFormState): number | null => {
  if (form.productionUnits.length > 0) {
    const summary = getProductionUnitsCompatibilitySummary(form.productionUnits);
    if (!summary || summary.is_mixed || !summary.primary_unit) {
      return null;
    }

    const unitType = normalizeProductionUnitType(summary.primary_unit.unit_type);
    if (unitType === 'pond') {
      const totalSurface = form.productionUnits.reduce((total, unit) => {
        const dimension = unit.surface_m2 ? Number(unit.surface_m2) : 0;
        return total + dimension;
      }, 0);
      return totalSurface || null;
    }

    const totalVolume = form.productionUnits.reduce((total, unit) => {
      const dimension = unit.volume_m3 ? Number(unit.volume_m3) : 0;
      return total + dimension;
    }, 0);
    return totalVolume || null;
  }

  const units = toFloat(form.unitCount);
  if (!form.infraType || !units) return null;

  if (form.infraType === 'etang') {
    const surface = toFloat(form.unitSurface);
    if (!surface) return null;
    return units * surface;
  }

  const volume = toFloat(form.unitVolume);
  if (!volume) return null;
  return units * volume;
};

export const getStockingDensityPreview = (
  form: FarmSetupFormState
): StockingDensityPreview | null => {
  const count = toInt(form.fingerlingsCount);
  const footprint = getInfrastructureFootprint(form);
  const capacityCount = getInfrastructureCapacityCount(form);
  if (!count || (!form.productionUnits.length && !form.infraType) || !footprint || !capacityCount) {
    return null;
  }

  if (form.infraType === 'etang') {
    const density = count / footprint;
    return {
      density,
      max: STOCKING_DENSITY_POND_PER_M2,
      unit: 'm²',
      isOk: count <= capacityCount,
    };
  }

  const density = count / footprint;
  return {
    density,
    max: STOCKING_DENSITY_TANK_PER_M3,
    unit: 'm³',
    isOk: count <= capacityCount,
  };
};

export const getFingerlingsCoherencePreview = (
  form: FarmSetupFormState
): FingerlingsCoherencePreview | null => {
  const count = toInt(form.fingerlingsCount);
  const maxCycle = getInfrastructureCapacityCount(form);
  if (!count || !maxCycle) return null;
  const ratio = count / maxCycle;
  const level =
    ratio > 1
      ? 'error'
      : ratio < 0.9
        ? 'ok'
        : ratio < 1
          ? 'warn'
          : 'ok';

  return {
    count,
    maxCycle,
    level,
  };
};

export const getFingerlingsCapacityStatusPreview = (
  form: FarmSetupFormState
): FingerlingsCapacityStatusPreview | null => {
  const coherence = getFingerlingsCoherencePreview(form);
  if (!coherence) return null;

  const ratio = coherence.count / coherence.maxCycle;
  if (ratio > 1) {
    return {
      level: 'error',
      key: 'createFarmCapacityOver',
      maxCycle: coherence.maxCycle,
    };
  }

  if (ratio === 1) {
    return {
      level: 'ok',
      key: 'createFarmCapacityReached',
      maxCycle: coherence.maxCycle,
    };
  }

  if (ratio >= 0.8) {
    return {
      level: 'ok',
      key: 'createFarmCapacityConsistent',
      maxCycle: coherence.maxCycle,
    };
  }

  if (ratio >= 0.5) {
    return {
      level: 'warn',
      key: 'createFarmCapacityUnderused',
      maxCycle: coherence.maxCycle,
    };
  }

  return {
    level: 'warn',
    key: 'createFarmCapacityHighlyUnderused',
    maxCycle: coherence.maxCycle,
  };
};

export const getTotalCapacityPreview = (form: FarmSetupFormState): string | null => {
  if (form.productionUnits.length > 0) {
    const capacity = getTotalProductionUnitsCapacity(form.productionUnits);
    return capacity !== null ? `${Math.round(capacity)}` : null;
  }

  const count = toFloat(form.unitCount);
  if (form.infraType === 'etang') {
    const surface = toFloat(form.unitSurface);
    return count * surface > 0 ? `${count * surface} m²` : null;
  }

  const volume = toFloat(form.unitVolume);
  return count * volume > 0 ? `${count * volume} m³` : null;
};

export const getFingerlingsSuggestionPreview = (
  form: FarmSetupFormState
): FingerlingsSuggestionPreview | null => {
  if (form.productionUnits.length > 0) {
    const maxAllowed = getTotalProductionUnitsCapacity(form.productionUnits);
    if (!maxAllowed) return null;
    return {
      value: Math.round(maxAllowed),
    };
  }

  const maxAllowed = getInfrastructureCapacityCount(form);
  if (!maxAllowed) return null;

  return {
    value: Math.round(maxAllowed),
  };
};

export const getHarvestCapacityPerCycle = (form: FarmSetupFormState): number | null => {
  const unitCount = toFloat(form.unitCount);
  if (!unitCount || !form.infraType) return null;

  if (form.infraType === 'etang') {
    const surface = toFloat(form.unitSurface);
    return unitCount * surface * HARVEST_DENSITY_POND_KG_PER_M2;
  }

  const volume = toFloat(form.unitVolume);
  return unitCount * volume * HARVEST_DENSITY_TANK_KG_PER_M3;
};

export const validateFarmSetupForm = (
  form: FarmSetupFormState
): FarmSetupFormErrors => {
  const errors: FarmSetupFormErrors = {};
  const unitCount = parseStrictInteger(form.unitCount);
  const fingerlingsCount = parseStrictInteger(form.fingerlingsCount);
  const hasProductionUnits = form.productionUnits.length > 0;

  if (!form.species) errors.species = 'required';

  if (!hasProductionUnits) {
    if (!form.infraType) errors.infraType = 'required';

    if (!form.unitCount.trim()) {
      errors.unitCount = 'required';
    } else if (unitCount === null || unitCount <= 0) {
      errors.unitCount = 'createFarmPositiveIntegerError';
    }

    if (form.infraType === 'etang') {
      const unitSurface = parseStrictNumber(form.unitSurface);
      if (!form.unitSurface.trim()) {
        errors.unitSurface = 'required';
      } else if (unitSurface === null || unitSurface <= 0) {
        errors.unitSurface = 'createFarmPositiveNumberError';
      }
    } else if (form.infraType) {
      const unitVolume = parseStrictNumber(form.unitVolume);
      if (!form.unitVolume.trim()) {
        errors.unitVolume = 'required';
      } else if (unitVolume === null || unitVolume <= 0) {
        errors.unitVolume = 'createFarmPositiveNumberError';
      }
    }
  }

  if (!form.fingerlingsCount.trim()) {
    errors.fingerlingsCount = 'required';
  } else if (fingerlingsCount === null || fingerlingsCount <= 0) {
    errors.fingerlingsCount = 'createFarmPositiveIntegerError';
  } else {
    const capacityCount = getInfrastructureCapacityCount(form);
    if (capacityCount !== null && fingerlingsCount > capacityCount) {
      errors.fingerlingsCount = 'createFarmStockingDensityError';
    }
  }

  if (form.startDate.trim() && !isValidISODate(form.startDate.trim())) {
    errors.startDate = 'createFarmInvalidDateError';
  }

  if (form.fingerlingsPrice.trim()) {
    const value = parseStrictNumber(form.fingerlingsPrice);
    if (value === null || value < 0) {
      errors.fingerlingsPrice = 'createFarmNonNegativeNumberError';
    }
  }

  if (form.sellingPrice.trim()) {
    const value = parseStrictNumber(form.sellingPrice);
    if (value === null || value <= 0) {
      errors.sellingPrice = 'createFarmPositiveNumberError';
    }
  }

  if (form.otherCosts.trim()) {
    const value = parseStrictNumber(form.otherCosts);
    if (value === null || value < 0) {
      errors.otherCosts = 'createFarmNonNegativeNumberError';
    }
  }

  if (form.fingerlingsCount.trim()) {
    const value = parseStrictInteger(form.fingerlingsCount);
    if (value === null || value <= 0) {
      errors.fingerlingsCount = 'createFarmPositiveIntegerError';
    }
  }

  if (form.harvestWeight.trim()) {
    const value = parseStrictNumber(form.harvestWeight);
    if (value === null || value < 50 || value > 5000) {
      errors.harvestWeight = 'createFarmHarvestWeightRangeError';
    }
  }

  if (form.survivalRate.trim()) {
    const value = parseStrictNumber(form.survivalRate);
    if (value === null || value < 1 || value > 100) {
      errors.survivalRate = 'createFarmSurvivalRateRangeError';
    }
  }

  return errors;
};

export const hasFarmSetupErrors = (errors: FarmSetupFormErrors): boolean =>
  Object.values(errors).some(Boolean);

export const buildCycleSimulationInput = (
  form: FarmSetupFormState,
  numCycles?: 1 | 2 | 3
): CycleSimulationInput => ({
  species: getSimulationSpecies(form.species),
  // API compatibility: backend still accepts legacy annual-first field names,
  // while the mobile setup now computes and displays cycle-first values.
  annual_production_target_kg: (() => {
    const cycleProductionKg = getCycleProductionEstimate(form) ?? 0;
    const compatibilityCycles = numCycles ?? getCompatibilityCyclesPerYear(form);
    return roundToTwoDecimals(cycleProductionKg * compatibilityCycles);
  })(),
  num_cycles: numCycles ?? getCompatibilityCyclesPerYear(form),
  start_date: form.startDate || todayISO(),
  selling_price_per_kg_fcfa: form.sellingPrice ? toFloat(form.sellingPrice) : undefined,
  fingerlings_cost_per_unit_fcfa: form.fingerlingsPrice ? toFloat(form.fingerlingsPrice) : undefined,
  other_costs_fcfa_per_year: form.otherCosts ? toFloat(form.otherCosts) : undefined,
  target_harvest_weight_g: form.harvestWeight ? toFloat(form.harvestWeight) : undefined,
  expected_survival_rate_pct: form.survivalRate
    ? toFloat(form.survivalRate)
    : DEFAULT_CYCLE_SURVIVAL_RATE_PCT,
  total_fingerlings_count: form.fingerlingsCount
    ? toInt(form.fingerlingsCount) * (numCycles ?? getCompatibilityCyclesPerYear(form))
    : undefined,
});

export const buildFarmSetupPayload = (
  form: FarmSetupFormState,
  numCycles?: 1 | 2 | 3
): FarmSetupData => ({
  setup_species: (form.species as FarmSetupData['setup_species']) || 'tilapia',
  setup_infrastructure_type: (() => {
    const summary = getProductionUnitsCompatibilitySummary(form.productionUnits);
    if (summary) {
      return summary.legacy_infrastructure_type as FarmSetupData['setup_infrastructure_type'];
    }
    return form.infraType as FarmSetupData['setup_infrastructure_type'];
  })(),
  setup_unit_count: (() => {
    const summary = getProductionUnitsCompatibilitySummary(form.productionUnits);
    if (summary) {
      return summary.legacy_unit_count;
    }
    return toInt(form.unitCount) || 1;
  })(),
  setup_unit_volume_m3: (() => {
    const summary = getProductionUnitsCompatibilitySummary(form.productionUnits);
    if (summary?.primary_unit && normalizeProductionUnitType(summary.primary_unit.unit_type) !== 'pond') {
      const value = summary.primary_unit.volume_m3 ? Number(summary.primary_unit.volume_m3) : null;
      return value ?? undefined;
    }
    return form.unitVolume ? toFloat(form.unitVolume) : undefined;
  })(),
  setup_unit_surface_m2: (() => {
    const summary = getProductionUnitsCompatibilitySummary(form.productionUnits);
    if (summary?.primary_unit && normalizeProductionUnitType(summary.primary_unit.unit_type) === 'pond') {
      const value = summary.primary_unit.surface_m2 ? Number(summary.primary_unit.surface_m2) : null;
      return value ?? undefined;
    }
    return form.unitSurface ? toFloat(form.unitSurface) : undefined;
  })(),
  annual_production_target_kg: (() => {
    const cycleProductionKg = getCycleProductionEstimate(form) ?? 0;
    const compatibilityCycles = numCycles ?? getCompatibilityCyclesPerYear(form);
    return roundToTwoDecimals(cycleProductionKg * compatibilityCycles);
  })(),
  num_cycles_per_year: numCycles ?? getCompatibilityCyclesPerYear(form),
  fingerlings_cost_per_unit_fcfa: form.fingerlingsPrice ? toFloat(form.fingerlingsPrice) : undefined,
  planned_selling_price_per_kg_fcfa: form.sellingPrice ? toFloat(form.sellingPrice) : undefined,
});

const roundToTwoDecimals = (value: number): number => Math.round(value * 100) / 100;
