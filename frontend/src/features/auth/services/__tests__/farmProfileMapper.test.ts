import { normalizeFarmProfile } from '../farmProfileMapper';
import type { FarmProfileApiResponse } from '@/features/profile/types/profile';

describe('normalizeFarmProfile', () => {
  const baseProfile: FarmProfileApiResponse = {
    id: 'farm-1',
    farm_name: 'Ferme Test',
    certification_status: 'pending',
    total_ponds: 2,
    is_certified: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  it('convertit les DecimalField Django en nombres pour le modèle front', () => {
    const result = normalizeFarmProfile({
      ...baseProfile,
      total_area_m2: '125.50',
      annual_production_kg: '1000.00',
      default_feed_price_per_kg: '1800.00',
      latitude: '4.0511000',
      longitude: '9.7679000',
      annual_production_target_kg: '2400.00',
      setup_unit_count: '6',
      setup_unit_volume_m3: '12.25',
      setup_unit_surface_m2: '80.00',
      fingerlings_cost_per_unit_fcfa: '50.00',
      planned_selling_price_per_kg_fcfa: '2800.00',
    });

    expect(result.total_area_m2).toBe(125.5);
    expect(result.annual_production_kg).toBe(1000);
    expect(result.default_feed_price_per_kg).toBe(1800);
    expect(result.latitude).toBe(4.0511);
    expect(result.longitude).toBe(9.7679);
    expect(result.annual_production_target_kg).toBe(2400);
    expect(result.setup_unit_count).toBe(6);
    expect(result.setup_unit_volume_m3).toBe(12.25);
    expect(result.setup_unit_surface_m2).toBe(80);
    expect(result.fingerlings_cost_per_unit_fcfa).toBe(50);
    expect(result.planned_selling_price_per_kg_fcfa).toBe(2800);
  });

  it('normalise les champs setup absents en null pour éviter les undefined ambigus', () => {
    const result = normalizeFarmProfile(baseProfile);

    expect(result.annual_production_target_kg).toBeNull();
    expect(result.setup_unit_count).toBeNull();
    expect(result.setup_unit_volume_m3).toBeNull();
    expect(result.setup_unit_surface_m2).toBeNull();
    expect(result.fingerlings_cost_per_unit_fcfa).toBeNull();
    expect(result.planned_selling_price_per_kg_fcfa).toBeNull();
  });
});
