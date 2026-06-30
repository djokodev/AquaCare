import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useDispatch, useSelector } from 'react-redux';
import FeedingPlanScreen from '../FeedingPlanScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { FeedingPlan, ProductionCycle } from '@/types/aquaculture';
import { useLocalFeedingAlarms } from '@/features/notifications/hooks/useLocalFeedingAlarms';

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getActiveCycles: jest.fn(),
    getFeedingPlans: jest.fn(),
    generateFeedingPlan: jest.fn(),
  },
}));

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
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

jest.mock('@/features/notifications/hooks/useLocalFeedingAlarms', () => ({
  useLocalFeedingAlarms: jest.fn(),
}));

describe('features/aquaculture/screens/FeedingPlanScreen', () => {
  const mockDispatch = jest.fn();
  const mockUseSelector = useSelector as unknown as jest.Mock;
  const mockService = aquacultureService as jest.Mocked<typeof aquacultureService>;
  const mockUseLocalFeedingAlarms = useLocalFeedingAlarms as jest.MockedFunction<typeof useLocalFeedingAlarms>;
  const mockReconcileCycleAlarms = jest.fn();
  const mockGetFormattedMealTimes = jest.fn(() => ['08h00', '13h00', '18h00']);
  const mockSetAlarmsEnabled = jest.fn(() => Promise.resolve());
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
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    mockUseLocalFeedingAlarms.mockReturnValue({
      scheduleAlarms: jest.fn(),
      cancelAlarms: jest.fn(),
      hasActiveAlarms: jest.fn(() => Promise.resolve(false)),
      reconcileCycleAlarms: mockReconcileCycleAlarms.mockResolvedValue({
        status: 'scheduled',
        scheduledCount: 3,
      }),
      getFormattedMealTimes: mockGetFormattedMealTimes,
      setAlarmsEnabled: mockSetAlarmsEnabled,
    } as any);
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          currentCycle: undefined,
        },
      })
    );
  });

  it('affiche l etat sans cycle actif et navigue vers CreateFarm', async () => {
    mockService.getActiveCycles.mockResolvedValueOnce([]);

    const { getByText } = render(<FeedingPlanScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText('noActiveCycles')).toBeTruthy();
      expect(getByText('startNewCycle')).toBeTruthy();
    });

    fireEvent.press(getByText('startNewCycle'));
    expect(navigation.navigate).toHaveBeenCalledWith('CreateFarm');
  });

  it('charge le premier cycle actif et ses plans', async () => {
    mockService.getActiveCycles.mockResolvedValueOnce([cycleA, cycleB]);
    mockService.getFeedingPlans.mockResolvedValueOnce([feedingPlanA]);

    const { getByText } = render(<FeedingPlanScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText(/week.*1/i)).toBeTruthy();
    });

    expect(mockService.getActiveCycles).toHaveBeenCalledTimes(1);
    expect(mockService.getFeedingPlans).toHaveBeenCalledWith(cycleA.id);
  });

  it('utilise currentCycle comme cycle preselectionne quand disponible', async () => {
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          currentCycle: cycleB,
        },
      })
    );
    mockService.getActiveCycles.mockResolvedValueOnce([cycleA, cycleB]);
    mockService.getFeedingPlans.mockResolvedValueOnce([feedingPlanA]);

    render(<FeedingPlanScreen navigation={navigation} />);

    await waitFor(() => {
      expect(mockService.getFeedingPlans).toHaveBeenCalledWith(cycleB.id);
    });
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
      expect(mockReconcileCycleAlarms).toHaveBeenCalled();
    });

    alertSpy.mockRestore();
  });

  it('force les alarmes actives et ne montre plus le toggle utilisateur', async () => {
    mockService.getActiveCycles.mockResolvedValueOnce([cycleA]);
    mockService.getFeedingPlans.mockResolvedValueOnce([feedingPlanA]);

    const { getByText, queryByText } = render(<FeedingPlanScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText('alarmsStatusActive')).toBeTruthy();
    });

    await waitFor(() => {
      expect(mockSetAlarmsEnabled).toHaveBeenCalledWith(true);
      expect(mockReconcileCycleAlarms).toHaveBeenCalled();
    });
    expect(queryByText('alarmToggle')).toBeNull();
    expect(queryByText('alarmToggleOff')).toBeNull();
  });

  it('affiche un etat vide si le chargement des cycles echoue', async () => {
    mockService.getActiveCycles.mockRejectedValueOnce(new Error('boom'));

    const { getByText } = render(<FeedingPlanScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText('noActiveCycles')).toBeTruthy();
    });
  });
});
