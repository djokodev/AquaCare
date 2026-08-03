import type { CycleLaunchRequest } from "@/types/aquaculture";
import type { FarmSetupFormState } from "@/features/aquaculture/utils/farmSetupForm";
import type {
  NewCycleData,
  CycleSpecies,
} from "@/features/aquaculture/utils/newCycleForm";

const toFarmSetupInfraType = (
  unitType: CycleLaunchRequest["production_units"][number]["unit_type"],
): FarmSetupFormState["infraType"] => {
  if (unitType === "pond") return "etang";
  if (unitType === "cage") return "cage_flottante";
  if (unitType === "tank") return "bac_hors_sol";
  return "";
};

export function hydrateFarmSetupFormFromLaunch(
  payload: CycleLaunchRequest,
): FarmSetupFormState {
  const cycle = payload.cycle;
  const ongoing = cycle.onboarding_mode === "ongoing";
  const units = payload.production_units ?? [];
  const allocations = payload.allocations ?? [];

  return {
    launchRequestId: payload.launch_uuid,
    onboardingMode: ongoing ? "ongoing" : "new",
    species:
      cycle.species === "clarias"
        ? "clarias"
        : cycle.species === "tilapia"
          ? "tilapia"
          : "",
    infraType: toFarmSetupInfraType(units[0]?.unit_type),
    unitCount: String(units.length || 1),
    unitVolume: String(units[0]?.volume_m3 ?? ""),
    unitSurface: String(units[0]?.surface_m2 ?? ""),
    annualTarget: String(
      payload.production_plan?.annual_production_target_kg ?? "",
    ),
    startDate: cycle.start_date,
    cycleDuration: String(cycle.planned_cycle_duration_days ?? ""),
    fingerlingsPrice: String(
      payload.production_plan?.fingerlings_cost_per_unit_fcfa
        ?? (
          cycle.initial_count > 0
            ? cycle.fingerlings_cost_fcfa / cycle.initial_count
            : ""
        ),
    ),
    sellingPrice: String(
      cycle.planned_selling_price_per_kg_fcfa ?? "",
    ),
    otherCosts: String(cycle.other_operational_costs_fcfa ?? ""),
    fingerlingsCount: String(
      ongoing
        ? payload.tracking_baseline?.fish_count ?? ""
        : cycle.initial_count ?? "",
    ),
    harvestWeight: String(cycle.target_harvest_weight_g ?? ""),
    survivalRate: String(cycle.expected_survival_rate_pct ?? ""),
    productionUnits: units
      .filter(
        (unit): unit is typeof unit & { unit_type: NonNullable<typeof unit.unit_type> } =>
          unit.unit_type !== undefined,
      )
      .map((unit) => ({
      local_id: unit.local_id,
      name: unit.name ?? "",
      unit_type: unit.unit_type,
      ...("surface_m2" in unit && unit.surface_m2 !== undefined
        ? { surface_m2: String(unit.surface_m2) }
        : {}),
      ...("volume_m3" in unit && unit.volume_m3 !== undefined
        ? { volume_m3: String(unit.volume_m3) }
        : {}),
      ...("production_unit_id" in unit
        ? { production_unit_id: unit.production_unit_id }
        : {}),
    })),
    productionUnitAllocations: allocations.map((alloc) => ({
      production_unit_local_id: alloc.production_unit_local_id,
      fish_count: String(alloc.fish_count),
    })),
    initialFeedStocks: payload.initial_feed_stocks ?? [],
    calibrationUnits: payload.calibration_units ?? [],
    historicalInitialCount: ongoing ? String(cycle.initial_count) : undefined,
    historicalInitialWeight: ongoing
      ? String(cycle.initial_average_weight ?? "")
      : undefined,
    trackingStartDate: ongoing
      ? payload.tracking_baseline?.tracking_start_date ?? cycle.start_date
      : undefined,
    trackingStartAverageWeight: ongoing
      ? String(
          payload.tracking_baseline?.average_weight_g ?? "",
        )
      : undefined,
    trackingStartBiomass: ongoing
      ? payload.tracking_baseline?.biomass_kg ?? ""
      : undefined,
  };
}

export function hydrateNewCycleFormFromLaunch(
  payload: CycleLaunchRequest,
): NewCycleData {
  const cycle = payload.cycle;
  const ongoing = cycle.onboarding_mode === "ongoing";
  const allocations = payload.allocations ?? [];

  return {
    onboarding_mode: ongoing ? "ongoing" : "new",
    cycle_name: cycle.cycle_name ?? "",
    species: (cycle.species || "tilapia") as CycleSpecies,
    pond_identifier: "",
    pond_surface_m2: "",
    pond_volume_m3: "",
    infrastructure_type: [],
    initial_count: String(cycle.initial_count ?? ""),
    initial_average_weight:
      cycle.initial_average_weight != null
        ? String(cycle.initial_average_weight)
        : "",
    start_date: cycle.start_date,
    target_harvest_weight_g: String(cycle.target_harvest_weight_g ?? ""),
    planned_cycle_duration_days: String(
      cycle.planned_cycle_duration_days ?? "",
    ),
    expected_survival_rate_pct: String(
      cycle.expected_survival_rate_pct ?? "",
    ),
    planned_selling_price_per_kg_fcfa: String(
      cycle.planned_selling_price_per_kg_fcfa ?? "",
    ),
    fingerlings_cost_fcfa: String(cycle.fingerlings_cost_fcfa ?? ""),
    other_operational_costs_fcfa: String(
      cycle.other_operational_costs_fcfa ?? "",
    ),
    tracking_start_date: ongoing
      ? payload.tracking_baseline?.tracking_start_date ?? ""
      : "",
    tracking_start_count: ongoing
      ? String(payload.tracking_baseline?.fish_count ?? "")
      : "",
    tracking_start_average_weight: ongoing
      ? String(payload.tracking_baseline?.average_weight_g ?? "")
      : "",
    tracking_start_biomass: ongoing
      ? (payload.tracking_baseline?.biomass_kg ?? "")
      : "",
    initial_feed_stocks: payload.initial_feed_stocks ?? [],
  };
}
