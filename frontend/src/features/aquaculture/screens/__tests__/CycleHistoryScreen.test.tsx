import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import CycleHistoryScreen from '../CycleHistoryScreen';
import { useDispatch, useSelector } from 'react-redux';
import { ProductionCycle } from '@/types/aquaculture';

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

describe('features/aquaculture/screens/CycleHistoryScreen', () => {
  const mockDispatch = jest.fn();
  const mockUseSelector = useSelector as unknown as jest.Mock;
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
  } as any;

  const harvestedTilapia: ProductionCycle = {
    id: 'cycle-t',
    farm_profile: 'farm-1',
    cycle_name: 'Cycle Tilapia',
    species: 'tilapia',
    pond_identifier: 'P1',
    pond_surface_m2: 100,
    start_date: '2026-01-01',
    initial_count: 1000,
    initial_average_weight: 10,
    initial_biomass: 10,
    end_date: '2026-05-01',
    final_biomass: 240,
    final_average_weight: 280,
    current_count: 900,
    current_average_weight: 280,
    current_biomass: 252,
    total_feed_consumed: 300,
    survival_rate: 88,
    fcr: 1.7,
    status: 'harvested',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  };

  const harvestedClarias: ProductionCycle = {
    ...harvestedTilapia,
    id: 'cycle-c',
    cycle_name: 'Cycle Clarias',
    species: 'clarias',
    end_date: '2026-06-01',
    survival_rate: 76,
    fcr: 2.1,
  };

  const setSelectorState = (cycles: ProductionCycle[], loadingCycles = false) => {
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          cycles,
          loading: { cycles: loadingCycles, dashboard: false, logs: false, sync: false },
        },
      })
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
  });

  it('affiche le loader pendant le chargement', () => {
    setSelectorState([], true);

    const { getByText } = render(<CycleHistoryScreen navigation={navigation} />);

    expect(getByText('loading')).toBeTruthy();
  });

  it('affiche un message vide sans cycles recoltes', () => {
    setSelectorState([{ ...harvestedTilapia, status: 'active', id: 'active-1' }]);

    const { getByText } = render(<CycleHistoryScreen navigation={navigation} />);

    expect(getByText('noHarvestedCycles')).toBeTruthy();
  });

  it('affiche les cycles recoltes et filtre par espece', () => {
    setSelectorState([harvestedTilapia, harvestedClarias]);

    const { getByText, queryByText } = render(<CycleHistoryScreen navigation={navigation} />);

    expect(getByText('Cycle Tilapia')).toBeTruthy();
    expect(getByText('Cycle Clarias')).toBeTruthy();
    expect(getByText('harvestedCycles (2)')).toBeTruthy();

    fireEvent.press(getByText('clarias'));
    expect(getByText('Cycle Clarias')).toBeTruthy();
    expect(queryByText('Cycle Tilapia')).toBeNull();
  });
});
