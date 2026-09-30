import type { DeliveryMethod, Order, OrderStatus } from '@/types/commerce';

type OrderWorkflowShape = Pick<Order, 'status' | 'delivery_method'>;
export type OrderStatusTone = 'info' | 'warning' | 'success' | 'error';

export const getOrderStatusLabelKey = (
  status: OrderStatus | string,
  deliveryMethod: DeliveryMethod = 'home',
): string => {
  if (status === 'cancelled') return 'orderStatusCancelled';
  if (status === 'delivered' && deliveryMethod === 'home') return 'orderStatusDeliveredHome';
  if (status === 'ready_for_pickup' && deliveryMethod === 'pickup') return 'orderStatusReadyForPickup';
  if (status === 'received') {
    return deliveryMethod === 'pickup' ? 'orderStatusPickupConfirmed' : 'orderStatusReceiptConfirmed';
  }
  return 'orderStatusConfirmed';
};

export const canConfirmOrderReceipt = (order: OrderWorkflowShape): boolean =>
  (order.delivery_method === 'home' && order.status === 'delivered')
  || (order.delivery_method === 'pickup' && order.status === 'ready_for_pickup');

export const getOrderReceiptActionLabelKey = (order: OrderWorkflowShape): string =>
  order.delivery_method === 'pickup' ? 'confirmPickupAction' : 'confirmReceiptAction';

/** Le client peut annuler tant que rien n'est livré ni prêt au retrait. */
export const canCancelOrder = (order: Pick<Order, 'status'>): boolean => order.status === 'confirmed';

/** Commande encore attendue (ni reçue ni annulée). */
export const isOrderOpen = (order: Pick<Order, 'status'>): boolean =>
  order.status !== 'received' && order.status !== 'cancelled';

export const getOrderStatusTone = (order: OrderWorkflowShape): OrderStatusTone => {
  if (order.status === 'cancelled') return 'error';
  if (order.status === 'received') return 'success';
  if (canConfirmOrderReceipt(order)) return 'warning';
  return 'info';
};
