import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ProductionUnitOverviewScreen from '../ProductionUnitOverviewScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getProductionUnitDashboard: jest.fn(),
  },
}));

describe('features/aquaculture/screens/ProductionUnitOverviewScreen', () => {
  const mockGetProductionUnitDashboard = aquacultureService.getProductionUnitDashboard as jest.Mock;
  const navigation = {
    navigate: jest.fn(),
  } as any;

  const route = {
    params: {
      cycleId: 'cycle-1',
      allocationId: 'allocation-1',
      productionUnitId: 'unit-1',
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('affiche les indicateurs, le statut et navigue avec le contexte unitaire', async () => {
    mockGetProductionUnitDashboard.mockResolvedValue({
      allocation: {
        id: 'allocation-1',
        cycle: 'cycle-1',
        cycle_name: 'Cycle Silure',
        production_unit: 'unit-1',
        production_unit_name: 'Bac 1',
        production_unit_type: 'tank',
        production_unit_display_dimension: '3 m³',
      },
      summary: {
        estimated_current_fish_count: 892,
        total_mortality_count: 8,
        mortality_rate_pct: '0.89',
        total_feed_consumed_kg: '6.50',
        latest_average_weight_g: '20.00',
        estimated_current_biomass_kg: '17.84',
        last_daily_log_date: '2026-06-28',
        days_since_last_log: 0,
        has_today_daily_log: true,
        active_sanitary_issues_count: 1,
        last_sanitary_event_date: '2026-06-27',
        has_unresolved_sanitary_issue: true,
      },
      recent_daily_logs: [
        {
          id: 'log-1',
          cycle: 'cycle-1',
          cycle_unit_allocation: 'allocation-1',
          log_date: '2026-06-28',
          mortality_count: 5,
          feed_quantity: 4,
          average_weight: 20,
          created_offline: false,
          created_at: '2026-06-28T08:00:00Z',
        },
      ],
      recent_sanitary_logs: [
        {
          id: 'sanitary-1',
          cycle: 'cycle-1',
          cycle_unit_allocation: 'allocation-1',
          event_date: '2026-06-27',
          event_type: 'disease',
          event_type_display: 'Disease',
          symptoms: 'White spots observed',
          resolved: false,
          created_offline: false,
          created_at: '2026-06-27T08:00:00Z',
        },
      ],
    });

    const { getByText, getAllByText } = render(
      <ProductionUnitOverviewScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(getByText('productionUnitDashboardTitle')).toBeTruthy();
      expect(getByText('productionUnitEstimatedFish')).toBeTruthy();
      expect(getByText('productionUnitCumulativeMortality')).toBeTruthy();
      expect(getByText('productionUnitConsumedFeed')).toBeTruthy();
      expect(getByText('productionUnitEstimatedBiomass')).toBeTruthy();
      expect(getByText('productionUnitTrackingSectionTitle')).toBeTruthy();
      expect(getByText('productionUnitTodayLogDone')).toBeTruthy();
      expect(getAllByText('productionUnitActiveHealthIssue').length).toBeGreaterThan(0);
      expect(getByText('productionUnitRecentActivity')).toBeTruthy();
      expect(getByText('Bac 1')).toBeTruthy();
      expect(getByText('Cycle Silure')).toBeTruthy();
    });

    fireEvent.press(getByText('productionUnitDailyLogAction'));
    expect(navigation.navigate).toHaveBeenCalledWith('DailyLog', {
      cycleId: 'cycle-1',
      cycleUnitAllocationId: 'allocation-1',
      productionUnitId: 'unit-1',
      productionUnitName: 'Bac 1',
    });

    fireEvent.press(getByText('productionUnitSanitaryLogAction'));
    expect(navigation.navigate).toHaveBeenCalledWith('SanitaryLog', {
      cycleId: 'cycle-1',
      cycleUnitAllocationId: 'allocation-1',
      productionUnitId: 'unit-1',
      productionUnitName: 'Bac 1',
    });

    fireEvent.press(getByText('productionUnitLogHistoryAction'));
    expect(navigation.navigate).toHaveBeenCalledWith('DailyLogHistory', {
      cycleId: 'cycle-1',
      cycleUnitAllocationId: 'allocation-1',
      productionUnitId: 'unit-1',
      productionUnitName: 'Bac 1',
    });
  });

  it('affiche un message d erreur et permet de relancer le chargement', async () => {
    mockGetProductionUnitDashboard.mockRejectedValue(new Error('network error'));

    const { getByText } = render(<ProductionUnitOverviewScreen navigation={navigation} route={route} />);

    await waitFor(() => {
      expect(getByText('productionUnitDashboardLoadError')).toBeTruthy();
      expect(getByText('retry')).toBeTruthy();
    });

    fireEvent.press(getByText('retry'));
    expect(mockGetProductionUnitDashboard).toHaveBeenCalledTimes(2);
  });
});
