import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import StatisticsScreen from '../StatisticsScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { ProductionCycle } from '@/types/aquaculture';

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getHarvestedCycles: jest.fn(),
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

describe('features/aquaculture/screens/StatisticsScreen', () => {
  const mockService = aquacultureService as jest.Mocked<typeof aquacultureService>;
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
  } as any;

  const harvestedCycle: ProductionCycle = {
    id: 'cycle-h1',
    farm_profile: 'farm-1',
    cycle_name: 'Cycle Recolte 1',
    species: 'tilapia',
    pond_identifier: 'P1',
    pond_surface_m2: 100,
    start_date: '2026-01-01',
    initial_count: 1000,
    initial_average_weight: 10,
    initial_biomass: 10,
    end_date: '2026-05-01',
    final_count: 860,
    final_average_weight: 290,
    final_biomass: 249.4,
    current_count: 860,
    current_average_weight: 290,
    current_biomass: 249.4,
    total_feed_consumed: 300,
    survival_rate: 86,
    fcr: 1.8,
    days_active: 120,
    daily_growth_rate: 2.3,
    average_daily_feed: 2.5,
    total_feed_cost: 145000,
    status: 'harvested',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('affiche un etat vide sans cycles recoltes', async () => {
    mockService.getHarvestedCycles.mockResolvedValueOnce([]);

    const { getByText } = render(<StatisticsScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText('noStatistics')).toBeTruthy();
      expect(getByText('harvestCycleToSeeStats')).toBeTruthy();
    });
  });

  it('affiche une erreur de chargement et relance via retry', async () => {
    mockService.getHarvestedCycles
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([]);

    const { getByText } = render(<StatisticsScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText('statisticsLoadError')).toBeTruthy();
      expect(getByText('retry')).toBeTruthy();
    });

    fireEvent.press(getByText('retry'));
    await waitFor(() => {
      expect(mockService.getHarvestedCycles).toHaveBeenCalledTimes(2);
    });
  });

  it('charge et affiche les statistiques d un cycle selectionne', async () => {
    mockService.getHarvestedCycles.mockResolvedValueOnce([harvestedCycle]);

    const { getByText } = render(<StatisticsScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText('Cycle Recolte 1')).toBeTruthy();
      expect(getByText('selectCycleToAnalyze')).toBeTruthy();
    });

    fireEvent.press(getByText('Cycle Recolte 1'));

    await waitFor(() => {
      expect(getByText('details')).toBeTruthy();
      expect(getByText('feedCost')).toBeTruthy();
      expect(getByText('duration')).toBeTruthy();
    });
  });
});
