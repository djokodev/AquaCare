import {
  STOCKING_DENSITY_POND_PER_M2,
  STOCKING_DENSITY_TANK_PER_M3,
} from '@/constants/aquaculture';
import type {
  ProductionUnitCompatibilitySummary,
  ProductionUnitDraft,
  ProductionUnitType,
} from '@/features/aquaculture/types/productionUnits';

const LEGACY_UNIT_TYPE_ALIASES: Record<string, ProductionUnitType> = {
  etang: 'pond',
  cage_flottante: 'cage',
  bac_hors_sol: 'tank',
  bac_en_sol: 'tank',
};

const LEGACY_UNIT_TYPE_BY_PRODUCTION_UNIT_TYPE: Record<
  ProductionUnitType,
  ProductionUnitCompatibilitySummary['legacy_infrastructure_type']
> = {
  tank: 'bac_hors_sol',
  pond: 'etang',
  cage: 'cage_flottante',
};

type ProductionUnitDimensionSource = {
  unit_type: string;
  volume_m3?: string | number | null;
  surface_m2?: string | number | null;
};

export type ProductionUnitDraftErrors = Partial<
  Record<'name' | 'unit_type' | 'volume_m3' | 'surface_m2', string>
>;

export type ProductionUnitDensityUnit = 'm3' | 'm2';

export interface ProductionUnitsDensityPreviewSingle {
  kind: 'single';
  currentDensity: number;
  maxDensity: number;
  unit: ProductionUnitDensityUnit;
  isAtMax: boolean;
}

export interface ProductionUnitsDensityPreviewMixed {
  kind: 'mixed';
}

export type ProductionUnitsDensityPreview =
  | ProductionUnitsDensityPreviewSingle
  | ProductionUnitsDensityPreviewMixed;

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

const DENSITY_MAX_BY_UNIT: Record<ProductionUnitDensityUnit, number> = {
  m3: STOCKING_DENSITY_TANK_PER_M3,
  m2: STOCKING_DENSITY_POND_PER_M2,
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

const toProductionUnitString = (value?: string | null): string => (value ?? '').trim();

const createLocalId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const createProductionUnitDraft = (
  overrides: Partial<ProductionUnitDraft> = {}
): ProductionUnitDraft => ({
  local_id: overrides.local_id ?? createLocalId('production-unit'),
  name: overrides.name ?? '',
  unit_type: overrides.unit_type ?? 'tank',
  volume_m3: overrides.volume_m3 ?? '',
  surface_m2: overrides.surface_m2 ?? '',
});

export const createIdenticalProductionUnitDrafts = (params: {
  unitType: ProductionUnitType;
  count: number;
  namePrefix?: string;
  volumeM3?: string;
  surfaceM2?: string;
  startIndex?: number;
}): ProductionUnitDraft[] => {
  const {
    unitType,
    count,
    namePrefix,
    volumeM3,
    surfaceM2,
    startIndex = 1,
  } = params;

  if (count <= 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    const itemIndex = startIndex + index;
    return createProductionUnitDraft({
      name: namePrefix ? `${namePrefix} ${itemIndex}` : '',
      unit_type: unitType,
      volume_m3: unitType === 'pond' ? '' : volumeM3 ?? '',
      surface_m2: unitType === 'pond' ? surfaceM2 ?? '' : '',
    });
  });
};

export const getProductionUnitCapacity = (unit: ProductionUnitDimensionSource): number | null => {
  const unitType = normalizeProductionUnitType(unit.unit_type);
  if (!unitType) {
    return null;
  }

  if (unitType === 'pond') {
    const surface = toPositiveNumber(unit.surface_m2);
    if (surface === null || surface <= 0) {
      return null;
    }
    return Number((surface * STOCKING_DENSITY_POND_PER_M2).toFixed(2));
  }

  const volume = toPositiveNumber(unit.volume_m3);
  if (volume === null || volume <= 0) {
    return null;
  }

  return Number((volume * STOCKING_DENSITY_TANK_PER_M3).toFixed(2));
};

export const getProductionUnitDensityUnit = (
  unit: Pick<ProductionUnitDimensionSource, 'unit_type'>
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
  unit: ProductionUnitDimensionSource
): string | null => {
  const unitType = normalizeProductionUnitType(unit.unit_type);
  if (unitType === 'pond') {
    const surface = toPositiveNumber(unit.surface_m2);
    if (surface === null || surface <= 0) {
      return null;
    }
    return `${surface.toFixed(2)} m²`;
  }

  if (unitType === 'tank' || unitType === 'cage') {
    const volume = toPositiveNumber(unit.volume_m3);
    if (volume === null || volume <= 0) {
      return null;
    }
    return `${volume.toFixed(2)} m³`;
  }

  return null;
};

export const getProductionUnitsDensityPreview = (params: {
  productionUnits: ProductionUnitDraft[];
  fingerlingsCount?: number | string | null;
}): ProductionUnitsDensityPreview | null => {
  const { productionUnits, fingerlingsCount } = params;
  if (!productionUnits.length) {
    return null;
  }

  const normalizedTypes = productionUnits
    .map((unit) => normalizeProductionUnitType(unit.unit_type))
    .filter((unitType): unitType is ProductionUnitType => unitType !== null);

  if (normalizedTypes.length !== productionUnits.length) {
    return null;
  }

  const hasPond = normalizedTypes.includes('pond');
  const hasVolumeUnit = normalizedTypes.some((unitType) => unitType === 'tank' || unitType === 'cage');

  if (hasPond && hasVolumeUnit) {
    return {
      kind: 'mixed',
    };
  }

  const densityUnit: ProductionUnitDensityUnit = hasPond ? 'm2' : 'm3';
  const densityFootprint = productionUnits.reduce((total, unit) => {
    const dimension = densityUnit === 'm2' ? toPositiveNumber(unit.surface_m2) : toPositiveNumber(unit.volume_m3);
    if (dimension === null || dimension <= 0) {
      return Number.NaN;
    }

    return total + dimension;
  }, 0);

  if (!Number.isFinite(densityFootprint) || densityFootprint <= 0) {
    return null;
  }

  const count = toPositiveNumber(fingerlingsCount);
  if (count === null || count <= 0) {
    return null;
  }

  const currentDensity = count / densityFootprint;
  const maxDensity = DENSITY_MAX_BY_UNIT[densityUnit];
  const totalCapacity = getTotalProductionUnitsCapacity(productionUnits);
  const isAtMax =
    (totalCapacity !== null && count === totalCapacity) ||
    Math.abs(currentDensity - maxDensity) < 1e-9;

  return {
    kind: 'single',
    currentDensity,
    maxDensity,
    unit: densityUnit,
    isAtMax,
  };
};

export const getProductionUnitDisplayName = (
  unit: Pick<ProductionUnitDraft, 'name'>
): string => toProductionUnitString(unit.name);

export const getTotalProductionUnitsCapacity = (
  units: ProductionUnitDimensionSource[]
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

export const getProductionUnitsCompatibilitySummary = (
  units: ProductionUnitDraft[]
): ProductionUnitCompatibilitySummary | null => {
  if (!units.length) {
    return null;
  }

  const normalizedFirstType = normalizeProductionUnitType(units[0].unit_type);
  if (!normalizedFirstType) {
    return null;
  }

  const totalCapacity = getTotalProductionUnitsCapacity(units);
  const isMixed = units.some(
    (unit) => normalizeProductionUnitType(unit.unit_type) !== normalizedFirstType
  );

  return {
    legacy_infrastructure_type: LEGACY_UNIT_TYPE_BY_PRODUCTION_UNIT_TYPE[normalizedFirstType],
    legacy_unit_count: units.length,
    total_capacity: totalCapacity,
    is_mixed: isMixed,
    primary_unit: units[0],
  };
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
