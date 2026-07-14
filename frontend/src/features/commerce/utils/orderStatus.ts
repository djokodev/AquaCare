import type { OrderStatus } from '@/types/commerce';

export const orderStatusLabelKeys: Record<OrderStatus, 'orderStatusConfirmed' | 'orderStatusDelivered' | 'orderStatusReceived'> = {
  confirmed: 'orderStatusConfirmed',
  delivered: 'orderStatusDelivered',
  received: 'orderStatusReceived',
};

export const getOrderStatusLabelKey = (status: string) =>
  orderStatusLabelKeys[status as OrderStatus] ?? 'orderStatusConfirmed';
