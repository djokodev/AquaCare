import React from 'react';
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
import { Alert, RefreshControl } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import FeedingSuggestionsScreen from '../FeedingSuggestionsScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
let mockState: any;
let mockLanguage: 'keys' | 'fr' | 'en' = 'keys';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (mockLanguage === 'keys') return key;
      const translations: Record<string, string> =
        mockLanguage === 'fr'
          ? jest.requireActual('@/i18n/locales/fr').fr
          : jest.requireActual('@/i18n/locales/en').en;
      return translations[key] ?? key;
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

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

describe('FeedingSuggestionsScreen', () => {
  const product = {
    id: 'prod-1',
    brand: 'dibaq',
    name: 'Feed Smart',
    species: 'tilapia',
    phase: 'grossissement',
    pellet_size_mm: '4',
    protein_percentage: 28,
    lipid_percentage: 7,
    package_weight_kg: 15,
    price_per_package: '29000',
    price_per_kg: '1933',
    is_available: true,
    created_at: '2026-02-20T10:00:00.000Z',
    updated_at: '2026-02-20T10:00:00.000Z',
  };

  const suggestionData = {
    has_suggestions: true,
    suggestion_type: 'ai',
    analysis: {
      confidence_score: 85,
      cycles_with_data: 1,
      total_cycles: 1,
      analysis_period_days: 30,
      safety_buffer_days: 5,
    },
    suggestions: [
      {
        cycle_id: 'cycle-1',
        cycle_name: 'Cycle Tilapia',
        species: 'tilapia',
        current_phase: 'grossissement',
        current_avg_weight_g: 220,
        days_remaining: 60,
        avg_daily_consumption_kg: 12,
        summary: {
          total_needed_kg: 500,
          total_bags: 34,
          total_price: 986000,
          coverage_days: 60,
        },
        phases: [
          {
            phase_name: 'Phase 1',
            pellet_size_mm: 4,
            weight_range_g: [100, 300],
            days_coverage: 30,
            estimated_need_kg: 250,
            total_price: 493000,
            products: [
              {
                product_id: 'prod-1',
                product_name: 'Feed Smart',
                quantity_bags: 17,
                total_kg: 255,
                total_price: 493000,
                brand: 'dibaq',
              },
            ],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLanguage = 'keys';
    mockDispatch.mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockState = {
      commerce: {
        suggestions: {
          data: suggestionData,
          loading: false,
          error: null,
        },
        cart: {
          items: [],
        },
        products: {
          items: [product],
        },
      },
      auth: {
        user: { id: 'u1' },
        farmProfile: { id: 'farm-1' },
      },
      aquaculture: {
        currentCycle: { id: 'cycle-1', cycle_name: 'Cycle Tilapia', status: 'active' },
      },
    };
  });

  it('affiche les suggestions, details phase et ajout cycle au panier', () => {
    const { getByLabelText, getByText } = render(<FeedingSuggestionsScreen />);

    expect(getByLabelText('Cycle Tilapia, details').props.accessibilityState.expanded).toBe(false);
    fireEvent.press(getByLabelText('Cycle Tilapia, details'));
    expect(getByLabelText('Cycle Tilapia, collapseActions').props.accessibilityState.expanded).toBe(true);
    expect(getByLabelText('Phase 1, details').props.accessibilityState.expanded).toBe(false);
    fireEvent.press(getByLabelText('Phase 1, details'));
    expect(getByLabelText('Phase 1, collapseActions').props.accessibilityState.expanded).toBe(true);
    expect(getByText('recommendedProducts')).toBeTruthy();

    fireEvent.press(getByText('addAllToCart'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'success',
      'cycleProductsAddedToCart',
      expect.any(Array)
    );
  });

  it('ajoute un produit et signale un produit absent', () => {
    const { getByLabelText } = render(<FeedingSuggestionsScreen />);
    fireEvent.press(getByLabelText('Cycle Tilapia, details'));
    fireEvent.press(getByLabelText('Phase 1, details'));
    fireEvent.press(getByLabelText('addToCart Feed Smart'));
    expect(mockDispatch).toHaveBeenCalled();

    mockState.commerce.products.items = [];
    const missing = render(<FeedingSuggestionsScreen />);
    fireEvent.press(missing.getByLabelText('Cycle Tilapia, details'));
    fireEvent.press(missing.getByLabelText('Phase 1, details'));
    fireEvent.press(missing.getByLabelText('addToCart Feed Smart'));
    expect(Alert.alert).toHaveBeenCalledWith('error', 'productNotFound');
  });

  it('rafraichit et conserve les suggestions en cas d erreur', async () => {
    mockState.commerce.suggestions.error = 'refresh failed';
    const { getByText, UNSAFE_getByType } = render(<FeedingSuggestionsScreen />);

    expect(getByText('Cycle Tilapia')).toBeTruthy();
    expect(getByText('refresh failed')).toBeTruthy();
    await UNSAFE_getByType(RefreshControl).props.onRefresh();
    expect(mockDispatch).toHaveBeenCalled();
  });

  it('affiche l etat vide et redirige vers nouveau cycle', () => {
    mockState.commerce.suggestions.data = {
      has_suggestions: false,
      suggestion_type: 'ai',
      analysis: {},
      suggestions: [],
    };

    const { getByText } = render(<FeedingSuggestionsScreen />);
    fireEvent.press(getByText('startNewCycle'));

    expect(mockNavigate).toHaveBeenCalledWith('CreateFarm');
  });

  it('affiche l etat erreur et permet retry', () => {
    mockState.commerce.suggestions = {
      data: null,
      loading: false,
      error: 'request failed',
    };

    const { getByText } = render(<FeedingSuggestionsScreen />);
    fireEvent.press(getByText('retry'));

    expect(mockDispatch).toHaveBeenCalled();
  });

  it('affiche l etat cycle non selectionne quand la session n est pas definie', () => {
    mockState.aquaculture.currentCycle = undefined;

    const { getByText } = render(<FeedingSuggestionsScreen />);

    expect(getByText('sessionCycleNotSelected')).toBeTruthy();
    fireEvent.press(getByText('sessionCycleConfirm'));
    expect(mockNavigate).toHaveBeenCalledWith('CycleSessionEntry', {
      showBackToDashboard: true,
    });
  });

  it('traduit la phase pre_recolte pour le cycle et les phases futures', () => {
    const preHarvestSuggestion = {
      ...suggestionData,
      suggestions: [
        {
          ...suggestionData.suggestions[0],
          current_phase: 'pre_recolte',
          phases: [
            {
              ...suggestionData.suggestions[0].phases[0],
              phase_name: 'pre_recolte',
              pellet_size_mm: 6,
            },
          ],
        },
      ],
    };
    mockState.commerce.suggestions.data = preHarvestSuggestion;

    mockLanguage = 'fr';
    const french = render(<FeedingSuggestionsScreen />);
    expect(french.getByText(/Phase actuelle: Pré-récolte/)).toBeTruthy();
    fireEvent.press(french.getByLabelText('Cycle Tilapia, Détails'));
    expect(french.getByText('Pré-récolte')).toBeTruthy();
    expect(french.queryByText(/pre_recolte/)).toBeNull();
    french.unmount();

    mockLanguage = 'en';
    const english = render(<FeedingSuggestionsScreen />);
    expect(english.getByText(/Current phase: Pre-harvest/)).toBeTruthy();
    fireEvent.press(english.getByLabelText('Cycle Tilapia, Details'));
    expect(english.getByText('Pre-harvest')).toBeTruthy();
    expect(english.queryByText(/pre_recolte/)).toBeNull();
  });
});
