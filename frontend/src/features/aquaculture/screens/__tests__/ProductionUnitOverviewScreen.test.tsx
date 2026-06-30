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
    setOptions: jest.fn(),
  } as any;

  const route = {
    params: {
      cycleId: 'cycle-1',
      allocationId: 'allocation-1',
      productionUnitId: 'unit-1',
    },
  } as any;

  const routeWithoutAllocation = {
    params: {
      cycleId: 'cycle-1',
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

    const { getByText, getAllByText, queryByText } = render(
      <ProductionUnitOverviewScreen navigation={navigation} route={route} />
    );

    await waitFor(() => {
      expect(navigation.setOptions).toHaveBeenCalledWith({ title: 'Bac 1' });
      expect(getByText('currentFish')).toBeTruthy();
      expect(getByText('productionUnitCumulativeMortality')).toBeTruthy();
      expect(getByText('productionUnitConsumedFeed')).toBeTruthy();
      expect(getByText('productionUnitEstimatedBiomass')).toBeTruthy();
      expect(getByText('productionUnitDashboardTitle')).toBeTruthy();
      expect(getByText('dailyLog')).toBeTruthy();
      expect(getByText('sanitaryLog')).toBeTruthy();
      expect(getByText('productionUnitLogHistoryAction')).toBeTruthy();
      expect(queryByText('notifications')).toBeNull();
      expect(queryByText('feedingPlan')).toBeNull();
      expect(queryByText('reports')).toBeNull();
      expect(getByText('viewAllActions')).toBeTruthy();
      expect(queryByText('Bac 1')).toBeNull();
      expect(queryByText('Cycle Silure')).toBeNull();
      expect(queryByText('productionUnitTodayLogDone')).toBeNull();
      expect(queryByText('productionUnitActiveHealthIssue')).toBeNull();
      expect(queryByText('productionUnitRecentActivity')).toBeNull();
    });

    fireEvent.press(getByText('dailyLog'));
    expect(navigation.navigate).toHaveBeenCalledWith('DailyLog', {
      cycleId: 'cycle-1',
      cycleUnitAllocationId: 'allocation-1',
      productionUnitId: 'unit-1',
      productionUnitName: 'Bac 1',
    });

    fireEvent.press(getByText('viewAllActions'));

    await waitFor(() => {
      expect(getByText('productionUnitSanitaryLogAction')).toBeTruthy();
      expect(getAllByText('productionUnitLogHistoryAction').length).toBeGreaterThanOrEqual(2);
      expect(queryByText('notifications')).toBeNull();
      expect(queryByText('feedingPlan')).toBeNull();
      expect(queryByText('reports')).toBeNull();
      expect(queryByText('categoryCommerce')).toBeNull();
      expect(queryByText('productCatalog')).toBeNull();
      expect(queryByText('cart')).toBeNull();
      expect(queryByText('ordersHistory')).toBeNull();
    });

    fireEvent.press(getByText('productionUnitSanitaryLogAction'));

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('SanitaryLog', {
        cycleId: 'cycle-1',
        cycleUnitAllocationId: 'allocation-1',
        productionUnitId: 'unit-1',
        productionUnitName: 'Bac 1',
      });
    });
  });

  it('affiche un loading initial avant le dashboard unitaire', async () => {
    let resolveDashboard: (value: unknown) => void = () => undefined;
    mockGetProductionUnitDashboard.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDashboard = resolve;
      }) as never
    );

    const { getByText, queryByText } = render(
      <ProductionUnitOverviewScreen navigation={navigation} route={route} />
    );

    expect(getByText('productionUnitDashboardLoading')).toBeTruthy();

    resolveDashboard({
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
        estimated_current_fish_count: 900,
        total_mortality_count: 0,
        mortality_rate_pct: '0.00',
        total_feed_consumed_kg: '0.00',
        latest_average_weight_g: null,
        estimated_current_biomass_kg: '9.00',
        last_daily_log_date: null,
        days_since_last_log: null,
        has_today_daily_log: false,
        active_sanitary_issues_count: 0,
        last_sanitary_event_date: null,
        has_unresolved_sanitary_issue: false,
      },
      recent_daily_logs: [],
      recent_sanitary_logs: [],
    });

    await waitFor(() => {
      expect(navigation.setOptions).toHaveBeenCalledWith({ title: 'Bac 1' });
      expect(getByText('currentFish')).toBeTruthy();
      expect(getByText('productionUnitDashboardTitle')).toBeTruthy();
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

  it('n appelle pas le dashboard si le contexte unitaire est incomplet', async () => {
    const { getByText, queryByText } = render(
      <ProductionUnitOverviewScreen navigation={navigation} route={routeWithoutAllocation} />
    );

    await waitFor(() => {
      expect(getByText('productionUnitContextIncompleteError')).toBeTruthy();
      expect(queryByText('retry')).toBeNull();
      expect(queryByText('viewAllActions')).toBeNull();
    });

    expect(mockGetProductionUnitDashboard).not.toHaveBeenCalled();
  });
});
