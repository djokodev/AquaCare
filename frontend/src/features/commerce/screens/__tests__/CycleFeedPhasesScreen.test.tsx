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
  remaining_need_kg: '40.00',
  consumed_kg: '0.00',
  allocated_stock_kg: '0.00',
  allocated_pending_kg: '0.00',
  shortfall_kg: '40.00',
  surplus_kg: '0.00',
  product_available: true,
  total_bags: 2,
  total_price: 40000,
  products: [{ product_id: 'p1', product_name: 'Starter', package_weight_kg: 20, quantity_bags: 2, total_kg: 40, unit_price: 20000, total_price: 40000, brand: 'dibaq', species: 'tilapia' as const, pellet_size_mm: 2 }],
};

const recommendation = (feeding_phases: Array<typeof phase>) => ({
  cycle_id: 'cycle-1',
  status: feeding_phases.length ? 'available' as const : 'available' as const,
  source: 'current_cycle_reforecast',
  calculated_at: '2026-07-20T00:00:00Z',
  summary: {},
  feeding_phases,
  warnings: [],
});

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
    jest.spyOn(aquacultureService, 'getCycleFeedPhases').mockResolvedValue(recommendation([phase]));
    const { findByText, getByLabelText, getByText } = render(<CycleFeedPhasesScreen {...props} />);

    expect(await findByText('Starter')).toBeTruthy();
    fireEvent.press(getByLabelText('increaseQuantity'));
    fireEvent.press(getByText('feedPhaseOrderBtn'));

    expect(mockDispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ quantity: 3 }) }));
    expect(Alert.alert).toHaveBeenCalledWith('success', 'feedPhaseAddedToCart', expect.any(Array));
  });

  it('commande toutes les phases et conserve le cycle dans la navigation', async () => {
    jest.spyOn(aquacultureService, 'getCycleFeedPhases').mockResolvedValue(recommendation([phase]));
    const { findByText, getByText } = render(<CycleFeedPhasesScreen {...props} />);
    await findByText('Starter');
    fireEvent.press(getByText(/feedPhaseOrderAllBtn/));
    expect(mockNavigate).toHaveBeenCalledWith('Cart', { cycleId: 'cycle-1' });
  });

  it('affiche une erreur puis permet de relancer', async () => {
    const load = jest.spyOn(aquacultureService, 'getCycleFeedPhases')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(recommendation([]));
    const { findByText, getByText } = render(<CycleFeedPhasesScreen {...props} />);
    expect(await findByText('feedPhasesLoadError')).toBeTruthy();
    fireEvent.press(getByText('retry'));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it('affiche le loading puis l etat vide', async () => {
    let resolveLoad: ((value: ReturnType<typeof recommendation>) => void) | undefined;
    jest.spyOn(aquacultureService, 'getCycleFeedPhases').mockImplementation(() => new Promise((resolve) => { resolveLoad = resolve; }));
    const loading = render(<CycleFeedPhasesScreen {...props} />);
    expect(loading.getByText('loading')).toBeTruthy();
    resolveLoad?.(recommendation([]));
    expect(await loading.findByText('feedPhasesEmpty')).toBeTruthy();
  });

  it('gere plusieurs phases, produits et quantites independantes', async () => {
    const secondProduct = { ...phase.products[0], product_id: 'p2', product_name: 'Grower', quantity_bags: 1 };
    const thirdProduct = { ...secondProduct, product_id: 'p3', product_name: 'Finisher' };
    const secondPhase = { ...phase, phase_name: 'grossissement', products: [thirdProduct], total_bags: 1 };
    jest.spyOn(aquacultureService, 'getCycleFeedPhases').mockResolvedValue(
      recommendation([{ ...phase, products: [phase.products[0], secondProduct] }, secondPhase])
    );
    mockCartQuantity = 3;
    const { findByText, getAllByLabelText, getByLabelText } = render(<CycleFeedPhasesScreen {...props} />);

    expect(await findByText('Starter')).toBeTruthy();
    expect(await findByText('Grower')).toBeTruthy();
    expect(await findByText('Finisher')).toBeTruthy();
    expect(getByLabelText('cart 3')).toBeTruthy();
    expect(getAllByLabelText('decreaseQuantity')[1].props.accessibilityState.disabled).toBe(false);
    fireEvent.press(getAllByLabelText('increaseQuantity')[0]);
    fireEvent.press(getAllByLabelText('increaseQuantity')[1]);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
