import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import CycleFeedPhasesScreen from '../CycleFeedPhasesScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';

const mockDispatch = jest.fn();
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockCartQuantity = 0;

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: (state: unknown) => unknown) => selector({ commerce: { cart: { items: mockCartQuantity ? [{ quantity: mockCartQuantity }] : [] } } }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

const phase = {
  phase_name: 'alevinage',
  days_range: [1, 30] as [number, number],
  weight_range_g: [5, 50] as [number, number],
  pellet_size_mm: 2,
  duration_days: 30,
  total_consumption_kg: 40,
  daily_avg_kg: 1.3,
  total_bags: 2,
  total_price: 40000,
  products: [{ product_id: 'p1', product_name: 'Starter', package_weight_kg: 20, quantity_bags: 2, total_kg: 40, unit_price: 20000, total_price: 40000, brand: 'dibaq' }],
};

const props = ({
  navigation: { navigate: mockNavigate, goBack: mockGoBack },
  route: { params: { cycleId: 'cycle-1' } },
} as unknown) as React.ComponentProps<typeof CycleFeedPhasesScreen>;

describe('CycleFeedPhasesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCartQuantity = 0;
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  it('affiche les phases, ajuste la quantite et ajoute une phase', async () => {
    jest.spyOn(aquacultureService, 'getCycleFeedPhases').mockResolvedValue({ feeding_phases: [phase] });
    const { findByText, getByLabelText, getByText } = render(<CycleFeedPhasesScreen {...props} />);

    expect(await findByText('Starter')).toBeTruthy();
    fireEvent.press(getByLabelText('increaseQuantity'));
    fireEvent.press(getByText('feedPhaseOrderBtn'));

    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ quantity: 3 }) }));
    expect(Alert.alert).toHaveBeenCalledWith('success', 'feedPhaseAddedToCart', expect.any(Array));
  });

  it('commande toutes les phases et conserve le cycle dans la navigation', async () => {
    jest.spyOn(aquacultureService, 'getCycleFeedPhases').mockResolvedValue({ feeding_phases: [phase] });
    const { findByText, getByText } = render(<CycleFeedPhasesScreen {...props} />);
    await findByText('Starter');
    fireEvent.press(getByText(/feedPhaseOrderAllBtn/));
    expect(mockNavigate).toHaveBeenCalledWith('Cart', { cycleId: 'cycle-1' });
  });

  it('affiche une erreur puis permet de relancer', async () => {
    const load = jest.spyOn(aquacultureService, 'getCycleFeedPhases')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ feeding_phases: [] });
    const { findByText, getByText } = render(<CycleFeedPhasesScreen {...props} />);
    expect(await findByText('feedPhasesLoadError')).toBeTruthy();
    fireEvent.press(getByText('retry'));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
});
