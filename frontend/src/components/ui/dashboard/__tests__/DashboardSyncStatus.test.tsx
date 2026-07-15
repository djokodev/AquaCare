import React from 'react';
import { act, render } from '@testing-library/react-native';

import { DashboardSyncStatus } from '../DashboardSyncStatus';

let mockLanguage = 'fr';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: mockLanguage },
    t: (key: string, options?: { count?: number; date?: string }) => {
      const count = options?.count;
      const labels: Record<string, Record<string, string>> = {
        fr: {
          dashboardSyncNever: 'Données non encore synchronisées',
          dashboardSyncNow: 'Données synchronisées à l’instant',
          dashboardSyncMinutesAgo: `Données synchronisées il y a ${count} min`,
          dashboardSyncHoursAgo: `Dernière synchronisation il y a ${count} h`,
          dashboardSyncYesterday: 'Dernière synchronisation hier',
          dashboardSyncOnDate: `Dernière synchronisation le ${options?.date}`,
        },
        en: {
          dashboardSyncNever: 'Data not synced yet',
          dashboardSyncNow: 'Data synced just now',
          dashboardSyncMinutesAgo: `Data synced ${count} min ago`,
          dashboardSyncHoursAgo: `Last synced ${count} hours ago`,
          dashboardSyncYesterday: 'Last synced yesterday',
          dashboardSyncOnDate: `Last synced on ${options?.date}`,
        },
      };
      return labels[mockLanguage][key];
    },
  }),
}));

describe('DashboardSyncStatus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-15T12:00:00Z'));
    mockLanguage = 'fr';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    [new Date('2026-07-15T12:00:00Z'), 'Données synchronisées à l’instant'],
    [new Date('2026-07-15T11:56:00Z'), 'Données synchronisées il y a 4 min'],
    [new Date('2026-07-15T10:00:00Z'), 'Dernière synchronisation il y a 2 h'],
    [null, 'Données non encore synchronisées'],
  ])('renders relative state for %p', (date, expected) => {
    const { getByText, getByLabelText } = render(<DashboardSyncStatus lastSyncedAt={date} />);
    expect(getByText(expected)).toBeTruthy();
    expect(getByLabelText(expected)).toBeTruthy();
  });

  it('updates after one minute without a network request', () => {
    const { getByText } = render(
      <DashboardSyncStatus lastSyncedAt={new Date('2026-07-15T11:59:30Z')} />,
    );
    expect(getByText('Données synchronisées à l’instant')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(getByText('Données synchronisées il y a 1 min')).toBeTruthy();
  });

  it('cleans its timer on unmount', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const { unmount } = render(<DashboardSyncStatus lastSyncedAt={Date.now()} />);
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('renders English wording', () => {
    mockLanguage = 'en';
    const { getByText } = render(
      <DashboardSyncStatus lastSyncedAt={new Date('2026-07-15T11:56:00Z')} />,
    );
    expect(getByText('Data synced 4 min ago')).toBeTruthy();
  });
});
