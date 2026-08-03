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
import { getOngoingCycleSchedule } from "@/utils/businessDate";

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

export interface LaunchFirstCycleParams {
  formData: FarmSetupFormState;
  simulationResult: CycleSimulationResult;
  defaultPondIdentifier: string;
  launchKind?: "initial_setup" | "additional_cycle";
}

export interface BuildFirstCycleFromFormParams {
  formData: FarmSetupFormState;
  launchKind?: "initial_setup" | "additional_cycle";
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

export const buildFirstCycleLaunchRequest = (
  params: LaunchFirstCycleParams,
): CycleLaunchRequest => {
  const { formData, simulationResult, launchKind = "initial_setup" } = params;
  const ongoing = formData.onboardingMode === "ongoing";
  const formPayload = buildFirstCycleLaunchRequestFromForm({
    formData,
    launchKind,
  });
  if (ongoing) {
    return formPayload;
  }

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

  const simulatedInitialCount = toPositiveInteger(firstCycle.initial_fish_count);
  const baselineCount = toPositiveInteger(formData.fingerlingsCount);
  if (!baselineCount || !simulatedInitialCount || simulatedInitialCount !== baselineCount) {
    throw new FirstCycleLaunchError(
      "simulationProductionUnitAllocationInvalidError",
    );
  }

  return {
    ...formPayload,
    ...(formPayload.production_plan
      ? {
          production_plan: {
            ...formPayload.production_plan,
            annual_production_target_kg:
              simulationResult.annual_production_target_kg,
            num_cycles_per_year: simulationResult.num_cycles,
          },
        }
      : {}),
    cycle: {
      ...formPayload.cycle,
      start_date: firstCycle.start_date_estimate,
      fingerlings_cost_fcfa:
        simulationResult.cycle_fingerlings_cost_fcfa
        ?? formPayload.cycle.fingerlings_cost_fcfa,
      other_operational_costs_fcfa:
        simulationResult.cycle_other_costs_fcfa
        ?? formPayload.cycle.other_operational_costs_fcfa,
      planned_feed_bags:
        firstCycle.feed_bags_total
        || simulationResult.feed_bags_per_cycle
        || undefined,
    },
  };
};

export const buildFirstCycleLaunchRequestFromForm = ({
  formData,
  launchKind = "initial_setup",
}: BuildFirstCycleFromFormParams): CycleLaunchRequest => {
  const ongoing = formData.onboardingMode === "ongoing";
  const configuredDuration = getValidCycleDuration(formData.cycleDuration);
  if (configuredDuration === undefined) {
    throw new FirstCycleLaunchError("simulationCycleDurationMismatchError");
  }

  const startDate = formData.startDate?.trim();
  if (!startDate) {
    throw new FirstCycleLaunchError(
      ongoing ? "ongoingCycleHistoricalStartRequired" : "fillRequiredFields",
    );
  }
  const baselineCount = toPositiveInteger(formData.fingerlingsCount);
  if (!baselineCount) {
    throw new FirstCycleLaunchError(
      ongoing ? "ongoingCycleTrackingCountRequired" : "fillRequiredFields",
    );
  }
  const historicalCount = ongoing
    ? toPositiveInteger(formData.historicalInitialCount)
    : baselineCount;
  if (!historicalCount) {
    throw new FirstCycleLaunchError("ongoingCycleHistoricalCountRequired");
  }
  const trackingStartDate = formData.trackingStartDate?.trim();
  if (ongoing && !trackingStartDate) {
    throw new FirstCycleLaunchError("ongoingCycleTrackingDateRequired");
  }
  if (
    ongoing
    && getOngoingCycleSchedule(
      startDate,
      trackingStartDate as string,
      configuredDuration,
    ) === null
  ) {
    throw new FirstCycleLaunchError("ongoingCyclePlannedHarvestElapsed");
  }
  const trackingWeight = toFiniteNumber(formData.trackingStartAverageWeight);
  if (ongoing && (!trackingWeight || trackingWeight <= 0)) {
    throw new FirstCycleLaunchError("ongoingCycleTrackingWeightRequired");
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
  const perCycleOtherCosts = (toFiniteNumber(formData.otherCosts) ?? 0)
    / Math.max(plan.num_cycles_per_year, 1);

  return {
    launch_uuid: launchUuid,
    launch_kind: launchKind,
    ...(launchKind === "initial_setup"
      ? {
          production_plan: {
            annual_production_target_kg: plan.annual_production_target_kg,
            num_cycles_per_year: plan.num_cycles_per_year,
            fingerlings_cost_per_unit_fcfa:
              plan.fingerlings_cost_per_unit_fcfa ?? fingerlingsPrice,
            ...(plan.planned_selling_price_per_kg_fcfa === undefined
              ? {}
              : {
                  planned_selling_price_per_kg_fcfa:
                    plan.planned_selling_price_per_kg_fcfa,
                }),
          },
        }
      : {}),
    cycle: {
      onboarding_mode: ongoing ? "ongoing" : "new",
      species: formData.species === "clarias" ? "clarias" : "tilapia",
      start_date: startDate,
      initial_count: historicalCount,
      ...(ongoing
        ? {
            initial_average_weight:
              toFiniteNumber(formData.historicalInitialWeight) === undefined
                ? null
                : formData.historicalInitialWeight,
          }
        : {}),
      target_harvest_weight_g: toFiniteNumber(formData.harvestWeight),
      planned_cycle_duration_days: configuredDuration,
      expected_survival_rate_pct: toFiniteNumber(formData.survivalRate) ?? 95,
      ...(sellingPrice === undefined
        ? {}
        : { planned_selling_price_per_kg_fcfa: sellingPrice }),
      fingerlings_cost_fcfa: fingerlingsPrice * historicalCount,
      other_operational_costs_fcfa: perCycleOtherCosts,
      created_offline: false,
    },
    ...(ongoing
      ? {
          tracking_baseline: {
            tracking_start_date: trackingStartDate as string,
            fish_count: baselineCount,
            average_weight_g: formData.trackingStartAverageWeight as string,
            biomass_kg: formData.trackingStartBiomass || null,
          },
        }
      : {}),
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
    ...(formData.calibrationUnits?.length
      ? { calibration_units: formData.calibrationUnits }
      : {}),
    ...(formData.initialFeedStocks?.length
      ? { initial_feed_stocks: formData.initialFeedStocks }
      : {}),
  };

};

export const launchFirstCycle = async (
  params: LaunchFirstCycleParams,
): Promise<FirstCycleLaunchResult> => {
  return aquacultureService.launchProductionCycle(
    buildFirstCycleLaunchRequest(params),
  );
};

export const launchFirstCycleFromForm = async (
  params: BuildFirstCycleFromFormParams,
): Promise<FirstCycleLaunchResult> =>
  aquacultureService.launchProductionCycle(
    buildFirstCycleLaunchRequestFromForm(params),
  );
