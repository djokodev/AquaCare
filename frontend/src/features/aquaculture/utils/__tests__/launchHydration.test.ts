import {
  hydrateFarmSetupFormFromLaunch,
  hydrateNewCycleFormFromLaunch,
} from "../launchHydration";

describe("launchHydration", () => {
  const ongoingLaunch = {
    launch_uuid: "33333333-3333-4333-8333-333333333333",
    launch_kind: "initial_setup",
    cycle: {
      onboarding_mode: "ongoing",
      species: "tilapia",
      start_date: "2026-06-01",
      initial_count: 2200,
      initial_average_weight: null,
      planned_cycle_duration_days: 150,
      expected_survival_rate_pct: 95,
      fingerlings_cost_fcfa: 0,
      other_operational_costs_fcfa: 0,
      created_offline: true,
    },
    tracking_baseline: {
      tracking_start_date: "2026-07-20",
      fish_count: 2100,
      average_weight_g: "75",
      biomass_kg: null,
    },
    production_units: [{
      local_id: "unit-local-1",
      source: "new",
      name: "Bassin local",
      unit_type: "tank",
      volume_m3: 10,
    }],
    allocations: [{
      production_unit_local_id: "unit-local-1",
      fish_count: 2100,
    }],
    initial_feed_stocks: [{
      local_id: "stock-1",
      quantity_kg: "25",
      cost_status: "unknown",
      total_cost_fcfa: null,
      note: "",
      external_feed: {
        client_uuid: "44444444-4444-4444-8444-444444444444",
        name: "Aliment local",
        pellet_size_mm: "2",
        brand: "",
      },
    }],
    calibration_units: [{
      client_uuid: "55555555-5555-4555-8555-555555555555",
      name: "Bac calibrage",
      volume_m3: 2,
    }],
  } as any;

  it("hydrate le setup ongoing depuis la baseline sans écraser l'historique", () => {
    const form = hydrateFarmSetupFormFromLaunch(ongoingLaunch);

    expect(form.historicalInitialCount).toBe("2200");
    expect(form.fingerlingsCount).toBe("2100");
    expect(form.trackingStartDate).toBe("2026-07-20");
    expect(form.trackingStartAverageWeight).toBe("75");
    expect(form.productionUnitAllocations).toEqual([{
      production_unit_local_id: "unit-local-1",
      fish_count: "2100",
    }]);
    expect(form.initialFeedStocks).toEqual(ongoingLaunch.initial_feed_stocks);
    expect(form.calibrationUnits).toEqual(ongoingLaunch.calibration_units);
  });

  it("hydrate un cycle additionnel ongoing avec le compte historique et la baseline distincts", () => {
    const form = hydrateNewCycleFormFromLaunch(ongoingLaunch);

    expect(form.initial_count).toBe("2200");
    expect(form.tracking_start_count).toBe("2100");
    expect(form.tracking_start_date).toBe("2026-07-20");
    expect(form.initial_feed_stocks).toEqual(ongoingLaunch.initial_feed_stocks);
  });
});
