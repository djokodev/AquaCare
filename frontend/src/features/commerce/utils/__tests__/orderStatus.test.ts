import {
  canConfirmOrderReceipt,
  getOrderReceiptActionLabelKey,
  getOrderStatusLabelKey,
  getOrderStatusTone,
} from '../orderStatus';
import { en } from '@/i18n/locales/en';
import { fr } from '@/i18n/locales/fr';

describe('orderStatus workflow helpers', () => {
  it.each([
    ['confirmed', 'home', 'orderStatusConfirmed'],
    ['delivered', 'home', 'orderStatusDeliveredHome'],
    ['ready_for_pickup', 'pickup', 'orderStatusReadyForPickup'],
    ['received', 'home', 'orderStatusReceiptConfirmed'],
    ['received', 'pickup', 'orderStatusPickupConfirmed'],
  ] as const)('maps %s/%s to %s', (status, deliveryMethod, expected) => {
    expect(getOrderStatusLabelKey(status, deliveryMethod)).toBe(expected);
  });

  it('only allows method-consistent customer confirmations', () => {
    const home = { status: 'delivered', delivery_method: 'home' } as const;
    const pickup = { status: 'ready_for_pickup', delivery_method: 'pickup' } as const;
    const confirmed = { status: 'confirmed', delivery_method: 'home' } as const;
    const mismatch = { status: 'delivered', delivery_method: 'pickup' } as const;

    expect(canConfirmOrderReceipt(home)).toBe(true);
    expect(canConfirmOrderReceipt(pickup)).toBe(true);
    expect(canConfirmOrderReceipt(confirmed)).toBe(false);
    expect(canConfirmOrderReceipt(mismatch)).toBe(false);
    expect(getOrderReceiptActionLabelKey(home)).toBe('confirmReceiptAction');
    expect(getOrderReceiptActionLabelKey(pickup)).toBe('confirmPickupAction');
    expect(getOrderStatusTone(home)).toBe('warning');
    expect(getOrderStatusTone({ status: 'received', delivery_method: 'pickup' })).toBe('success');
  });

  it('keeps the contextual workflow copy aligned in French and English', () => {
    expect(fr.orderStatusDeliveredHome).toBe('Livrée — confirmation attendue');
    expect(fr.orderStatusReadyForPickup).toBe('Prête au retrait');
    expect(fr.orderStatusReceiptConfirmed).toBe('Réception confirmée');
    expect(fr.orderStatusPickupConfirmed).toBe('Retrait confirmé');
    expect(en.orderStatusDeliveredHome).toBe('Delivered — confirmation pending');
    expect(en.orderStatusReadyForPickup).toBe('Ready for pickup');
    expect(en.orderStatusReceiptConfirmed).toBe('Receipt confirmed');
    expect(en.orderStatusPickupConfirmed).toBe('Pickup confirmed');
  });
});
