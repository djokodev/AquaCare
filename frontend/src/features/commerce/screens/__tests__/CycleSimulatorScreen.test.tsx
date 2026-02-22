import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import CycleSimulatorScreen from '../CycleSimulatorScreen';

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

describe('CycleSimulatorScreen', () => {
  const product = {
    id: 'prod-1',
    brand: 'dibaq',
    name: 'Feed Pro',
    species: 'tilapia',
    phase: 'grossissement',
    pellet_size_mm: '4',
    protein_percentage: 28,
    lipid_percentage: 7,
    package_weight_kg: 15,
    price_per_package: '30000',
    price_per_kg: '2000',
    is_available: true,
    created_at: '2026-02-20T10:00:00.000Z',
    updated_at: '2026-02-20T10:00:00.000Z',
  };

  const simulationResult = {
    simulation_type: 'predictive',
    parameters: {
      species: 'tilapia',
      initial_fish_count: 1000,
      initial_weight_g: 5,
      target_weight_g: 300,
      cycle_duration_days: 120,
      survival_rate: 0.85,
    },
    feeding_phases: [
      {
        phase_name: 'grow_out',
        days_range: [1, 30],
        weight_range_g: [5, 120],
        pellet_size_mm: 3,
        duration_days: 30,
        total_consumption_kg: 420,
        daily_avg_kg: 14,
        total_bags: 28,
        total_price: 840000,
        products: [
          {
            product_id: 'prod-1',
            product_name: 'Feed Pro',
            package_weight_kg: 15,
            quantity_bags: 28,
            total_kg: 420,
            unit_price: 30000,
            total_price: 840000,
            brand: 'dibaq',
          },
        ],
      },
    ],
    summary: {
      total_feed_kg: 420,
      total_cost_fcfa: 840000,
      initial_fish_count: 1000,
      estimated_final_count: 850,
      survival_rate: 0.85,
      biomass_gain_kg: 250,
      estimated_fcr: 1.6,
      estimated_revenue_fcfa: 1500000,
      estimated_profit_fcfa: 660000,
      roi_percentage: 78.6,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockState = {
      commerce: {
        simulation: {
          result: null,
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
    };
  });

  it('valide les champs et bloque une simulation invalide', () => {
    const { getByDisplayValue, getByText } = render(<CycleSimulatorScreen />);

    fireEvent.changeText(getByDisplayValue('1000'), '0');
    fireEvent.press(getByText('simulate'));

    expect(Alert.alert).toHaveBeenCalledWith('error', 'invalidSimulationParams');
  });

  it('declenche la simulation avec des parametres valides', () => {
    const { getByText } = render(<CycleSimulatorScreen />);

    fireEvent.press(getByText('simulate'));

    expect(mockDispatch).toHaveBeenCalled();
  });

  it('affiche les resultats et ajoute les produits au panier', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((title: any, _msg?: any, buttons?: any) => {
      if (title === 'success') {
        buttons?.[0]?.onPress?.();
      }
    });

    mockState.commerce.simulation.result = simulationResult;

    const { getByText } = render(<CycleSimulatorScreen />);

    expect(getByText('simulationResults')).toBeTruthy();
    fireEvent.press(getByText('addAllToCart'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('Cart');
    });
  });
});
