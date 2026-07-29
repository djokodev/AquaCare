import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useDispatch, useSelector } from 'react-redux';

import CycleSimulationScreen from '../CycleSimulationScreen';
import {
  FirstCycleLaunchError,
  buildFirstCycleLaunchRequest,
  buildFirstCycleLaunchRequestFromForm,
  launchFirstCycle,
  launchFirstCycleFromForm,
} from '@/features/aquaculture/services/firstCycleLaunchService';
import { offlineService } from '@/services/offlineService';
import {
  addCreatedProductionCycle,
  setCurrentCycle,
} from '@/features/aquaculture/store/aquacultureSlice';
import { runCycleSimulation } from '@/features/aquaculture/store/farmSetupSlice';
import type { ProductionCycle } from '@/types/aquaculture';

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock('react-i18next', () => {
  const actual = jest.requireActual('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      i18n: { language: 'en' },
      t: (
        key: string,
        options?: { days?: number; count?: number; date?: string },
      ) => {
        if (key === 'simulationDays') return `${options?.days} days`;
        if (key === 'myFeedSacks') return `${options?.count} sacks`;
        if (key === 'ongoingTotalDuration') {
          return `total:${options?.count}`;
        }
        if (key === 'ongoingPlannedHarvestDate') {
          return `harvest:${options?.date}`;
        }
        if (key === 'ongoingRemainingDuration') {
          return `remaining:${options?.count}`;
        }
        return key;
      },
    }),
  };
});

jest.mock('@/features/aquaculture/services/firstCycleLaunchService', () => ({
  launchFirstCycle: jest.fn(),
  launchFirstCycleFromForm: jest.fn(),
  buildFirstCycleLaunchRequest: jest.fn(),
  buildFirstCycleLaunchRequestFromForm: jest.fn(),
  FirstCycleLaunchError: class FirstCycleLaunchError extends Error {
    translationKey: string;

    constructor(translationKey: string) {
      super(translationKey);
      this.translationKey = translationKey;
    }
  },
}));

jest.mock('@/services/offlineService', () => ({
  offlineService: {
    isOnline: jest.fn(),
    saveCycleLaunchOffline: jest.fn(),
    updatePendingCycleLaunch: jest.fn(),
  },
}));

describe('features/aquaculture/screens/CycleSimulationScreen', () => {
  const mockDispatch = jest.fn();
  const mockLaunchFirstCycle = launchFirstCycle as unknown as jest.Mock;
  const mockLaunchFirstCycleFromForm =
    launchFirstCycleFromForm as unknown as jest.Mock;
  const mockBuildRequest = buildFirstCycleLaunchRequest as unknown as jest.Mock;
  const mockBuildRequestFromForm =
    buildFirstCycleLaunchRequestFromForm as unknown as jest.Mock;
  const mockOffline = offlineService as jest.Mocked<typeof offlineService>;
  const createdProductionCycle = { id: 'cycle-1' } as unknown as ProductionCycle;
  const navigation = {
    goBack: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    navigate: jest.fn(),
  } as any;

  const currentResult = {
    species: 'tilapia',
    num_cycles: 1,
    annual_production_target_kg: 1200,
    cycles_per_year_derived: 1,
    technical_pause_days: 1,
    other_costs_rate_pct: 0,
    annual_revenue_fcfa: 0,
    annual_feed_cost_fcfa: 0,
    annual_fingerlings_cost_fcfa: 0,
    annual_other_costs_fcfa: 0,
    annual_total_cost_fcfa: 0,
    aquacare_fee_fcfa: 0,
    annual_net_profit_fcfa: 0,
    annual_roi_pct: 0,
    cycle_production_kg: 0,
    cycle_revenue_fcfa: 0,
    cycle_feed_cost_fcfa: 0,
    cycle_fingerlings_cost_fcfa: 0,
    cycle_other_costs_fcfa: 0,
    cycle_aquacare_fee_fcfa: 0,
    cycle_total_cost_fcfa: 0,
    cycle_net_profit_fcfa: 0,
    cycle_roi_pct: 0,
    annual_projection_production_kg: 0,
    annual_projection_revenue_fcfa: 0,
    annual_projection_net_profit_fcfa: 0,
    annual_projection_aquacare_fee_fcfa: 0,
    production_per_cycle_kg: 0,
    cycle_duration_days: 90,
    feed_bags_per_cycle: 0,
    initial_fish_count_per_cycle: 1200,
    cycles_breakdown: [
      {
        cycle_num: 1,
        production_kg: 0,
        start_date_estimate: '2026-05-15',
        end_date_estimate: '2026-08-12',
        duration_days: 90,
        feed_bags_total: 0,
        feed_cost_fcfa: 0,
        fingerlings_cost_fcfa: 0,
        initial_fish_count: 1200,
      },
    ],
  };

  const buildRoute = (formDataOverrides: Record<string, unknown> = {}) =>
    ({
      params: {
        formData: {
          species: 'tilapia',
          infraType: '',
          unitCount: '',
          unitVolume: '',
          unitSurface: '',
          annualTarget: '',
          startDate: '2026-05-14',
          cycleDuration: '90',
          fingerlingsPrice: '50',
          sellingPrice: '2800',
          otherCosts: '0',
          fingerlingsCount: '1200',
          harvestWeight: '350',
          survivalRate: '95',
          productionUnits: [],
          productionUnitAllocations: [],
          ...formDataOverrides,
        },
      },
    } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    mockOffline.isOnline.mockResolvedValue(true);
    mockBuildRequest.mockReturnValue({
      launch_uuid: 'launch-1',
      launch_kind: 'initial_setup',
      cycle: { created_offline: false },
    });
    mockBuildRequestFromForm.mockReturnValue({
      launch_uuid: 'launch-ongoing-1',
      launch_kind: 'initial_setup',
      cycle: { onboarding_mode: 'ongoing', created_offline: false },
    });
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    (useSelector as unknown as jest.Mock).mockImplementation(
      (selector: (state: any) => unknown) =>
        selector({ farmSetup: { cycleSimulation: { result: null, loading: false } } })
    );
    let defaultFunctionCallCount = 0;
    mockDispatch.mockImplementation((action: unknown) => {
      if (typeof action === 'function') {
        defaultFunctionCallCount += 1;
        if (defaultFunctionCallCount === 1) {
          return {
            type: runCycleSimulation.fulfilled.type,
            payload: currentResult,
          };
        }

        return {
          unwrap: jest.fn().mockResolvedValue({
            active_cycles: [],
          }),
        };
      }

      return action;
    });
    mockLaunchFirstCycle.mockResolvedValue({
      farmProfile: { id: 'farm-profile-1' },
      productionCycle: createdProductionCycle,
      productionUnitIdByLocalId: {},
    });
    mockLaunchFirstCycleFromForm.mockResolvedValue({
      farmProfile: { id: 'farm-profile-1' },
      productionCycle: createdProductionCycle,
      productionUnitIdByLocalId: {},
    });
  });

  it('confirme et lance un ongoing sans appeler la simulation legacy', async () => {
    const route = buildRoute({
      onboardingMode: 'ongoing',
      startDate: '2026-06-01',
      historicalInitialCount: '2200',
      historicalInitialWeight: '',
      trackingStartDate: '2026-07-20',
      trackingStartAverageWeight: '75',
      fingerlingsCount: '2100',
    });
    const { getByText } = render(
      <CycleSimulationScreen navigation={navigation} route={route} />,
    );

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(getByText('historicalStartDate')).toBeTruthy();
    expect(getByText('trackingStartSituation')).toBeTruthy();
    expect(getByText('baselineBiomass')).toBeTruthy();
    fireEvent.press(getByText('simulationLaunchBtn'));

    await waitFor(() =>
      expect(mockLaunchFirstCycleFromForm).toHaveBeenCalledWith(
        expect.objectContaining({ formData: route.params.formData }),
      ),
    );
    expect(mockBuildRequest).not.toHaveBeenCalled();
    expect(mockLaunchFirstCycle).not.toHaveBeenCalled();
  });

  it('affiche le calendrier complet et la durée restante du setup ongoing', () => {
    const route = buildRoute({
      onboardingMode: 'ongoing',
      startDate: '2026-06-01',
      cycleDuration: '150',
      historicalInitialCount: '2200',
      trackingStartDate: '2026-10-27',
      trackingStartAverageWeight: '75',
      fingerlingsCount: '2100',
    });
    const { getByTestId } = render(
      <CycleSimulationScreen navigation={navigation} route={route} />,
    );

    expect(mockDispatch).not.toHaveBeenCalled();
    expect(getByTestId('simulationOngoingTotalDuration')).toBeTruthy();
    expect(getByTestId('simulationOngoingPlannedHarvestDate')).toBeTruthy();
    expect(getByTestId('simulationOngoingRemainingDuration')).toBeTruthy();
    expect(getByTestId('simulationOngoingTotalDuration').props.children).toBe(
      'total:150',
    );
    expect(getByTestId('simulationOngoingRemainingDuration').props.children).toBe(
      'remaining:2',
    );
  });

  it('désactive le lancement ongoing lorsque la récolte est déjà atteinte', () => {
    const route = buildRoute({
      onboardingMode: 'ongoing',
      startDate: '2026-06-01',
      cycleDuration: '150',
      historicalInitialCount: '2200',
      trackingStartDate: '2026-10-28',
      trackingStartAverageWeight: '75',
      fingerlingsCount: '2100',
    });
    const { getByText } = render(
      <CycleSimulationScreen navigation={navigation} route={route} />,
    );

    expect(getByText('ongoingCyclePlannedHarvestElapsed')).toBeTruthy();
    fireEvent.press(getByText('simulationLaunchBtn'));
    expect(mockBuildRequestFromForm).not.toHaveBeenCalled();
    expect(mockLaunchFirstCycleFromForm).not.toHaveBeenCalled();
    expect(mockOffline.saveCycleLaunchOffline).not.toHaveBeenCalled();
  });

  it('enregistre directement le lancement quand le téléphone est hors ligne', async () => {
    mockOffline.isOnline.mockResolvedValue(false);
    const { findByText } = render(
      <CycleSimulationScreen navigation={navigation} route={buildRoute()} />,
    );

    fireEvent.press(await findByText('simulationLaunchBtn'));

    await waitFor(() => {
      expect(mockOffline.saveCycleLaunchOffline).toHaveBeenCalledWith(
        expect.objectContaining({
          launch_uuid: 'launch-1',
          cycle: expect.objectContaining({ created_offline: true }),
        }),
      );
      expect(mockLaunchFirstCycle).not.toHaveBeenCalled();
    });
  });

  it('affiche la durée et la date de récolte fournies par le backend', async () => {
    const route = buildRoute({ cycleDuration: '150', startDate: '2026-04-01' });
    const result = {
      ...currentResult,
      cycle_duration_days: 150,
      cycles_breakdown: [{
        ...currentResult.cycles_breakdown[0],
        start_date_estimate: '2026-04-01',
        end_date_estimate: '2026-08-28',
        duration_days: 150,
      }],
    };
    mockDispatch.mockImplementation((action: unknown) =>
      typeof action === 'function'
        ? { type: runCycleSimulation.fulfilled.type, payload: result }
        : action
    );

    const { getByText } = render(<CycleSimulationScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('simulationPlannedDuration')).toBeTruthy();
      expect(getByText('150 days')).toBeTruthy();
      expect(getByText('simulationEstimatedHarvestDate')).toBeTruthy();
      expect(getByText('Aug 28, 2026')).toBeTruthy();
    });
  });

  it('redirige vers le dashboard du cycle nouvellement lancé', async () => {
    let functionCallCount = 0;
    mockDispatch.mockImplementation((action: unknown) => {
      if (typeof action === 'function') {
        functionCallCount += 1;
        if (functionCallCount === 1) {
          return {
            type: runCycleSimulation.fulfilled.type,
            payload: currentResult,
          };
        }

        if (functionCallCount === 2) {
          return {
            unwrap: jest.fn().mockResolvedValue({
              active_cycles: [],
            }),
          };
        }

        return {
          unwrap: jest.fn().mockResolvedValue({}),
        };
      }

      return action;
    });

    mockLaunchFirstCycle.mockResolvedValue({
      farmProfile: { id: 'farm-profile-1' },
      productionCycle: createdProductionCycle,
      productionUnitIdByLocalId: {
        'unit-pond': 'production-unit-1',
      },
      productionUnits: [
        {
          id: 'production-unit-1',
          farm_profile: 'farm-profile-1',
          name: 'Étang principal',
          unit_type: 'pond',
          surface_m2: 120,
          volume_m3: null,
          status: 'active',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    });

    const route = buildRoute({
      unitSurface: '120',
      fingerlingsCount: '1200',
      productionUnits: [
        {
          local_id: 'unit-pond',
          name: 'Étang principal',
          unit_type: 'pond',
          surface_m2: '120',
          volume_m3: '',
        },
      ],
    });

    const { getByText } = render(<CycleSimulationScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('simulationLaunchBtn')).toBeTruthy();
    });

    fireEvent.press(getByText('simulationLaunchBtn'));

    await waitFor(() => {
      expect(mockLaunchFirstCycle).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPondIdentifier: 'simulationDefaultPondIdentifier',
          formData: expect.objectContaining({
            productionUnits: [
              expect.objectContaining({
                unit_type: 'pond',
                surface_m2: '120',
              }),
            ],
          }),
        })
      );
      expect(mockDispatch).toHaveBeenCalledWith(
        addCreatedProductionCycle(createdProductionCycle)
      );
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: { id: 'farm-profile-1' },
        })
      );
      expect(mockDispatch).toHaveBeenCalledWith(setCurrentCycle(createdProductionCycle));
      expect(navigation.reset).toHaveBeenCalledWith({
        index: 0,
        routes: [
          {
            name: 'MainTabs',
            params: { screen: 'Dashboard' },
          },
        ],
      });
    });
  }, 10000);

  it('redirige aussi vers le dashboard sans unite de production persistee', async () => {
    let functionCallCount = 0;
    mockDispatch.mockImplementation((action: unknown) => {
      if (typeof action === 'function') {
        functionCallCount += 1;
        if (functionCallCount === 1) {
          return {
            type: runCycleSimulation.fulfilled.type,
            payload: currentResult,
          };
        }

        return {
          unwrap: jest.fn().mockResolvedValue({
            active_cycles: [],
          }),
        };
      }

      return action;
    });

    mockLaunchFirstCycle.mockResolvedValue({
      farmProfile: { id: 'farm-profile-1' },
      productionCycle: createdProductionCycle,
      productionUnitIdByLocalId: {},
      productionUnits: [],
      cycleUnitAllocations: [],
      idempotentReplay: false,
    });

    const route = buildRoute();
    const { getByText } = render(<CycleSimulationScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('simulationLaunchBtn')).toBeTruthy();
    });

    fireEvent.press(getByText('simulationLaunchBtn'));

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(setCurrentCycle(createdProductionCycle));
      expect(navigation.reset).toHaveBeenCalledWith({
        index: 0,
        routes: [
          { name: 'MainTabs', params: { screen: 'Dashboard' } },
        ],
      });
    });
  });

  it('lance le cycle additionnel directement quand un cycle existe deja', async () => {
    (useSelector as unknown as jest.Mock).mockImplementation((selector: (state: any) => unknown) =>
      selector({
        auth: { farmProfile: { farm_setup_completed: true } },
        aquaculture: {
          currentCycle: { id: 'cycle-existing' },
          dashboardData: { active_cycles: [{ id: 'cycle-existing' }] },
        },
        farmSetup: { cycleSimulation: { result: null, loading: false } },
      })
    );

    mockLaunchFirstCycle.mockResolvedValue({
      farmProfile: { id: 'farm-profile-1' },
      productionCycle: createdProductionCycle,
      productionUnitIdByLocalId: {},
      productionUnits: [],
      cycleUnitAllocations: [],
      idempotentReplay: false,
    });

    const route = buildRoute();
    const { getByText } = render(<CycleSimulationScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('simulationLaunchAdditionalBtn')).toBeTruthy();
    });

    fireEvent.press(getByText('simulationLaunchAdditionalBtn'));

    await waitFor(() => {
      expect(mockLaunchFirstCycle).toHaveBeenCalledWith(
        expect.objectContaining({
          launchKind: 'additional_cycle',
        })
      );
      expect(mockDispatch).toHaveBeenCalledWith(setCurrentCycle(createdProductionCycle));
      expect(navigation.reset).toHaveBeenCalledWith({
        index: 0,
        routes: [
          { name: 'MainTabs', params: { screen: 'Dashboard' } },
        ],
      });
    });
  });

  it('affiche un message lisible si la persistance du cycle echoue', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined as never);
    mockLaunchFirstCycle.mockRejectedValueOnce(
      new FirstCycleLaunchError('simulationUnableToSaveCycleProductionUnits')
    );

    mockDispatch.mockImplementation((action: unknown) => {
      if (typeof action === 'function') {
        return {
          type: runCycleSimulation.fulfilled.type,
          payload: currentResult,
        };
      }

      return action;
    });

    const route = buildRoute({
      unitSurface: '120',
      fingerlingsCount: '1200',
      productionUnits: [
        {
          local_id: 'unit-pond',
          name: 'Étang principal',
          unit_type: 'pond',
          surface_m2: '120',
          volume_m3: '',
        },
      ],
      productionUnitAllocations: [
        {
          production_unit_local_id: 'unit-pond',
          fish_count: '1200',
        },
      ],
    });

    const { getByText } = render(<CycleSimulationScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('simulationLaunchBtn')).toBeTruthy();
    });

    fireEvent.press(getByText('simulationLaunchBtn'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('error', 'simulationUnableToSaveCycleProductionUnits');
      expect(navigation.reset).not.toHaveBeenCalled();
    });

    alertSpy.mockRestore();
  });

  it('affiche une densite unique quand les bacs sont a capacite max', async () => {
    mockDispatch.mockImplementation((action: unknown) => {
      if (typeof action === 'function') {
        return {
          type: runCycleSimulation.fulfilled.type,
          payload: currentResult,
        };
      }

      return action;
    });

    const route = buildRoute({
      fingerlingsCount: '3600',
      productionUnits: [
        {
          local_id: 'unit-1',
          name: 'Bac 1',
          unit_type: 'tank',
          volume_m3: '3',
        },
        {
          local_id: 'unit-2',
          name: 'Bac 2',
          unit_type: 'tank',
          volume_m3: '3',
        },
        {
          local_id: 'unit-3',
          name: 'Bac 3',
          unit_type: 'tank',
          volume_m3: '3',
        },
        {
          local_id: 'unit-4',
          name: 'Bac 4',
          unit_type: 'tank',
          volume_m3: '3',
        },
      ],
    });

    const { getByText, queryByText } = render(
      <CycleSimulationScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(getByText('simulationDensity')).toBeTruthy();
      expect(getByText('300 productionUnitDensityFingerlingsPerCubicMeter')).toBeTruthy();
      expect(queryByText('simulationCurrentDensity')).toBeNull();
      expect(queryByText('simulationMaxDensity')).toBeNull();
    });
  });

  it('affiche une densite a repartitionner pour un setup mixte bac cage et etang', async () => {
    mockDispatch.mockImplementation((action: unknown) => {
      if (typeof action === 'function') {
        return {
          type: runCycleSimulation.fulfilled.type,
          payload: currentResult,
        };
      }

      return action;
    });

    const route = buildRoute({
      fingerlingsCount: '3600',
      productionUnits: [
        {
          local_id: 'unit-1',
          name: 'Bac 1',
          unit_type: 'tank',
          volume_m3: '3',
        },
        {
          local_id: 'unit-2',
          name: 'Cage 1',
          unit_type: 'cage',
          volume_m3: '5',
        },
        {
          local_id: 'unit-3',
          name: 'Étang principal',
          unit_type: 'pond',
          surface_m2: '120',
          volume_m3: '',
        },
      ],
    });

    const { getByText, queryByText } = render(
      <CycleSimulationScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(getByText('simulationDensity')).toBeTruthy();
      expect(getByText('simulationDensityToBeAllocated')).toBeTruthy();
      expect(getByText('simulationDensityByUnitNote')).toBeTruthy();
      expect(queryByText('simulationCurrentDensity')).toBeNull();
      expect(queryByText('simulationMaxDensity')).toBeNull();
      expect(queryByText('—')).toBeNull();
    });
  });

  it('n affiche pas la capacite de recolte estimee dans le detail technique', async () => {
    mockDispatch.mockImplementation((action: unknown) => {
      if (typeof action === 'function') {
        return {
          type: runCycleSimulation.fulfilled.type,
          payload: currentResult,
        };
      }

      return action;
    });

    const route = buildRoute();
    const { getByText, queryByText } = render(
      <CycleSimulationScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(getByText('simulationCycleTechnicalTitle')).toBeTruthy();
      expect(getByText('simulationSpecies')).toBeTruthy();
      expect(getByText('simulationFeedBags')).toBeTruthy();
      expect(queryByText('simulationHarvestCapacityHint')).toBeNull();
    });
  });

  it('affiche un resume de repartition par unite quand les allocations sont presentes', async () => {
    mockDispatch.mockImplementation((action: unknown) => {
      if (typeof action === 'function') {
        return {
          type: runCycleSimulation.fulfilled.type,
          payload: currentResult,
        };
      }

      return action;
    });

    const route = buildRoute({
      fingerlingsCount: '2100',
      productionUnits: [
        {
          local_id: 'unit-1',
          name: 'Bac 1',
          unit_type: 'tank',
          volume_m3: '3',
        },
        {
          local_id: 'unit-2',
          name: 'Étang principal',
          unit_type: 'pond',
          surface_m2: '120',
        },
      ],
      productionUnitAllocations: [
        { production_unit_local_id: 'unit-1', fish_count: '900' },
        { production_unit_local_id: 'unit-2', fish_count: '1200' },
      ],
    });

    const { getByText, getByText: getText, queryByText } = render(
      <CycleSimulationScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(getByText('simulationAllocationByUnitTitle')).toBeTruthy();
      expect(getByText('simulationDensitySeeUnitDetails')).toBeTruthy();
      expect(queryByText('simulationDensityByUnitNote')).toBeNull();
      expect(getText('Bac 1')).toBeTruthy();
      expect(getText('Étang principal')).toBeTruthy();
      expect(getText(/300 productionUnitDensityFingerlingsPerCubicMeter/)).toBeTruthy();
      expect(getText(/10 productionUnitDensityFingerlingsPerSquareMeter/)).toBeTruthy();
      expect(getText(/299,3 kg/)).toBeTruthy();
      expect(getText(/399 kg/)).toBeTruthy();
    });
  });

  it('regroupe les bacs identiques dans un seul resume lisible', async () => {
    mockDispatch.mockImplementation((action: unknown) => {
      if (typeof action === 'function') {
        return {
          type: runCycleSimulation.fulfilled.type,
          payload: {
            ...currentResult,
            initial_fish_count_per_cycle: 180_000,
            cycles_breakdown: [
              { ...currentResult.cycles_breakdown[0], initial_fish_count: 180_000 },
            ],
          },
        };
      }

      return action;
    });

    const route = buildRoute({
      fingerlingsCount: '180000',
      productionUnits: [1, 2, 3].map((index) => ({
        local_id: `unit-${index}`,
        name: `Bac ${index}`,
        unit_type: 'tank',
        volume_m3: '200',
      })),
      productionUnitAllocations: [1, 2, 3].map((index) => ({
        production_unit_local_id: `unit-${index}`,
        fish_count: '60000',
      })),
    });

    const { getAllByText, getByText, queryByText } = render(
      <CycleSimulationScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(getByText('Bac 1 → Bac 2 → Bac 3')).toBeTruthy();
      expect(getByText('60,000 productionUnitFingerlingsUnit')).toBeTruthy();
      expect(getAllByText('300 productionUnitDensityFingerlingsPerCubicMeter')).toHaveLength(2);
      expect(queryByText('simulationAllocationByUnitDescription')).toBeNull();
    });
  });
});
