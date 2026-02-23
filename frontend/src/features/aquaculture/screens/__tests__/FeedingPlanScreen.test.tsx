import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import FeedingPlanScreen from '../FeedingPlanScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { FeedingPlan, ProductionCycle } from '@/types/aquaculture';

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getActiveCycles: jest.fn(),
    getFeedingPlans: jest.fn(),
    generateFeedingPlan: jest.fn(),
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

describe('features/aquaculture/screens/FeedingPlanScreen', () => {
  const mockService = aquacultureService as jest.Mocked<typeof aquacultureService>;
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
  } as any;

  const cycleA: ProductionCycle = {
    id: 'cycle-a',
    farm_profile: 'farm-1',
    cycle_name: 'Cycle A',
    species: 'tilapia',
    pond_identifier: 'Pond-A',
    pond_surface_m2: 100,
    start_date: '2026-01-01',
    initial_count: 1000,
    initial_average_weight: 10,
    initial_biomass: 10,
    current_count: 900,
    current_average_weight: 120,
    current_biomass: 108,
    total_feed_consumed: 130,
    survival_rate: 90,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };

  const cycleB: ProductionCycle = {
    ...cycleA,
    id: 'cycle-b',
    cycle_name: 'Cycle B',
    species: 'clarias',
    pond_identifier: 'Pond-B',
  };

  const feedingPlanA: FeedingPlan = {
    id: 'plan-a-1',
    cycle: cycleA.id,
    week_number: 1,
    estimated_fish_count: 900,
    average_weight: 120,
    biomass: 108,
    daily_feed_amount: 2.2,
    feeding_rate: 2.5,
    meals_per_day: 3,
    feed_per_meal: 0.73,
    recommended_feed: 'Feed Pro',
    protein_percentage: 32,
    start_date: '2026-02-01',
    end_date: '2026-02-07',
    is_active: true,
    created_at: '2026-02-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('affiche l etat sans cycle actif et navigue vers NewCycle', async () => {
    mockService.getActiveCycles.mockResolvedValueOnce([]);

    const { getByText } = render(<FeedingPlanScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText('noActiveCycles')).toBeTruthy();
      expect(getByText('newCycle')).toBeTruthy();
    });

    fireEvent.press(getByText('newCycle'));
    expect(navigation.navigate).toHaveBeenCalledWith('NewCycle');
  });

  it('charge le premier cycle actif et ses plans', async () => {
    mockService.getActiveCycles.mockResolvedValueOnce([cycleA, cycleB]);
    mockService.getFeedingPlans.mockResolvedValueOnce([feedingPlanA]);

    const { getByText } = render(<FeedingPlanScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText('Cycle A')).toBeTruthy();
      expect(getByText(/week 1/)).toBeTruthy();
    });

    expect(mockService.getActiveCycles).toHaveBeenCalledTimes(1);
    expect(mockService.getFeedingPlans).toHaveBeenCalledWith(cycleA.id);
  });

  it('genere un plan apres confirmation et recharge la liste', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockService.getActiveCycles.mockResolvedValueOnce([cycleA]);
    mockService.getFeedingPlans
      .mockResolvedValueOnce([feedingPlanA])
      .mockResolvedValueOnce([feedingPlanA]);
    mockService.generateFeedingPlan.mockResolvedValueOnce([feedingPlanA]);

    const { getByText } = render(<FeedingPlanScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText('generatePlan')).toBeTruthy();
    });

    fireEvent.press(getByText('generatePlan'));

    const firstCall = alertSpy.mock.calls[0];
    const buttons = firstCall[2] as Array<{ text?: string; onPress?: () => void }> | undefined;
    const confirmButton = buttons?.find((button) => button.text === 'confirm');
    expect(confirmButton).toBeTruthy();
    confirmButton?.onPress?.();

    await waitFor(() => {
      expect(mockService.generateFeedingPlan).toHaveBeenCalledWith(cycleA.id);
      expect(mockService.getFeedingPlans).toHaveBeenCalledTimes(2);
    });

    alertSpy.mockRestore();
  });

  it('affiche une erreur si le chargement des plans du cycle echoue', async () => {
    mockService.getActiveCycles.mockResolvedValueOnce([cycleA, cycleB]);
    mockService.getFeedingPlans
      .mockResolvedValueOnce([feedingPlanA])
      .mockRejectedValueOnce(new Error('boom'));

    const { getByText } = render(<FeedingPlanScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText('Cycle B')).toBeTruthy();
    });

    fireEvent.press(getByText('Cycle B'));

    await waitFor(() => {
      expect(getByText('feedingPlansLoadByCycleError')).toBeTruthy();
    });
  });
});
