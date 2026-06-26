import {
  HARVEST_DENSITY_POND_KG_PER_M2,
  HARVEST_DENSITY_TANK_KG_PER_M3,
  RECOMMENDED_STOCKING_DENSITY_POND_PER_M2,
  RECOMMENDED_STOCKING_DENSITY_TANK_PER_M3,
  STOCKING_DENSITY_POND_PER_M2,
  STOCKING_DENSITY_TANK_PER_M3,
} from '@/constants/aquaculture';
import type {
  AnnualSimulationInput,
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
}

export type FarmSetupFormErrors = Partial<Record<keyof FarmSetupFormState, string>>;

export interface StockingDensityPreview {
  density: number;
  max: number;
  unit: string;
  isOk: boolean;
}

export interface FingerlingsCoherencePreview {
  maxAnnual: number;
  level: 'ok' | 'warn' | 'error';
  target: number;
}

export interface FingerlingsSuggestionPreview {
  value: number;
  target: number | null;
  achievable: boolean;
}

const DEFAULT_NUM_CYCLES = 2;

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

export const getStockingDensityPreview = (
  form: FarmSetupFormState
): StockingDensityPreview | null => {
  const count = toInt(form.fingerlingsCount);
  const units = toFloat(form.unitCount);
  if (!count || !form.infraType || !units) return null;

  const fingerlingsPerCycle = count / DEFAULT_NUM_CYCLES;

  if (form.infraType === 'etang') {
    const surface = toFloat(form.unitSurface);
    if (!surface) return null;
    const density = Math.round(fingerlingsPerCycle / (units * surface));
    return {
      density,
      max: STOCKING_DENSITY_POND_PER_M2,
      unit: 'm²',
      isOk: density <= STOCKING_DENSITY_POND_PER_M2,
    };
  }

  const volume = toFloat(form.unitVolume);
  if (!volume) return null;
  const density = Math.round(fingerlingsPerCycle / (units * volume));
  return {
    density,
    max: STOCKING_DENSITY_TANK_PER_M3,
    unit: 'm³',
    isOk: density <= STOCKING_DENSITY_TANK_PER_M3,
  };
};

export const getFingerlingsCoherencePreview = (
  form: FarmSetupFormState
): FingerlingsCoherencePreview | null => {
  const count = toInt(form.fingerlingsCount);
  const target = toFloat(form.annualTarget);
  if (!count || !target) return null;

  const survivalRate = toFloat(form.survivalRate || '85') / 100;
  const harvestWeightG = toFloat(
    form.harvestWeight || String(getSpeciesHarvestWeightDefault(form.species))
  );
  const maxAnnual = Math.round((count * survivalRate * harvestWeightG) / 1000);
  const ratio = maxAnnual / target;

  return {
    maxAnnual,
    level: ratio >= 0.9 ? 'ok' : ratio >= 0.75 ? 'warn' : 'error',
    target: Math.round(target),
  };
};

export const getTotalCapacityPreview = (form: FarmSetupFormState): string | null => {
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
  const units = toFloat(form.unitCount);
  if (!form.infraType || !units) return null;

  const survivalRate = toFloat(form.survivalRate || '95') / 100;
  const harvestWeightKg =
    toFloat(form.harvestWeight || String(getSpeciesHarvestWeightDefault(form.species))) / 1000;

  let capacitySuggested = 0;
  let maxAllowed = 0;

  if (form.infraType === 'etang') {
    const surface = toFloat(form.unitSurface);
    if (!surface) return null;
    capacitySuggested = Math.round(
      units * surface * RECOMMENDED_STOCKING_DENSITY_POND_PER_M2 * DEFAULT_NUM_CYCLES
    );
    maxAllowed = Math.round(units * surface * STOCKING_DENSITY_POND_PER_M2 * DEFAULT_NUM_CYCLES);
  } else {
    const volume = toFloat(form.unitVolume);
    if (!volume) return null;
    capacitySuggested = Math.round(
      units * volume * RECOMMENDED_STOCKING_DENSITY_TANK_PER_M3 * DEFAULT_NUM_CYCLES
    );
    maxAllowed = Math.round(units * volume * STOCKING_DENSITY_TANK_PER_M3 * DEFAULT_NUM_CYCLES);
  }

  if (!capacitySuggested) return null;

  const annualTarget = toFloat(form.annualTarget);
  if (annualTarget > 0 && survivalRate > 0 && harvestWeightKg > 0) {
    const needed = Math.ceil(annualTarget / harvestWeightKg / survivalRate);
    return {
      value: Math.min(needed, maxAllowed),
      target: Math.round(annualTarget),
      achievable: needed <= maxAllowed,
    };
  }

  return { value: capacitySuggested, target: null, achievable: true };
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
  const annualTarget = parseStrictNumber(form.annualTarget);

  if (!form.species) errors.species = 'required';
  if (!form.infraType) errors.infraType = 'required';

  if (!form.unitCount.trim()) {
    errors.unitCount = 'required';
  } else if (unitCount === null || unitCount <= 0) {
    errors.unitCount = 'createFarmPositiveIntegerError';
  }

  if (!form.annualTarget.trim()) {
    errors.annualTarget = 'required';
  } else if (annualTarget === null || annualTarget <= 0) {
    errors.annualTarget = 'createFarmPositiveNumberError';
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

export const buildAnnualSimulationInput = (
  form: FarmSetupFormState,
  numCycles: 2 | 3
): AnnualSimulationInput => ({
  species: getSimulationSpecies(form.species),
  annual_production_target_kg: toFloat(form.annualTarget),
  num_cycles: numCycles,
  start_date: form.startDate || todayISO(),
  selling_price_per_kg_fcfa: form.sellingPrice ? toFloat(form.sellingPrice) : undefined,
  fingerlings_cost_per_unit_fcfa: form.fingerlingsPrice ? toFloat(form.fingerlingsPrice) : undefined,
  other_costs_fcfa_per_year: form.otherCosts ? toFloat(form.otherCosts) : 0,
  target_harvest_weight_g: form.harvestWeight ? toFloat(form.harvestWeight) : undefined,
  expected_survival_rate_pct: form.survivalRate ? toFloat(form.survivalRate) : undefined,
  total_fingerlings_count: form.fingerlingsCount ? toInt(form.fingerlingsCount) : undefined,
});

export const buildFarmSetupPayload = (
  form: FarmSetupFormState,
  numCycles: 2 | 3
): FarmSetupData => ({
  setup_species: (form.species as FarmSetupData['setup_species']) || 'tilapia',
  setup_infrastructure_type: form.infraType as FarmSetupData['setup_infrastructure_type'],
  setup_unit_count: toInt(form.unitCount) || 1,
  setup_unit_volume_m3: form.unitVolume ? toFloat(form.unitVolume) : undefined,
  setup_unit_surface_m2: form.unitSurface ? toFloat(form.unitSurface) : undefined,
  annual_production_target_kg: toFloat(form.annualTarget),
  num_cycles_per_year: numCycles,
  fingerlings_cost_per_unit_fcfa: form.fingerlingsPrice ? toFloat(form.fingerlingsPrice) : undefined,
  planned_selling_price_per_kg_fcfa: form.sellingPrice ? toFloat(form.sellingPrice) : undefined,
});
