import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import OrdersHistoryScreen from '../OrdersHistoryScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockDispatch = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
}));

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: any) =>
    selector({
      commerce: {
        orders: {
          items: [
            {
              id: 'order-1',
              order_number: 'ORD-001',
              status: 'confirmed',
              delivery_method: 'pickup',
              pickup_location: 'ndokoti',
              subtotal: '30000',
              delivery_fee: '0',
              total: '30000',
              total_bags: 1,
              is_free_delivery: false,
              items: [
                {
                  id: 'item-1',
                  product: 'p1',
                  product_name: 'Feed',
                  product_brand: 'aller_aqua',
                  product_package_weight: 20,
                  unit_price: '30000',
                  quantity: 1,
                  line_total: '30000',
                },
              ],
              delivery_name: 'Test User',
              delivery_phone: '+237600000000',
              delivery_region: 'Littoral',
              delivery_city: 'Douala',
              delivery_full_address: 'Bonamoussadi',
              user: 'u1',
              user_name: 'Test User',
              farm_profile: 'f1',
              farm_name: 'Farm',
              created_offline: false,
              created_at: '2026-02-20T10:00:00.000Z',
              updated_at: '2026-02-20T10:00:00.000Z',
            },
          ],
          statistics: {
            total_orders: 1,
            total_spent: '30000',
            total_bags_ordered: 1,
            average_order_value: '30000',
          },
          loading: false,
          error: null,
        },
      },
    }),
}));

describe('OrdersHistoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('affiche le prefixe i18n du point de retrait sans branding hardcode', () => {
    const { getByText, queryByText } = render(<OrdersHistoryScreen />);

    fireEvent.press(getByText('ORD-001'));

    expect(getByText('pickupLocationPrefix Ndokoti')).toBeTruthy();
    expect(queryByText(/MAVECAM/i)).toBeNull();
  });
});
