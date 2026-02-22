import * as commerceDomain from '@/domain/commerce';
import * as commerceModule from '@/features/commerce';
import {
  estimateDeliveryFee,
  estimateFeedNeed,
  estimateTotalBags,
  estimateTotalPrice,
  bagsNeededForFreeDelivery,
  isFreeDelivery,
} from '@/domain/commerce/estimators';

describe('commerce domain estimators and exports', () => {
  const items: any[] = [
    {
      quantity: 2,
      product: { price_per_package: '25000' },
    },
    {
      quantity: 1,
      product: { price_per_package: '30000' },
    },
  ];

  it('calcule les indicateurs panier', () => {
    expect(estimateTotalPrice(items as any)).toBe(80000);
    expect(estimateTotalBags(items as any)).toBe(3);
  });

  it('applique les regles livraison avec normalisation region', () => {
    expect(estimateDeliveryFee('pickup', 'Littoral', 1)).toBe(0);
    expect(estimateDeliveryFee('home', '  LITTORAL  ', 20)).toBe(0);
    expect(estimateDeliveryFee('home', 'centre', 25)).toBe(3000);
    expect(isFreeDelivery('home', 'littoral', 20)).toBe(true);
    expect(bagsNeededForFreeDelivery('littoral', 15)).toBe(5);
    expect(bagsNeededForFreeDelivery('centre', 15)).toBe(0);
  });

  it('estime le besoin alimentaire', () => {
    expect(estimateFeedNeed(100, 10)).toBe(35);
  });

  it('exporte les symboles principaux du module commerce', () => {
    expect(commerceDomain.DELIVERY_METHODS.length).toBeGreaterThan(0);
    expect(commerceDomain.CYCLE_SIMULATION_DEFAULTS.tilapia.initial_weight_g).toBe(5);
    expect(commerceModule.CartScreen).toBeDefined();
    expect(commerceModule.ProductCatalogScreen).toBeDefined();
  });
});
