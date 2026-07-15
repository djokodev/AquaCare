import React from 'react';
import { Alert, RefreshControl } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import OrdersHistoryScreen from '../OrdersHistoryScreen';
import type { Order } from '@/types/commerce';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
const mockConfirmOrderReceipt = jest.fn((id: string) => ({ type: 'confirmOrderReceipt', payload: id }));
let mockState: {
  commerce: {
    orders: {
      items: Order[];
      statistics: { total_orders: number; total_spent: string; total_bags_ordered: number; average_order_value: string } | null;
      loading: boolean;
      error: string | null;
    };
  };
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
}));

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

jest.mock('@/features/commerce/store/commerceSlice', () => ({
  fetchOrders: jest.fn(() => ({ type: 'fetchOrders' })),
  fetchOrderStatistics: jest.fn(() => ({ type: 'fetchOrderStatistics' })),
  confirmOrderReceipt: (id: string) => mockConfirmOrderReceipt(id),
}));

const createOrder = (status: Order['status'] = 'confirmed'): Order => ({
  id: `order-${status}`,
  order_number: `ORD-${status}`,
  status,
  delivery_method: 'pickup',
  pickup_location: 'ndokoti',
  subtotal: '30000',
  delivery_fee: '0',
  total: '30000',
  total_bags: 1,
  is_free_delivery: false,
  items: [{
    id: 'item-1', product: 'p1', product_name: 'Feed', product_brand: 'dibaq',
    product_package_weight: 20, unit_price: '30000', quantity: 1, line_total: '30000',
  }],
  delivery_name: 'Test User',
  delivery_phone: '+237600000000',
  delivery_region: 'Littoral',
  delivery_city: 'Douala',
  delivery_full_address: 'Bonamoussadi',
  user: 'u1', user_name: 'Test User', farm_profile: 'f1', farm_name: 'Farm',
  created_offline: false,
  created_at: '2026-02-20T10:00:00.000Z',
  updated_at: '2026-02-20T10:00:00.000Z',
});

describe('OrdersHistoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockImplementation((action: { type?: string }) => action.type === 'confirmOrderReceipt'
      ? { unwrap: jest.fn().mockResolvedValue(createOrder('received')) }
      : { unwrap: jest.fn().mockResolvedValue({}) });
    mockState = {
      commerce: {
        orders: {
          items: [createOrder()],
          statistics: { total_orders: 1, total_spent: '30000', total_bags_ordered: 1, average_order_value: '30000' },
          loading: false,
          error: null,
        },
      },
    };
  });

  it('affiche statistiques, statuts et aucune action PDF', () => {
    mockState.commerce.orders.items = [createOrder('confirmed'), createOrder('delivered'), createOrder('received')];
    const { getByText, queryByText } = render(<OrdersHistoryScreen />);

    expect(getByText('orderStatistics')).toBeTruthy();
    expect(getByText('orderStatusConfirmed')).toBeTruthy();
    expect(getByText('orderStatusDelivered')).toBeTruthy();
    expect(getByText('orderStatusReceived')).toBeTruthy();
    expect(queryByText(/pdf|download|télécharger/i)).toBeNull();
  });

  it('annonce les etats expanded et collapsed et affiche le point de retrait', () => {
    const { getByLabelText, getByText } = render(<OrdersHistoryScreen />);
    expect(getByLabelText('details').props.accessibilityState.expanded).toBe(false);

    fireEvent.press(getByLabelText('details'));

    expect(getByLabelText('collapseActions').props.accessibilityState.expanded).toBe(true);
    expect(getByText('pickupLocationPrefix Ndokoti')).toBeTruthy();
  });

  it('affiche loading, empty et erreur initiale avec retry', () => {
    mockState.commerce.orders.items = [];
    mockState.commerce.orders.statistics = null;
    mockState.commerce.orders.loading = true;
    const loading = render(<OrdersHistoryScreen />);
    expect(loading.getByText('loading')).toBeTruthy();
    loading.unmount();

    mockState.commerce.orders.loading = false;
    const empty = render(<OrdersHistoryScreen />);
    expect(empty.getByText('noOrdersYet')).toBeTruthy();
    empty.unmount();

    mockState.commerce.orders.error = 'orders failed';
    const failed = render(<OrdersHistoryScreen />);
    fireEvent.press(failed.getByText('retry'));
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('conserve les commandes et statistiques sur erreur de refresh', async () => {
    mockState.commerce.orders.error = 'refresh failed';
    const { getByText, UNSAFE_getByType } = render(<OrdersHistoryScreen />);

    expect(getByText('ORD-confirmed')).toBeTruthy();
    expect(getByText('refresh failed')).toBeTruthy();
    expect(getByText('orderStatistics')).toBeTruthy();
    await UNSAFE_getByType(RefreshControl).props.onRefresh();
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('confirme une reception, bloque le double clic et gere une erreur', async () => {
    mockState.commerce.orders.items = [createOrder('delivered')];
    let confirmAction: (() => Promise<void>) | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons) => {
      if (title === 'confirmReceiptTitle') confirmAction = buttons?.[1]?.onPress as () => Promise<void>;
    });
    const { getByText } = render(<OrdersHistoryScreen />);
    fireEvent.press(getByText('confirmReceiptAction'));
    void confirmAction?.();
    void confirmAction?.();
    await waitFor(() => expect(mockConfirmOrderReceipt).toHaveBeenCalledTimes(1));

    mockDispatch.mockImplementation((action: { type?: string }) => action.type === 'confirmOrderReceipt'
      ? { unwrap: jest.fn().mockRejectedValue(new Error('failed')) }
      : { unwrap: jest.fn().mockResolvedValue({}) });
    fireEvent.press(getByText('confirmReceiptAction'));
    await confirmAction?.();
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('error', 'confirmReceiptError'));
  });
});
