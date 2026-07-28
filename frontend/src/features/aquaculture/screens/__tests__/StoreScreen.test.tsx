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
const mockCreateFarmFeedReference = jest.fn();
const mockConfirmOrderReceipt = jest.fn();
const mockGetProducts = jest.fn();
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

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getCycleStore: (...args: unknown[]) => mockGetCycleStore(...args),
    declareCycleStoreManualStock: (...args: unknown[]) => mockDeclareCycleStoreManualStock(...args),
    createFarmFeedReference: (...args: unknown[]) => mockCreateFarmFeedReference(...args),
    getFarmFeedReferences: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/features/commerce/services/commerceApi', () => ({
  __esModule: true,
  default: {
    confirmOrderReceipt: (...args: unknown[]) => mockConfirmOrderReceipt(...args),
    getProducts: (...args: unknown[]) => mockGetProducts(...args),
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
          farm_profile: 'farm-1',
          species: 'tilapia',
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
    mockDispatch.mockImplementation(() => ({
      unwrap: jest.fn().mockResolvedValue(mockState.aquaculture.cycleFeedStatus.data),
    }));
    mockGetCycleStore.mockResolvedValue({
      cycle_id: 'cycle-1',
      calculation_status: 'available',
      calculation_source: 'current_cycle_reforecast:cycle_current_weight',
      calculated_at: '2026-07-20T00:00:00Z',
      calculation_warnings: [],
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
        total_feed_needed_kg: '600.00',
        feed_need_remaining_kg: '590.00',
        secured_feed_kg: '80.00',
        feed_to_secure_kg: '510.00',
        stock_tracking_started_at: '2026-06-01',
        unclassified_stock_kg: '0.00',
      },
      stock_items: [{ label: 'Aliment starter 20kg', feed_size_mm: '2.00', quantity_added_kg: '70.00', quantity_consumed_kg: '10.00', quantity_available_kg: '60.00' }],
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
      unclassified_entries: [],
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
        total_feed_needed_kg: '600.00',
        feed_need_remaining_kg: '590.00',
        secured_feed_kg: '105.00',
        feed_to_secure_kg: '485.00',
        stock_tracking_started_at: '2026-06-01',
      },
      stock_items: [{ label: 'Aliment starter 20kg', feed_size_mm: '2.00', quantity_added_kg: '95.00', quantity_consumed_kg: '10.00', quantity_available_kg: '85.00' }],
      status: 'ok',
      pending_orders: [],
      stock_tracking_started_at: '2026-06-01',
    });
    mockCreateFarmFeedReference.mockResolvedValue({ id: 'feed-server-1' });
    mockConfirmOrderReceipt.mockResolvedValue({ status: 'received' });
    mockGetProducts.mockResolvedValue([
      {
        id: 'product-1', brand: 'dibaq', name: 'DIBAQ Tilapia 2 mm', species: 'tilapia',
        phase: 'grossissement', pellet_size_mm: '2.00', protein_percentage: 32,
        lipid_percentage: 10, package_weight_kg: 15, price_per_package: '23500.00',
        price_per_kg: '1566.67', is_available: true, created_at: '', updated_at: '',
      },
    ]);
  });

  it('affiche le stock du cycle et ouvre les actions du Magasin', async () => {
    const { getByText, getByPlaceholderText, getAllByText } = render(<StoreScreen />);

    await waitFor(() => {
      expect(getByText('storeTitle')).toBeTruthy();
      expect(getByText('storeCurrentStock')).toBeTruthy();
      expect(getByText('510')).toBeTruthy();
      expect(getByText('storeEstimatedNeedToFinish')).toBeTruthy();
      expect(getByText('ORD-001')).toBeTruthy();
    });

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
    expect(getByText('storeManualCycleContext')).toBeTruthy();
    expect(getByText('storeManualSpeciesContext')).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText('storeManualLabelPlaceholder'), 'Aliment starter 20kg');
    fireEvent.changeText(getByPlaceholderText('storeManualFeedSizePlaceholder'), '2,5');
    fireEvent.changeText(getByPlaceholderText('storeManualQuantityPlaceholder'), '75,5');
    fireEvent.changeText(getByPlaceholderText('storeManualTotalCostPlaceholder'), '90000,5');
    fireEvent.changeText(getByPlaceholderText('storeManualDatePlaceholder'), '2026-06-29');
    fireEvent.changeText(getByPlaceholderText('storeManualNotePlaceholder'), 'Premier dépôt');

    fireEvent.press(getAllByText('storeManualSubmit')[1]);

    await waitFor(() => {
      expect(mockDeclareCycleStoreManualStock).toHaveBeenCalledWith(
        'cycle-1',
        expect.objectContaining({
          feed_reference_id: 'feed-server-1',
          quantity_kg: '75.5',
          total_cost_fcfa: '90000.5',
          entry_date: '2026-06-29',
          note: 'Premier dépôt',
          created_offline: false,
        })
      );
    });
  });

  it('affiche uniquement la saisie du nouvel aliment pour une déclaration normale', async () => {
    const { getByText, queryByText } = render(<StoreScreen />);

    await waitFor(() => expect(getByText('storeManualSubmit')).toBeTruthy());
    fireEvent.press(getByText('storeManualSubmit'));
    expect(getByText('storeManualLabel')).toBeTruthy();
    expect(queryByText('storeAquacareFeed')).toBeNull();
    expect(queryByText('storeUseExistingFeed')).toBeNull();
  });

  it('recommande un réapprovisionnement seulement avec un stock explicitement nul', async () => {
    mockGetCycleStore.mockResolvedValueOnce({
      cycle_id: 'cycle-1',
      summary: {
        manual_feed_kg: '0.00', received_order_feed_kg: '0.00', total_feed_added_kg: '0.00',
        feed_consumed_kg: '0.00', estimated_feed_remaining_kg: '0.00', feed_expenses_fcfa: '0.00',
        pending_orders_count: 0, pending_order_amount_fcfa: '0.00', pending_order_feed_kg: '0.00',
        total_feed_needed_kg: '600.00', feed_need_remaining_kg: '600.00', secured_feed_kg: '0.00', feed_to_secure_kg: '600.00', stock_tracking_started_at: '2026-06-01',
      },
      status: 'low', pending_orders: [], stock_tracking_started_at: '2026-06-01',
      stock_items: [],
    });
    const { getByText } = render(<StoreScreen />);
    await waitFor(() => expect(getByText('storeReplenishmentRequired')).toBeTruthy());
  });

  it('n affiche jamais un besoin couvert lorsque le calcul est indisponible', async () => {
    mockGetCycleStore.mockResolvedValueOnce({
      ...(await mockGetCycleStore()),
      calculation_status: 'unavailable',
      calculation_warnings: ['target_weight_unavailable'],
      summary: {
        ...(await mockGetCycleStore()).summary,
        feed_to_secure_kg: null,
        total_feed_needed_kg: null,
      },
    });

    const { findByText, queryByText } = render(<StoreScreen />);

    expect(await findByText('feedEstimateUnavailable')).toBeTruthy();
    expect(queryByText('storeNeedCoveredTitle')).toBeNull();
  });

  it('ignore le statut alimentaire d un autre cycle', async () => {
    mockRouteParams = { cycleId: 'cycle-2' };
    mockState.aquaculture.currentCycle = { id: 'cycle-2', cycle_name: 'Cycle B' };
    mockState.aquaculture.cycleFeedStatus.data = {
      ...mockState.aquaculture.cycleFeedStatus.data,
      cycle_id: 'cycle-1',
      bags_remaining_to_order: 8,
    };
    const { getByText, queryByText } = render(<StoreScreen />);

    await waitFor(() => {
      expect(getByText('storeContextMismatch')).toBeTruthy();
    });
    expect(queryByText('storeEstimatedNeedToFinish')).toBeNull();
    expect(queryByText('storeReplenishmentRequired')).toBeNull();
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

  it('explique une commande legacy incompatible sans proposer une classification dangereuse', async () => {
    const payload = await mockGetCycleStore();
    mockGetCycleStore.mockResolvedValueOnce({
      ...payload,
      unclassified_entries: [{
        id: 'legacy-order-1',
        label: 'Catfish 2mm',
        quantity_kg: '30.00',
        quantity_added_kg: '30.00',
        historical_consumption_kg: '0.00',
        quantity_available_kg: '30.00',
        source: 'order',
        classification_reason: 'order_species_mismatch',
        catalog_product_id: 'product-catfish',
        catalog_product_species: 'clarias',
        catalog_product_pellet_size_mm: '2.00',
      }],
    });

    const { findByText, queryByText } = render(<StoreScreen />);

    expect(await findByText('storeLegacyOrderSpeciesMismatch')).toBeTruthy();
    expect(queryByText('storeClassificationCatalogAction')).toBeNull();
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
    fireEvent.changeText(getByPlaceholderText('storeManualFeedSizePlaceholder'), '2');
    fireEvent.changeText(getByPlaceholderText('storeManualQuantityPlaceholder'), '50');
    fireEvent.changeText(getByPlaceholderText('storeManualTotalCostPlaceholder'), '75000');
    fireEvent.changeText(getByPlaceholderText('storeManualDatePlaceholder'), '2026-07-14');

    fireEvent.press(getAllByText('storeManualSubmit')[1]);
    fireEvent.press(getAllByText('storeManualSubmit')[1]);

    await waitFor(() => expect(mockDeclareCycleStoreManualStock).toHaveBeenCalledTimes(1));
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
  });

  it('confirme un retrait prêt et recharge le magasin sans double clic', async () => {
    const initialPayload = await mockGetCycleStore();
    mockGetCycleStore.mockClear();
    mockGetCycleStore.mockResolvedValueOnce({
      ...initialPayload,
      pending_orders: [{
        id: 'order-ready',
        order_number: 'ORD-READY',
        status: 'ready_for_pickup',
        delivery_method: 'pickup',
        total_bags: 1,
        total_fcfa: '30000.00',
        estimated_feed_kg: '20.00',
        created_at: '2026-06-10T08:00:00.000Z',
      }],
    }).mockResolvedValueOnce({
      ...initialPayload,
      summary: { ...initialPayload.summary, pending_orders_count: 0 },
      pending_orders: [],
    });
    let confirmAction: (() => Promise<void>) | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons) => {
      if (title === 'confirmPickupTitle') confirmAction = buttons?.[1]?.onPress as () => Promise<void>;
    });
    const { getByText, queryByText } = render(<StoreScreen />);

    await waitFor(() => expect(getByText('confirmPickupAction')).toBeTruthy());
    fireEvent.press(getByText('confirmPickupAction'));
    void confirmAction?.();
    void confirmAction?.();

    await waitFor(() => expect(mockConfirmOrderReceipt).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(queryByText('ORD-READY')).toBeNull());
  });

  it('conserve la confirmation si le refresh du magasin échoue', async () => {
    const initialPayload = await mockGetCycleStore();
    mockGetCycleStore.mockClear();
    mockGetCycleStore.mockResolvedValueOnce({
      ...initialPayload,
      pending_orders: [{
        id: 'order-confirmed',
        order_number: 'ORD-CONFIRMED',
        status: 'delivered',
        delivery_method: 'home',
        total_bags: 1,
        total_fcfa: '30000.00',
        estimated_feed_kg: '20.00',
        created_at: '2026-06-10T08:00:00.000Z',
      }],
    }).mockRejectedValueOnce(new Error('refresh unavailable'));
    mockConfirmOrderReceipt.mockResolvedValueOnce({
      id: 'order-confirmed',
      status: 'received',
    });
    let confirmAction: (() => Promise<void>) | undefined;
    jest.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons) => {
      if (title === 'confirmReceiptTitle') confirmAction = buttons?.[1]?.onPress as () => Promise<void>;
    });
    const { getByText, queryByText } = render(<StoreScreen />);

    await waitFor(() => expect(getByText('confirmReceiptAction')).toBeTruthy());
    fireEvent.press(getByText('confirmReceiptAction'));
    await confirmAction?.();

    await waitFor(() => {
      expect(mockConfirmOrderReceipt).toHaveBeenCalledWith('order-confirmed');
      expect(queryByText('ORD-CONFIRMED')).toBeNull();
    });
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'success',
      'confirmReceiptSuccess\n\nstoreRefreshAfterConfirmationError',
    );
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
