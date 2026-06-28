import {
  STOCKING_DENSITY_POND_PER_M2,
  STOCKING_DENSITY_TANK_PER_M3,
} from '@/constants/aquaculture';
import type {
  ProductionUnit,
  ProductionUnitDraft,
  ProductionUnitType,
} from '@/features/aquaculture/types/productionUnits';

const LEGACY_UNIT_TYPE_ALIASES: Record<string, ProductionUnitType> = {
  etang: 'pond',
  cage_flottante: 'cage',
  bac_hors_sol: 'tank',
  bac_en_sol: 'tank',
};

export type ProductionUnitDraftErrors = Partial<
  Record<'name' | 'unit_type' | 'volume_m3' | 'surface_m2', string>
>;

const toTrimmedString = (value?: string | null): string => (value ?? '').trim();

const toPositiveNumber = (value?: string | number | null): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
};

export const normalizeProductionUnitType = (
  unitType?: string | null
): ProductionUnitType | null => {
  const normalized = toTrimmedString(unitType).toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === 'tank' || normalized === 'pond' || normalized === 'cage') {
    return normalized;
  }

  return LEGACY_UNIT_TYPE_ALIASES[normalized] ?? null;
};

export const getProductionUnitCapacity = (unit: Pick<ProductionUnit, 'unit_type' | 'volume_m3' | 'surface_m2'>): number | null => {
  const unitType = normalizeProductionUnitType(unit.unit_type);
  if (!unitType) {
    return null;
  }

  if (unitType === 'pond') {
    if (!unit.surface_m2 || unit.surface_m2 <= 0) {
      return null;
    }
    return Number((unit.surface_m2 * STOCKING_DENSITY_POND_PER_M2).toFixed(2));
  }

  if (!unit.volume_m3 || unit.volume_m3 <= 0) {
    return null;
  }

  return Number((unit.volume_m3 * STOCKING_DENSITY_TANK_PER_M3).toFixed(2));
};

export const getProductionUnitDensityUnit = (
  unit: Pick<ProductionUnit, 'unit_type'>
): string | null => {
  const unitType = normalizeProductionUnitType(unit.unit_type);
  if (unitType === 'pond') {
    return 'poissons/m²';
  }
  if (unitType === 'tank' || unitType === 'cage') {
    return 'poissons/m³';
  }
  return null;
};

export const getProductionUnitDisplayDimension = (
  unit: Pick<ProductionUnit, 'unit_type' | 'volume_m3' | 'surface_m2'>
): string | null => {
  const unitType = normalizeProductionUnitType(unit.unit_type);
  if (unitType === 'pond') {
    if (!unit.surface_m2 || unit.surface_m2 <= 0) {
      return null;
    }
    return `${unit.surface_m2.toFixed(2)} m²`;
  }

  if (unitType === 'tank' || unitType === 'cage') {
    if (!unit.volume_m3 || unit.volume_m3 <= 0) {
      return null;
    }
    return `${unit.volume_m3.toFixed(2)} m³`;
  }

  return null;
};

export const getTotalProductionUnitsCapacity = (
  units: Array<Pick<ProductionUnit, 'unit_type' | 'volume_m3' | 'surface_m2'>>
): number | null => {
  if (!units.length) {
    return null;
  }

  const capacities = units.map(getProductionUnitCapacity);
  if (capacities.some((capacity) => capacity === null)) {
    return null;
  }

  const safeCapacities = capacities.filter((capacity): capacity is number => capacity !== null);
  return safeCapacities.reduce((total, capacity) => total + capacity, 0);
};

export const validateProductionUnitDraft = (draft: ProductionUnitDraft): ProductionUnitDraftErrors => {
  const errors: ProductionUnitDraftErrors = {};
  const unitType = normalizeProductionUnitType(draft.unit_type);

  if (!toTrimmedString(draft.name)) {
    errors.name = 'required';
  }

  if (!unitType) {
    errors.unit_type = 'required';
    return errors;
  }

  if (unitType === 'pond') {
    const surface = toPositiveNumber(draft.surface_m2);
    if (surface === null) {
      errors.surface_m2 = 'required';
    } else if (surface <= 0) {
      errors.surface_m2 = 'createProductionUnitPositiveNumberError';
    }
    return errors;
  }

  const volume = toPositiveNumber(draft.volume_m3);
  if (volume === null) {
    errors.volume_m3 = 'required';
  } else if (volume <= 0) {
    errors.volume_m3 = 'createProductionUnitPositiveNumberError';
  }

  return errors;
};
