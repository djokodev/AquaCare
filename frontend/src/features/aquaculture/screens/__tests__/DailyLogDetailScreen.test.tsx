import React from 'react';
import { render } from '@testing-library/react-native';
import { useSelector } from 'react-redux';

import DailyLogDetailScreen from '../DailyLogDetailScreen';
import { CycleLog, ProductionCycle } from '@/types/aquaculture';
import { formatDate, formatDateTime } from '@/utils';

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

describe('features/aquaculture/screens/DailyLogDetailScreen', () => {
  const mockUseSelector = useSelector as unknown as jest.Mock;
  const navigation = {
    goBack: jest.fn(),
  } as any;

  const cycle: ProductionCycle = {
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

  const log: CycleLog = {
    id: 'log-1',
    cycle: 'cycle-1',
    cycle_unit_allocation: 'allocation-1',
    production_unit: 'unit-1',
    production_unit_name: 'Bac 1',
    production_unit_type: 'tank',
    production_unit_display_dimension: '3 m³',
    log_date: '2026-02-19',
    log_time: '08:15',
    mortality_count: 2,
    mortality_reason: 'Stress',
    sample_count: 10,
    sample_total_weight: 1100,
    average_weight: 110,
    feed_quantity: 4.5,
    feed_type: 'Feed A',
    feed_size_mm: 2,
    feeding_times: ['08:00', '12:00'],
    water_temperature: 28.5,
    dissolved_oxygen: 6.8,
    ph_level: 7.2,
    ammonia_level: 0.2,
    observations: 'RAS',
    created_offline: false,
    synced_at: '2026-02-19T09:00:00Z',
    created_at: '2026-02-19T08:20:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          currentCycle: cycle,
          dashboardData: {
            active_cycles: [cycle],
          },
        },
      })
    );
  });

  it('affiche le detail complet d une saisie', () => {
    const { getByText, getAllByText } = render(
      <DailyLogDetailScreen
        navigation={navigation}
        route={{
          params: {
            log,
            cycleId: 'cycle-1',
            cycleUnitAllocationId: 'allocation-1',
            productionUnitName: 'Bac 1',
          },
        } as any}
      />
    );

    expect(getByText('dailyLogDetailTitle')).toBeTruthy();
    expect(getAllByText('Bac 1').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Cycle 1').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText(formatDate(log.log_date)).length).toBeGreaterThanOrEqual(1);
    expect(getByText('08:15')).toBeTruthy();
    expect(getByText(formatDateTime(log.created_at))).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
    expect(getByText('Stress')).toBeTruthy();
    expect(getByText('10')).toBeTruthy();
    expect(getByText('1100 g')).toBeTruthy();
    expect(getByText('4.5 kg')).toBeTruthy();
    expect(getByText('Feed A')).toBeTruthy();
    expect(getByText('2 mm')).toBeTruthy();
    expect(getByText('08:00, 12:00')).toBeTruthy();
    expect(getByText('28.5°C')).toBeTruthy();
    expect(getByText('6.8 mg/L')).toBeTruthy();
    expect(getByText('0.2 ppm')).toBeTruthy();
    expect(getByText('RAS')).toBeTruthy();
  });
});
