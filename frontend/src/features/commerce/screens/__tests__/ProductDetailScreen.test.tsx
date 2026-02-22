import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ProductDetailScreen from '../ProductDetailScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockSetParams = jest.fn();
const mockDispatch = jest.fn();
let mockState: any;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    setParams: mockSetParams,
  }),
  useRoute: () => ({
    params: {
      productId: 'prod-1',
    },
  }),
}));

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: any) => selector(mockState),
}));

describe('ProductDetailScreen', () => {
  const product = {
    id: 'prod-1',
    brand: 'dibaq',
    name: 'Feed Grower',
    species: 'tilapia',
    phase: 'grossissement',
    pellet_size_mm: '3',
    protein_percentage: 28,
    lipid_percentage: 7,
    package_weight_kg: 15,
    price_per_package: '30000',
    price_per_kg: '2000',
    is_available: true,
    created_at: '2026-02-20T10:00:00.000Z',
    updated_at: '2026-02-20T10:00:00.000Z',
  };

  const similarProduct = {
    ...product,
    id: 'prod-2',
    name: 'Feed Finisher',
    price_per_package: '32000',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockDispatch.mockImplementation(() => ({ unwrap: jest.fn().mockResolvedValue(product) }));
    mockState = {
      commerce: {
        products: {
          items: [product, similarProduct],
        },
        cart: {
          items: [],
        },
      },
    };
  });

  it('affiche le produit et permet d ajouter au panier', async () => {
    const { findByText, getByText } = render(<ProductDetailScreen />);

    expect(await findByText('Feed Grower')).toBeTruthy();
    fireEvent.press(getByText('addToCart'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'success',
      'productAddedToCartWithQuantity',
      expect.any(Array)
    );
  });

  it('charge le produit via API quand absent du store', async () => {
    mockState.commerce.products.items = [];
    const { findByText } = render(<ProductDetailScreen />);

    expect(await findByText('Feed Grower')).toBeTruthy();
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('gere les erreurs de chargement sans planter', async () => {
    mockState.commerce.products.items = [];
    mockDispatch.mockImplementation(() => ({ unwrap: jest.fn().mockRejectedValue(new Error('boom')) }));

    render(<ProductDetailScreen />);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith('error', 'productLoadError');
    });
  });

  it('permet de changer vers un produit similaire', async () => {
    const { findByText, getByText } = render(<ProductDetailScreen />);

    await findByText('Feed Grower');
    fireEvent.press(getByText('Feed Finisher'));

    expect(mockSetParams).toHaveBeenCalledWith({ productId: 'prod-2' });
  });
});
