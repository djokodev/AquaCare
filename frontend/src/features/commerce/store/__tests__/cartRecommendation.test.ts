import reducer, { addToCart, setCartItemFromRecommendation, updateCartQuantity } from '../commerceSlice';
import type { Product } from '@/types/commerce';

const product = { id: 'p1', brand: 'dibaq', name: 'DIBAQ CATFISH 2MM', price_per_package: '20000' } as unknown as Product;
const breakdown = [{ phase_name: 'Alevinage', pellet_size_mm: '2', suggested_bags: 3 }];

describe('panier : quantites issues du besoin du cycle', () => {
  it('fixe la quantite et reste identique quand on rejoue l action', () => {
    let state = reducer(undefined, { type: 'init' });
    state = reducer(state, setCartItemFromRecommendation({ product, quantity: 3, recommendation_breakdown: breakdown }));
    state = reducer(state, setCartItemFromRecommendation({ product, quantity: 3, recommendation_breakdown: breakdown }));
    expect(state.cart.items).toHaveLength(1);
    expect(state.cart.items[0].quantity).toBe(3);
  });

  it('retire la ligne quand la quantite demandee est zero', () => {
    let state = reducer(undefined, { type: 'init' });
    state = reducer(state, setCartItemFromRecommendation({ product, quantity: 2, recommendation_breakdown: breakdown }));
    state = reducer(state, setCartItemFromRecommendation({ product, quantity: 0, recommendation_breakdown: [] }));
    expect(state.cart.items).toHaveLength(0);
  });

  it('plafonne a 500 sacs par produit comme le serveur', () => {
    let state = reducer(undefined, { type: 'init' });
    state = reducer(state, addToCart({ product, quantity: 499 }));
    state = reducer(state, addToCart({ product, quantity: 10 }));
    expect(state.cart.items[0].quantity).toBe(500);
    state = reducer(state, updateCartQuantity({ productId: 'p1', quantity: 9999 }));
    expect(state.cart.items[0].quantity).toBe(500);
  });
});
