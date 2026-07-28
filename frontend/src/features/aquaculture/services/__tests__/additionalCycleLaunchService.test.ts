import {
  buildAdditionalCycleLaunchRequest,
  validateAdditionalCycleLaunch,
} from "../additionalCycleLaunchService";

const unit = {
  id: "unit-1",
  farm_profile: "farm-1",
  name: "Bassin 1",
  unit_type: "tank",
  volume_m3: 100,
  recommended_capacity: 2000,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} as const;

const ongoingForm = {
  onboarding_mode: "ongoing",
  cycle_name: "Clarias Nord",
  species: "clarias",
  pond_identifier: "",
  pond_surface_m2: "",
  pond_volume_m3: "",
  infrastructure_type: [],
  initial_count: "2000",
  initial_average_weight: "",
  start_date: "2026-06-01",
  target_harvest_weight_g: "400",
  planned_cycle_duration_days: "150",
  expected_survival_rate_pct: "95",
  planned_selling_price_per_kg_fcfa: "2000",
  fingerlings_cost_fcfa: "100000",
  other_operational_costs_fcfa: "50000",
  tracking_start_date: "2026-07-20",
  tracking_start_count: "1850",
  tracking_start_average_weight: "75.00",
  tracking_start_biomass: "",
  initial_feed_stocks: [
    {
      local_id: "stock-1",
      external_feed: {
        client_uuid: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        name: "Aliment local",
        pellet_size_mm: "2.00",
      },
      quantity_kg: "25.00",
      cost_status: "unknown",
      total_cost_fcfa: null,
      note: "Reliquat",
    },
  ],
} as const;

describe("additionalCycleLaunchService ongoing onboarding", () => {
  it("builds an ongoing aggregate without inventing historical weight or cost", () => {
    const payload = buildAdditionalCycleLaunchRequest({
      formData: ongoingForm as any,
      selectedUnits: [unit as any],
      allocationsByUnitId: { "unit-1": "1850" },
      launchUuid: "11111111-1111-4111-8111-111111111111",
    });

    expect(payload.cycle.onboarding_mode).toBe("ongoing");
    expect(payload.cycle.initial_average_weight).toBeNull();
    expect(payload.tracking_baseline).toEqual({
      tracking_start_date: "2026-07-20",
      fish_count: 1850,
      average_weight_g: "75.00",
      biomass_kg: null,
    });
    expect(payload.allocations[0].fish_count).toBe(1850);
    expect(payload.initial_feed_stocks?.[0].total_cost_fcfa).toBeNull();
  });

  it("validates allocation against the tracking baseline count", () => {
    expect(validateAdditionalCycleLaunch({
      formData: ongoingForm as any,
      selectedUnits: [unit as any],
      allocationsByUnitId: { "unit-1": "2000" },
    })).toBe("createFarmProductionUnitAllocationSumError");
  });

  it("rejects a declared biomass outside the ten-percent tolerance", () => {
    expect(validateAdditionalCycleLaunch({
      formData: { ...ongoingForm, tracking_start_biomass: "200.00" } as any,
      selectedUnits: [unit as any],
      allocationsByUnitId: { "unit-1": "1850" },
    })).toBe("ongoingCycleBiomassInconsistent");
  });
});
