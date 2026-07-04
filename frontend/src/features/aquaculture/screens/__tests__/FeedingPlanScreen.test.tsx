import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import FeedingPlanScreen from '../FeedingPlanScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { useLocalFeedingAlarms } from '@/features/notifications/hooks/useLocalFeedingAlarms';

const mockT = jest.fn((key: string) => key);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
    i18n: { language: 'fr' },
  }),
}));

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getFeedingPlansForAllocation: jest.fn(),
    generateFeedingPlanForAllocation: jest.fn(),
  },
}));

jest.mock('@/features/notifications/hooks/useLocalFeedingAlarms', () => ({
  useLocalFeedingAlarms: jest.fn(),
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
  const mockUseLocalFeedingAlarms = useLocalFeedingAlarms as jest.MockedFunction<typeof useLocalFeedingAlarms>;
  const mockReconcileCycleAlarms = jest.fn();
  const mockGetFormattedMealTimes = jest.fn(() => ['08h00', '13h00']);
  const mockSetAlarmsEnabled = jest.fn(() => Promise.resolve());
  const navigation = {
    goBack: jest.fn(),
    setOptions: jest.fn(),
  } as any;
  const route = {
    params: {
      cycleId: 'cycle-1',
      cycleUnitAllocationId: 'allocation-1',
      productionUnitId: 'unit-1',
      productionUnitName: 'Bac 1',
    },
  } as any;

  const feedingPlan = {
    id: 'plan-1',
    cycle: 'cycle-1',
    cycle_unit_allocation: 'allocation-1',
    production_unit: 'unit-1',
    production_unit_name: 'Bac 1',
    production_unit_type: 'tank' as const,
    production_unit_display_dimension: '3.00 m³',
    scope_label: 'Plan d\'alimentation de Bac 1',
    week_number: 1,
    estimated_fish_count: 900,
    average_weight: 18,
    biomass: 16.2,
    daily_feed_amount: 0.82,
    feeding_rate: 4.5,
    meals_per_day: 2,
    feed_per_meal: 0.41,
    recommended_feed_type: 'Feed Pro',
    protein_percentage: 40,
    start_date: '2026-02-01',
    end_date: '2026-02-07',
    is_active: true,
    temperature_used_c: 28,
    used_default_temperature: false,
    data_source: 'DIBAQ',
    feed_size_mm: 2,
    created_at: '2026-02-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalFeedingAlarms.mockReturnValue({
      scheduleAlarms: jest.fn(),
      cancelAlarms: jest.fn(),
      hasActiveAlarms: jest.fn(),
      reconcileCycleAlarms: mockReconcileCycleAlarms.mockResolvedValue({
        status: 'scheduled',
        scheduledCount: 2,
      }),
      getFormattedMealTimes: mockGetFormattedMealTimes,
      setAlarmsEnabled: mockSetAlarmsEnabled,
    } as any);
  });

  it('charge les plans d une unite et affiche le titre unitaire', async () => {
    mockService.getFeedingPlansForAllocation.mockResolvedValueOnce([feedingPlan]);

    const { getByText } = render(<FeedingPlanScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(navigation.setOptions).toHaveBeenCalledWith({ title: 'feedingPlanUnitTitle' });
      expect(mockService.getFeedingPlansForAllocation).toHaveBeenCalledWith('allocation-1');
      expect(getByText('feedingPlanUnitTitle')).toBeTruthy();
      expect(getByText('feedingPlans')).toBeTruthy();
      expect(getByText('week 1')).toBeTruthy();
      expect(getByText('feedingPlanUnitSummary')).toBeTruthy();
      expect(getByText('estimatedFishCount')).toBeTruthy();
      expect(getByText('feedingPlanRecommendationSection')).toBeTruthy();
      expect(getByText('feedingPlanFeedSection')).toBeTruthy();
      expect(getByText('feedingPlanDataSection')).toBeTruthy();
    });

    await waitFor(() => {
      expect(mockReconcileCycleAlarms).toHaveBeenCalledWith(
        expect.objectContaining({
          cycleId: 'cycle-1',
          scopeId: 'cycle-1:allocation-1',
          cycleName: 'Bac 1',
        })
      );
    });
  });

  it('genere un plan pour une allocation et recharge la liste', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockService.getFeedingPlansForAllocation.mockResolvedValueOnce([feedingPlan]);
    mockService.getFeedingPlansForAllocation.mockResolvedValueOnce([feedingPlan]);
    mockService.generateFeedingPlanForAllocation.mockResolvedValueOnce([feedingPlan]);

    const { getByText } = render(<FeedingPlanScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('generateFeedingPlanShort')).toBeTruthy();
    });

    fireEvent.press(getByText('generateFeedingPlanShort'));

    const alertArgs = alertSpy.mock.calls[0];
    const buttons = alertArgs?.[2] as Array<{ text?: string; onPress?: () => void }> | undefined;
    expect(alertArgs?.[0]).toBe('feedingPlanGenerateConfirmTitle');
    expect(alertArgs?.[1]).toBe('feedingPlanGenerateConfirmExisting');
    buttons?.find((button) => button.text === 'cancel')?.onPress?.();
    buttons?.find((button) => button.text === 'generatePlan')?.onPress?.();

    await waitFor(() => {
      expect(mockService.generateFeedingPlanForAllocation).toHaveBeenCalledWith({
        cycleUnitAllocationId: 'allocation-1',
        weeksAhead: 1,
        cycleId: 'cycle-1',
      });
      expect(mockService.getFeedingPlansForAllocation).toHaveBeenCalledTimes(2);
    });

    alertSpy.mockRestore();
  });

  it('affiche le bon message de confirmation quand aucun plan n existe', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockService.getFeedingPlansForAllocation.mockResolvedValueOnce([]);
    mockService.getFeedingPlansForAllocation.mockResolvedValueOnce([]);
    mockService.generateFeedingPlanForAllocation.mockResolvedValueOnce([]);

    const { getByText } = render(<FeedingPlanScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('generateFeedingPlanShort')).toBeTruthy();
    });

    fireEvent.press(getByText('generateFeedingPlanShort'));

    const alertArgs = alertSpy.mock.calls[0];
    expect(alertArgs?.[0]).toBe('feedingPlanGenerateConfirmTitle');
    expect(alertArgs?.[1]).toBe('feedingPlanGenerateConfirmEmpty');

    alertSpy.mockRestore();
  });

  it('n appelle pas l API si le contexte unitaire est incomplet', async () => {
    const incompleteRoute = {
      params: {
        cycleId: 'cycle-1',
        productionUnitId: 'unit-1',
        productionUnitName: 'Bac 1',
      },
    } as any;

    const { getByText } = render(<FeedingPlanScreen navigation={navigation} route={incompleteRoute} />);

    await waitFor(() => {
      expect(getByText('feedingPlanUnitContextIncompleteError')).toBeTruthy();
    });

    expect(mockService.getFeedingPlansForAllocation).not.toHaveBeenCalled();
    expect(mockService.generateFeedingPlanForAllocation).not.toHaveBeenCalled();
  });
});
