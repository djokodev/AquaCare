import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import CartScreen from '../CartScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
let mockState: any;
let mockRouteParams: any;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
  useRoute: () => ({
    params: mockRouteParams,
  }),
}));

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: any) => selector(mockState),
}));

jest.mock('@/features/commerce/store/commerceSlice', () => ({
  __esModule: true,
  updateCartQuantity: jest.fn((payload: unknown) => ({ type: 'updateCartQuantity', payload })),
  removeFromCart: jest.fn((payload: unknown) => ({ type: 'removeFromCart', payload })),
  clearCart: jest.fn(() => ({ type: 'clearCart' })),
  setDeliveryMethod: jest.fn((payload: unknown) => ({ type: 'setDeliveryMethod', payload })),
  setPickupLocation: jest.fn((payload: unknown) => ({ type: 'setPickupLocation', payload })),
  fetchDeliveryFeePreview: jest.fn((payload: unknown) => ({ type: 'fetchDeliveryFeePreview', payload })),
  createOrder: jest.fn((payload: unknown) => ({ type: 'createOrder', payload })),
}));

const { createOrder: mockCreateOrder } = jest.requireMock(
  '@/features/commerce/store/commerceSlice'
) as {
  createOrder: jest.Mock;
};

describe('CartScreen', () => {
  const product = {
    id: 'prod-1',
    brand: 'dibaq',
    name: 'Feed 2mm',
    species: 'tilapia',
    phase: 'grossissement',
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
    mockDispatch.mockImplementation((action: unknown) => {
      if (action && typeof action === 'object' && (action as { type?: string }).type === 'createOrder') {
        return { unwrap: jest.fn().mockResolvedValue({ id: 'order-1' }) };
      }

      return { unwrap: jest.fn().mockResolvedValue({}) };
    });
    mockRouteParams = undefined;
    mockState = {
      commerce: {
        cart: {
          items: [],
          delivery_method: 'home',
          pickup_location: undefined,
          deliveryPreview: null,
          previewLoading: false,
        },
      },
      auth: {
        user: null,
        farmProfile: null,
      },
      aquaculture: {
        currentCycle: undefined,
      },
    };
  });

  it('navigue vers le catalogue depuis etat panier vide', () => {
    const { getByText } = render(<CartScreen />);

    fireEvent.press(getByText('browseCatalog'));

    expect(mockNavigate).toHaveBeenCalledWith('ProductCatalog', undefined);
  });

  it('affiche une erreur si pickup sans point de retrait', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockState = {
      commerce: {
        cart: {
          items: [{ product, quantity: 1 }],
          delivery_method: 'pickup',
          pickup_location: undefined,
          deliveryPreview: {
            subtotal: '25000',
            delivery_fee: '0',
            total: '25000',
            total_bags: 1,
            free_delivery_threshold_reached: false,
          },
          previewLoading: false,
        },
      },
      auth: {
        user: { id: 'u1', region: 'Littoral' },
        farmProfile: { id: 'farm-1' },
      },
      aquaculture: {
        currentCycle: undefined,
      },
    };

    const { getByText } = render(<CartScreen />);
    fireEvent.press(getByText('confirmOrder'));

    expect(alertSpy).toHaveBeenCalledWith('error', 'selectPickupLocationError');
  });

  it('cree une commande et redirige vers historique apres confirmation', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((title: any, _msg?: any, buttons?: any) => {
      if (title === 'confirmOrder') {
        buttons?.[1]?.onPress?.();
      }
      if (title === 'success') {
        buttons?.[0]?.onPress?.();
      }
    });

    mockState = {
      commerce: {
        cart: {
          items: [{ product, quantity: 2 }],
          delivery_method: 'home',
          pickup_location: undefined,
          deliveryPreview: {
            subtotal: '50000',
            delivery_fee: '3000',
            total: '53000',
            total_bags: 2,
            free_delivery_threshold_reached: false,
          },
          previewLoading: false,
        },
      },
      auth: {
        user: { id: 'u1', region: 'Littoral' },
        farmProfile: { id: 'farm-1' },
      },
      aquaculture: {
        currentCycle: { id: 'cycle-1' },
      },
    };

    mockRouteParams = {
      cycleId: 'cycle-store',
      source: 'store',
    };

    const { getByText } = render(<CartScreen />);
    fireEvent.press(getByText('confirmOrder'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('OrdersHistory', {
        cycleId: 'cycle-store',
        source: 'store',
      });
    });

    expect(alertSpy).toHaveBeenCalled();
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        production_cycle_id: 'cycle-store',
      })
    );
  });

  it('normalise les erreurs API lors de la creation commande', async () => {
    const unwrap = jest.fn().mockRejectedValue({ response: { data: { detail: 'detail API' } } });
    mockDispatch.mockImplementation(() => ({ unwrap }));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((title: any, _msg?: any, buttons?: any) => {
      if (title === 'confirmOrder') {
        buttons?.[1]?.onPress?.();
      }
    });

    mockState = {
      commerce: {
        cart: {
          items: [{ product, quantity: 1 }],
          delivery_method: 'home',
          pickup_location: undefined,
          deliveryPreview: {
            subtotal: '25000',
            delivery_fee: '3000',
            total: '28000',
            total_bags: 1,
            free_delivery_threshold_reached: false,
          },
          previewLoading: false,
        },
      },
      auth: {
        user: { id: 'u1', region: 'Littoral' },
        farmProfile: { id: 'farm-1' },
      },
      aquaculture: {
        currentCycle: undefined,
      },
    };

    const { getByText } = render(<CartScreen />);
    fireEvent.press(getByText('confirmOrder'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('error', 'detail API');
    });
  });
});
