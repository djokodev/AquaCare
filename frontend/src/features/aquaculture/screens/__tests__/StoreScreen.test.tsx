import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import StoreScreen from '../StoreScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
const mockGetCycleStore = jest.fn();
const mockDeclareCycleStoreManualStock = jest.fn();
const mockFetchCycleFeedStatus = jest.fn((cycleId: string) => ({
  type: 'aquaculture/fetchCycleFeedStatus',
  payload: cycleId,
}));
const mockT = (key: string) => key;
let mockState: any;
let mockRouteParams: { cycleId?: string };
const mockUseEffect = React.useEffect;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
  useRoute: () => ({
    params: mockRouteParams,
  }),
  useFocusEffect: (callback: () => void) => mockUseEffect(() => callback(), [callback]),
}));

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: any) => selector(mockState),
}));

jest.mock('@/features/aquaculture/store/aquacultureSlice', () => ({
  fetchCycleFeedStatus: (cycleId: string) => mockFetchCycleFeedStatus(cycleId),
}));

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getCycleStore: (...args: unknown[]) => mockGetCycleStore(...args),
    declareCycleStoreManualStock: (...args: unknown[]) => mockDeclareCycleStoreManualStock(...args),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockT,
    i18n: {
      language: 'fr',
    },
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('StoreScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = { cycleId: 'cycle-1' };
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockState = {
      aquaculture: {
        currentCycle: {
          id: 'cycle-1',
          cycle_name: 'Cycle Magasin',
        },
        cycleFeedStatus: {
          data: {
            cycle_id: 'cycle-1',
            total_bags_needed: 12,
            total_feed_needed_kg: 600,
            total_bags_ordered: 4,
            total_feed_ordered_kg: 200,
            total_bags_consumed: 2,
            total_feed_consumed_kg: 100,
            bags_remaining_to_order: 8,
            bags_consumed_equivalent: 2,
            feed_remaining_kg: 400,
            estimated_feed_remaining_kg: 400,
            feed_phase: null,
          },
          loading: false,
          error: null,
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
      expect(getByText('storeCurrentStock')).toBeTruthy();
      expect(getByText('8')).toBeTruthy();
      expect(getByText('storeEstimatedNeedToFinish')).toBeTruthy();
      expect(getByText('ORD-001')).toBeTruthy();
    });

    expect(mockFetchCycleFeedStatus).toHaveBeenCalledWith('cycle-1');

    fireEvent.press(getByText('storeViewProducts'));
    expect(mockNavigate).toHaveBeenCalledWith('ProductCatalog', {
      cycleId: 'cycle-1',
      source: 'store',
    });

    fireEvent.press(getByText('storeViewCart'));
    expect(mockNavigate).toHaveBeenCalledWith('Cart', {
      cycleId: 'cycle-1',
      source: 'store',
    });

    fireEvent.press(getByText('storeViewOrders'));
    expect(mockNavigate).toHaveBeenCalledWith('OrdersHistory', {
      cycleId: 'cycle-1',
      source: 'store',
    });

    fireEvent.press(getByText('storeOrderCycleNeed'));
    expect(mockNavigate).toHaveBeenCalledWith('CycleFeedPhases', {
      cycleId: 'cycle-1',
    });

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

  it('recommande un réapprovisionnement seulement avec un stock explicitement nul', async () => {
    mockGetCycleStore.mockResolvedValueOnce({
      cycle_id: 'cycle-1',
      summary: {
        manual_feed_kg: '0.00', received_order_feed_kg: '0.00', total_feed_added_kg: '0.00',
        feed_consumed_kg: '0.00', estimated_feed_remaining_kg: '0.00', feed_expenses_fcfa: '0.00',
        pending_orders_count: 0, pending_order_amount_fcfa: '0.00', pending_order_feed_kg: '0.00',
        stock_tracking_started_at: '2026-06-01',
      },
      status: 'low', pending_orders: [], stock_tracking_started_at: '2026-06-01',
    });
    const { getByText } = render(<StoreScreen />);
    await waitFor(() => expect(getByText('storeReplenishmentRequired')).toBeTruthy());
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

  it('affiche une validation lorsque le formulaire de stock est vide', async () => {
    const { getAllByText } = render(<StoreScreen />);

    await waitFor(() => expect(getAllByText('storeManualSubmit')).toHaveLength(1));
    fireEvent.press(getAllByText('storeManualSubmit')[0]);
    fireEvent.press(getAllByText('storeManualSubmit')[1]);

    expect(Alert.alert).toHaveBeenCalledWith('error', 'storeManualValidationError');
    expect(mockDeclareCycleStoreManualStock).not.toHaveBeenCalled();
  });

  it('empeche la double soumission du stock manuel', async () => {
    let resolveSubmission: (() => void) | undefined;
    mockDeclareCycleStoreManualStock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSubmission = resolve;
      })
    );
    const { getAllByText, getByPlaceholderText } = render(<StoreScreen />);

    await waitFor(() => expect(getAllByText('storeManualSubmit')).toHaveLength(1));
    fireEvent.press(getAllByText('storeManualSubmit')[0]);
    fireEvent.changeText(getByPlaceholderText('storeManualLabelPlaceholder'), 'Aliment starter');
    fireEvent.changeText(getByPlaceholderText('storeManualQuantityPlaceholder'), '50');
    fireEvent.changeText(getByPlaceholderText('storeManualTotalCostPlaceholder'), '75000');
    fireEvent.changeText(getByPlaceholderText('storeManualDatePlaceholder'), '2026-07-14');

    fireEvent.press(getAllByText('storeManualSubmit')[1]);
    fireEvent.press(getAllByText('storeManualSubmit')[1]);

    expect(mockDeclareCycleStoreManualStock).toHaveBeenCalledTimes(1);
    resolveSubmission?.();
  });

  it('conserve le magasin visible après une erreur de refresh', async () => {
    const { getByLabelText, getByText } = render(<StoreScreen />);

    await waitFor(() => expect(getByText('ORD-001')).toBeTruthy());
    mockGetCycleStore.mockRejectedValue(new Error('network refresh failed'));
    fireEvent.press(getByLabelText('refresh'));

    await waitFor(() => expect(getByText('network refresh failed')).toBeTruthy());
    expect(getByText('ORD-001')).toBeTruthy();
    expect(mockGetCycleStore).toHaveBeenCalledTimes(2);
    expect(mockFetchCycleFeedStatus).toHaveBeenCalledTimes(2);
  });

  it('permet un retry après une erreur initiale', async () => {
    mockGetCycleStore.mockRejectedValue(new Error('initial failure'));
    const { getByText } = render(<StoreScreen />);

    await waitFor(() => expect(getByText('initial failure')).toBeTruthy());
    mockGetCycleStore.mockResolvedValue({
      cycle_id: 'cycle-1',
      summary: { manual_feed_kg: '50', received_order_feed_kg: '20', total_feed_added_kg: '70', feed_consumed_kg: '10', estimated_feed_remaining_kg: '60', feed_expenses_fcfa: '105000', pending_orders_count: 1, pending_order_amount_fcfa: '30000', pending_order_feed_kg: '20', stock_tracking_started_at: null },
      status: 'ok',
      pending_orders: [],
      stock_tracking_started_at: null,
    });
    fireEvent.press(getByText('retry'));
    await waitFor(() => expect(getByText('storePendingOrdersEmptyTitle')).toBeTruthy());
  });

  it('affiche un état approprié sans cycle de session', async () => {
    mockRouteParams = {};
    mockState.aquaculture.currentCycle = null;
    const { getByText } = render(<StoreScreen />);

    await waitFor(() => expect(getByText('storeNoCycleSelected')).toBeTruthy());
    expect(mockGetCycleStore).not.toHaveBeenCalled();
  });
});
