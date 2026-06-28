import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ProductionUnitsHubScreen from '../ProductionUnitsHubScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getCycleUnitAllocations: jest.fn(),
  },
}));

describe('features/aquaculture/screens/ProductionUnitsHubScreen', () => {
  const mockGetCycleUnitAllocations = aquacultureService.getCycleUnitAllocations as jest.Mock;
  const navigation = {
    navigate: jest.fn(),
  } as any;

  const route = {
    params: {
      cycleId: 'cycle-1',
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('affiche les allocations du cycle et les actions d ouverture', async () => {
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
        current_fish_count: 900,
        expected_survival_rate_pct: 95,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'allocation-2',
        cycle: 'cycle-1',
        cycle_name: 'Cycle actif',
        production_unit: 'unit-2',
        production_unit_name: 'Étang principal',
        production_unit_type: 'pond',
        production_unit_display_dimension: '120 m²',
        production_unit_recommended_capacity: 1200,
        initial_fish_count: 1200,
        current_fish_count: 1180,
        current_biomass_kg: 412.5,
        survival_rate_pct: 98,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const { getByText, getAllByText } = render(
      <ProductionUnitsHubScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(getByText('productionUnitsHubTitle')).toBeTruthy();
      expect(getByText('Bac 1')).toBeTruthy();
      expect(getByText('Étang principal')).toBeTruthy();
      expect(getAllByText('productionUnitsInitialFishCount').length).toBeGreaterThan(0);
      expect(getAllByText(/900/).length).toBeGreaterThan(0);
      expect(getAllByText(/1[\s\u202f]?200/).length).toBeGreaterThan(0);
      expect(getAllByText('productionUnitsRecommendedCapacity').length).toBeGreaterThan(0);
      expect(getAllByText('productionUnitsExpectedSurvivalRate').length).toBeGreaterThan(0);
      expect(getAllByText('productionUnitsOpenUnit').length).toBe(2);
    });

    fireEvent.press(getAllByText('productionUnitsOpenUnit')[0]);

    expect(navigation.navigate).toHaveBeenCalledWith('ProductionUnitOverview', {
      cycleId: 'cycle-1',
      allocationId: 'allocation-1',
      productionUnitId: 'unit-1',
    });
  });

  it('affiche un empty state quand aucune unite ne correspond', async () => {
    mockGetCycleUnitAllocations.mockResolvedValue([]);

    const { getByText } = render(<ProductionUnitsHubScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('productionUnitsEmptyTitle')).toBeTruthy();
      expect(getByText('productionUnitsEmptyDescription')).toBeTruthy();
    });
  });

  it('affiche un message lisible en cas d erreur de chargement', async () => {
    mockGetCycleUnitAllocations.mockRejectedValue(new Error('network error'));

    const { getByText } = render(<ProductionUnitsHubScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('productionUnitsLoadError')).toBeTruthy();
    }, { timeout: 3000 });
  });
});
