import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useDispatch, useSelector } from 'react-redux';

import DashboardScreen from '../DashboardScreen';
import { ProductionCycle } from '@/types/aquaculture';
import { setCurrentCycle } from '@/features/aquaculture/store/aquacultureSlice';
import { offlineService } from '@/services/offlineService';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'cycleDashboardTitle') {
        return 'Dashboard du cycle';
      }
      if (key === 'productionUnitsCount') {
        return `${options?.count} unités`;
      }
      return key;
    },
    i18n: {
      language: 'fr',
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getCycleDashboard: jest.fn(),
    getCycleStore: jest.fn(),
  },
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    displayName: 'Jean Test',
  }),
}));

jest.mock('@/services/offlineService', () => ({
  offlineService: {
    hasAnyPendingSync: jest.fn(),
    syncAllOfflineData: jest.fn(),
  },
}));

jest.mock('@/features/main/components/DashboardHeader', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/components/modals/HarvestModal', () => ({
  __esModule: true,
  default: () => null,
}));

describe('features/main/screens/DashboardScreen', () => {
  const mockDispatch = jest.fn();
  const mockUseSelector = useSelector as unknown as jest.Mock;
  const mockOffline = offlineService as jest.Mocked<typeof offlineService>;
  const mockGetCycleDashboard = aquacultureService.getCycleDashboard as jest.Mock;
  const mockGetCycleStore = aquacultureService.getCycleStore as jest.Mock;
  const navigation = {
    navigate: jest.fn(),
  } as any;

  const cycleA: ProductionCycle = {
    id: 'cycle-a',
    farm_profile: 'farm-1',
    cycle_name: 'Cycle A',
    species: 'tilapia',
    pond_identifier: 'P1',
    pond_surface_m2: 100,
    start_date: '2026-01-01',
    initial_count: 1000,
    initial_average_weight: 10,
    initial_biomass: 10,
    current_count: 900,
    current_average_weight: 120,
    current_biomass: 108,
    total_feed_consumed: 120,
    survival_rate: 88,
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  const cycleB: ProductionCycle = {
    ...cycleA,
    id: 'cycle-b',
    cycle_name: 'Cycle B',
    pond_identifier: 'P2',
  };

  const cycleWithUnits: ProductionCycle = {
    ...cycleA,
    id: 'cycle-unit',
    cycle_name: 'Cycle Unit',
    pond_identifier: 'Bac 1',
    infrastructure_type: ['tank', 'pond'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockImplementation(() => ({ unwrap: jest.fn().mockResolvedValue({}) }));
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    mockOffline.hasAnyPendingSync.mockResolvedValue(false);
    mockOffline.syncAllOfflineData.mockResolvedValue({ success: 0, failed: 0, details: {} as any });
    mockGetCycleDashboard.mockResolvedValue({
      summary: {
        total_allocations: 3,
      },
    });
    mockGetCycleStore.mockResolvedValue({
      cycle_id: 'cycle-a',
      summary: {
        manual_feed_kg: '50.00',
        received_order_feed_kg: '20.00',
        total_feed_added_kg: '70.00',
        feed_consumed_kg: '10.00',
        estimated_feed_remaining_kg: '60.00',
        feed_expenses_fcfa: '105000.00',
        pending_orders_count: 1,
        pending_order_amount_fcfa: '30000.00',
        pending_order_feed_kg: '20.00',
        stock_tracking_started_at: '2026-06-01',
      },
      status: 'ok',
      pending_orders: [
        {
          id: 'order-1',
          order_number: 'ORD-001',
          status: 'confirmed',
          delivery_method: 'pickup',
          total_bags: 1,
          total_fcfa: '30000.00',
          estimated_feed_kg: '20.00',
          created_at: '2026-06-10T08:00:00.000Z',
        },
      ],
      stock_tracking_started_at: '2026-06-01',
    });

    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          dashboardData: {
            active_cycles_count: 2,
            total_biomass: 216,
            total_fish_count: 1800,
            average_fcr: 1.8,
            average_survival_rate: 88,
            active_cycles: [cycleA, cycleB],
            recent_logs: [],
            current_feeding_plans: [],
            pending_notifications: [],
          },
          loading: {
            dashboard: false,
            cycles: false,
            logs: false,
            sync: false,
          },
          error: null,
          currentCycle: cycleA,
        },
        notifications: {
          unreadCount: 0,
        },
        commerce: {
          orders: {
            items: [],
            statistics: null,
            loading: false,
            error: null,
          },
        },
      })
    );
  });

  it('permet de changer le cycle de session depuis le dashboard', async () => {
    const { getByText, getAllByText } = render(<DashboardScreen navigation={navigation} />);

    expect(getByText('Dashboard du cycle')).toBeTruthy();
    expect(getByText('dashboardEstimatedMarketValue')).toBeTruthy();
    expect(getByText('dashboardFeedCostConsumed')).toBeTruthy();
    expect(getByText('dashboardTimeRemainingCycle')).toBeTruthy();
    expect(getByText('dashboardDirectProductionCost')).toBeTruthy();
    await waitFor(() => {
      expect(getByText('storeTitle')).toBeTruthy();
      expect(getByText('storeFeedRemaining')).toBeTruthy();
    });

    fireEvent.press(getByText('storeOpen'));
    expect(navigation.navigate).toHaveBeenCalledWith('Store', { cycleId: cycleA.id });

    fireEvent.press(getByText('changeSessionCycle'));
    fireEvent.press(getAllByText('Cycle B').pop() as any);
    fireEvent.press(getByText('sessionCycleConfirm'));

    await waitFor(() => {
      expect(mockDispatch).toHaveBeenCalledWith(setCurrentCycle(cycleB));
    });
  });

  it('affiche un CTA vers les unites en production pour le cycle actif', async () => {
    const { getByText } = render(<DashboardScreen navigation={navigation} />);

    expect(getByText('productionUnitsDashboardCta')).toBeTruthy();

    fireEvent.press(getByText('productionUnitsDashboardCta'));

    expect(navigation.navigate).toHaveBeenCalledWith('ProductionUnitsHub', {
      cycleId: cycleA.id,
    });
  });

  it('masque les actions operationnelles pour un cycle avec unites', async () => {
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          dashboardData: {
            active_cycles_count: 1,
            total_biomass: 450,
            total_fish_count: 2700,
            average_fcr: 1.8,
            average_survival_rate: 88,
            active_cycles: [cycleWithUnits],
            recent_logs: [],
            current_feeding_plans: [],
            pending_notifications: [],
          },
          loading: {
            dashboard: false,
            cycles: false,
            logs: false,
            sync: false,
          },
          error: null,
          currentCycle: cycleWithUnits,
        },
        notifications: {
          unreadCount: 0,
        },
        commerce: {
          orders: {
            items: [],
            statistics: null,
            loading: false,
            error: null,
          },
        },
      })
    );

    const { getByText, queryByText } = render(<DashboardScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText('Dashboard du cycle')).toBeTruthy();
      expect(getByText('dashboardEstimatedMarketValue')).toBeTruthy();
      expect(getByText('dashboardDirectProductionCost')).toBeTruthy();
      expect(getByText('dashboardEstimatedCurrentFish')).toBeTruthy();
      expect(getByText('dashboardTimeRemainingCycle')).toBeTruthy();
      expect(getByText('productionUnitsDashboardCta')).toBeTruthy();
      expect(getByText('storeTitle')).toBeTruthy();
      expect(getByText(/3 unités/)).toBeTruthy();
      expect(queryByText('viewAllActions')).toBeNull();
      expect(queryByText('dailyLog')).toBeNull();
      expect(queryByText('productCatalog')).toBeNull();
      expect(queryByText('harvest')).toBeNull();
      expect(queryByText('Bac 1')).toBeNull();
    });

    expect(mockGetCycleDashboard).toHaveBeenCalledWith('cycle-unit');
  });

  it('rafraichit le Magasin apres confirmation de reception', async () => {
    const confirmOrder = {
      id: 'order-delivered-1',
      order_number: 'ORD-DEL-001',
      status: 'delivered',
      total: '30000.00',
      created_at: '2026-06-29T08:00:00.000Z',
    };

    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          dashboardData: {
            active_cycles_count: 1,
            total_biomass: 216,
            total_fish_count: 1800,
            average_fcr: 1.8,
            average_survival_rate: 88,
            active_cycles: [cycleA],
            recent_logs: [],
            current_feeding_plans: [],
            pending_notifications: [],
          },
          loading: {
            dashboard: false,
            cycles: false,
            logs: false,
            sync: false,
          },
          error: null,
          currentCycle: cycleA,
        },
        notifications: {
          unreadCount: 0,
        },
        commerce: {
          orders: {
            items: [confirmOrder],
            statistics: null,
            loading: false,
            error: null,
          },
        },
      })
    );

    jest.spyOn(Alert, 'alert').mockImplementation((title: any, _message?: any, buttons?: any) => {
      if (title === 'confirmReceiptTitle') {
        buttons?.[1]?.onPress?.();
      }
    });

    const { getByText } = render(<DashboardScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText('confirmReceiptAction')).toBeTruthy();
    });

    fireEvent.press(getByText('confirmReceiptAction'));

    await waitFor(() => {
      expect(mockGetCycleStore).toHaveBeenCalledTimes(2);
    });
  });
});
