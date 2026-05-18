import { CreateCycleForm } from '@/types/aquaculture';
import {
  STOCKING_DENSITY_POND_PER_M2,
  STOCKING_DENSITY_TANK_PER_M3,
} from '@/constants/aquaculture';

export type CycleSpecies = 'clarias' | 'tilapia';

export interface NewCycleData {
  cycle_name: string;
  species: CycleSpecies | '';
  pond_identifier: string;
  pond_surface_m2: string;
  pond_volume_m3: string;
  infrastructure_type: string[];
  initial_count: string;
  initial_average_weight: string;
  start_date: string;
  target_harvest_weight_g: string;
  planned_cycle_duration_days: string;
  expected_survival_rate_pct: string;
  planned_selling_price_per_kg_fcfa: string;
  fingerlings_cost_fcfa: string;
  other_operational_costs_fcfa: string;
}

export const ECONOMIC_DEFAULTS = {
  tilapia: {
    target_harvest_weight_g: 350,
    planned_cycle_duration_days: 180,
    expected_survival_rate_pct: 85,
    planned_selling_price_per_kg_fcfa: 2800,
  },
  clarias: {
    target_harvest_weight_g: 400,
    planned_cycle_duration_days: 120,
    expected_survival_rate_pct: 85,
    planned_selling_price_per_kg_fcfa: 2000,
  },
} as const;

export const MAX_DENSITY_BY_INFRA = {
  pondPerM2: STOCKING_DENSITY_POND_PER_M2,
  tankPerM3: STOCKING_DENSITY_TANK_PER_M3,
} as const;

export const parseFormNumber = (value: string): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const buildCyclePayload = (formData: NewCycleData): CreateCycleForm => ({
  cycle_name: formData.cycle_name,
  species: formData.species as CycleSpecies,
  pond_identifier: formData.pond_identifier,
  pond_surface_m2: formData.pond_surface_m2 ? parseFormNumber(formData.pond_surface_m2) : undefined,
  pond_volume_m3: formData.pond_volume_m3 ? parseFormNumber(formData.pond_volume_m3) : undefined,
  infrastructure_type: formData.infrastructure_type.length > 0 ? formData.infrastructure_type : undefined,
  start_date: formData.start_date,
  initial_count: Number.parseInt(formData.initial_count, 10),
  initial_average_weight: parseFormNumber(formData.initial_average_weight),
  target_harvest_weight_g: parseFormNumber(formData.target_harvest_weight_g),
  planned_cycle_duration_days: Number.parseInt(formData.planned_cycle_duration_days, 10),
  expected_survival_rate_pct: parseFormNumber(formData.expected_survival_rate_pct),
  planned_selling_price_per_kg_fcfa: parseFormNumber(formData.planned_selling_price_per_kg_fcfa),
  fingerlings_cost_fcfa: parseFormNumber(formData.fingerlings_cost_fcfa || '0'),
  other_operational_costs_fcfa: parseFormNumber(formData.other_operational_costs_fcfa || '0'),
});

export const buildSimulatorPrefill = (cycleData: CreateCycleForm) => ({
  species: cycleData.species === 'clarias' ? ('catfish' as const) : ('tilapia' as const),
  initial_fish_count: cycleData.initial_count,
  initial_weight_g: cycleData.initial_average_weight ?? 5,
  target_weight_g: cycleData.target_harvest_weight_g || 300,
  cycle_duration_days: cycleData.planned_cycle_duration_days || 120,
  survival_rate: (cycleData.expected_survival_rate_pct || 85) / 100,
  selling_price_per_kg_fcfa: cycleData.planned_selling_price_per_kg_fcfa || 1800,
  fingerlings_cost_fcfa: cycleData.fingerlings_cost_fcfa || 0,
  other_costs_fcfa: cycleData.other_operational_costs_fcfa || 0,
});

export const validateNewCycleData = (formData: NewCycleData): boolean => {
  const required = [
    'cycle_name',
    'species',
    'pond_identifier',
    'initial_count',
    'initial_average_weight',
    'target_harvest_weight_g',
    'planned_cycle_duration_days',
    'expected_survival_rate_pct',
    'planned_selling_price_per_kg_fcfa',
  ] as const;

  for (const field of required) {
    if (!(formData[field] as string).trim()) {
      return false;
    }
  }

  const initialCount = parseFormNumber(formData.initial_count);
  const initialWeight = parseFormNumber(formData.initial_average_weight);
  const targetWeight = parseFormNumber(formData.target_harvest_weight_g);
  const durationDays = Number.parseInt(formData.planned_cycle_duration_days, 10);
  const survivalPct = parseFormNumber(formData.expected_survival_rate_pct);
  const sellingPrice = parseFormNumber(formData.planned_selling_price_per_kg_fcfa);
  const fingerlingsCost = parseFormNumber(formData.fingerlings_cost_fcfa || '0');
  const otherCosts = parseFormNumber(formData.other_operational_costs_fcfa || '0');

  if (initialCount <= 0 || initialWeight <= 0) return false;
  if (targetWeight <= initialWeight) return false;
  if (!Number.isFinite(durationDays) || durationDays < 30 || durationDays > 365) return false;
  if (survivalPct < 0 || survivalPct > 100) return false;
  if (sellingPrice <= 0) return false;
  if (fingerlingsCost < 0 || otherCosts < 0) return false;

  const hasSurface = formData.pond_surface_m2.trim() !== '' && parseFormNumber(formData.pond_surface_m2) > 0;
  const hasVolume = formData.pond_volume_m3.trim() !== '' && parseFormNumber(formData.pond_volume_m3) > 0;
  if (!hasSurface && !hasVolume) return false;

  return true;
};
