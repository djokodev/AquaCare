import React from 'react';
import { Alert, RefreshControl } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import OrdersHistoryScreen from '../OrdersHistoryScreen';
import type { Order } from '@/types/commerce';
import { dashboardSyncService } from '@/services/dashboardSyncService';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
const mockConfirmOrderReceipt = jest.fn((id: string) => ({ type: 'confirmOrderReceipt', payload: id }));
let mockRouteParams: { cycleId?: string } | undefined;
let mockState: {
  commerce: {
    orders: {
      items: Order[];
      statistics: { total_orders: number; total_spent: string; total_bags_ordered: number; average_order_value: string } | null;
      contextCycleId: string | null;
      loading: boolean;
      error: string | null;
    };
  };
  aquaculture: {
    currentCycle?: { id: string; cycle_name: string };
  };
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

jest.mock('@/features/commerce/store/commerceSlice', () => ({
  fetchOrders: jest.fn((payload) => ({ type: 'fetchOrders', payload })),
  fetchOrderStatistics: jest.fn((payload) => ({ type: 'fetchOrderStatistics', payload })),
  clearOrderContext: jest.fn(() => ({ type: 'clearOrderContext' })),
  confirmOrderReceipt: (id: string) => mockConfirmOrderReceipt(id),
}));

jest.mock('@/services/dashboardSyncService', () => ({
  dashboardSyncService: {
    get: jest.fn().mockResolvedValue(null),
    markSuccessful: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  },
}));

const createOrder = (status: Order['status'] = 'confirmed'): Order => ({
  id: `order-${status}`,
  order_number: `ORD-${status}`,
  status,
  delivery_method: status === 'delivered' ? 'home' : 'pickup',
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
    mockRouteParams = { cycleId: 'cycle-a' };
    mockState = {
      commerce: {
        orders: {
          items: [createOrder()],
          statistics: { total_orders: 1, total_spent: '30000', total_bags_ordered: 1, average_order_value: '30000' },
          contextCycleId: 'cycle-a',
          loading: false,
          error: null,
        },
      },
      aquaculture: {
        currentCycle: { id: 'cycle-a', cycle_name: 'Cycle A' },
      },
    };
    mockDispatch.mockImplementation((action: { type?: string }) => {
      if (action.type === 'confirmOrderReceipt') return { unwrap: jest.fn().mockResolvedValue(createOrder('received')) };
      if (action.type === 'fetchOrders') return { unwrap: jest.fn().mockResolvedValue(mockState.commerce.orders.items) };
      if (action.type === 'fetchOrderStatistics') return { unwrap: jest.fn().mockResolvedValue(mockState.commerce.orders.statistics) };
      return { unwrap: jest.fn().mockResolvedValue({}) };
    });
  });

  it('ne lance aucune requête globale sans cycle', () => {
    mockRouteParams = undefined;
    mockState.aquaculture.currentCycle = undefined;
    const { getByText } = render(<OrdersHistoryScreen />);

    expect(getByText('noCycleSelected')).toBeTruthy();
    expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'fetchOrders' }));
    expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'fetchOrderStatistics' }));
  });

  it('masque immédiatement le cycle précédent et charge le nouveau cycle', async () => {
    const screen = render(<OrdersHistoryScreen />);
    expect(screen.getByText('ORD-confirmed')).toBeTruthy();

    mockRouteParams = { cycleId: 'cycle-b' };
    mockState.aquaculture.currentCycle = { id: 'cycle-b', cycle_name: 'Cycle B' };
    mockDispatch.mockImplementation((action: { type?: string; payload?: { productionCycleId?: string } }) => {
      if (action.type === 'fetchOrders' && action.payload?.productionCycleId === 'cycle-b') {
        return { unwrap: jest.fn().mockResolvedValue([]) };
      }
      if (action.type === 'fetchOrderStatistics' && action.payload?.productionCycleId === 'cycle-b') {
        return {
          unwrap: jest.fn().mockResolvedValue({
            total_orders: 0,
            total_spent: '0',
            total_bags_ordered: 0,
            average_order_value: '0',
          }),
        };
      }
      return { unwrap: jest.fn().mockResolvedValue({}) };
    });
    screen.rerender(<OrdersHistoryScreen />);

    await waitFor(() => expect(screen.queryByText('ORD-confirmed')).toBeNull());
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'fetchOrders',
      payload: { productionCycleId: 'cycle-b' },
    });
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'fetchOrderStatistics',
      payload: { productionCycleId: 'cycle-b' },
    });
  });

  it('affiche statistiques, statuts et aucune action PDF', () => {
    mockState.commerce.orders.items = [createOrder('confirmed'), createOrder('delivered'), createOrder('received')];
    const { getByText, queryByText } = render(<OrdersHistoryScreen />);

    expect(getByText('orderStatistics')).toBeTruthy();
    expect(getByText('orderStatusConfirmed')).toBeTruthy();
    expect(getByText('orderStatusDeliveredHome')).toBeTruthy();
    expect(getByText('orderStatusPickupConfirmed')).toBeTruthy();
    expect(queryByText(/pdf|download|télécharger/i)).toBeNull();
  });

  it('annonce les etats expanded et collapsed et affiche le point de retrait', () => {
    const { getByLabelText, getByText } = render(<OrdersHistoryScreen />);
    expect(getByLabelText('details').props.accessibilityState.expanded).toBe(false);

    fireEvent.press(getByLabelText('details'));

    expect(getByLabelText('collapseActions').props.accessibilityState.expanded).toBe(true);
    expect(getByText('pickupLocationPrefix Ndokoti')).toBeTruthy();
  });

  it('affiche le chargement initial et permet de relancer', () => {
    mockState.commerce.orders.items = [];
    mockState.commerce.orders.statistics = null;
    mockState.commerce.orders.loading = true;
    const loading = render(<OrdersHistoryScreen />);
    expect(loading.getByText('loading')).toBeTruthy();
    loading.unmount();

    expect(mockDispatch).toHaveBeenCalled();
  });

  it('conserve les commandes et statistiques pendant un refresh', async () => {
    const { getByText, UNSAFE_getByType } = render(<OrdersHistoryScreen />);

    expect(getByText('ORD-confirmed')).toBeTruthy();
    await UNSAFE_getByType(RefreshControl).props.onRefresh();
    expect(getByText('orderStatistics')).toBeTruthy();
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('confirme une reception et bloque le double clic', async () => {
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

    expect(Alert.alert).toHaveBeenCalledWith('success', 'confirmReceiptSuccess');
  });

  it('confirme un retrait uniquement quand la commande est prête', async () => {
    mockState.commerce.orders.items = [createOrder('ready_for_pickup')];
    let confirmAction: (() => Promise<void>) | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons) => {
      if (title === 'confirmPickupTitle') confirmAction = buttons?.[1]?.onPress as () => Promise<void>;
    });
    const { getByText, queryByText } = render(<OrdersHistoryScreen />);

    expect(getByText('confirmPickupAction')).toBeTruthy();
    expect(queryByText('confirmReceiptAction')).toBeNull();
    fireEvent.press(getByText('confirmPickupAction'));
    await confirmAction?.();

    await waitFor(() => expect(mockConfirmOrderReceipt).toHaveBeenCalledTimes(1));
    expect(Alert.alert).toHaveBeenCalledWith('success', 'confirmPickupSuccess');
  });

  it('ignore un chargement composite obsolète et son timestamp', async () => {
    const resolvers: Record<string, Array<(value: unknown) => void>> = {
      fetchOrders: [],
      fetchOrderStatistics: [],
    };
    mockDispatch.mockImplementation((action: { type: 'fetchOrders' | 'fetchOrderStatistics' }) => ({
      unwrap: () => new Promise((resolve) => resolvers[action.type].push(resolve)),
    }));
    const { getByText, queryByText, UNSAFE_getByType } = render(<OrdersHistoryScreen />);
    const refreshPromise = UNSAFE_getByType(RefreshControl).props.onRefresh();
    const newestOrder = { ...createOrder(), id: 'new-order', order_number: 'ORD-new' };
    resolvers.fetchOrders[1]([newestOrder]);
    resolvers.fetchOrderStatistics[1]({ total_orders: 1, total_spent: '45000', total_bags_ordered: 2, average_order_value: '45000' });
    await refreshPromise;
    await waitFor(() => expect(getByText('ORD-new')).toBeTruthy());

    resolvers.fetchOrders[0]([{ ...createOrder(), id: 'old-order', order_number: 'ORD-old' }]);
    resolvers.fetchOrderStatistics[0]({ total_orders: 1, total_spent: '10000', total_bags_ordered: 1, average_order_value: '10000' });
    await waitFor(() => expect(queryByText('ORD-old')).toBeNull());
    expect(dashboardSyncService.markSuccessful).toHaveBeenCalledTimes(1);
  });

  it('conserve les anciennes données après une erreur de refresh', async () => {
    const { getByText, UNSAFE_getByType } = render(<OrdersHistoryScreen />);
    await waitFor(() => expect(getByText('ORD-confirmed')).toBeTruthy());
    mockDispatch.mockImplementation(() => ({ unwrap: jest.fn().mockRejectedValue(new Error('network')) }));

    await UNSAFE_getByType(RefreshControl).props.onRefresh();

    expect(getByText('ORD-confirmed')).toBeTruthy();
    expect(getByText('orderStatistics')).toBeTruthy();
    await waitFor(() => expect(getByText('ordersDashboardLoadError')).toBeTruthy());
  });
});
