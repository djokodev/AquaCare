import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useDispatch, useSelector } from 'react-redux';

import CycleSimulationScreen from '../CycleSimulationScreen';
import { createProductionCycle } from '@/features/aquaculture/store/aquacultureSlice';
import { runCycleSimulation } from '@/features/aquaculture/store/farmSetupSlice';

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock('@/features/aquaculture/store/aquacultureSlice', () => ({
  createProductionCycle: jest.fn(),
}));

describe('features/aquaculture/screens/CycleSimulationScreen', () => {
  const mockDispatch = jest.fn();
  const mockCreateProductionCycle = createProductionCycle as unknown as jest.Mock;
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

  const buildRoute = (formDataOverrides: Record<string, unknown>) =>
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
    mockCreateProductionCycle.mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({ id: 'cycle-1' }),
    });
  });

  it('n envoie jamais de volume pour un etang pilote par surface', async () => {
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
      expect(mockCreateProductionCycle).toHaveBeenCalledWith(
        expect.objectContaining({
          pond_surface_m2: 120,
          pond_volume_m3: undefined,
        })
      );
      expect(navigation.reset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      });
    });
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
});
