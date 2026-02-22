import { apiService as api } from '@/services/api';
import {
  Product,
  ProductFilters,
  Order,
  CreateOrderPayload,
  OrderStatistics,
  DeliveryFeePreview,
  FeedingSuggestion,
  CycleSimulationParams,
  SimulationResult,
} from '@/types/commerce';

export const getProducts = async (filters?: ProductFilters) => {
  const response = await api.get<{ results: Product[] }>('/commerce/products/', {
    params: filters,
  });
  return response.data.results;
};

export const getProductDetail = async (productId: string) => {
  const response = await api.get<Product>(`/commerce/products/${productId}/`);
  return response.data;
};

export const getRecommendedProduct = async (species: 'tilapia' | 'catfish', weightG: number) => {
  const response = await api.get<Product>('/commerce/products/recommended/', {
    params: { species, weight_g: weightG },
  });
  return response.data;
};

export const getFeedingSuggestions = async (farmProfileId?: string) => {
  const response = await api.get<FeedingSuggestion>('/commerce/products/feeding_suggestions/', {
    params: farmProfileId ? { farm_profile_id: farmProfileId } : undefined,
  });
  return response.data;
};

export const simulateCycle = async (params: CycleSimulationParams) => {
  const response = await api.post<SimulationResult>('/commerce/products/cycle_simulation/', params);
  return response.data;
};

export const getOrders = async () => {
  const response = await api.get<Order[] | { results: Order[] }>('/commerce/orders/');
  const payload = response.data as Order[] | { results: Order[] };
  return Array.isArray(payload) ? payload : payload.results;
};

export const getOrderDetail = async (orderId: string) => {
  const response = await api.get<Order>(`/commerce/orders/${orderId}/`);
  return response.data;
};

export const createOrder = async (orderData: CreateOrderPayload) => {
  const response = await api.post<Order>('/commerce/orders/', orderData);
  return response.data;
};

export const getOrderStatistics = async () => {
  const response = await api.get<OrderStatistics>('/commerce/orders/statistics/');
  return response.data;
};

export const previewDeliveryFee = async (data: {
  items: Array<{ product_id: string; quantity: number }>;
  delivery_method: 'home' | 'pickup';
}) => {
  const response = await api.post<DeliveryFeePreview>('/commerce/orders/preview_delivery_fee/', data);
  return response.data;
};

const commerceApi = {
  getProducts,
  getProductDetail,
  getRecommendedProduct,
  getFeedingSuggestions,
  simulateCycle,
  getOrders,
  getOrderDetail,
  createOrder,
  getOrderStatistics,
  previewDeliveryFee,
};

export default commerceApi;
