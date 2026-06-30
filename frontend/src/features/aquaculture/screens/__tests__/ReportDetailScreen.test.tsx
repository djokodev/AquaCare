import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

import ReportDetailScreen from '../ReportDetailScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getReport: jest.fn(),
    regenerateReport: jest.fn(),
    validateReport: jest.fn(),
    sendReportEmail: jest.fn(),
    markReportWhatsAppShared: jest.fn(),
  },
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

describe('features/aquaculture/screens/ReportDetailScreen', () => {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
  } as any;

  const mockGetReport = aquacultureService.getReport as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('affiche un résumé cycle et la comparaison par unité', async () => {
    mockGetReport.mockResolvedValue({
      id: 'report-1',
      report_type: 'daily',
      status: 'draft',
      period_start: '2026-06-30',
      period_end: '2026-06-30',
      farm_profile: 'farm-1',
      email_status: 'not_sent',
      whatsapp_status: 'not_shared',
      created_at: '2026-06-30T08:00:00Z',
      updated_at: '2026-06-30T08:00:00Z',
      payload: {
        report_meta: {
          scope_type: 'cycle',
          scope_label: 'Rapport du cycle',
          scope_name: 'Cycle Juin 2026',
        },
        summary: {
          cycle_name: 'Cycle Juin 2026',
          initial_fish_count: 1000,
          estimated_current_fish_count: 970,
          total_mortality_count: 30,
          mortality_rate_pct: 3,
          total_feed_consumed_kg: 14.5,
          estimated_current_biomass_kg: 95.8,
          units_with_today_log_count: 2,
          units_missing_today_log_count: 1,
          active_sanitary_events_count: 1,
        },
        units: [
          {
            id: 'allocation-1',
            name: 'Bac 1',
            production_unit_dimension: '3 m³',
            estimated_current_fish_count: 500,
            total_mortality_count: 10,
            total_feed_consumed_kg: 6,
            estimated_current_biomass_kg: 45,
            sanitary_status_short: 'ok',
            last_daily_log_date: '2026-06-30',
          },
          {
            id: 'allocation-2',
            name: 'Bac 2',
            production_unit_dimension: '4 m³',
            estimated_current_fish_count: 470,
            total_mortality_count: 20,
            total_feed_consumed_kg: 8.5,
            estimated_current_biomass_kg: 50.8,
            sanitary_status_short: 'active',
            last_daily_log_date: '2026-06-29',
          },
        ],
        cycles: [
          {
            cycle: {
              cycle_name: 'Cycle Juin 2026',
              species_display: 'Tilapia',
              pond_identifier: 'B1',
              start_date: '2026-06-01',
              days_active: 29,
            },
            unit: {
              production_unit_name: 'Bac 1',
              production_unit_type_display: 'Bac',
              production_unit_dimension: '3 m³',
            },
            dashboard_metrics: {
              estimated_market_value_fcfa: 100000,
              feed_cost_consumed_fcfa: 20000,
              time_remaining_days: 15,
              direct_production_cost_fcfa: 25000,
            },
            current_metrics: {
              current_count: 500,
              current_average_weight: 95,
              current_biomass: 45,
              total_feed_consumed: 6,
              survival_rate: 97,
            },
            period_metrics: {
              log_count: 2,
              sanitary_event_count: 1,
              total_feed: 6,
              total_mortality: 10,
              average_weight: 95,
            },
            logs: [{ log_date: '2026-06-30', feed_quantity: 3, mortality_count: 1 }],
            sanitary_logs: [{ event_date: '2026-06-29', event_type_display: 'Disease', affected_count: 2, resolved: false }],
          },
          {
            cycle: {
              cycle_name: 'Cycle Juin 2026',
              species_display: 'Tilapia',
              pond_identifier: 'B2',
              start_date: '2026-06-01',
              days_active: 29,
            },
            unit: {
              production_unit_name: 'Bac 2',
              production_unit_type_display: 'Bac',
              production_unit_dimension: '4 m³',
            },
            dashboard_metrics: {
              estimated_market_value_fcfa: 90000,
              feed_cost_consumed_fcfa: 18000,
              time_remaining_days: 12,
              direct_production_cost_fcfa: 22000,
            },
            current_metrics: {
              current_count: 470,
              current_average_weight: 90,
              current_biomass: 50.8,
              total_feed_consumed: 8.5,
              survival_rate: 94,
            },
            period_metrics: {
              log_count: 2,
              sanitary_event_count: 0,
              total_feed: 8.5,
              total_mortality: 20,
              average_weight: 90,
            },
            logs: [{ log_date: '2026-06-29', feed_quantity: 4.5, mortality_count: 1 }],
            sanitary_logs: [],
          },
        ],
      },
    });

    const { getByText } = render(
      <ReportDetailScreen
        navigation={navigation}
        route={{ key: 'ReportDetail', name: 'ReportDetail', params: { reportId: 'report-1' } } as any}
      />
    );

    await waitFor(() => {
      expect(getByText('reportSummaryCycle')).toBeTruthy();
      expect(getByText('reportComparisonByUnit')).toBeTruthy();
      expect(getByText('Bac 1')).toBeTruthy();
      expect(getByText('Bac 2')).toBeTruthy();
      expect(getByText('reportInitialFishCount')).toBeTruthy();
      expect(getByText('reportEstimatedFishCount')).toBeTruthy();
    });
  });

  it('affiche un résumé unité et les derniers logs', async () => {
    mockGetReport.mockResolvedValue({
      id: 'report-2',
      report_type: 'daily',
      status: 'validated',
      period_start: '2026-06-30',
      period_end: '2026-06-30',
      farm_profile: 'farm-1',
      email_status: 'not_sent',
      whatsapp_status: 'not_shared',
      created_at: '2026-06-30T08:00:00Z',
      updated_at: '2026-06-30T08:00:00Z',
      payload: {
        report_meta: {
          scope_type: 'unit',
          scope_label: "Rapport de l'unité",
          scope_name: 'Bac 1',
        },
        summary: {
          scope_name: 'Bac 1',
          initial_fish_count: 500,
          estimated_current_fish_count: 495,
          total_mortality_count: 5,
          mortality_rate_pct: 1,
          total_feed_consumed_kg: 3.2,
          estimated_current_biomass_kg: 48.5,
        },
        cycles: [
          {
            cycle: {
              cycle_name: 'Cycle Juin 2026',
              species_display: 'Tilapia',
              pond_identifier: 'B1',
              start_date: '2026-06-01',
              days_active: 29,
            },
            unit: {
              production_unit_name: 'Bac 1',
              production_unit_type_display: 'Bac',
              production_unit_dimension: '3 m³',
            },
            dashboard_metrics: {
              estimated_market_value_fcfa: 50000,
              feed_cost_consumed_fcfa: 8000,
              time_remaining_days: 10,
              direct_production_cost_fcfa: 9000,
            },
            current_metrics: {
              current_count: 495,
              current_average_weight: 97.5,
              current_biomass: 48.5,
              total_feed_consumed: 3.2,
              survival_rate: 99,
            },
            period_metrics: {
              log_count: 1,
              sanitary_event_count: 0,
              total_feed: 3.2,
              total_mortality: 5,
              average_weight: 97.5,
            },
            logs: [{ log_date: '2026-06-30', feed_quantity: 3.2, mortality_count: 0, average_weight: 97.5 }],
            sanitary_logs: [],
          },
        ],
      },
    });

    const { getByText } = render(
      <ReportDetailScreen
        navigation={navigation}
        route={{ key: 'ReportDetail', name: 'ReportDetail', params: { reportId: 'report-2' } } as any}
      />
    );

    await waitFor(() => {
      expect(getByText('reportSummaryUnit')).toBeTruthy();
      expect(getByText('reportLastAverageWeight')).toBeTruthy();
      expect(getByText('reportLastEntry')).toBeTruthy();
      expect(getByText('Bac 1')).toBeTruthy();
      expect(getByText("Rapport de l'unité")).toBeTruthy();
    });
  });
});
