import { getProductionUnitCapacity } from "@/features/aquaculture/utils/productionUnits";
import type { NewCycleData } from "@/features/aquaculture/utils/newCycleForm";
import type { CycleLaunchCalibrationUnitInput, CycleLaunchRequest, ProductionUnit } from "@/types/aquaculture";

export class AdditionalCycleLaunchError extends Error {
  translationKey: string;

  constructor(translationKey: string) {
    super(translationKey);
    this.name = "AdditionalCycleLaunchError";
    this.translationKey = translationKey;
  }
}

interface AdditionalCycleLaunchInput {
  formData: NewCycleData;
  selectedUnits: ProductionUnit[];
  allocationsByUnitId: Record<string, string>;
  launchUuid: string;
  calibrationUnits?: CycleLaunchCalibrationUnitInput[];
}

const toFiniteNumber = (value: string): number | undefined => {
  if (!value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toPositiveInteger = (value: string): number | undefined => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const getUnitLocalId = (unit: ProductionUnit): string => `existing-${unit.id}`;

export const validateAdditionalCycleLaunch = ({
  formData,
  selectedUnits,
  allocationsByUnitId,
  calibrationUnits = [],
}: Omit<AdditionalCycleLaunchInput, "launchUuid">): string | null => {
  if (!formData.species || !formData.start_date.trim()) {
    return "fillRequiredFields";
  }
  if (!toPositiveInteger(formData.initial_count)) {
    return "fillRequiredFields";
  }
  const initialWeight = toFiniteNumber(formData.initial_average_weight);
  const targetWeight = toFiniteNumber(formData.target_harvest_weight_g);
  if (
    initialWeight === undefined ||
    targetWeight === undefined ||
    targetWeight <= initialWeight
  ) {
    return "fillRequiredFields";
  }
  const duration = toPositiveInteger(formData.planned_cycle_duration_days);
  const survival = toFiniteNumber(formData.expected_survival_rate_pct);
  if (
    !duration ||
    duration < 30 ||
    duration > 365 ||
    survival === undefined ||
    survival < 0 ||
    survival > 100
  ) {
    return "fillRequiredFields";
  }
  const sellingPrice = toFiniteNumber(
    formData.planned_selling_price_per_kg_fcfa,
  );
  if (sellingPrice !== undefined && sellingPrice <= 0) {
    return "cycleLaunchInvalidSellingPrice";
  }
  if (selectedUnits.length === 0) {
    return "createFarmAtLeastOneUnitError";
  }
  const calibrationNames = calibrationUnits.map((unit) => unit.name.trim().toLocaleLowerCase());
  if (
    calibrationUnits.some((unit) => !unit.name.trim() || !Number.isFinite(unit.volume_m3) || unit.volume_m3 <= 0) ||
    new Set(calibrationNames).size !== calibrationNames.length
  ) {
    return "calibrationLaunchUnitsInvalid";
  }

  const initialCount = toPositiveInteger(formData.initial_count) ?? 0;
  let totalAllocated = 0;
  for (const unit of selectedUnits) {
    const fishCount = toPositiveInteger(allocationsByUnitId[unit.id] ?? "");
    if (!fishCount) {
      return "createFarmProductionUnitAllocationRequiredError";
    }
    const capacity =
      unit.recommended_capacity ?? getProductionUnitCapacity(unit);
    if (capacity === null || capacity === undefined) {
      return "createFarmProductionUnitCapacityUnavailableError";
    }
    if (fishCount > capacity) {
      return "createFarmProductionUnitRecommendedCapacityExceededError";
    }
    totalAllocated += fishCount;
  }
  return totalAllocated === initialCount
    ? null
    : "createFarmProductionUnitAllocationSumError";
};

export const buildAdditionalCycleLaunchRequest = (
  input: AdditionalCycleLaunchInput,
): CycleLaunchRequest => {
  const validationError = validateAdditionalCycleLaunch(input);
  if (validationError) {
    throw new AdditionalCycleLaunchError(validationError);
  }

  const { formData, selectedUnits, allocationsByUnitId, launchUuid, calibrationUnits = [] } = input;
  const sellingPrice = toFiniteNumber(
    formData.planned_selling_price_per_kg_fcfa,
  );
  const cycle: CycleLaunchRequest["cycle"] = {
    species: formData.species as "clarias" | "tilapia",
    start_date: formData.start_date,
    initial_count: toPositiveInteger(formData.initial_count) ?? 0,
    planned_cycle_duration_days:
      toPositiveInteger(formData.planned_cycle_duration_days) ?? 0,
    expected_survival_rate_pct:
      toFiniteNumber(formData.expected_survival_rate_pct) ?? 0,
    fingerlings_cost_fcfa: toFiniteNumber(formData.fingerlings_cost_fcfa) ?? 0,
    other_operational_costs_fcfa:
      toFiniteNumber(formData.other_operational_costs_fcfa) ?? 0,
    created_offline: false,
    ...(formData.cycle_name.trim()
      ? { cycle_name: formData.cycle_name.trim() }
      : {}),
    ...(toFiniteNumber(formData.initial_average_weight) === undefined
      ? {}
      : {
          initial_average_weight: toFiniteNumber(
            formData.initial_average_weight,
          ),
        }),
    ...(toFiniteNumber(formData.target_harvest_weight_g) === undefined
      ? {}
      : {
          target_harvest_weight_g: toFiniteNumber(
            formData.target_harvest_weight_g,
          ),
        }),
    ...(sellingPrice === undefined
      ? {}
      : { planned_selling_price_per_kg_fcfa: sellingPrice }),
  };

  return {
    launch_uuid: launchUuid,
    launch_kind: "additional_cycle",
    cycle,
    production_units: selectedUnits.map((unit) => ({
      local_id: getUnitLocalId(unit),
      source: "existing",
      production_unit_id: unit.id,
    })),
    allocations: selectedUnits.map((unit) => ({
      production_unit_local_id: getUnitLocalId(unit),
      fish_count: toPositiveInteger(allocationsByUnitId[unit.id]) ?? 0,
    })),
    ...(calibrationUnits.length ? { calibration_units: calibrationUnits } : {}),
  };
};
