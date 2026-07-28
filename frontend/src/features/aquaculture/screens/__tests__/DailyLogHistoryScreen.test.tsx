import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import DailyLogHistoryScreen from '../DailyLogHistoryScreen';
import { useSelector } from 'react-redux';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { CycleLog, ProductionCycle } from '@/types/aquaculture';

jest.mock('react-redux', () => ({
  useSelector: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getCycleLogs: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
}));

describe('features/aquaculture/screens/DailyLogHistoryScreen', () => {
  const mockUseSelector = useSelector as unknown as jest.Mock;
  const mockService = aquacultureService as jest.Mocked<typeof aquacultureService>;
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
  } as any;
  const route = {
    params: {
      cycleId: 'cycle-1',
      cycleUnitAllocationId: 'allocation-1',
      productionUnitName: 'Bac 1',
    },
  } as any;

  const activeCycle: ProductionCycle = {
    id: 'cycle-1',
    farm_profile: 'farm-1',
    cycle_name: 'Cycle 1',
    species: 'tilapia',
    pond_identifier: 'P1',
    pond_surface_m2: 100,
    start_date: '2026-01-01',
    initial_count: 1000,
    initial_average_weight: 10,
    initial_biomass: 10,
    current_count: 900,
    current_average_weight: 110,
    current_biomass: 99,
    total_feed_consumed: 150,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };

  const setSelectorCycles = (cycles: ProductionCycle[], currentCycle?: ProductionCycle) => {
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          currentCycle,
          dashboardData: {
            active_cycles: cycles,
          },
        },
      })
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockService.getCycleLogs.mockReset();
  });

  it('charge les logs au demarrage et affiche une carte', async () => {
    const logs: CycleLog[] = [
      {
        id: 'log-1',
        cycle: 'cycle-1',
        log_date: '2026-02-19',
        sample_count: 10,
        sample_total_weight: 1100,
        mortality_count: 2,
        water_temperature: 28.5,
        ph_level: 7.2,
        observations: 'RAS',
        created_offline: false,
        created_at: '2026-02-19T10:00:00Z',
      },
    ];

    setSelectorCycles([activeCycle], activeCycle);
    mockService.getCycleLogs.mockResolvedValueOnce(logs);

    const { getByText } = render(<DailyLogHistoryScreen navigation={navigation} />);

    await waitFor(() => {
      expect(mockService.getCycleLogs).toHaveBeenCalledWith('cycle-1');
      expect(getByText(/observations/i)).toBeTruthy();
      expect(getByText('RAS')).toBeTruthy();
    });
  });

  it('filtre les logs par allocation quand le contexte unité est fourni', async () => {
    setSelectorCycles([activeCycle], activeCycle);
    mockService.getCycleLogs.mockResolvedValueOnce([]);

    const { getByText, queryByText } = render(
      <DailyLogHistoryScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(mockService.getCycleLogs).toHaveBeenCalledWith('cycle-1', {
        cycleUnitAllocationId: 'allocation-1',
      });
      expect(getByText('Cycle 1')).toBeTruthy();
      expect(queryByText('productionUnitLogHistoryContextTitle')).toBeNull();
      expect(queryByText('sessionActiveCycleLabel')).toBeNull();
    });
  });

  it('n appelle pas l API des logs si aucun cycle de session n est selectionne', async () => {
    setSelectorCycles([activeCycle], undefined);
    mockService.getCycleLogs.mockResolvedValueOnce([]);

    const { getAllByText } = render(<DailyLogHistoryScreen navigation={navigation} />);

    await waitFor(() => {
      expect(mockService.getCycleLogs).not.toHaveBeenCalled();
      expect(getAllByText('sessionCycleNotSelected').length).toBeGreaterThan(0);
    });
  });

  it('affiche un etat vide si aucun log', async () => {
    setSelectorCycles([activeCycle], activeCycle);
    mockService.getCycleLogs.mockResolvedValueOnce([]);

    const { getByText } = render(<DailyLogHistoryScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText('noLogsYet')).toBeTruthy();
      expect(getByText('startLoggingData')).toBeTruthy();
    });
  });

  it('navigue vers le detail de la saisie au clic sur une carte', async () => {
    const logs: CycleLog[] = [
      {
        id: 'log-1',
        cycle: 'cycle-1',
        log_date: '2026-02-19',
        sample_count: 10,
        sample_total_weight: 1100,
        mortality_count: 2,
        water_temperature: 28.5,
        ph_level: 7.2,
        observations: 'RAS',
        created_offline: false,
        created_at: '2026-02-19T10:00:00Z',
      },
    ];

    setSelectorCycles([activeCycle], activeCycle);
    mockService.getCycleLogs.mockResolvedValueOnce(logs);

    const { getByTestId } = render(<DailyLogHistoryScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByTestId('daily-log-card-log-1')).toBeTruthy();
    });

    fireEvent.press(getByTestId('daily-log-card-log-1'));

    expect(navigation.navigate).toHaveBeenCalledWith(
      'DailyLogDetail',
      expect.objectContaining({
        cycleId: 'cycle-1',
        cycleUnitAllocationId: 'allocation-1',
        productionUnitName: 'Bac 1',
        log: expect.objectContaining({
          id: 'log-1',
        }),
      })
    );
  });
});
