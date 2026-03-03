import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useDispatch } from 'react-redux';

import CycleSessionEntryScreen from '../CycleSessionEntryScreen';
import {
  clearCurrentCycle,
  fetchDashboardData,
  setCurrentCycle,
} from '@/features/aquaculture/store/aquacultureSlice';
import { ProductionCycle } from '@/types/aquaculture';

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
}));

describe('features/aquaculture/screens/CycleSessionEntryScreen', () => {
  const mockDispatch = jest.fn();
  const navigation = {
    replace: jest.fn(),
  } as any;

  const cycleA: ProductionCycle = {
    id: 'cycle-a',
    farm_profile: 'farm-1',
    cycle_name: 'Cycle A',
    species: 'tilapia',
    pond_identifier: 'P1',
    pond_surface_m2: 100,
    start_date: '2026-01-01',
    initial_count: 1000,
    initial_average_weight: 10,
    initial_biomass: 10,
    current_count: 900,
    current_average_weight: 120,
    current_biomass: 108,
    total_feed_consumed: 120,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };

  const cycleB: ProductionCycle = {
    ...cycleA,
    id: 'cycle-b',
    cycle_name: 'Cycle B',
    pond_identifier: 'P2',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
  });

  const mockDashboardDispatchResult = (dashboardAction: ReturnType<typeof fetchDashboardData.fulfilled>) => {
    mockDispatch.mockImplementation((action: unknown) => {
      if (typeof action === 'function') {
        return Promise.resolve(dashboardAction);
      }
      return action;
    });
  };

  it('affiche le CTA "Créer mon premier cycle" si 0 cycles actifs', async () => {
    mockDashboardDispatchResult(
      fetchDashboardData.fulfilled(
        {
          active_cycles_count: 0,
          total_biomass: 0,
          total_fish_count: 0,
          average_fcr: 0,
          average_survival_rate: 0,
          active_cycles: [],
          recent_logs: [],
          current_feeding_plans: [],
          pending_notifications: [],
        },
        'req-id',
        undefined
      )
    );

    const { getByText } = render(<CycleSessionEntryScreen navigation={navigation} />);

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(clearCurrentCycle());
      expect(getByText('sessionCreateFirstCycle')).toBeTruthy();
    });
  });

  it('auto-selectionne le cycle unique et redirige', async () => {
    mockDashboardDispatchResult(
      fetchDashboardData.fulfilled(
        {
          active_cycles_count: 1,
          total_biomass: 108,
          total_fish_count: 900,
          average_fcr: 1.8,
          average_survival_rate: 90,
          active_cycles: [cycleA],
          recent_logs: [],
          current_feeding_plans: [],
          pending_notifications: [],
        },
        'req-id',
        undefined
      )
    );

    render(<CycleSessionEntryScreen navigation={navigation} />);

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(setCurrentCycle(cycleA));
      expect(navigation.replace).toHaveBeenCalledWith('MainTabs');
    });
  });

  it('affiche la selection si plusieurs cycles et confirme le choix utilisateur', async () => {
    mockDashboardDispatchResult(
      fetchDashboardData.fulfilled(
        {
          active_cycles_count: 2,
          total_biomass: 216,
          total_fish_count: 1800,
          average_fcr: 1.8,
          average_survival_rate: 90,
          active_cycles: [cycleA, cycleB],
          recent_logs: [],
          current_feeding_plans: [],
          pending_notifications: [],
        },
        'req-id',
        undefined
      )
    );

    const { getByText } = render(<CycleSessionEntryScreen navigation={navigation} />);

    // Capture references inside waitFor to avoid race condition on state flush
    let cycleBEl: ReturnType<typeof getByText>;
    let confirmEl: ReturnType<typeof getByText>;
    await waitFor(() => {
      expect(getByText('Cycle A')).toBeTruthy();
      cycleBEl = getByText('Cycle B');
      confirmEl = getByText('sessionCycleConfirm');
    });

    fireEvent.press(cycleBEl!);
    fireEvent.press(confirmEl!);

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(setCurrentCycle(cycleB));
      expect(navigation.replace).toHaveBeenCalledWith('MainTabs');
    });
  });
});
