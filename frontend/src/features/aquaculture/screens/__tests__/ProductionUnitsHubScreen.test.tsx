import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ProductionUnitsHubScreen from '../ProductionUnitsHubScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getCycleDashboard: jest.fn(),
  },
}));

describe('features/aquaculture/screens/ProductionUnitsHubScreen', () => {
  const mockGetCycleDashboard = aquacultureService.getCycleDashboard as jest.Mock;
  const navigation = {
    navigate: jest.fn(),
  } as any;

  const route = {
    params: {
      cycleId: 'cycle-1',
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('affiche les allocations du cycle et les actions d ouverture', async () => {
    mockGetCycleDashboard.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        cycle_name: 'Cycle actif',
      },
      summary: {
        total_allocations: 2,
        total_estimated_current_fish_count: 1770,
        total_mortality_count: 30,
        total_feed_consumed_kg: '12.50',
        estimated_current_biomass_kg: '430.50',
        units_with_sanitary_issue_count: 1,
        units_missing_today_log_count: 1,
        has_allocations: true,
        data_source: 'unit_allocations',
      },
      allocations: [
        {
          allocation: {
            id: 'allocation-1',
            cycle: 'cycle-1',
            cycle_name: 'Cycle actif',
            production_unit: 'unit-1',
            production_unit_name: 'Bac 1',
            production_unit_type: 'tank',
            production_unit_display_dimension: '3 m³',
            production_unit_recommended_capacity: 900,
            initial_fish_count: 900,
            current_fish_count: 900,
            expected_survival_rate_pct: 95,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
          summary: {
            estimated_current_fish_count: 892,
            total_mortality_count: 8,
            mortality_rate_pct: '0.89',
            total_feed_consumed_kg: '6.50',
            latest_average_weight_g: '20.00',
            estimated_current_biomass_kg: '17.84',
            last_daily_log_date: '2026-06-27',
            days_since_last_log: 1,
            has_today_daily_log: true,
            active_sanitary_issues_count: 1,
            last_sanitary_event_date: '2026-06-27',
            has_unresolved_sanitary_issue: true,
          },
          recent_daily_logs: [],
          recent_sanitary_logs: [],
        },
        {
          allocation: {
            id: 'allocation-2',
            cycle: 'cycle-1',
            cycle_name: 'Cycle actif',
            production_unit: 'unit-2',
            production_unit_name: 'Étang principal',
            production_unit_type: 'pond',
            production_unit_display_dimension: '120 m²',
            production_unit_recommended_capacity: 1200,
            initial_fish_count: 1200,
            current_fish_count: 1180,
            current_biomass_kg: 412.5,
            survival_rate_pct: 98,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
          summary: {
            estimated_current_fish_count: 878,
            total_mortality_count: 22,
            mortality_rate_pct: '1.83',
            total_feed_consumed_kg: '6.00',
            latest_average_weight_g: '25.00',
            estimated_current_biomass_kg: '412.66',
            last_daily_log_date: '2026-06-26',
            days_since_last_log: 2,
            has_today_daily_log: false,
            active_sanitary_issues_count: 0,
            last_sanitary_event_date: '2026-06-26',
            has_unresolved_sanitary_issue: false,
          },
          recent_daily_logs: [],
          recent_sanitary_logs: [],
        },
      ],
    });

    const { getByText, getAllByText } = render(
      <ProductionUnitsHubScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(getByText('cycleDashboardTitle')).toBeTruthy();
      expect(getByText('Bac 1')).toBeTruthy();
      expect(getByText('Étang principal')).toBeTruthy();
      expect(getAllByText('cycleDashboardEstimatedFishCount').length).toBeGreaterThan(0);
      expect(getAllByText(/900/).length).toBeGreaterThan(0);
      expect(getAllByText(/1[\s\u202f]?200/).length).toBeGreaterThan(0);
      expect(getAllByText('productionUnitsRecommendedCapacity').length).toBeGreaterThan(0);
      expect(getAllByText('productionUnitsExpectedSurvivalRate').length).toBeGreaterThan(0);
      expect(getAllByText('cycleDashboardSanitaryIssueUnits').length).toBeGreaterThan(0);
      expect(getAllByText('cycleDashboardMissingTodayLogs').length).toBeGreaterThan(0);
      expect(getAllByText('productionUnitsOpenUnit').length).toBe(2);
    });

    fireEvent.press(getAllByText('productionUnitsOpenUnit')[0]);

    expect(navigation.navigate).toHaveBeenCalledWith('ProductionUnitOverview', {
      cycleId: 'cycle-1',
      allocationId: 'allocation-1',
      productionUnitId: 'unit-1',
    });
  });

  it('affiche un empty state quand aucune unite ne correspond', async () => {
    mockGetCycleDashboard.mockResolvedValue({
      cycle: {
        id: 'cycle-1',
        cycle_name: 'Cycle actif',
      },
      summary: {
        total_allocations: 0,
        total_estimated_current_fish_count: 900,
        total_mortality_count: 0,
        total_feed_consumed_kg: '0.00',
        estimated_current_biomass_kg: '9.00',
        units_with_sanitary_issue_count: 0,
        units_missing_today_log_count: 0,
        has_allocations: false,
        data_source: 'legacy_cycle',
      },
      allocations: [],
    });

    const { getByText } = render(<ProductionUnitsHubScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('cycleDashboardNoUnitsTitle')).toBeTruthy();
      expect(getByText('cycleDashboardNoUnitsDescription')).toBeTruthy();
      expect(getByText('cycleDashboardLegacyNotice')).toBeTruthy();
    });
  });

  it('affiche un message lisible en cas d erreur de chargement', async () => {
    mockGetCycleDashboard.mockRejectedValue(new Error('network error'));

    const { getByText } = render(<ProductionUnitsHubScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('cycleDashboardLoadError')).toBeTruthy();
    }, { timeout: 3000 });
  });
});
