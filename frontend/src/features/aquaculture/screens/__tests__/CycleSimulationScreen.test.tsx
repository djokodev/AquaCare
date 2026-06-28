import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useDispatch, useSelector } from 'react-redux';

import CycleSimulationScreen from '../CycleSimulationScreen';
import { FirstCycleLaunchError, launchFirstCycle } from '@/features/aquaculture/services/firstCycleLaunchService';
import { addCreatedProductionCycle } from '@/features/aquaculture/store/aquacultureSlice';
import { runCycleSimulation } from '@/features/aquaculture/store/farmSetupSlice';
import type { ProductionCycle } from '@/types/aquaculture';

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock('@/features/aquaculture/services/firstCycleLaunchService', () => ({
  launchFirstCycle: jest.fn(),
  FirstCycleLaunchError: class FirstCycleLaunchError extends Error {
    translationKey: string;

    constructor(translationKey: string) {
      super(translationKey);
      this.translationKey = translationKey;
    }
  },
}));

describe('features/aquaculture/screens/CycleSimulationScreen', () => {
  const mockDispatch = jest.fn();
  const mockLaunchFirstCycle = launchFirstCycle as unknown as jest.Mock;
  const createdProductionCycle = { id: 'cycle-1' } as unknown as ProductionCycle;
  const navigation = {
    goBack: jest.fn(),
    reset: jest.fn(),
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
        end_date_estimate: '2026-08-13',
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
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    (useSelector as unknown as jest.Mock).mockImplementation(
      (selector: (state: any) => unknown) =>
        selector({ farmSetup: { cycleSimulation: { result: null, loading: false } } })
    );
    mockLaunchFirstCycle.mockResolvedValue({
      farmProfile: { id: 'farm-profile-1' },
      productionCycle: createdProductionCycle,
      productionUnitIdByLocalId: {},
    });
  });

  it('redirige vers le hub des unites en production quand le cycle cree contient des unites', async () => {
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
            id: 'farm-profile-1',
          }),
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
      expect(navigation.reset).toHaveBeenCalledWith({
        index: 1,
        routes: [
          { name: 'MainTabs' },
          {
            name: 'ProductionUnitsHub',
            params: { cycleId: createdProductionCycle.id },
          },
        ],
      });
    });
  }, 10000);

  it('conserve la navigation legacy quand aucune unite de production n est persistee', async () => {
    mockDispatch.mockImplementation((action: unknown) => {
      if (typeof action === 'function') {
        return {
          type: runCycleSimulation.fulfilled.type,
          payload: currentResult,
        };
      }

      return action;
    });

    mockLaunchFirstCycle.mockResolvedValue({
      farmProfile: { id: 'farm-profile-1' },
      productionCycle: createdProductionCycle,
      productionUnitIdByLocalId: {},
      productionUnits: [],
    });

    const route = buildRoute();
    const { getByText } = render(<CycleSimulationScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('simulationLaunchBtn')).toBeTruthy();
    });

    fireEvent.press(getByText('simulationLaunchBtn'));

    await waitFor(() => {
      expect(navigation.reset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'MainTabs' }],
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
});
