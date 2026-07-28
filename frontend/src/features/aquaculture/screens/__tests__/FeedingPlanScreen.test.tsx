import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import FeedingPlanScreen from '../FeedingPlanScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { useLocalFeedingAlarms } from '@/features/notifications/hooks/useLocalFeedingAlarms';

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

const mockT = jest.fn((key: string) => key);

const getLocalDateIso = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDaysIso = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return getLocalDateIso(date);
};

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
    start_date: getLocalDateIso(),
    end_date: addDaysIso(6),
    is_active: true,
    temperature_used_c: 28,
    used_default_temperature: false,
    data_source: 'DIBAQ',
    feed_size_mm: 2,
    created_at: '2026-02-01T00:00:00Z',
  };
  const futureFeedingPlan = {
    ...feedingPlan,
    id: 'plan-2',
    week_number: 2,
    start_date: addDaysIso(7),
    end_date: addDaysIso(13),
    created_at: '2026-02-08T00:00:00Z',
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
    mockService.getFeedingPlansForAllocation.mockResolvedValueOnce([feedingPlan, futureFeedingPlan]);

    const { getByText, queryByText, getByTestId } = render(<FeedingPlanScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(navigation.setOptions).toHaveBeenCalledWith({ title: 'feedingPlanUnitTitle' });
      expect(mockService.getFeedingPlansForAllocation).toHaveBeenCalledWith('allocation-1', {
        currentWeekOnly: true,
      });
      expect(getByText('feedingPlanUnitTitle')).toBeTruthy();
      expect(getByText('feedingPlans')).toBeTruthy();
      expect(getByText('feedingPlanCurrentWeekLabel · week 1')).toBeTruthy();
      expect(getByText('feedingRecommendedRate')).toBeTruthy();
      expect(getByText('feedingPlanRecommendationSection')).toBeTruthy();
      expect(getByText('feedingFeedLabel')).toBeTruthy();
      expect(getByText('feedingProteinRate')).toBeTruthy();
      expect(getByText('feedingPlanFeedSection')).toBeTruthy();
      expect(getByText('feedingPlanDataSection')).toBeTruthy();
      expect(getByText('feedingWaterTemperature')).toBeTruthy();
      expect(getByText('feedingPlanReferenceUsed')).toBeTruthy();
      expect(getByText('feedingPlanReferenceDibaq')).toBeTruthy();
      expect(queryByText('feedingPlanCurrentWeekLabel · week 2')).toBeNull();
      expect(queryByText('feedingPlanUnitSummary')).toBeNull();
      expect(queryByText('estimatedFishCount')).toBeNull();
      expect(queryByText('feedSizeMm')).toBeNull();
      expect(getByTestId('feeding-plan-card')).toBeTruthy();
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

  it('traduit une source technique en reference lisible', async () => {
    mockService.getFeedingPlansForAllocation.mockResolvedValueOnce([
      {
        ...feedingPlan,
        data_source: 'fallback_interne',
      },
    ]);

    const { getByText, queryByText } = render(<FeedingPlanScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('feedingPlanReferenceUsed')).toBeTruthy();
      expect(getByText('feedingPlanReferenceAquacareEstimate')).toBeTruthy();
      expect(queryByText('fallback_interne')).toBeNull();
    });
  });

  it('ajoute un suffixe quand la temperature est une valeur par defaut', async () => {
    mockService.getFeedingPlansForAllocation.mockResolvedValueOnce([
      {
        ...feedingPlan,
        used_default_temperature: true,
      },
    ]);

    const { getByText } = render(<FeedingPlanScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('28.0°C feedingDefaultTemperatureSuffix')).toBeTruthy();
    });
  });

  it('affiche un avertissement si la ration calculée reste nulle', async () => {
    mockService.getFeedingPlansForAllocation.mockResolvedValueOnce([
      {
        ...feedingPlan,
        biomass: 0,
        daily_feed_amount: 0,
        feed_per_meal: 0,
      },
    ]);

    const { getByText } = render(<FeedingPlanScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('feedingPlanInsufficientDataWarning')).toBeTruthy();
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
      expect(mockService.getFeedingPlansForAllocation).toHaveBeenLastCalledWith('allocation-1', {
        currentWeekOnly: true,
      });
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
