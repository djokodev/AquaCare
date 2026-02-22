/**
 * Client-side estimators for immediate UI feedback.
 * Backend always recalculates official values.
 */

import { CartItem } from '@/types/commerce';
import { DELIVERY_FEE_FCFA, FREE_DELIVERY_THRESHOLD } from './constants';

const normalizeRegion = (region: string): string => region.trim().toLowerCase();

export const estimateTotalPrice = (items: CartItem[]): number => {
  return items.reduce((total, item) => {
    const price = parseFloat(item.product.price_per_package);
    return total + price * item.quantity;
  }, 0);
};

export const estimateTotalBags = (items: CartItem[]): number => {
  return items.reduce((total, item) => total + item.quantity, 0);
};

export const estimateDeliveryFee = (
  deliveryMethod: 'home' | 'pickup',
  region: string,
  totalBags: number
): number => {
  if (deliveryMethod === 'pickup') {
    return 0;
  }

  if (normalizeRegion(region) === 'littoral' && totalBags >= FREE_DELIVERY_THRESHOLD) {
    return 0;
  }

  return DELIVERY_FEE_FCFA;
};

export const isFreeDelivery = (
  deliveryMethod: 'home' | 'pickup',
  region: string,
  totalBags: number
): boolean => {
  return estimateDeliveryFee(deliveryMethod, region, totalBags) === 0;
};

export const bagsNeededForFreeDelivery = (region: string, totalBags: number): number => {
  if (normalizeRegion(region) !== 'littoral') {
    return 0;
  }

  if (totalBags >= FREE_DELIVERY_THRESHOLD) {
    return 0;
  }

  return FREE_DELIVERY_THRESHOLD - totalBags;
};

export const estimateFeedNeed = (biomassKg: number, days: number): number => {
  const dailyFeedingRate = 0.035;
  const dailyFeed = biomassKg * dailyFeedingRate;
  return Math.round(dailyFeed * days);
};

export default {
  estimateTotalPrice,
  estimateTotalBags,
  estimateDeliveryFee,
  isFreeDelivery,
  bagsNeededForFreeDelivery,
  estimateFeedNeed,
};
