import { configureStore } from '@reduxjs/toolkit';
import commerceReducer, {
  applyFilters,
  resetFilters,
  addToCart,
  removeFromCart,
  updateCartQuantity,
  clearCart,
  setDeliveryMethod,
  setPickupLocation,
  resetSuggestions,
  resetSimulation,
  fetchProducts,
  fetchProductDetail,
  fetchRecommendedProduct,
  fetchFeedingSuggestions,
  fetchCycleSimulation,
  fetchOrders,
  fetchOrderDetail,
  createOrder,
  confirmOrderReceipt,
  fetchOrderStatistics,
  fetchDeliveryFeePreview,
} from '../commerceSlice';
import commerceApi from '@/features/commerce/services/commerceApi';
import { Product, Order } from '@/types/commerce';

jest.mock('@/features/commerce/services/commerceApi', () => ({
  __esModule: true,
  default: {
    getProducts: jest.fn(),
    getProductDetail: jest.fn(),
    getRecommendedProduct: jest.fn(),
    getFeedingSuggestions: jest.fn(),
    simulateCycle: jest.fn(),
    getOrders: jest.fn(),
    getOrderDetail: jest.fn(),
    createOrder: jest.fn(),
    confirmOrderReceipt: jest.fn(),
    getOrderStatistics: jest.fn(),
    previewDeliveryFee: jest.fn(),
  },
}));

describe('features/commerce/store/commerceSlice', () => {
  const mockApi = commerceApi as jest.Mocked<typeof commerceApi>;

  const productA: Product = {
    id: 'prod-1',
    brand: 'aller_aqua',
    name: 'Aliment Tilapia 2mm',
    species: 'tilapia',
    phase: 'juvenile',
    pellet_size_mm: '2.0',
    protein_percentage: 45,
    lipid_percentage: 12,
    package_weight_kg: 15,
    price_per_package: '25000',
    price_per_kg: '1667',
    is_available: true,
    created_at: '2026-02-20T00:00:00Z',
    updated_at: '2026-02-20T00:00:00Z',
  };

  const productB: Product = {
    ...productA,
    id: 'prod-2',
    name: 'Aliment Catfish 3mm',
    species: 'catfish',
    pellet_size_mm: '3.0',
  };

  const orderA: Order = {
    id: 'order-1',
    order_number: 'ORD-20260220-0001',
    status: 'confirmed',
    user: 'user-uuid-1',
    user_name: 'Test User',
    farm_profile: 'farm-uuid-1',
    farm_name: 'Test Farm',
    delivery_method: 'home',
    delivery_name: 'Test User',
    delivery_phone: '+237652000000',
    delivery_region: 'littoral',
    delivery_city: 'Douala',
    delivery_full_address: 'Littoral, Wouri, Douala, Akwa',
    subtotal: '50000',
    delivery_fee: '3000',
    total: '53000',
    total_bags: 2,
    is_free_delivery: false,
    items: [],
    created_offline: false,
    created_at: '2026-02-20T10:00:00Z',
    updated_at: '2026-02-20T10:00:00Z',
  };

  const createStore = () =>
    configureStore({
      reducer: { commerce: commerceReducer },
    });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applique et reset les filtres produits', () => {
    let state = commerceReducer(undefined, applyFilters({ species: 'tilapia', search: '2mm' }));
    expect(state.products.filters).toEqual({ species: 'tilapia', search: '2mm' });

    state = commerceReducer(state, resetFilters());
    expect(state.products.filters).toEqual({});
  });

  it('gere le panier: ajout, increment, update, remove, clear', () => {
    let state = commerceReducer(undefined, addToCart({ product: productA, quantity: 2 }));
    expect(state.cart.items).toHaveLength(1);
    expect(state.cart.items[0].quantity).toBe(2);

    state = commerceReducer(state, addToCart({ product: productA, quantity: 1 }));
    expect(state.cart.items[0].quantity).toBe(3);

    state = commerceReducer(state, addToCart({ product: productB, quantity: 1 }));
    expect(state.cart.items).toHaveLength(2);

    state = commerceReducer(state, updateCartQuantity({ productId: 'prod-1', quantity: 5 }));
    expect(state.cart.items.find((i) => i.product.id === 'prod-1')?.quantity).toBe(5);

    state = commerceReducer(state, updateCartQuantity({ productId: 'prod-2', quantity: 0 }));
    expect(state.cart.items.some((i) => i.product.id === 'prod-2')).toBe(false);

    state = commerceReducer(state, removeFromCart('prod-1'));
    expect(state.cart.items).toHaveLength(0);

    state = commerceReducer(state, addToCart({ product: productA, quantity: 1 }));
    state = commerceReducer(state, clearCart());
    expect(state.cart.items).toHaveLength(0);
  });

  it('gere la methode de livraison et le pickup', () => {
    let state = commerceReducer(undefined, setDeliveryMethod('pickup'));
    state = commerceReducer(state, setPickupLocation('ndokoti' as any));

    expect(state.cart.delivery_method).toBe('pickup');
    expect(state.cart.pickup_location).toBe('ndokoti');

    state = commerceReducer(state, setDeliveryMethod('home'));
    expect(state.cart.delivery_method).toBe('home');
    expect(state.cart.pickup_location).toBeUndefined();
  });

  it('resetSuggestions et resetSimulation nettoient les sections', () => {
    const seeded = {
      ...commerceReducer(undefined, { type: '@@INIT' }),
      suggestions: {
        data: { has_suggestions: true },
        loading: false,
        error: 'boom',
      },
      simulation: {
        result: { summary: { total_feed_kg: 100 } },
        loading: false,
        error: 'err',
      },
    } as any;

    let state = commerceReducer(seeded, resetSuggestions());
    expect(state.suggestions.data).toBeNull();
    expect(state.suggestions.error).toBeNull();

    state = commerceReducer(state, resetSimulation());
    expect(state.simulation.result).toBeNull();
    expect(state.simulation.error).toBeNull();
  });

  it('fetchProducts met a jour loading, success et erreur', async () => {
    const store = createStore();

    mockApi.getProducts.mockResolvedValueOnce([productA, productB] as any);
    const pending = fetchProducts.pending('req-1', undefined);
    let state = commerceReducer(store.getState().commerce, pending);
    expect(state.products.loading).toBe(true);

    await store.dispatch(fetchProducts(undefined) as any);
    state = store.getState().commerce;
    expect(state.products.items).toHaveLength(2);
    expect(state.products.loading).toBe(false);

    mockApi.getProducts.mockRejectedValueOnce({ response: { data: { message: 'API indisponible' } } } as any);
    await store.dispatch(fetchProducts({ species: 'tilapia' } as any) as any);
    state = store.getState().commerce;
    expect(state.products.error).toBe('API indisponible');
  });

  it('fetchProductDetail et fetchRecommendedProduct appellent les bons endpoints', async () => {
    const store = createStore();
    mockApi.getProductDetail.mockResolvedValueOnce(productA as any);
    mockApi.getRecommendedProduct.mockResolvedValueOnce(productB as any);

    await store.dispatch(fetchProductDetail('prod-1') as any);
    await store.dispatch(fetchRecommendedProduct({ species: 'catfish', weightG: 120 }) as any);

    expect(mockApi.getProductDetail).toHaveBeenCalledWith('prod-1');
    expect(mockApi.getRecommendedProduct).toHaveBeenCalledWith('catfish', 120);
  });

  it('fetchFeedingSuggestions et fetchCycleSimulation remplissent les donnees', async () => {
    const store = createStore();

    mockApi.getFeedingSuggestions.mockResolvedValueOnce({ has_suggestions: true, suggestions: [] } as any);
    await store.dispatch(fetchFeedingSuggestions({ farmProfileId: 'farm-1', cycleId: 'cycle-session-1' }) as any);

    let state = store.getState().commerce;
    expect(state.suggestions.loading).toBe(false);
    expect(state.suggestions.data?.has_suggestions).toBe(true);
    expect(mockApi.getFeedingSuggestions).toHaveBeenCalledWith({
      farmProfileId: 'farm-1',
      cycleId: 'cycle-session-1',
    });

    mockApi.simulateCycle.mockResolvedValueOnce({ summary: { estimated_fcr: 1.4 } } as any);
    await store.dispatch(fetchCycleSimulation({ species: 'tilapia' } as any) as any);

    state = store.getState().commerce;
    expect(state.simulation.result?.summary.estimated_fcr).toBe(1.4);

    mockApi.simulateCycle.mockRejectedValueOnce({ response: { data: { message: 'Erreur simulation' } } } as any);
    await store.dispatch(fetchCycleSimulation({ species: 'tilapia' } as any) as any);
    state = store.getState().commerce;
    expect(state.simulation.error).toBe('Erreur simulation');
  });

  it('fetchOrders, fetchOrderDetail, createOrder, confirmOrderReceipt et fetchOrderStatistics mettent a jour orders', async () => {
    const store = createStore();

    mockApi.getOrders.mockResolvedValueOnce([orderA] as any);
    await store.dispatch(fetchOrders() as any);

    let state = store.getState().commerce;
    expect(state.orders.items).toHaveLength(1);

    const updatedOrder = { ...orderA, status: 'confirmed' };
    mockApi.getOrderDetail.mockResolvedValueOnce(updatedOrder as any);
    await store.dispatch(fetchOrderDetail('order-1') as any);

    state = store.getState().commerce;
    expect(state.orders.items[0].status).toBe('confirmed');

    const newOrder = { ...orderA, id: 'order-2', order_number: 'ORD-002' };
    mockApi.createOrder.mockResolvedValueOnce(newOrder as any);
    await store.dispatch(createOrder({ items: [], delivery_method: 'home' } as any) as any);

    state = store.getState().commerce;
    expect(state.orders.items[0].id).toBe('order-2');

    mockApi.confirmOrderReceipt.mockResolvedValueOnce({ ...newOrder, status: 'received' } as any);
    await store.dispatch(confirmOrderReceipt('order-2') as any);

    state = store.getState().commerce;
    expect(state.orders.items[0].status).toBe('received');

    mockApi.getOrderStatistics.mockResolvedValueOnce({ total_orders: 2, total_spent: 100000 } as any);
    await store.dispatch(fetchOrderStatistics() as any);

    state = store.getState().commerce;
    expect(state.orders.statistics?.total_orders).toBe(2);
  });

  it('fetchDeliveryFeePreview gere success et reject', async () => {
    const store = createStore();

    mockApi.previewDeliveryFee.mockResolvedValueOnce({
      subtotal: '50000',
      delivery_fee: '3000',
      total: '53000',
      free_delivery_threshold_reached: false,
      total_bags: 2,
    } as any);

    await store.dispatch(
      fetchDeliveryFeePreview({
        items: [{ product_id: 'prod-1', quantity: 2 }],
        delivery_method: 'home',
      }) as any
    );

    let state = store.getState().commerce;
    expect(state.cart.deliveryPreview?.total).toBe('53000');
    expect(state.cart.previewLoading).toBe(false);

    mockApi.previewDeliveryFee.mockRejectedValueOnce(new Error('network'));
    await store.dispatch(
      fetchDeliveryFeePreview({
        items: [{ product_id: 'prod-1', quantity: 2 }],
        delivery_method: 'home',
      }) as any
    );

    state = store.getState().commerce;
    expect(state.cart.deliveryPreview).toBeNull();
    expect(state.cart.previewLoading).toBe(false);
  });

  it('normalise les formats d erreurs API (message | error | detail)', async () => {
    const store = createStore();

    mockApi.getOrders.mockRejectedValueOnce({ response: { data: { error: 'Erreur backend' } } } as any);
    await store.dispatch(fetchOrders() as any);
    let state = store.getState().commerce;
    expect(state.orders.error).toBe('Erreur backend');

    mockApi.getOrders.mockRejectedValueOnce({ response: { data: { detail: 'Session invalide' } } } as any);
    await store.dispatch(fetchOrders() as any);
    state = store.getState().commerce;
    expect(state.orders.error).toBe('Session invalide');
  });
});
