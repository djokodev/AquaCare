import { renderHook, act, waitFor } from '@testing-library/react-native';

import { useFarmProfileEditor } from '../useFarmProfileEditor';
import type { FarmProfile } from '@/features/profile/types/profile';

describe('features/profile/hooks/useFarmProfileEditor', () => {
  it("n'initialise pas annual_production_kg dans l'etat d'edition", async () => {
    const updateFarm = jest.fn().mockResolvedValue({} as FarmProfile);
    const farmProfile: FarmProfile = {
      id: 'farm-1',
      farm_name: 'Ferme Test',
      certification_status: 'pending',
      total_ponds: 3,
      total_area_m2: 1200,
      water_source: 'Riviere',
      main_species: 'tilapia',
      annual_production_kg: 500,
      latitude: null,
      longitude: null,
      location_address: '',
      is_certified: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    const { result } = renderHook(() => useFarmProfileEditor({ farmProfile, updateFarm }));

    await waitFor(() => {
      expect(result.current.editData.farm_name).toBe('Ferme Test');
    });

    await act(async () => {
      await result.current.save();
    });

    expect(updateFarm).toHaveBeenCalledTimes(1);
    expect(updateFarm.mock.calls[0][0]).not.toHaveProperty('annual_production_kg');
  });
});
