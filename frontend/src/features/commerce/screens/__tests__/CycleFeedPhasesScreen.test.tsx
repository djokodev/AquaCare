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
  phase_id: 'phase-001',
  sequence: 1,
  phase_status: 'current' as const,
  phase_name: 'alevinage',
  days_range: [1, 30] as [number, number],
  planned_days_range: [1, 30] as [number, number],
  weight_range_g: ['5.00', '50.00'] as [string, string],
  planned_weight_range_g: ['5.00', '50.00'] as [string, string],
  pellet_size_mm: '2.00',
  duration_days: 30,
  planned_duration_days: 30,
  planned_consumption_kg: '40.00',
  actual_consumed_kg: '0.00',
  estimated_remaining_need_kg: '40.00',
  remaining_need_kg: '40.00',
  consumed_kg: '0.00',
  allocated_stock_kg: '0.00',
  allocated_pending_kg: '0.00',
  shortfall_kg: '40.00',
  surplus_kg: '0.00',
  product_available: true,
  total_bags: 2,
  total_price: '40000.00',
  products: [{ product_id: 'p1', product_name: 'Starter', package_weight_kg: '20.00', quantity_bags: 2, total_kg: '40.00', unit_price: '20000.00', total_price: '40000.00', brand: 'dibaq', species: 'tilapia' as const, pellet_size_mm: '2.00' }],
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
    fireEvent.press(getByText(/feedPhaseOrderAllBtn/));
    expect(mockNavigate).toHaveBeenCalledWith('Cart', { cycleId: 'cycle-1' });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it('affiche les avertissements structurés sans exposer une clé backend brute', async () => {
    jest.spyOn(aquacultureService, 'getCycleFeedPhases').mockResolvedValue({
      ...recommendation([phase]),
      status: 'incomplete',
      warnings: ['unclassified_consumption'],
    });
    const { findByText, queryByText } = render(<CycleFeedPhasesScreen {...props} />);

    expect(await findByText('feedWarning_unclassified_consumption')).toBeTruthy();
    expect(queryByText('unclassified_consumption')).toBeNull();
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

  it('affiche clairement une phase terminee sans chiffres techniques', async () => {
    const coveredPhase = {
      ...phase,
      total_bags: 0,
      shortfall_kg: '0.00',
      remaining_need_kg: '0.00',
      products: [],
    };
    jest.spyOn(aquacultureService, 'getCycleFeedPhases').mockResolvedValue(recommendation([coveredPhase]));

    const { findByText, getByText, queryByText } = render(<CycleFeedPhasesScreen {...props} />);

    expect(await findByText('feedPhaseCompleted')).toBeTruthy();
    expect(getByText('feedPhaseCompletedShort')).toBeTruthy();
    expect(queryByText('feedPhaseCoverage')).toBeNull();
    expect(queryByText('feedPhaseDetailsShow')).toBeNull();
    expect(queryByText('feedPhaseOrderBtn')).toBeNull();
  });

  it('signale une phase sans produit exact sans afficher une action de commande', async () => {
    const unavailablePhase = {
      ...phase,
      product_available: false,
      total_bags: 0,
      shortfall_kg: '25.00',
      products: [],
    };
    jest.spyOn(aquacultureService, 'getCycleFeedPhases').mockResolvedValue(recommendation([unavailablePhase]));

    const { findByText, getByText, queryByText } = render(<CycleFeedPhasesScreen {...props} />);

    expect(await findByText('feedPhaseUnavailable')).toBeTruthy();
    expect(getByText('feedPhaseNoExactProduct')).toBeTruthy();
    expect(queryByText('feedPhaseOrderBtn')).toBeNull();
    expect(queryByText('feedTotalToOrderLabel')).toBeNull();
  });

  it('regroupe les etapes commerciales qui utilisent le meme aliment', async () => {
    const secondStep = {
      ...phase,
      phase_id: 'phase-002',
      days_range: [31, 60] as [number, number],
      planned_days_range: [31, 60] as [number, number],
      weight_range_g: ['50.00', '100.00'] as [string, string],
      planned_weight_range_g: ['50.00', '100.00'] as [string, string],
      total_bags: 1,
      planned_consumption_kg: '20.00',
      shortfall_kg: '20.00',
      remaining_need_kg: '20.00',
      products: [{ ...phase.products[0], quantity_bags: 1, total_kg: '20.00', total_price: '20000.00' }],
    };
    jest.spyOn(aquacultureService, 'getCycleFeedPhases').mockResolvedValue(recommendation([phase, secondStep]));

    const { findByText, getAllByText } = render(<CycleFeedPhasesScreen {...props} />);

    expect(await findByText('feedPhaseToOrder')).toBeTruthy();
    expect(getAllByText('feedPhaseOrderBtn')).toHaveLength(1);
  });
});
