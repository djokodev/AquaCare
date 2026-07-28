import React from 'react';
import { Alert, RefreshControl } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { NavigationContext, NavigationRouteContext } from '@react-navigation/core';

import ProductCatalogScreen from '../ProductCatalogScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
let mockState: any;
let mockRouteParams: any;

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: any) => selector(mockState),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('ProductCatalogScreen', () => {
  const product = {
    id: 'prod-1',
    brand: 'dibaq',
    name: 'Feed Starter',
    species: 'tilapia',
    phase: 'alevinage',
    pellet_size_mm: '2',
    protein_percentage: 30,
    lipid_percentage: 8,
    package_weight_kg: 15,
    price_per_package: '25000',
    price_per_kg: '1666',
    is_available: true,
    created_at: '2026-02-20T10:00:00.000Z',
    updated_at: '2026-02-20T10:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockDispatch.mockResolvedValue(undefined);
    mockRouteParams = {
      cycleId: 'cycle-store',
      source: 'store',
    };
    mockState = {
      commerce: {
        products: {
          items: [product],
          loading: false,
          error: null,
          filters: {},
        },
        cart: {
          items: [{ product, quantity: 2 }],
        },
      },
      aquaculture: {
        currentCycle: null,
        cycleFeedStatus: {
          data: null,
          loading: false,
        },
      },
    };
  });

  const renderScreen = () =>
    render(
      <NavigationContext.Provider
        value={
          {
            navigate: mockNavigate,
            goBack: mockGoBack,
          } as any
        }
      >
        <NavigationRouteContext.Provider
          value={
            {
              key: 'ProductCatalog-key',
              name: 'ProductCatalog',
              params: mockRouteParams,
            } as any
          }
        >
          <ProductCatalogScreen />
        </NavigationRouteContext.Provider>
      </NavigationContext.Provider>
    );

  it('affiche les produits et ouvre les details', () => {
    const { getByText, queryByText } = renderScreen();

    expect(queryByText('myFeedCycleHeader')).toBeNull();

    fireEvent.press(getByText('Feed Starter'));

    expect(mockNavigate).toHaveBeenCalledWith('ProductDetail', {
      productId: 'prod-1',
      cycleId: 'cycle-store',
      source: 'store',
    });
  });

  it('affiche l etat vide et reset les filtres', () => {
    mockState.commerce.products.items = [];
    const { getByText } = renderScreen();

    expect(getByText('noProductsFound')).toBeTruthy();
    fireEvent.press(getByText('resetFilters'));

    expect(mockDispatch).toHaveBeenCalled();
  });

  it('affiche l etat erreur et relance le chargement', () => {
    mockState.commerce.products.items = [];
    mockState.commerce.products.error = 'boom';
    const { getByText } = renderScreen();

    fireEvent.press(getByText('retry'));

    expect(mockDispatch).toHaveBeenCalled();
  });

  it('conserve les produits lors d une erreur de refresh', () => {
    mockState.commerce.products.error = 'boom';
    const { getByText, queryByText } = renderScreen();

    expect(getByText('Feed Starter')).toBeTruthy();
    expect(getByText('boom')).toBeTruthy();
    expect(queryByText('retry')).toBeNull();
  });

  it('recherche, filtre puis reset les filtres', () => {
    const { getByLabelText, getByText } = renderScreen();

    fireEvent.changeText(getByLabelText('searchProducts'), 'starter');
    fireEvent(getByLabelText('searchProducts'), 'submitEditing');
    fireEvent.press(getByLabelText('tilapia'));
    fireEvent.press(getByText('resetFilters'));

    expect(mockDispatch).toHaveBeenCalled();
  });

  it('ajoute rapidement sans ouvrir le detail', () => {
    const { getByLabelText } = renderScreen();

    fireEvent.press(getByLabelText('addToCart Feed Starter'));

    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'commerce/addToCart' }));
    expect(mockNavigate).not.toHaveBeenCalledWith('ProductDetail', expect.anything());
  });

  it('rafraichit le catalogue et expose le compteur panier', async () => {
    const { getByLabelText, UNSAFE_getByType } = renderScreen();

    expect(getByLabelText('cart 2')).toBeTruthy();
    await UNSAFE_getByType(RefreshControl).props.onRefresh();

    expect(mockDispatch).toHaveBeenCalled();
  });

  it('conserve le contexte Magasin quand on ouvre le panier depuis le catalogue', () => {
    const { getByLabelText } = renderScreen();

    fireEvent.press(getByLabelText('cart 2'));

    expect(mockNavigate).toHaveBeenCalledWith('Cart', {
      cycleId: 'cycle-store',
      source: 'store',
    });
  });
});
