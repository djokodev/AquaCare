import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import CycleSimulatorScreen from '../CycleSimulatorScreen';

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
      feed_cost_fcfa: 840000,
      fingerlings_cost_fcfa: 50000,
      other_costs_fcfa: 25000,
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
    mockRouteParams = undefined;
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockState = {
      aquaculture: {
        currentCycle: undefined,
        activeCycles: [],
      },
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

  it('auto lance la simulation avec les params de navigation', () => {
    mockRouteParams = {
      cycleId: 'cycle-1',
      prefill: {
        species: 'catfish',
        initial_fish_count: 1200,
        initial_weight_g: 6,
        target_weight_g: 450,
        cycle_duration_days: 155,
        survival_rate: 0.82,
        selling_price_per_kg_fcfa: 3000,
        fingerlings_cost_fcfa: 120000,
        other_costs_fcfa: 80000,
      },
    };

    render(<CycleSimulatorScreen />);

    expect(mockDispatch).toHaveBeenCalled();
  });

  it('n expose pas la mise a jour d un cycle hors session', () => {
    mockRouteParams = {
      cycleId: 'cycle-out-of-session',
      prefill: {
        species: 'tilapia',
        initial_fish_count: 900,
        initial_weight_g: 6,
        target_weight_g: 350,
        cycle_duration_days: 140,
        survival_rate: 0.85,
        selling_price_per_kg_fcfa: 2500,
        fingerlings_cost_fcfa: 80000,
        other_costs_fcfa: 20000,
      },
    };

    const { queryByText } = render(<CycleSimulatorScreen />);
    expect(queryByText('updateCycleParameters')).toBeNull();
  });

  it('prefill les champs a partir de currentCycle quand disponible', () => {
    mockState.aquaculture.currentCycle = {
      id: 'cycle-session',
      farm_profile: 'farm-1',
      cycle_name: 'Cycle Session',
      species: 'clarias',
      pond_identifier: 'P1',
      pond_surface_m2: 120,
      start_date: '2026-01-01',
      initial_count: 1500,
      initial_average_weight: 12,
      initial_biomass: 18,
      target_harvest_weight_g: 450,
      planned_cycle_duration_days: 160,
      expected_survival_rate_pct: 82,
      planned_selling_price_per_kg_fcfa: 3000,
      fingerlings_cost_fcfa: 200000,
      other_operational_costs_fcfa: 50000,
      current_count: 1400,
      current_average_weight: 100,
      current_biomass: 140,
      total_feed_consumed: 200,
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    mockState.aquaculture.activeCycles = [mockState.aquaculture.currentCycle];

    const { getByDisplayValue } = render(<CycleSimulatorScreen />);

    expect(getByDisplayValue('1500')).toBeTruthy();
    expect(getByDisplayValue('450')).toBeTruthy();
    expect(getByDisplayValue('3000')).toBeTruthy();
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
