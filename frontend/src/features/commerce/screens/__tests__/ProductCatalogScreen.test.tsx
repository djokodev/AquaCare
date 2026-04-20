import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import ProductCatalogScreen from '../ProductCatalogScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
let mockState: any;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
}));

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: any) => selector(mockState),
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

  it('affiche les produits et ouvre les details', () => {
    const { getByText } = render(<ProductCatalogScreen />);

    fireEvent.press(getByText('Feed Starter'));

    expect(mockNavigate).toHaveBeenCalledWith('ProductDetail', { productId: 'prod-1' });
  });

  it('affiche l etat vide et reset les filtres', () => {
    mockState.commerce.products.items = [];
    const { getByText } = render(<ProductCatalogScreen />);

    expect(getByText('noProductsFound')).toBeTruthy();
    fireEvent.press(getByText('resetFilters'));

    expect(mockDispatch).toHaveBeenCalled();
  });

  it('affiche l etat erreur et relance le chargement', () => {
    mockState.commerce.products.error = 'boom';
    const { getByText } = render(<ProductCatalogScreen />);

    fireEvent.press(getByText('retry'));

    expect(mockDispatch).toHaveBeenCalled();
  });
});
