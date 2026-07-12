import { aquacultureService } from "../aquacultureService";
import { launchFirstCycle } from "../firstCycleLaunchService";

jest.mock("../aquacultureService", () => ({
  aquacultureService: {
    launchProductionCycle: jest.fn(),
  },
}));

describe("features/aquaculture/services/firstCycleLaunchService", () => {
  const mockAquaculture = aquacultureService as jest.Mocked<
    typeof aquacultureService
  >;
  const launchResponse = {
    launchUuid: "8bfdbf37-ef57-4829-a9b6-98a0c2645a31",
    idempotentReplay: false,
    farmProfile: { id: "farm-1" },
    productionCycle: { id: "cycle-1" },
    productionUnits: [{ id: "unit-1" }],
    cycleUnitAllocations: [{ id: "allocation-1" }],
    productionUnitIdByLocalId: { "unit-1": "unit-1" },
  } as any;

  const formData = {
    launchRequestId: launchResponse.launchUuid,
    species: "tilapia",
    infraType: "bac_hors_sol",
    unitCount: "1",
    unitVolume: "10",
    unitSurface: "",
    annualTarget: "",
    startDate: "2026-05-15",
    cycleDuration: "150",
    fingerlingsPrice: "50",
    sellingPrice: "2800",
    otherCosts: "0",
    fingerlingsCount: "2100",
    harvestWeight: "350",
    survivalRate: "95",
    productionUnits: [
      {
        local_id: "unit-1",
        name: "Bac 1",
        unit_type: "tank",
        volume_m3: "25",
        surface_m2: "",
      },
    ],
    productionUnitAllocations: [
      { production_unit_local_id: "unit-1", fish_count: "2100" },
    ],
  } as any;

  const simulationResult = {
    annual_production_target_kg: 700,
    num_cycles: 1,
    cycle_duration_days: 150,
    cycle_fingerlings_cost_fcfa: 105000,
    cycle_other_costs_fcfa: 5000,
    feed_bags_per_cycle: 12,
    cycles_breakdown: [
      {
        cycle_num: 1,
        production_kg: 0,
        start_date_estimate: "2026-05-15",
        end_date_estimate: "2026-10-11",
        duration_days: 150,
        feed_bags_total: 12,
        feed_cost_fcfa: 0,
        fingerlings_cost_fcfa: 105000,
        initial_fish_count: 2100,
      },
    ],
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAquaculture.launchProductionCycle.mockResolvedValue(launchResponse);
  });

  it("effectue un seul appel réseau agrégé sans persistance best effort", async () => {
    const result = await launchFirstCycle({
      formData,
      simulationResult,
      defaultPondIdentifier: "Bassin principal",
    });

    expect(mockAquaculture.launchProductionCycle).toHaveBeenCalledTimes(1);
    expect(mockAquaculture.launchProductionCycle).toHaveBeenCalledWith(
      expect.objectContaining({
        launch_uuid: formData.launchRequestId,
        production_units: [
          {
            local_id: "unit-1",
            name: "Bac 1",
            unit_type: "tank",
            volume_m3: 25,
          },
        ],
        allocations: [{ production_unit_local_id: "unit-1", fish_count: 2100 }],
      }),
    );
    const payload = mockAquaculture.launchProductionCycle.mock
      .calls[0][0] as any;
    expect(payload.cycle.current_fish_count).toBeUndefined();
    expect(payload.cycle.initial_biomass).toBeUndefined();
    expect(result.productionCycle.id).toBe("cycle-1");
  });

  it("conserve le même launch_uuid pour un retry", async () => {
    await launchFirstCycle({
      formData,
      simulationResult,
      defaultPondIdentifier: "Bassin principal",
    });
    await launchFirstCycle({
      formData,
      simulationResult,
      defaultPondIdentifier: "Bassin principal",
    });

    expect(mockAquaculture.launchProductionCycle).toHaveBeenCalledTimes(2);
    expect(
      mockAquaculture.launchProductionCycle.mock.calls[0][0].launch_uuid,
    ).toBe(formData.launchRequestId);
    expect(
      mockAquaculture.launchProductionCycle.mock.calls[1][0].launch_uuid,
    ).toBe(formData.launchRequestId);
  });

  it("bloque un lancement sans unité réelle", async () => {
    await expect(
      launchFirstCycle({
        formData: {
          ...formData,
          productionUnits: [],
          productionUnitAllocations: [],
        },
        simulationResult,
        defaultPondIdentifier: "Bassin principal",
      }),
    ).rejects.toMatchObject({
      translationKey: "createFarmAtLeastOneUnitError",
    });
    expect(mockAquaculture.launchProductionCycle).not.toHaveBeenCalled();
  });

  it("bloque une allocation partielle avant l appel réseau", async () => {
    await expect(
      launchFirstCycle({
        formData: {
          ...formData,
          productionUnitAllocations: [
            { production_unit_local_id: "unit-1", fish_count: "2000" },
          ],
        },
        simulationResult,
        defaultPondIdentifier: "Bassin principal",
      }),
    ).rejects.toMatchObject({
      translationKey: "simulationProductionUnitAllocationInvalidError",
    });
    expect(mockAquaculture.launchProductionCycle).not.toHaveBeenCalled();
  });

  it("rejette une durée différente de la simulation", async () => {
    await expect(
      launchFirstCycle({
        formData: { ...formData, cycleDuration: "120" },
        simulationResult,
        defaultPondIdentifier: "Bassin principal",
      }),
    ).rejects.toMatchObject({
      translationKey: "simulationCycleDurationMismatchError",
    });
  });

  it("rejette une durée de breakdown différente de la simulation", async () => {
    await expect(
      launchFirstCycle({
        formData,
        simulationResult: {
          ...simulationResult,
          cycles_breakdown: [
            { ...simulationResult.cycles_breakdown[0], duration_days: 120 },
          ],
        },
        defaultPondIdentifier: "Bassin principal",
      }),
    ).rejects.toMatchObject({
      translationKey: "simulationCycleDurationMismatchError",
    });
    expect(mockAquaculture.launchProductionCycle).not.toHaveBeenCalled();
  });

  it("rejette une allocation qui référence une unité inconnue", async () => {
    await expect(
      launchFirstCycle({
        formData: {
          ...formData,
          productionUnitAllocations: [
            { production_unit_local_id: "unit-unknown", fish_count: "2100" },
          ],
        },
        simulationResult,
        defaultPondIdentifier: "Bassin principal",
      }),
    ).rejects.toMatchObject({
      translationKey: "simulationProductionUnitAllocationInvalidError",
    });
    expect(mockAquaculture.launchProductionCycle).not.toHaveBeenCalled();
  });

  it("rejette les allocations dupliquées pour une même unité", async () => {
    await expect(
      launchFirstCycle({
        formData: {
          ...formData,
          productionUnitAllocations: [
            { production_unit_local_id: "unit-1", fish_count: "1000" },
            { production_unit_local_id: "unit-1", fish_count: "1100" },
          ],
        },
        simulationResult,
        defaultPondIdentifier: "Bassin principal",
      }),
    ).rejects.toMatchObject({
      translationKey: "simulationProductionUnitAllocationInvalidError",
    });
    expect(mockAquaculture.launchProductionCycle).not.toHaveBeenCalled();
  });

  it("rejette une unité dont le type est invalide avant l appel réseau", async () => {
    await expect(
      launchFirstCycle({
        formData: {
          ...formData,
          productionUnits: [
            { ...formData.productionUnits[0], unit_type: "unknown" },
          ],
        },
        simulationResult,
        defaultPondIdentifier: "Bassin principal",
      }),
    ).rejects.toMatchObject({
      translationKey: "simulationUnableToSaveCycleProductionUnits",
    });
    expect(mockAquaculture.launchProductionCycle).not.toHaveBeenCalled();
  });

  it("propage l erreur de lancement agrégé sans effectuer de second appel", async () => {
    mockAquaculture.launchProductionCycle.mockRejectedValueOnce(
      new Error("conflict"),
    );

    await expect(
      launchFirstCycle({
        formData,
        simulationResult,
        defaultPondIdentifier: "Bassin principal",
      }),
    ).rejects.toThrow("conflict");
    expect(mockAquaculture.launchProductionCycle).toHaveBeenCalledTimes(1);
  });
});
