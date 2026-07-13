import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ReportsScreen from '../ReportsScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { useSelector } from 'react-redux';

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getReports: jest.fn(),
    getCycleUnitAllocations: jest.fn(),
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
  const mockGetAllocations = aquacultureService.getCycleUnitAllocations as jest.Mock;
  const mockGenerateReport = aquacultureService.generateReport as jest.Mock;
  const mockUseSelector = useSelector as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllocations.mockResolvedValue([]);
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
      expect(getAllByText('reportCycleTitle').length).toBeGreaterThan(0);
      expect(getByText('reportGenerationDaily')).toBeTruthy();
      expect(getByText('reportGenerationWeekly')).toBeTruthy();
      expect(getByText('reportGenerationMonthly')).toBeTruthy();
      expect(getByText('Rapport du cycle')).toBeTruthy();
    });

    fireEvent.press(getByText('reportGenerationWeekly'));

    await waitFor(() => {
      expect(mockGenerateReport).toHaveBeenCalledWith({
        report_type: 'weekly',
        scope_type: 'cycle',
        cycle_id: 'cycle-1',
      });
    });
  });

  it('genere les trois types depuis un cycle sans allocation unitaire', async () => {
    mockGetReports.mockResolvedValue([]);
    mockGenerateReport.mockResolvedValue({ id: 'report-4' });

    const { getByText } = render(
      <ReportsScreen
        navigation={navigation}
        route={{ key: 'Reports', name: 'Reports', params: { scope: 'cycle', cycleId: 'cycle-1' } } as any}
      />
    );

    await waitFor(() => expect(getByText('reportGenerationDaily')).toBeTruthy());

    for (const reportType of ['daily', 'weekly', 'monthly'] as const) {
      fireEvent.press(getByText(
        reportType === 'daily'
          ? 'reportGenerationDaily'
          : reportType === 'weekly'
            ? 'reportGenerationWeekly'
            : 'reportGenerationMonthly'
      ));
      await waitFor(() => expect(mockGenerateReport).toHaveBeenCalledWith({
        report_type: reportType,
        scope_type: 'cycle',
        cycle_id: 'cycle-1',
      }));
    }
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
    mockGetAllocations.mockResolvedValue([
      {
        id: 'allocation-1',
        cycle: 'cycle-1',
        production_unit: 'unit-1',
        production_unit_name: 'Bac 1',
        production_unit_type: 'tank',
        production_unit_display_dimension: '3 m³',
        status_display: 'Actif',
      },
    ]);
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
      expect(getByText('reportGenerationDaily')).toBeTruthy();
    });

    fireEvent.press(getByText('reportGenerationWeekly'));

    await waitFor(() => {
      expect(mockGenerateReport).toHaveBeenCalledWith({
        report_type: 'weekly',
        scope_type: 'unit',
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

  it('permet de sélectionner une allocation du cycle et envoie son identifiant canonique', async () => {
    mockGetReports.mockResolvedValue([]);
    mockGetAllocations.mockResolvedValue([
      {
        id: 'allocation-2',
        cycle: 'cycle-1',
        production_unit: 'unit-2',
        production_unit_name: 'Bassin B',
        production_unit_type: 'pond',
        production_unit_display_dimension: '12 m²',
        status_display: 'Actif',
      },
    ]);
    mockGenerateReport.mockResolvedValue({ id: 'report-unit' });

    const { getByText } = render(
      <ReportsScreen
        navigation={navigation}
        route={{ key: 'Reports', name: 'Reports', params: { scope: 'cycle', cycleId: 'cycle-1' } } as any}
      />
    );

    await waitFor(() => expect(getByText('Bassin B')).toBeTruthy());
    fireEvent.press(getByText('Bassin B'));
    fireEvent.press(getByText('reportGenerationDaily'));

    await waitFor(() => {
      expect(mockGenerateReport).toHaveBeenCalledWith({
        report_type: 'daily',
        scope_type: 'unit',
        cycle_id: 'cycle-1',
        cycle_unit_allocation_id: 'allocation-2',
      });
    });
  });

  it('identifie les rapports pending, cycle et legacy dans l historique', async () => {
    mockGetReports.mockResolvedValue([
      {
        id: 'pending-unit',
        report_type: 'weekly',
        status: 'pending',
        scope_type: 'unit',
        scope_name: 'Bassin A',
        scope_label: "Rapport de l'unité",
        period_start: '2026-06-22',
        period_end: '2026-06-28',
        farm_profile: 'farm-1',
        email_status: 'not_sent',
        whatsapp_status: 'not_shared',
        created_at: '2026-06-28T08:00:00Z',
        updated_at: '2026-06-28T08:00:00Z',
      },
      {
        id: 'cycle-report',
        report_type: 'daily',
        status: 'draft',
        scope_type: 'cycle',
        scope_name: 'Cycle Clarias juillet',
        scope_label: 'Rapport du cycle',
        period_start: '2026-06-30',
        period_end: '2026-06-30',
        farm_profile: 'farm-1',
        email_status: 'not_sent',
        whatsapp_status: 'not_shared',
        created_at: '2026-06-30T08:00:00Z',
        updated_at: '2026-06-30T08:00:00Z',
      },
      {
        id: 'legacy-report',
        report_type: 'monthly',
        status: 'draft',
        scope_type: 'cycle',
        scope_label: 'Rapport historique',
        period_start: '2026-06-01',
        period_end: '2026-06-30',
        farm_profile: 'farm-1',
        email_status: 'not_sent',
        whatsapp_status: 'not_shared',
        created_at: '2026-06-30T08:00:00Z',
        updated_at: '2026-06-30T08:00:00Z',
      },
    ]);

    const { getByText } = render(
      <ReportsScreen
        navigation={navigation}
        route={{ key: 'Reports', name: 'Reports', params: { scope: 'cycle', cycleId: 'cycle-1' } } as any}
      />
    );

    await waitFor(() => {
      expect(getByText("Bassin A · Rapport de l'unité")).toBeTruthy();
      expect(getByText('Cycle Clarias juillet · Rapport du cycle')).toBeTruthy();
      expect(getByText('Rapport historique')).toBeTruthy();
    });
  });

  it('réinitialise la portée unitaire quand le cycle change', async () => {
    mockGetReports.mockResolvedValue([]);
    mockGetAllocations.mockImplementation(async (cycleId: string) => (
      cycleId === 'cycle-a'
        ? [{
            id: 'allocation-a1',
            cycle: 'cycle-a',
            production_unit: 'unit-a1',
            production_unit_name: 'Bassin A1',
            production_unit_type: 'tank',
            production_unit_display_dimension: '3 m³',
            status_display: 'Actif',
          }]
        : [{
            id: 'allocation-b1',
            cycle: 'cycle-b',
            production_unit: 'unit-b1',
            production_unit_name: 'Bassin B1',
            production_unit_type: 'pond',
            production_unit_display_dimension: '12 m²',
            status_display: 'Actif',
          }]
    ));

    const { getByText, queryByText, rerender } = render(
      <ReportsScreen
        navigation={navigation}
        route={{
          key: 'Reports',
          name: 'Reports',
          params: { scope: 'unit', cycleId: 'cycle-a', cycleUnitAllocationId: 'allocation-a1' },
        } as any}
      />
    );

    await waitFor(() => expect(getByText('Bassin A1')).toBeTruthy());

    rerender(
      <ReportsScreen
        navigation={navigation}
        route={{ key: 'Reports', name: 'Reports', params: { scope: 'cycle', cycleId: 'cycle-b' } } as any}
      />
    );

    await waitFor(() => {
      expect(getByText('Bassin B1')).toBeTruthy();
      expect(queryByText('incompleteUnitContext')).toBeNull();
      expect(mockGetReports).toHaveBeenCalledWith({ scope_type: 'cycle', cycle_id: 'cycle-b' });
    });

    fireEvent.press(getByText('reportGenerationDaily'));
    await waitFor(() => {
      expect(mockGenerateReport).toHaveBeenCalledWith({
        report_type: 'daily',
        scope_type: 'cycle',
        cycle_id: 'cycle-b',
      });
      expect(mockGenerateReport).not.toHaveBeenCalledWith(expect.objectContaining({
        cycle_unit_allocation_id: 'allocation-a1',
      }));
    });
  });

  it('restaure une allocation unitaire valide sur une nouvelle route', async () => {
    mockGetReports.mockResolvedValue([]);
    mockGetAllocations.mockResolvedValue([
      {
        id: 'allocation-b1',
        cycle: 'cycle-b',
        production_unit: 'unit-b1',
        production_unit_name: 'Bassin B1',
        production_unit_type: 'pond',
        production_unit_display_dimension: '12 m²',
        status_display: 'Actif',
      },
    ]);
    mockGenerateReport.mockResolvedValue({ id: 'report-b1' });

    const { getByText } = render(
      <ReportsScreen
        navigation={navigation}
        route={{
          key: 'Reports',
          name: 'Reports',
          params: { scope: 'unit', cycleId: 'cycle-b', cycleUnitAllocationId: 'allocation-b1' },
        } as any}
      />
    );

    await waitFor(() => expect(getByText('Bassin B1')).toBeTruthy());
    fireEvent.press(getByText('reportGenerationWeekly'));

    await waitFor(() => {
      expect(mockGenerateReport).toHaveBeenCalledWith({
        report_type: 'weekly',
        scope_type: 'unit',
        cycle_id: 'cycle-b',
        cycle_unit_allocation_id: 'allocation-b1',
      });
    });
  });
});
