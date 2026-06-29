import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { farmSetupService } from '@/features/aquaculture/services/farmSetupService';
import {
  buildFarmSetupPayload,
  type FarmSetupFormState,
} from '@/features/aquaculture/utils/farmSetupForm';
import {
  normalizeProductionUnitType,
  validateProductionUnitDraft,
  validateProductionUnitFishAllocations,
} from '@/features/aquaculture/utils/productionUnits';
import type {
  CycleSimulationResult,
} from '@/features/aquaculture/types/farmSetup';
import type { FarmProfile } from '@/features/profile/types/profile';
import type {
  CycleUnitAllocationCreatePayload,
  ProductionUnitCreatePayload,
  ProductionUnitDraft,
  ProductionUnitFishAllocationDraft,
  ProductionCycle,
  ProductionUnitType,
} from '@/types/aquaculture';
import type { ProductionUnit } from '@/types/aquaculture';

export class FirstCycleLaunchError extends Error {
  translationKey: string;

  constructor(translationKey: string) {
    super(translationKey);
    this.name = 'FirstCycleLaunchError';
    this.translationKey = translationKey;
  }
}

export interface FirstCycleLaunchResult {
  farmProfile: FarmProfile;
  productionCycle: ProductionCycle;
  productionUnitIdByLocalId: Record<string, string>;
  productionUnits: ProductionUnit[];
}

interface LaunchFirstCycleParams {
  formData: FarmSetupFormState;
  simulationResult: CycleSimulationResult;
  defaultPondIdentifier: string;
}

const toFiniteNumber = (value?: string | number | null): number | undefined => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toPositiveInteger = (value?: string | number | null): number | undefined => {
  const parsed = toFiniteNumber(value);
  if (parsed === undefined || !Number.isInteger(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
};

const buildProductionUnitPayload = (unit: ProductionUnitDraft): ProductionUnitCreatePayload => {
  const normalizedType = normalizeProductionUnitType(unit.unit_type);
  if (!normalizedType) {
    throw new FirstCycleLaunchError('simulationUnableToSaveCycleProductionUnits');
  }

  const payload: ProductionUnitCreatePayload = {
    name: unit.name.trim(),
    unit_type: normalizedType,
    status: 'active',
  };

  if (normalizedType === 'pond') {
    const surface = toFiniteNumber(unit.surface_m2);
    if (surface === undefined || surface <= 0) {
      throw new FirstCycleLaunchError('simulationUnableToSaveCycleProductionUnits');
    }
    payload.surface_m2 = surface;
    return payload;
  }

  const volume = toFiniteNumber(unit.volume_m3);
  if (volume === undefined || volume <= 0) {
    throw new FirstCycleLaunchError('simulationUnableToSaveCycleProductionUnits');
  }

  payload.volume_m3 = volume;
  return payload;
};

const buildCycleUnitAllocationPayload = (params: {
  cycleId: string;
  productionUnitId: string;
  allocation: ProductionUnitFishAllocationDraft;
  survivalRatePct?: number;
}): CycleUnitAllocationCreatePayload => {
  const fishCount = toPositiveInteger(params.allocation.fish_count);
  if (fishCount === undefined) {
    throw new FirstCycleLaunchError('simulationUnableToSaveCycleUnitAllocations');
  }

  const payload: CycleUnitAllocationCreatePayload = {
    cycle: params.cycleId,
    production_unit: params.productionUnitId,
    initial_fish_count: fishCount,
    current_fish_count: fishCount,
  };

  if (params.survivalRatePct !== undefined) {
    payload.expected_survival_rate_pct = params.survivalRatePct;
  }

  return payload;
};

const getNormalizedInfrastructureTypes = (
  units: ProductionUnitDraft[]
): ProductionUnitType[] | undefined => {
  const normalizedTypes = units
    .map((unit) => normalizeProductionUnitType(unit.unit_type))
    .filter((unitType): unitType is ProductionUnitType => unitType !== null);

  if (!normalizedTypes.length) {
    return undefined;
  }

  return Array.from(new Set(normalizedTypes));
};

const buildLegacyCycleFootprint = (
  units: ProductionUnitDraft[]
): Partial<Pick<ProductionCycle, 'pond_surface_m2' | 'pond_volume_m3'>> => {
  const normalizedTypes = getNormalizedInfrastructureTypes(units);
  const primaryType = normalizedTypes?.[0];
  if (!primaryType) {
    return {};
  }

  const matchingUnits = units.filter(
    (unit) => normalizeProductionUnitType(unit.unit_type) === primaryType
  );

  if (primaryType === 'pond') {
    const totalSurface = matchingUnits.reduce((total, unit) => {
      const surface = toFiniteNumber(unit.surface_m2);
      return surface === undefined ? total : total + surface;
    }, 0);

    return totalSurface > 0 ? { pond_surface_m2: totalSurface } : {};
  }

  const totalVolume = matchingUnits.reduce((total, unit) => {
    const volume = toFiniteNumber(unit.volume_m3);
    return volume === undefined ? total : total + volume;
  }, 0);

  return totalVolume > 0 ? { pond_volume_m3: totalVolume } : {};
};

const validateProductionUnits = (units: ProductionUnitDraft[]): void => {
  const firstInvalidUnit = units.find((unit) => {
    const errors = validateProductionUnitDraft(unit);
    return Object.values(errors).some(Boolean);
  });

  if (firstInvalidUnit) {
    throw new FirstCycleLaunchError('simulationUnableToSaveCycleProductionUnits');
  }
};

const validateProductionUnitAllocations = (params: {
  units: ProductionUnitDraft[];
  allocations: ProductionUnitFishAllocationDraft[];
  fingerlingsCount?: string | number | null;
  survivalRatePct?: string | number | null;
  targetWeightG?: string | number | null;
}): void => {
  if (!params.units.length) {
    return;
  }

  const validation = validateProductionUnitFishAllocations({
    productionUnits: params.units,
    allocations: params.allocations,
    totalFishCount: params.fingerlingsCount,
    survivalRatePct: params.survivalRatePct,
    targetWeightG: params.targetWeightG,
  });

  const unitLocalIds = new Set(params.units.map((unit) => unit.local_id));
  const allocationLocalIds = new Set(
    params.allocations.map((allocation) => allocation.production_unit_local_id)
  );
  const hasUnknownAllocation = [...allocationLocalIds].some((localId) => !unitLocalIds.has(localId));

  if (
    !validation ||
    validation.global_error ||
    Object.keys(validation.unit_errors).length > 0 ||
    hasUnknownAllocation ||
    params.allocations.length !== params.units.length
  ) {
    throw new FirstCycleLaunchError('simulationProductionUnitAllocationInvalidError');
  }
};

export const launchFirstCycle = async (
  params: LaunchFirstCycleParams
): Promise<FirstCycleLaunchResult> => {
  const { formData, simulationResult, defaultPondIdentifier } = params;
  const firstCycle = simulationResult.cycles_breakdown[0];
  if (!firstCycle) {
    throw new FirstCycleLaunchError('simulationErrorRetry');
  }

  const productionUnits = formData.productionUnits ?? [];
  const productionUnitAllocations = formData.productionUnitAllocations ?? [];

  if (productionUnits.length > 0) {
    validateProductionUnits(productionUnits);
    validateProductionUnitAllocations({
      units: productionUnits,
      allocations: productionUnitAllocations,
      fingerlingsCount: formData.fingerlingsCount,
      survivalRatePct: formData.survivalRate,
      targetWeightG: formData.harvestWeight,
    });
  }

  const farmProfile = await farmSetupService.completeFarmSetup(buildFarmSetupPayload(formData));

  const legacyUnit = productionUnits.length > 0 ? productionUnits[0] : null;
  const legacyUnitType = legacyUnit ? normalizeProductionUnitType(legacyUnit.unit_type) : null;
  const hasProductionUnitSummary = productionUnits.length > 0;
  const legacyPondSurface =
    legacyUnitType === 'pond' ? toFiniteNumber(legacyUnit?.surface_m2) : undefined;
  const legacyPondVolume = hasProductionUnitSummary
    ? legacyUnitType && legacyUnitType !== 'pond'
      ? toFiniteNumber(legacyUnit?.volume_m3)
      : undefined
    : toFiniteNumber(formData.unitVolume);
  const speciesForCycle = formData.species === 'clarias' ? 'clarias' : 'tilapia';
  const fingerlingsCost =
    simulationResult.cycle_fingerlings_cost_fcfa ?? firstCycle.fingerlings_cost_fcfa;
  const otherCosts = simulationResult.cycle_other_costs_fcfa ?? 0;
  const infrastructureTypes = getNormalizedInfrastructureTypes(productionUnits) ?? (
    formData.infraType ? [formData.infraType] : undefined
  );
  const legacyCycleFootprint = productionUnits.length > 0
    ? buildLegacyCycleFootprint(productionUnits)
    : {};

  const productionCycle = await aquacultureService.createProductionCycle({
    species: speciesForCycle,
    cycle_name: undefined,
    pond_identifier: legacyUnit?.name?.trim() || defaultPondIdentifier,
    pond_surface_m2: hasProductionUnitSummary
      ? legacyPondSurface
      : toFiniteNumber(formData.unitSurface),
    pond_volume_m3: legacyPondVolume,
    initial_count: firstCycle.initial_fish_count,
    initial_average_weight: undefined,
    start_date: firstCycle.start_date_estimate,
    target_harvest_weight_g: toFiniteNumber(formData.harvestWeight),
    planned_cycle_duration_days: firstCycle.duration_days,
    expected_survival_rate_pct: toFiniteNumber(formData.survivalRate),
    planned_selling_price_per_kg_fcfa: toFiniteNumber(formData.sellingPrice),
    fingerlings_cost_fcfa: fingerlingsCost,
    other_operational_costs_fcfa: otherCosts,
    planned_feed_bags: firstCycle.feed_bags_total || simulationResult.feed_bags_per_cycle || undefined,
    infrastructure_type: infrastructureTypes,
    ...(productionUnits.length > 0
      ? legacyCycleFootprint
      : {
          pond_surface_m2: toFiniteNumber(formData.unitSurface),
          pond_volume_m3: legacyPondVolume,
        }),
  });

  if (productionUnits.length === 0) {
    return {
      farmProfile,
      productionCycle,
      productionUnitIdByLocalId: {},
      productionUnits: [],
    };
  }

  const productionUnitIdByLocalId: Record<string, string> = {};
  const createdProductionUnits: ProductionUnit[] = [];

  // Best-effort sequencing: unit/allocation persistence stays simple here.
  // Full atomic rollback can be added later if launch needs transactional writes.
  for (const unit of productionUnits) {
    const payload = buildProductionUnitPayload(unit);
    let createdUnit: ProductionUnit;
    try {
      createdUnit = await aquacultureService.createProductionUnit(payload);
    } catch {
      throw new FirstCycleLaunchError('simulationUnableToSaveCycleProductionUnits');
    }
    productionUnitIdByLocalId[unit.local_id] = createdUnit.id;
    createdProductionUnits.push(createdUnit);
  }

  for (const allocation of productionUnitAllocations) {
    const productionUnitId = productionUnitIdByLocalId[allocation.production_unit_local_id];
    if (!productionUnitId) {
      throw new FirstCycleLaunchError('simulationProductionUnitAllocationInvalidError');
    }

    const payload = buildCycleUnitAllocationPayload({
      cycleId: productionCycle.id,
      productionUnitId,
      allocation,
      survivalRatePct: toFiniteNumber(formData.survivalRate),
    });
    try {
      await aquacultureService.createCycleUnitAllocation(payload);
    } catch {
      throw new FirstCycleLaunchError('simulationUnableToSaveCycleUnitAllocations');
    }
  }

  return {
    farmProfile,
    productionCycle,
    productionUnitIdByLocalId,
    productionUnits: createdProductionUnits,
  };
};
