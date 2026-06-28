import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ProductionUnitOverviewScreen from '../ProductionUnitOverviewScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getCycleUnitAllocations: jest.fn(),
  },
}));

describe('features/aquaculture/screens/ProductionUnitOverviewScreen', () => {
  const mockGetCycleUnitAllocations = aquacultureService.getCycleUnitAllocations as jest.Mock;
  const navigation = {
    navigate: jest.fn(),
  } as any;

  const route = {
    params: {
      cycleId: 'cycle-1',
      allocationId: 'allocation-1',
      productionUnitId: 'unit-1',
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('affiche les actions de suivi et navigue avec le contexte d unitaire', async () => {
    mockGetCycleUnitAllocations.mockResolvedValue([
      {
        id: 'allocation-1',
        cycle: 'cycle-1',
        cycle_name: 'Cycle actif',
        production_unit: 'unit-1',
        production_unit_name: 'Bac 1',
        production_unit_type: 'tank',
        production_unit_display_dimension: '3 m³',
        production_unit_recommended_capacity: 900,
        initial_fish_count: 900,
        current_fish_count: 880,
        current_biomass_kg: 330,
        survival_rate_pct: 97.5,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const { getByText } = render(
      <ProductionUnitOverviewScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(getByText('productionUnitTrackingSectionTitle')).toBeTruthy();
      expect(getByText('productionUnitDailyLogAction')).toBeTruthy();
      expect(getByText('productionUnitSanitaryLogAction')).toBeTruthy();
      expect(getByText('productionUnitLogHistoryAction')).toBeTruthy();
      expect(getByText('Bac 1')).toBeTruthy();
    });

    fireEvent.press(getByText('productionUnitDailyLogAction'));
    expect(navigation.navigate).toHaveBeenCalledWith('DailyLog', {
      cycleId: 'cycle-1',
      cycleUnitAllocationId: 'allocation-1',
      productionUnitId: 'unit-1',
      productionUnitName: 'Bac 1',
    });

    fireEvent.press(getByText('productionUnitSanitaryLogAction'));
    expect(navigation.navigate).toHaveBeenCalledWith('SanitaryLog', {
      cycleId: 'cycle-1',
      cycleUnitAllocationId: 'allocation-1',
      productionUnitId: 'unit-1',
      productionUnitName: 'Bac 1',
    });

    fireEvent.press(getByText('productionUnitLogHistoryAction'));
    expect(navigation.navigate).toHaveBeenCalledWith('DailyLogHistory', {
      cycleId: 'cycle-1',
      cycleUnitAllocationId: 'allocation-1',
      productionUnitName: 'Bac 1',
    });
  });
});
