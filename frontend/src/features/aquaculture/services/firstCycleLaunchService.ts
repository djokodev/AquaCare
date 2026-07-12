import { aquacultureService } from "@/features/aquaculture/services/aquacultureService";
import {
  buildFarmSetupPayload,
  getValidCycleDuration,
  type FarmSetupFormState,
} from "@/features/aquaculture/utils/farmSetupForm";
import {
  normalizeProductionUnitType,
  validateProductionUnitDraft,
  validateProductionUnitFishAllocations,
} from "@/features/aquaculture/utils/productionUnits";
import type { CycleSimulationResult } from "@/features/aquaculture/types/farmSetup";
import type {
  CycleLaunchRequest,
  CycleLaunchResponse,
  ProductionUnitDraft,
} from "@/types/aquaculture";

export class FirstCycleLaunchError extends Error {
  translationKey: string;

  constructor(translationKey: string) {
    super(translationKey);
    this.name = "FirstCycleLaunchError";
    this.translationKey = translationKey;
  }
}

export interface FirstCycleLaunchResult extends CycleLaunchResponse {
  farmProfile: CycleLaunchResponse["farmProfile"];
  productionCycle: CycleLaunchResponse["productionCycle"];
  productionUnitIdByLocalId: CycleLaunchResponse["productionUnitIdByLocalId"];
  productionUnits: CycleLaunchResponse["productionUnits"];
  cycleUnitAllocations: CycleLaunchResponse["cycleUnitAllocations"];
  idempotentReplay: boolean;
}

interface LaunchFirstCycleParams {
  formData: FarmSetupFormState;
  simulationResult: CycleSimulationResult;
  defaultPondIdentifier: string;
}

const toFiniteNumber = (value?: string | number | null): number | undefined => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toPositiveInteger = (
  value?: string | number | null,
): number | undefined => {
  const parsed = toFiniteNumber(value);
  if (parsed === undefined || !Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
};

const validateProductionUnits = (units: ProductionUnitDraft[]): void => {
  if (!units.length) {
    throw new FirstCycleLaunchError("createFarmAtLeastOneUnitError");
  }

  const firstInvalidUnit = units.find((unit) => {
    const errors = validateProductionUnitDraft(unit);
    return Object.values(errors).some(Boolean);
  });

  if (firstInvalidUnit) {
    throw new FirstCycleLaunchError(
      "simulationUnableToSaveCycleProductionUnits",
    );
  }
};

const validateProductionUnitAllocations = (params: {
  units: ProductionUnitDraft[];
  allocations: FarmSetupFormState["productionUnitAllocations"];
  fingerlingsCount?: string | number | null;
  survivalRatePct?: string | number | null;
  targetWeightG?: string | number | null;
}): void => {
  const validation = validateProductionUnitFishAllocations({
    productionUnits: params.units,
    allocations: params.allocations,
    totalFishCount: params.fingerlingsCount,
    survivalRatePct: params.survivalRatePct,
    targetWeightG: params.targetWeightG,
  });
  const unitLocalIds = new Set(params.units.map((unit) => unit.local_id));
  const allocationLocalIds = params.allocations.map(
    (allocation) => allocation.production_unit_local_id,
  );
  const hasDuplicateAllocation =
    new Set(allocationLocalIds).size !== allocationLocalIds.length;
  const hasUnknownAllocation = allocationLocalIds.some(
    (localId) => !unitLocalIds.has(localId),
  );

  if (
    !validation ||
    validation.global_error ||
    Object.keys(validation.unit_errors).length > 0 ||
    hasDuplicateAllocation ||
    hasUnknownAllocation ||
    params.allocations.length !== params.units.length
  ) {
    throw new FirstCycleLaunchError(
      "simulationProductionUnitAllocationInvalidError",
    );
  }
};

const buildLaunchUnit = (
  unit: ProductionUnitDraft,
): CycleLaunchRequest["production_units"][number] => {
  const unitType = normalizeProductionUnitType(unit.unit_type);
  if (!unitType) {
    throw new FirstCycleLaunchError(
      "simulationUnableToSaveCycleProductionUnits",
    );
  }

  const input: CycleLaunchRequest["production_units"][number] = {
    local_id: unit.local_id,
    source: "new",
    name: unit.name.trim(),
    unit_type: unitType,
  };
  if (unitType === "pond") {
    input.surface_m2 = toFiniteNumber(unit.surface_m2);
  } else {
    input.volume_m3 = toFiniteNumber(unit.volume_m3);
  }
  return input;
};

export const launchFirstCycle = async (
  params: LaunchFirstCycleParams,
): Promise<FirstCycleLaunchResult> => {
  const { formData, simulationResult } = params;
  const firstCycle = simulationResult.cycles_breakdown[0];
  if (!firstCycle) {
    throw new FirstCycleLaunchError("simulationErrorRetry");
  }

  const configuredDuration = getValidCycleDuration(formData.cycleDuration);
  if (
    configuredDuration === undefined ||
    configuredDuration !== firstCycle.duration_days ||
    configuredDuration !== simulationResult.cycle_duration_days
  ) {
    throw new FirstCycleLaunchError("simulationCycleDurationMismatchError");
  }

  const productionUnits = formData.productionUnits ?? [];
  const productionUnitAllocations = formData.productionUnitAllocations ?? [];
  validateProductionUnits(productionUnits);
  validateProductionUnitAllocations({
    units: productionUnits,
    allocations: productionUnitAllocations,
    fingerlingsCount: formData.fingerlingsCount,
    survivalRatePct: formData.survivalRate,
    targetWeightG: formData.harvestWeight,
  });

  const launchUuid = formData.launchRequestId?.trim();
  if (!launchUuid) {
    throw new FirstCycleLaunchError("simulationErrorRetry");
  }

  const plan = buildFarmSetupPayload(formData);
  const sellingPrice = toFiniteNumber(formData.sellingPrice);
  const fingerlingsPrice = toFiniteNumber(formData.fingerlingsPrice) ?? 0;
  const initialCount = toPositiveInteger(firstCycle.initial_fish_count);
  if (
    !initialCount ||
    initialCount !== toPositiveInteger(formData.fingerlingsCount)
  ) {
    throw new FirstCycleLaunchError(
      "simulationProductionUnitAllocationInvalidError",
    );
  }

  const payload: CycleLaunchRequest = {
    launch_uuid: launchUuid,
    launch_kind: "initial_setup",
    production_plan: {
      annual_production_target_kg: simulationResult.annual_production_target_kg,
      num_cycles_per_year: simulationResult.num_cycles,
      fingerlings_cost_per_unit_fcfa:
        plan.fingerlings_cost_per_unit_fcfa ?? fingerlingsPrice,
      planned_selling_price_per_kg_fcfa:
        plan.planned_selling_price_per_kg_fcfa ?? sellingPrice,
    },
    cycle: {
      species: formData.species === "clarias" ? "clarias" : "tilapia",
      start_date: firstCycle.start_date_estimate,
      initial_count: initialCount,
      target_harvest_weight_g: toFiniteNumber(formData.harvestWeight),
      planned_cycle_duration_days: configuredDuration,
      expected_survival_rate_pct: toFiniteNumber(formData.survivalRate) ?? 95,
      ...(sellingPrice === undefined
        ? {}
        : { planned_selling_price_per_kg_fcfa: sellingPrice }),
      fingerlings_cost_fcfa:
        simulationResult.cycle_fingerlings_cost_fcfa ??
        fingerlingsPrice * initialCount,
      other_operational_costs_fcfa:
        simulationResult.cycle_other_costs_fcfa ?? 0,
      planned_feed_bags:
        firstCycle.feed_bags_total ||
        simulationResult.feed_bags_per_cycle ||
        undefined,
      created_offline: false,
    },
    production_units: productionUnits.map(buildLaunchUnit),
    allocations: productionUnitAllocations.map((allocation) => {
      const fishCount = toPositiveInteger(allocation.fish_count);
      if (!fishCount) {
        throw new FirstCycleLaunchError(
          "simulationProductionUnitAllocationInvalidError",
        );
      }
      return {
        production_unit_local_id: allocation.production_unit_local_id,
        fish_count: fishCount,
      };
    }),
  };

  return aquacultureService.launchProductionCycle(payload);
};
