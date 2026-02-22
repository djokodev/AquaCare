import commerceApi from '../commerceApi';
import { apiService } from '@/services/api';

jest.mock('@/services/api', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('features/commerce/services/commerceApi', () => {
  const mockApi = apiService as jest.Mocked<typeof apiService>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getProducts retourne response.results avec params', async () => {
    mockApi.get.mockResolvedValueOnce({ data: { results: [{ id: 'p1' }] } } as any);

    const result = await commerceApi.getProducts({ species: 'tilapia' } as any);

    expect(mockApi.get).toHaveBeenCalledWith('/commerce/products/', {
      params: { species: 'tilapia' },
    });
    expect(result).toEqual([{ id: 'p1' }]);
  });

  it('getProductDetail, getRecommendedProduct, getFeedingSuggestions et simulateCycle', async () => {
    mockApi.get
      .mockResolvedValueOnce({ data: { id: 'p1' } } as any)
      .mockResolvedValueOnce({ data: { id: 'p2' } } as any)
      .mockResolvedValueOnce({ data: { has_suggestions: true } } as any)
      .mockResolvedValueOnce({ data: { has_suggestions: false } } as any);
    mockApi.post.mockResolvedValueOnce({ data: { summary: { total_feed_kg: 120 } } } as any);

    const detail = await commerceApi.getProductDetail('p1');
    const recommended = await commerceApi.getRecommendedProduct('catfish', 80);
    const suggestionsWithFarm = await commerceApi.getFeedingSuggestions('farm-1');
    const suggestionsWithoutFarm = await commerceApi.getFeedingSuggestions();
    const simulation = await commerceApi.simulateCycle({ species: 'tilapia' } as any);

    expect(detail.id).toBe('p1');
    expect(recommended.id).toBe('p2');
    expect(suggestionsWithFarm.has_suggestions).toBe(true);
    expect(suggestionsWithoutFarm.has_suggestions).toBe(false);
    expect(simulation.summary.total_feed_kg).toBe(120);

    expect(mockApi.get).toHaveBeenNthCalledWith(1, '/commerce/products/p1/');
    expect(mockApi.get).toHaveBeenNthCalledWith(2, '/commerce/products/recommended/', {
      params: { species: 'catfish', weight_g: 80 },
    });
    expect(mockApi.get).toHaveBeenNthCalledWith(3, '/commerce/products/feeding_suggestions/', {
      params: { farm_profile_id: 'farm-1' },
    });
    expect(mockApi.get).toHaveBeenNthCalledWith(4, '/commerce/products/feeding_suggestions/', {
      params: undefined,
    });
    expect(mockApi.post).toHaveBeenCalledWith('/commerce/products/cycle_simulation/', { species: 'tilapia' });
  });

  it('getOrders gere array direct et payload pagine', async () => {
    mockApi.get
      .mockResolvedValueOnce({ data: [{ id: 'o1' }] } as any)
      .mockResolvedValueOnce({ data: { results: [{ id: 'o2' }] } } as any);

    const direct = await commerceApi.getOrders();
    const paged = await commerceApi.getOrders();

    expect(direct).toEqual([{ id: 'o1' }]);
    expect(paged).toEqual([{ id: 'o2' }]);
    expect(mockApi.get).toHaveBeenCalledWith('/commerce/orders/');
  });

  it('getOrderDetail, createOrder, getOrderStatistics, previewDeliveryFee', async () => {
    mockApi.get
      .mockResolvedValueOnce({ data: { id: 'o1' } } as any)
      .mockResolvedValueOnce({ data: { total_orders: 3 } } as any);

    mockApi.post
      .mockResolvedValueOnce({ data: { id: 'o-created' } } as any)
      .mockResolvedValueOnce({ data: { subtotal: '10000', delivery_fee: '3000', total: '13000', total_bags: 2, free_delivery_threshold_reached: false } } as any);

    const detail = await commerceApi.getOrderDetail('o1');
    const created = await commerceApi.createOrder({ items: [], delivery_method: 'home' } as any);
    const stats = await commerceApi.getOrderStatistics();
    const preview = await commerceApi.previewDeliveryFee({
      items: [{ product_id: 'p1', quantity: 2 }],
      delivery_method: 'home',
    });

    expect(detail.id).toBe('o1');
    expect(created.id).toBe('o-created');
    expect(stats.total_orders).toBe(3);
    expect(preview.total).toBe('13000');

    expect(mockApi.get).toHaveBeenNthCalledWith(1, '/commerce/orders/o1/');
    expect(mockApi.get).toHaveBeenNthCalledWith(2, '/commerce/orders/statistics/');
    expect(mockApi.post).toHaveBeenNthCalledWith(1, '/commerce/orders/', {
      items: [],
      delivery_method: 'home',
    });
    expect(mockApi.post).toHaveBeenNthCalledWith(2, '/commerce/orders/preview_delivery_fee/', {
      items: [{ product_id: 'p1', quantity: 2 }],
      delivery_method: 'home',
    });
  });
});
