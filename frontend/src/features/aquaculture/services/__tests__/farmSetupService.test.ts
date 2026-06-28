import { API_ENDPOINTS } from '@/constants/api';
import { apiService } from '@/services/api';

import { farmSetupService } from '../farmSetupService';
import type {
  AnnualSimulationInput,
  FarmSetupData,
} from '@/features/aquaculture/types/farmSetup';

jest.mock('@/services/api');

describe('farmSetupService', () => {
  const mockApiService = apiService as jest.Mocked<typeof apiService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiService.post.mockReset();
  });

  it('sauvegarde le setup sur le endpoint canonique aquaculture', async () => {
    const setupData: FarmSetupData = {
      setup_species: 'tilapia',
      setup_infrastructure_type: 'etang',
      setup_unit_count: 2,
      setup_unit_surface_m2: 100,
      annual_production_target_kg: 500,
      num_cycles_per_year: 2,
    };
    const farmProfile = {
      id: 'farm-1',
      farm_name: 'Ferme Test',
      total_ponds: 2,
      total_area_m2: 100,
      water_source: 'well',
      main_species: 'tilapia',
      annual_production_kg: 500,
      certification_status: 'pending',
      default_feed_price_per_kg: 450,
      farm_setup_completed: true,
      setup_species: 'tilapia',
      setup_infrastructure_type: 'etang',
      setup_unit_count: 2,
      setup_unit_surface_m2: 100,
      annual_production_target_kg: 500,
      num_cycles_per_year: 2,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    mockApiService.post.mockResolvedValueOnce({ data: farmProfile } as any);

    const result = await farmSetupService.completeFarmSetup(setupData);

    expect(mockApiService.post).toHaveBeenCalledWith(
      API_ENDPOINTS.AQUACULTURE.PRODUCTION_PLAN_SETUP,
      setupData
    );
    expect(result.farm_setup_completed).toBe(true);
  });

  it('lance la simulation annuelle sur le endpoint canonique aquaculture', async () => {
    const params: AnnualSimulationInput = {
      species: 'tilapia',
      annual_production_target_kg: 500,
      num_cycles: 1,
    };
    const simulation = {
      species: 'tilapia',
      num_cycles: 1,
      annual_production_target_kg: 500,
      cycles_per_year_derived: 1,
      technical_pause_days: 14,
      other_costs_rate_pct: 5,
      annual_revenue_fcfa: 1400000,
      annual_feed_cost_fcfa: 450000,
      annual_fingerlings_cost_fcfa: 75000,
      annual_other_costs_fcfa: 25000,
      annual_total_cost_fcfa: 560000,
      aquacare_fee_fcfa: 10000,
      annual_net_profit_fcfa: 840000,
      annual_roi_pct: 150,
      cycle_production_kg: 500,
      cycle_revenue_fcfa: 1400000,
      cycle_feed_cost_fcfa: 450000,
      cycle_fingerlings_cost_fcfa: 75000,
      cycle_other_costs_fcfa: 25000,
      cycle_aquacare_fee_fcfa: 10000,
      cycle_total_cost_fcfa: 560000,
      cycle_net_profit_fcfa: 840000,
      cycle_roi_pct: 150,
      annual_projection_production_kg: 500,
      annual_projection_revenue_fcfa: 1400000,
      annual_projection_net_profit_fcfa: 840000,
      annual_projection_aquacare_fee_fcfa: 10000,
      production_per_cycle_kg: 500,
      cycle_duration_days: 180,
      feed_bags_per_cycle: 23,
      initial_fish_count_per_cycle: 1500,
      cycles_breakdown: [],
    };
    mockApiService.post.mockResolvedValueOnce({ data: simulation } as any);

    const result = await farmSetupService.simulateAnnualProduction(params);

    expect(mockApiService.post).toHaveBeenCalledWith(
      API_ENDPOINTS.AQUACULTURE.PRODUCTION_PLAN_SIMULATE,
      params
    );
    expect(result).toEqual(simulation);
  });
});
