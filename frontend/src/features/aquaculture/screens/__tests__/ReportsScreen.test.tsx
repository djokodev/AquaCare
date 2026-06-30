import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ReportsScreen from '../ReportsScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { useSelector } from 'react-redux';

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getReports: jest.fn(),
    generateReport: jest.fn(),
    deleteReport: jest.fn(),
  },
}));

jest.mock('react-redux', () => ({
  useSelector: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    const React = require('react');
    React.useEffect(() => {
      callback();
    }, [callback]);
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('features/aquaculture/screens/ReportsScreen', () => {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
  } as any;

  const mockGetReports = aquacultureService.getReports as jest.Mock;
  const mockGenerateReport = aquacultureService.generateReport as jest.Mock;
  const mockUseSelector = useSelector as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          currentCycle: { id: 'cycle-1' },
        },
      })
    );
  });

  it('affiche un rapport cycle et genere avec le contexte cycle', async () => {
    mockGetReports.mockResolvedValue([
      {
        id: 'report-1',
        report_type: 'daily',
        status: 'draft',
        scope_type: 'cycle',
        scope_label: 'Rapport du cycle',
        period_start: '2026-06-30',
        period_end: '2026-06-30',
        farm_profile: 'farm-1',
        email_status: 'not_sent',
        whatsapp_status: 'not_shared',
        created_at: '2026-06-30T08:00:00Z',
        updated_at: '2026-06-30T08:00:00Z',
      },
    ]);
    mockGenerateReport.mockResolvedValueOnce({ id: 'report-2' });

    const { getByText, getAllByText } = render(
      <ReportsScreen
        navigation={navigation}
        route={{ key: 'Reports', name: 'Reports', params: { scope: 'cycle', cycleId: 'cycle-1' } } as any}
      />
    );

    await waitFor(() => {
      expect(getByText('reportCycleTitle')).toBeTruthy();
      expect(getAllByText('reportTypeDaily').length).toBeGreaterThan(0);
      expect(getByText('Rapport du cycle')).toBeTruthy();
    });

    fireEvent.press(getAllByText('reportTypeDaily')[0]);

    await waitFor(() => {
      expect(mockGenerateReport).toHaveBeenCalledWith({
        report_type: 'daily',
        scope: 'cycle',
        cycle_id: 'cycle-1',
        cycle_unit_allocation_id: undefined,
      });
    });
  });

  it('affiche un rapport unité et genere avec le contexte unitaire', async () => {
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          currentCycle: null,
        },
      })
    );
    mockGetReports.mockResolvedValue([]);
    mockGenerateReport.mockResolvedValue({ id: 'report-3' });

    const { getByText } = render(
      <ReportsScreen
        navigation={navigation}
        route={{
          key: 'Reports',
          name: 'Reports',
          params: {
            scope: 'unit',
            cycleId: 'cycle-1',
            cycleUnitAllocationId: 'allocation-1',
            productionUnitId: 'unit-1',
            productionUnitName: 'Bac 1',
          },
        } as any}
      />
    );

    await waitFor(() => {
      expect(getByText('reportUnitTitle')).toBeTruthy();
      expect(getByText('generateReport')).toBeTruthy();
    });

    fireEvent.press(getByText('reportTypeWeekly'));

    await waitFor(() => {
      expect(mockGenerateReport).toHaveBeenCalledWith({
        report_type: 'weekly',
        scope: 'unit',
        cycle_id: 'cycle-1',
        cycle_unit_allocation_id: 'allocation-1',
      });
    });
  });

  it('n appelle pas l API si le contexte unitaire est incomplet', async () => {
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          currentCycle: null,
        },
      })
    );

    const { getAllByText } = render(
      <ReportsScreen
        navigation={navigation}
        route={{
          key: 'Reports',
          name: 'Reports',
          params: {
            scope: 'unit',
            cycleId: 'cycle-1',
            productionUnitId: 'unit-1',
          },
        } as any}
      />
    );

    await waitFor(() => {
      expect(getAllByText('incompleteUnitContext').length).toBeGreaterThan(0);
    });

    expect(mockGetReports).not.toHaveBeenCalled();
  });
});
