import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import FeedingPlanScreen from '../FeedingPlanScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import {
  enableFeedingReminders,
  markRemindersOffered,
  savePlanSnapshotEntry,
  shouldOfferReminders,
} from '@/features/notifications/reminders/feedingReminders';

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

jest.mock('@/features/notifications/reminders/feedingReminders', () => ({
  savePlanSnapshotEntry: jest.fn(() => Promise.resolve()),
  shouldOfferReminders: jest.fn(() => Promise.resolve(false)),
  markRemindersOffered: jest.fn(() => Promise.resolve()),
  enableFeedingReminders: jest.fn(() => Promise.resolve({ status: 'scheduled', scheduledCount: 2 })),
  loadReminderSettings: jest.fn(() => Promise.resolve({
    enabled: false,
    times: [{ id: 'a', hour: 8, minute: 30 }, { id: 'b', hour: 16, minute: 30 }],
    days: [1, 2, 3, 4, 5, 6, 7],
    bypassDnd: false,
  })),
  formatReminderTime: ({ hour, minute }: { hour: number; minute: number }) =>
    `${String(hour).padStart(2, '0')}h${String(minute).padStart(2, '0')}`,
}));

jest.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) => selector({ auth: { user: { id: 'user-1' } } }),
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
  const mockSaveSnapshot = savePlanSnapshotEntry as jest.MockedFunction<typeof savePlanSnapshotEntry>;
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
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
      expect(mockSaveSnapshot).toHaveBeenCalledWith('user-1', 'allocation-1', {
        unitName: 'Bac 1',
        feedPerMealKg: 0.41,
        endDate: feedingPlan.end_date,
      });
    });
  });

  it('ouvre les rappels de nourrissage depuis le plan', async () => {
    mockService.getFeedingPlansForAllocation.mockResolvedValueOnce([feedingPlan]);

    const { getByText } = render(<FeedingPlanScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('feedingRemindersTitle')).toBeTruthy();
    });
    fireEvent.press(getByText('feedingRemindersTitle'));

    expect(navigation.navigate).toHaveBeenCalledWith('FeedingReminders');
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

  describe('proposition des rappels apres generation', () => {
    const generate = async () => {
      mockService.getFeedingPlansForAllocation.mockResolvedValueOnce([]);
      mockService.getFeedingPlansForAllocation.mockResolvedValueOnce([feedingPlan]);
      mockService.generateFeedingPlanForAllocation.mockResolvedValueOnce([feedingPlan]);
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const { getByText } = render(<FeedingPlanScreen navigation={navigation} route={route} />);
      await waitFor(() => expect(getByText('generateFeedingPlanShort')).toBeTruthy());
      fireEvent.press(getByText('generateFeedingPlanShort'));
      const confirmButtons = alertSpy.mock.calls[0][2] as Array<{ text?: string; onPress?: () => Promise<void> }>;
      await confirmButtons.find((button) => button.text === 'generatePlan')?.onPress?.();
      return alertSpy;
    };

    it('propose une seule fois d activer les rappels', async () => {
      (shouldOfferReminders as jest.Mock).mockResolvedValueOnce(true);
      const alertSpy = await generate();

      await waitFor(() => expect(alertSpy).toHaveBeenCalledTimes(2));
      const [title, message, buttons] = alertSpy.mock.calls[1] as [string, string, Array<{ text?: string; onPress?: () => Promise<void> }>];
      expect(title).toBe('feedingPlanGenerated');
      expect(message).toBe('remindersOfferMessage');
      expect(markRemindersOffered).toHaveBeenCalledWith('user-1');

      await buttons.find((button) => button.text === 'remindersOfferEnable')?.onPress?.();
      expect(enableFeedingReminders).toHaveBeenCalledWith('user-1', expect.any(Object), 'fr-FR');
      alertSpy.mockRestore();
    });

    it('affiche une simple confirmation si la proposition a deja ete faite', async () => {
      const alertSpy = await generate();

      await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('success', 'feedingPlanGenerated'));
      expect(markRemindersOffered).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });
  });
});
