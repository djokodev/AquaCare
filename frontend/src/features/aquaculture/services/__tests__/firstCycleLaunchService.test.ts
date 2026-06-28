import { aquacultureService } from '../aquacultureService';
import { farmSetupService } from '../farmSetupService';
import { launchFirstCycle } from '../firstCycleLaunchService';

jest.mock('../aquacultureService', () => ({
  aquacultureService: {
    createProductionCycle: jest.fn(),
    createProductionUnit: jest.fn(),
    createCycleUnitAllocation: jest.fn(),
  },
}));

jest.mock('../farmSetupService', () => ({
  farmSetupService: {
    completeFarmSetup: jest.fn(),
  },
}));

describe('features/aquaculture/services/firstCycleLaunchService', () => {
  const mockAquaculture = aquacultureService as jest.Mocked<typeof aquacultureService>;
  const mockFarmSetup = farmSetupService as jest.Mocked<typeof farmSetupService>;

  const farmProfile = {
    id: 'farm-1',
    farm_name: 'Ferme Test',
    certification_status: 'pending',
    total_ponds: 1,
    is_certified: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } as any;

  const productionCycle = {
    id: 'cycle-1',
    farm_profile: 'farm-1',
    cycle_name: 'Cycle Tilapia 2026',
    species: 'tilapia',
    pond_identifier: 'Bac 1',
    pond_surface_m2: 120,
    start_date: '2026-05-15',
    initial_count: 2100,
    initial_average_weight: 10,
    initial_biomass: 21,
    current_count: 2100,
    current_average_weight: 10,
    current_biomass: 21,
    total_feed_consumed: 0,
    status: 'active',
    created_at: '2026-05-15T00:00:00Z',
    updated_at: '2026-05-15T00:00:00Z',
  } as any;

  const baseCurrentResult = {
    cycle_fingerlings_cost_fcfa: 105000,
    cycle_other_costs_fcfa: 5000,
    feed_bags_per_cycle: 12,
    cycles_breakdown: [
      {
        cycle_num: 1,
        production_kg: 0,
        start_date_estimate: '2026-05-15',
        end_date_estimate: '2026-08-13',
        duration_days: 90,
        feed_bags_total: 12,
        feed_cost_fcfa: 0,
        fingerlings_cost_fcfa: 105000,
        initial_fish_count: 2100,
      },
    ],
  } as any;

  const baseFormData = {
    species: 'tilapia',
    infraType: 'etang',
    unitCount: '1',
    unitVolume: '',
    unitSurface: '120',
    annualTarget: '',
    startDate: '2026-05-14',
    fingerlingsPrice: '50',
    sellingPrice: '2800',
    otherCosts: '0',
    fingerlingsCount: '2100',
    harvestWeight: '350',
    survivalRate: '95',
    productionUnits: [],
    productionUnitAllocations: [],
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFarmSetup.completeFarmSetup.mockResolvedValue(farmProfile);
    mockAquaculture.createProductionCycle.mockResolvedValue(productionCycle);
    mockAquaculture.createProductionUnit.mockImplementation(async (payload) => ({
      id: payload.name === 'Bac 1' ? 'unit-backend-1' : 'unit-backend-2',
      farm_profile: 'farm-1',
      name: payload.name,
      unit_type: payload.unit_type,
      volume_m3: payload.volume_m3 ?? null,
      surface_m2: payload.surface_m2 ?? null,
      status: payload.status ?? 'active',
      created_at: '2026-05-15T00:00:00Z',
      updated_at: '2026-05-15T00:00:00Z',
    } as any));
    mockAquaculture.createCycleUnitAllocation.mockResolvedValue({
      id: 'allocation-1',
      cycle: 'cycle-1',
      production_unit: 'unit-backend-1',
      initial_fish_count: 900,
      current_fish_count: 900,
      initial_biomass_kg: 0,
      current_biomass_kg: 0,
      expected_survival_rate_pct: 95,
      created_at: '2026-05-15T00:00:00Z',
      updated_at: '2026-05-15T00:00:00Z',
    } as any);
  });

  it('garde le flux legacy quand aucune production unit n\'est fournie', async () => {
    const result = await launchFirstCycle({
      formData: baseFormData,
      simulationResult: baseCurrentResult,
      defaultPondIdentifier: 'Bassin principal',
    });

    expect(mockFarmSetup.completeFarmSetup).toHaveBeenCalledTimes(1);
    expect(mockAquaculture.createProductionCycle).toHaveBeenCalledTimes(1);
    expect(mockAquaculture.createProductionUnit).not.toHaveBeenCalled();
    expect(mockAquaculture.createCycleUnitAllocation).not.toHaveBeenCalled();
    expect(result.productionUnitIdByLocalId).toEqual({});
  });

  it('persiste les unités et allocations avec le mapping local vers backend', async () => {
    const result = await launchFirstCycle({
      formData: {
        ...baseFormData,
        productionUnits: [
          {
            local_id: 'unit-1',
            name: 'Bac 1',
            unit_type: 'tank',
            volume_m3: '3',
            surface_m2: '',
          },
          {
            local_id: 'unit-2',
            name: 'Étang principal',
            unit_type: 'pond',
            volume_m3: '',
            surface_m2: '120',
          },
        ],
        productionUnitAllocations: [
          {
            production_unit_local_id: 'unit-1',
            fish_count: '900',
          },
          {
            production_unit_local_id: 'unit-2',
            fish_count: '1200',
          },
        ],
      },
      simulationResult: baseCurrentResult,
      defaultPondIdentifier: 'Bassin principal',
    });

    expect(mockAquaculture.createProductionUnit).toHaveBeenNthCalledWith(1, {
      name: 'Bac 1',
      unit_type: 'tank',
      volume_m3: 3,
      status: 'active',
    });
    expect(mockAquaculture.createProductionUnit).toHaveBeenNthCalledWith(2, {
      name: 'Étang principal',
      unit_type: 'pond',
      surface_m2: 120,
      status: 'active',
    });

    const secondUnitPayload = mockAquaculture.createProductionUnit.mock.calls[1]?.[0] as any;
    expect(secondUnitPayload.volume_m3).toBeUndefined();

    expect(mockAquaculture.createCycleUnitAllocation).toHaveBeenNthCalledWith(1, {
      cycle: 'cycle-1',
      production_unit: 'unit-backend-1',
      initial_fish_count: 900,
      current_fish_count: 900,
      expected_survival_rate_pct: 95,
    });
    expect(mockAquaculture.createCycleUnitAllocation).toHaveBeenNthCalledWith(2, {
      cycle: 'cycle-1',
      production_unit: 'unit-backend-2',
      initial_fish_count: 1200,
      current_fish_count: 1200,
      expected_survival_rate_pct: 95,
    });

    expect(result.productionUnitIdByLocalId).toEqual({
      'unit-1': 'unit-backend-1',
      'unit-2': 'unit-backend-2',
    });
  });

  it('bloque le lancement si une allocation est manquante', async () => {
    await expect(
      launchFirstCycle({
        formData: {
          ...baseFormData,
          productionUnits: [
            {
              local_id: 'unit-1',
              name: 'Bac 1',
              unit_type: 'tank',
              volume_m3: '3',
              surface_m2: '',
            },
          ],
          productionUnitAllocations: [],
        },
        simulationResult: baseCurrentResult,
        defaultPondIdentifier: 'Bassin principal',
      })
    ).rejects.toMatchObject({
      translationKey: 'simulationProductionUnitAllocationInvalidError',
    });

    expect(mockFarmSetup.completeFarmSetup).not.toHaveBeenCalled();
    expect(mockAquaculture.createProductionCycle).not.toHaveBeenCalled();
  });

  it('bloque le lancement si une allocation reference un local_id inconnu', async () => {
    await expect(
      launchFirstCycle({
        formData: {
          ...baseFormData,
          productionUnits: [
            {
              local_id: 'unit-1',
              name: 'Bac 1',
              unit_type: 'tank',
              volume_m3: '3',
              surface_m2: '',
            },
          ],
          productionUnitAllocations: [
            {
              production_unit_local_id: 'unit-unknown',
              fish_count: '900',
            },
          ],
        },
        simulationResult: baseCurrentResult,
        defaultPondIdentifier: 'Bassin principal',
      })
    ).rejects.toMatchObject({
      translationKey: 'simulationProductionUnitAllocationInvalidError',
    });

    expect(mockFarmSetup.completeFarmSetup).not.toHaveBeenCalled();
    expect(mockAquaculture.createProductionCycle).not.toHaveBeenCalled();
  });

  it('remonte une erreur lisible si la creation d une unite echoue', async () => {
    mockAquaculture.createProductionUnit.mockRejectedValueOnce(new Error('boom'));

    await expect(
      launchFirstCycle({
        formData: {
          ...baseFormData,
          productionUnits: [
            {
              local_id: 'unit-1',
              name: 'Bac 1',
              unit_type: 'tank',
              volume_m3: '10',
              surface_m2: '',
            },
          ],
          productionUnitAllocations: [
            {
              production_unit_local_id: 'unit-1',
              fish_count: '2100',
            },
          ],
        },
        simulationResult: baseCurrentResult,
        defaultPondIdentifier: 'Bassin principal',
      })
    ).rejects.toMatchObject({
      translationKey: 'simulationUnableToSaveCycleProductionUnits',
    });
  });

  it('remonte une erreur lisible si la creation d une allocation echoue', async () => {
    mockAquaculture.createCycleUnitAllocation.mockRejectedValueOnce(new Error('boom'));

    await expect(
      launchFirstCycle({
        formData: {
          ...baseFormData,
          productionUnits: [
            {
              local_id: 'unit-1',
              name: 'Bac 1',
              unit_type: 'tank',
              volume_m3: '10',
              surface_m2: '',
            },
          ],
          productionUnitAllocations: [
            {
              production_unit_local_id: 'unit-1',
              fish_count: '2100',
            },
          ],
        },
        simulationResult: baseCurrentResult,
        defaultPondIdentifier: 'Bassin principal',
      })
    ).rejects.toMatchObject({
      translationKey: 'simulationUnableToSaveCycleUnitAllocations',
    });
  });
});
