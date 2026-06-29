import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import StoreScreen from '../StoreScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockGetCycleStore = jest.fn();
const mockDeclareCycleStoreManualStock = jest.fn();
let mockState: any;
const mockUseEffect = React.useEffect;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
  useRoute: () => ({
    params: {
      cycleId: 'cycle-1',
    },
  }),
  useFocusEffect: (callback: () => void) => mockUseEffect(() => callback(), [callback]),
}));

jest.mock('react-redux', () => ({
  useSelector: (selector: any) => selector(mockState),
}));

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getCycleStore: (...args: unknown[]) => mockGetCycleStore(...args),
    declareCycleStoreManualStock: (...args: unknown[]) => mockDeclareCycleStoreManualStock(...args),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: 'fr',
    },
  }),
}));

describe('StoreScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockState = {
      aquaculture: {
        currentCycle: {
          id: 'cycle-1',
          cycle_name: 'Cycle Magasin',
        },
      },
    };
    mockGetCycleStore.mockResolvedValue({
      cycle_id: 'cycle-1',
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
    mockDeclareCycleStoreManualStock.mockResolvedValue({
      cycle_id: 'cycle-1',
      summary: {
        manual_feed_kg: '75.00',
        received_order_feed_kg: '20.00',
        total_feed_added_kg: '95.00',
        feed_consumed_kg: '10.00',
        estimated_feed_remaining_kg: '85.00',
        feed_expenses_fcfa: '180000.00',
        pending_orders_count: 1,
        pending_order_amount_fcfa: '30000.00',
        pending_order_feed_kg: '20.00',
        stock_tracking_started_at: '2026-06-01',
      },
      status: 'ok',
      pending_orders: [],
      stock_tracking_started_at: '2026-06-01',
    });
  });

  it('affiche le stock du cycle et ouvre les actions du Magasin', async () => {
    const { getByText, getByPlaceholderText, getAllByText } = render(<StoreScreen />);

    await waitFor(() => {
      expect(getByText('storeTitle')).toBeTruthy();
      expect(getByText('storeFeedRemaining')).toBeTruthy();
      expect(getByText('ORD-001')).toBeTruthy();
    });

    fireEvent.press(getByText('storeViewProducts'));
    expect(mockNavigate).toHaveBeenCalledWith('ProductCatalog');

    fireEvent.press(getByText('storeViewCart'));
    expect(mockNavigate).toHaveBeenCalledWith('Cart');

    fireEvent.press(getByText('storeViewOrders'));
    expect(mockNavigate).toHaveBeenCalledWith('OrdersHistory');

    fireEvent.press(getByText('storeManualSubmit'));

    fireEvent.changeText(getByPlaceholderText('storeManualLabelPlaceholder'), 'Aliment starter 20kg');
    fireEvent.changeText(getByPlaceholderText('storeManualQuantityPlaceholder'), '75.00');
    fireEvent.changeText(getByPlaceholderText('storeManualTotalCostPlaceholder'), '90000.00');
    fireEvent.changeText(getByPlaceholderText('storeManualDatePlaceholder'), '2026-06-29');
    fireEvent.changeText(getByPlaceholderText('storeManualNotePlaceholder'), 'Premier dépôt');

    fireEvent.press(getAllByText('storeManualSubmit')[1]);

    await waitFor(() => {
      expect(mockDeclareCycleStoreManualStock).toHaveBeenCalledWith(
        'cycle-1',
        expect.objectContaining({
          label: 'Aliment starter 20kg',
          quantity_kg: '75.00',
          total_cost_fcfa: '90000.00',
          entry_date: '2026-06-29',
          note: 'Premier dépôt',
          created_offline: false,
        })
      );
    });
  });

  it('affiche un etat vide quand aucun stock n est encore declare', async () => {
    mockGetCycleStore.mockResolvedValue({
      cycle_id: 'cycle-1',
      summary: {
        manual_feed_kg: '0.00',
        received_order_feed_kg: '0.00',
        total_feed_added_kg: '0.00',
        feed_consumed_kg: '0.00',
        estimated_feed_remaining_kg: '0.00',
        feed_expenses_fcfa: '0.00',
        pending_orders_count: 0,
        pending_order_amount_fcfa: '0.00',
        pending_order_feed_kg: '0.00',
        stock_tracking_started_at: null,
      },
      status: 'not_started',
      pending_orders: [],
      stock_tracking_started_at: null,
    });

    const { getByText } = render(<StoreScreen />);

    await waitFor(() => {
      expect(getByText('storePendingOrdersEmptyTitle')).toBeTruthy();
      expect(getByText('storePendingOrdersEmptyDescription')).toBeTruthy();
    });
  });
});
