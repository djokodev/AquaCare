import {
  STOCKING_DENSITY_POND_PER_M2,
  STOCKING_DENSITY_TANK_PER_M3,
} from '@/constants/aquaculture';
import type {
  ProductionUnitAllocationStatus,
  ProductionUnitCompatibilitySummary,
  ProductionUnitDraft,
  ProductionUnitFishAllocationDraft,
  ProductionUnitFishAllocationValidationResult,
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

const toPositiveInteger = (value?: string | number | null): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
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

export const getProductionUnitAllocationProductionEstimate = (params: {
  allocation?: string | number | null;
  survivalRatePct?: string | number | null;
  targetWeightG?: string | number | null;
}): number | null => {
  const allocation = toPositiveInteger(params.allocation);
  if (allocation === null) {
    return null;
  }

  const survivalRate = toPositiveNumber(params.survivalRatePct);
  const targetWeightG = toPositiveNumber(params.targetWeightG);
  if (survivalRate === null || targetWeightG === null) {
    return null;
  }

  return Number(((allocation * (survivalRate / 100) * targetWeightG) / 1000).toFixed(2));
};

export const getProductionUnitAllocationStatus = (params: {
  unit: ProductionUnitDimensionSource;
  productionUnitLocalId?: string;
  allocation?: string | number | null;
  survivalRatePct?: string | number | null;
  targetWeightG?: string | number | null;
}): ProductionUnitAllocationStatus => {
  const capacity = getProductionUnitCapacity(params.unit);
  const fishCount = toPositiveInteger(params.allocation);
  const allocationFootprint =
    normalizeProductionUnitType(params.unit.unit_type) === 'pond'
      ? toPositiveNumber(params.unit.surface_m2)
      : toPositiveNumber(params.unit.volume_m3);
  const density =
    fishCount !== null && allocationFootprint && allocationFootprint > 0
      ? Number((fishCount / allocationFootprint).toFixed(2))
      : null;
  const densityUnit = (
    normalizeProductionUnitType(params.unit.unit_type) === 'pond' ? 'm2' : 'm3'
  ) as ProductionUnitAllocationStatus['density_unit'];
  const isOverCapacity =
    capacity !== null && fishCount !== null ? fishCount > capacity : false;

  return {
    production_unit_local_id: params.productionUnitLocalId ?? '',
    fish_count: fishCount,
    recommended_capacity: capacity,
    density,
    density_unit: capacity === null ? null : densityUnit,
    estimated_production_kg: getProductionUnitAllocationProductionEstimate({
      allocation: params.allocation,
      survivalRatePct: params.survivalRatePct,
      targetWeightG: params.targetWeightG,
    }),
    is_over_capacity: isOverCapacity,
  };
};

export const suggestProductionUnitFishAllocations = (params: {
  productionUnits: ProductionUnitDraft[];
  totalFishCount?: string | number | null;
}): ProductionUnitFishAllocationDraft[] | null => {
  const totalFish = toPositiveInteger(params.totalFishCount);
  if (!params.productionUnits.length || totalFish === null || totalFish <= 0) {
    return null;
  }

  const capacities = params.productionUnits.map(getProductionUnitCapacity);
  if (capacities.some((capacity) => capacity === null || capacity <= 0)) {
    return null;
  }

  const safeCapacities = capacities.filter((capacity): capacity is number => capacity !== null);
  const totalCapacity = safeCapacities.reduce((total, capacity) => total + capacity, 0);
  if (totalCapacity <= 0 || totalFish > totalCapacity) {
    return null;
  }

  const rawAllocations = safeCapacities.map((capacity) => (totalFish * capacity) / totalCapacity);
  const allocations = rawAllocations.map((allocation) => Math.floor(allocation));
  let remainder = totalFish - allocations.reduce((total, allocation) => total + allocation, 0);

  const rankedRemainders = rawAllocations
    .map((allocation, index) => ({
      index,
      decimal: allocation - Math.floor(allocation),
    }))
    .sort((left, right) => {
      if (right.decimal !== left.decimal) {
        return right.decimal - left.decimal;
      }
      return left.index - right.index;
    });

  for (const candidate of rankedRemainders) {
    if (remainder <= 0) {
      break;
    }

    if (allocations[candidate.index] + 1 <= safeCapacities[candidate.index]) {
      allocations[candidate.index] += 1;
      remainder -= 1;
    }
  }

  if (remainder > 0) {
    return null;
  }

  return params.productionUnits.map((unit, index) => ({
    production_unit_local_id: unit.local_id,
    fish_count: String(allocations[index] ?? 0),
  }));
};

export const validateProductionUnitFishAllocations = (params: {
  productionUnits: ProductionUnitDraft[];
  allocations: ProductionUnitFishAllocationDraft[];
  totalFishCount?: string | number | null;
  survivalRatePct?: string | number | null;
  targetWeightG?: string | number | null;
}): ProductionUnitFishAllocationValidationResult | null => {
  if (!params.productionUnits.length) {
    return null;
  }

  const totalFishCount = toPositiveInteger(params.totalFishCount);
  if (totalFishCount === null || totalFishCount <= 0) {
    return null;
  }

  const capacities = params.productionUnits.map(getProductionUnitCapacity);
  if (capacities.some((capacity) => capacity === null || capacity <= 0)) {
    return {
      total_fish_count: totalFishCount,
      total_capacity: null,
      total_allocated_fish: 0,
      global_error: 'createFarmProductionUnitCapacityUnavailableError',
      unit_errors: {},
      unit_statuses: params.productionUnits.map((unit) => getProductionUnitAllocationStatus({
        unit,
        productionUnitLocalId: unit.local_id,
        allocation: params.allocations.find(
          (allocation) => allocation.production_unit_local_id === unit.local_id
        )?.fish_count,
        survivalRatePct: params.survivalRatePct,
        targetWeightG: params.targetWeightG,
      })),
    };
  }

  const safeCapacities = capacities.filter((capacity): capacity is number => capacity !== null);
  const totalCapacity = safeCapacities.reduce((total, capacity) => total + capacity, 0);

  const allocationByUnitId = new Map(
    params.allocations.map((allocation) => [allocation.production_unit_local_id, allocation.fish_count] as const)
  );

  const unitErrors: Record<string, string> = {};
  const unitStatuses = params.productionUnits.map((unit, index) => {
    const fishCount = allocationByUnitId.get(unit.local_id);
    const capacity = safeCapacities[index] ?? null;
    const parsedFishCount = toPositiveInteger(fishCount);
    const densityFootprint =
      normalizeProductionUnitType(unit.unit_type) === 'pond'
        ? toPositiveNumber(unit.surface_m2)
        : toPositiveNumber(unit.volume_m3);
    const density =
      parsedFishCount !== null && densityFootprint && densityFootprint > 0
        ? Number((parsedFishCount / densityFootprint).toFixed(2))
        : null;
    const estimatedProductionKg = getProductionUnitAllocationProductionEstimate({
      allocation: fishCount,
      survivalRatePct: params.survivalRatePct,
      targetWeightG: params.targetWeightG,
    });
    const densityUnit = (
      normalizeProductionUnitType(unit.unit_type) === 'pond' ? 'm2' : 'm3'
    ) as ProductionUnitAllocationStatus['density_unit'];
    const isOverCapacity = capacity !== null && parsedFishCount !== null
      ? parsedFishCount > capacity
      : false;

    if (fishCount === undefined || fishCount === '') {
      unitErrors[unit.local_id] = 'createFarmProductionUnitAllocationRequiredError';
    } else if (parsedFishCount === null || parsedFishCount < 0) {
      unitErrors[unit.local_id] = 'createFarmProductionUnitAllocationRequiredError';
    } else if (isOverCapacity) {
      unitErrors[unit.local_id] = 'createFarmProductionUnitRecommendedCapacityExceededError';
    }

    return {
      production_unit_local_id: unit.local_id,
      fish_count: parsedFishCount,
      recommended_capacity: capacity,
      density,
      density_unit: densityUnit,
      estimated_production_kg: estimatedProductionKg,
      is_over_capacity: isOverCapacity,
    };
  });

  const totalAllocatedFish = unitStatuses.reduce(
    (total, status) => total + (status.fish_count ?? 0),
    0
  );

  let globalError: string | null = null;
  if (totalFishCount > totalCapacity) {
    globalError = 'createFarmProductionUnitTotalCapacityExceededError';
  } else if (totalAllocatedFish !== totalFishCount) {
    globalError = 'createFarmProductionUnitAllocationSumError';
  }

  return {
    total_fish_count: totalFishCount,
    total_capacity: totalCapacity,
    total_allocated_fish: totalAllocatedFish,
    global_error: globalError,
    unit_errors: unitErrors,
    unit_statuses: unitStatuses,
  };
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
