import {
  buildAdditionalCycleLaunchRequest,
  validateAdditionalCycleLaunch,
} from "../additionalCycleLaunchService";
import type { NewCycleData } from "@/features/aquaculture/utils/newCycleForm";
import type { ProductionUnit } from "@/types/aquaculture";

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

const validFarmContext = {
  selectedUnitIds: ["unit-1"],
  farmProfileId: "farm-1",
  loadedFarmProfileId: "farm-1",
  loadingUnits: false,
};

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
  it.each(["2026-10-28", "2026-10-29"])(
    "rejects a baseline %s at or after planned harvest",
    (trackingStartDate) => {
      jest.useFakeTimers().setSystemTime(new Date("2026-10-30T12:00:00Z"));
      expect(validateAdditionalCycleLaunch({
        ...validFarmContext,
        formData: {
          ...ongoingForm,
          tracking_start_date: trackingStartDate,
        } as any,
        selectedUnits: [unit as any],
        allocationsByUnitId: { "unit-1": "1850" },
      })).toBe("ongoingCyclePlannedHarvestElapsed");
      jest.useRealTimers();
    },
  );

  it("accepts the day before harvest and builds two inclusive remaining days", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-27T12:00:00Z"));
    const input = {
      ...validFarmContext,
      formData: {
        ...ongoingForm,
        tracking_start_date: "2026-10-27",
      } as any,
      selectedUnits: [unit as any],
      allocationsByUnitId: { "unit-1": "1850" },
      launchUuid: "11111111-1111-4111-8111-111111111111",
    };
    expect(validateAdditionalCycleLaunch(input)).toBeNull();
    expect(
      buildAdditionalCycleLaunchRequest(input).tracking_baseline
        ?.tracking_start_date,
    ).toBe("2026-10-27");
    jest.useRealTimers();
  });

  it("rejects an elapsed harvest in both validator and builder", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-29T12:00:00Z"));
    const input = {
      ...validFarmContext,
      formData: {
        ...ongoingForm,
        start_date: "2026-01-01",
        tracking_start_date: "2026-05-29",
      } as any,
      selectedUnits: [unit as any],
      allocationsByUnitId: { "unit-1": "1850" },
      launchUuid: "11111111-1111-4111-8111-111111111111",
    };

    expect(validateAdditionalCycleLaunch(input)).toBe(
      "ongoingCyclePlannedHarvestElapsed",
    );
    expect(() => buildAdditionalCycleLaunchRequest(input)).toThrow(
      expect.objectContaining({
        translationKey: "ongoingCyclePlannedHarvestElapsed",
      }),
    );
    jest.useRealTimers();
  });

  it("builds an ongoing aggregate without inventing historical weight or cost", () => {
    const payload = buildAdditionalCycleLaunchRequest({
      ...validFarmContext,
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
      ...validFarmContext,
      formData: ongoingForm as any,
      selectedUnits: [unit as any],
      allocationsByUnitId: { "unit-1": "2000" },
    })).toBe("createFarmProductionUnitAllocationSumError");
  });

  it("rejects a declared biomass outside the ten-percent tolerance", () => {
    expect(validateAdditionalCycleLaunch({
      ...validFarmContext,
      formData: { ...ongoingForm, tracking_start_biomass: "200.00" } as any,
      selectedUnits: [unit as any],
      allocationsByUnitId: { "unit-1": "1850" },
    })).toBe("ongoingCycleBiomassInconsistent");
  });

  it.each([
    {
      feed_reference_id: "feed-1",
      feed_reference_client_uuid: "11111111-1111-4111-8111-111111111111",
    },
    {
      feed_reference_client_uuid: "11111111-1111-4111-8111-111111111111",
      external_feed: {
        client_uuid: "22222222-2222-4222-8222-222222222222",
        name: "Aliment externe",
        pellet_size_mm: "2.00",
      },
    },
  ])("rejects opening stock with multiple feed identities", (identities) => {
    expect(validateAdditionalCycleLaunch({
      ...validFarmContext,
      formData: {
        ...ongoingForm,
        initial_feed_stocks: [{
          local_id: "stock-conflict",
          ...identities,
          quantity_kg: "25.00",
          cost_status: "unknown",
          total_cost_fcfa: null,
          note: "",
        }],
      } as unknown as NewCycleData,
      selectedUnits: [unit as unknown as ProductionUnit],
      allocationsByUnitId: { "unit-1": "1850" },
    })).toBe("openingStockInvalid");
  });

  it.each([
    {
      context: { ...validFarmContext, loadingUnits: true },
      error: "cycleLaunchFarmContextLoading",
    },
    {
      context: { ...validFarmContext, loadedFarmProfileId: "farm-2" },
      error: "cycleLaunchFarmContextChanged",
    },
    {
      context: {
        ...validFarmContext,
        selectedUnits: [{ ...unit, farm_profile: "farm-2" }],
      },
      error: "cycleLaunchProductionUnitFarmMismatch",
    },
    {
      context: { ...validFarmContext, selectedUnits: [] },
      error: "cycleLaunchProductionUnitNotFound",
    },
    {
      context: { ...validFarmContext, unavailableUnitIds: ["unit-1"] },
      error: "cycleLaunchProductionUnitNotFound",
    },
  ])("rejects an invalid farm context with $error", ({ context, error }) => {
    const input = {
      ...validFarmContext,
      formData: ongoingForm as any,
      selectedUnits: [unit as any],
      allocationsByUnitId: { "unit-1": "1850" },
      launchUuid: "11111111-1111-4111-8111-111111111111",
      ...context,
    };

    expect(validateAdditionalCycleLaunch(input)).toBe(error);
    expect(() => buildAdditionalCycleLaunchRequest(input)).toThrow(
      expect.objectContaining({ translationKey: error }),
    );
  });
});
