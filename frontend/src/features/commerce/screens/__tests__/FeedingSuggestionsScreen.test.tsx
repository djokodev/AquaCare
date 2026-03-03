import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import FeedingSuggestionsScreen from '../FeedingSuggestionsScreen';

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
    const { getByText } = render(<FeedingSuggestionsScreen />);

    fireEvent.press(getByText('Cycle Tilapia'));
    fireEvent.press(getByText('Phase 1'));
    expect(getByText('recommendedProducts')).toBeTruthy();

    fireEvent.press(getByText('addAllToCart'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'success',
      'cycleProductsAddedToCart',
      expect.any(Array)
    );
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

    expect(mockNavigate).toHaveBeenCalledWith('NewCycle');
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
    expect(mockNavigate).toHaveBeenCalledWith('CycleSessionEntry');
  });
});
