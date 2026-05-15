import * as SecureStore from 'expo-secure-store';

import { STORAGE_KEYS } from '@/constants/api';
import { apiService } from '@/services/api';
import { profileService } from '@/features/profile/services/profileService';

jest.mock('@/services/api');
jest.mock('expo-secure-store');

describe('features/profile/services/profileService', () => {
  const mockApiService = apiService as jest.Mocked<typeof apiService>;
  const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;

  const mockUser = {
    id: '123',
    phone_number: '+237670000000',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    account_type: 'individual' as const,
    language_preference: 'fr' as const,
    is_verified: false,
    display_name: 'John Doe',
    is_individual: true,
    is_company: false,
  };

  const mockFarmProfile = {
    id: '456',
    farm_name: 'Ferme Test',
    certification_status: 'pending' as const,
    total_ponds: 5,
    total_area_m2: 5000,
    is_certified: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiService.get.mockReset();
    mockApiService.patch.mockReset();
    mockSecureStore.setItemAsync.mockReset();
    mockApiService.get.mockResolvedValue({ data: {} } as any);
    mockApiService.patch.mockResolvedValue({ data: {} } as any);
    mockSecureStore.setItemAsync.mockResolvedValue();
  });

  it('recupere le profil utilisateur et met a jour le storage', async () => {
    mockApiService.get.mockResolvedValueOnce({ data: mockUser } as any);

    const result = await profileService.getProfile();

    expect(mockApiService.get).toHaveBeenCalledWith(expect.stringContaining('/profile/'));
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      STORAGE_KEYS.USER_DATA,
      JSON.stringify(mockUser)
    );
    expect(result).toEqual(mockUser);
  });

  it('met a jour le profil utilisateur', async () => {
    const updatedUser = { ...mockUser, first_name: 'Jane' };
    mockApiService.patch.mockResolvedValueOnce({ data: updatedUser } as any);

    const result = await profileService.updateProfile({ first_name: 'Jane' });

    expect(mockApiService.patch).toHaveBeenCalledWith(
      expect.stringContaining('/profile/'),
      { first_name: 'Jane' }
    );
    expect(result).toEqual(updatedUser);
  });

  it('recupere et normalise le profil ferme', async () => {
    mockApiService.get.mockResolvedValueOnce({
      data: {
        ...mockFarmProfile,
        annual_production_target_kg: '1200.00',
        setup_unit_surface_m2: '150.50',
        planned_selling_price_per_kg_fcfa: '2800.00',
      },
    } as any);

    const result = await profileService.getFarmProfile();

    expect(mockApiService.get).toHaveBeenCalledWith(expect.stringContaining('/farm/'));
    expect(result?.annual_production_target_kg).toBe(1200);
    expect(result?.setup_unit_surface_m2).toBe(150.5);
    expect(result?.planned_selling_price_per_kg_fcfa).toBe(2800);
  });

  it('retourne null si le profil ferme est introuvable', async () => {
    mockApiService.get.mockRejectedValueOnce({ response: { status: 404 } });

    await expect(profileService.getFarmProfile()).resolves.toBeNull();
  });

  it('met a jour le profil ferme', async () => {
    const updatedFarm = { ...mockFarmProfile, farm_name: 'Nouvelle Ferme' };
    mockApiService.patch.mockResolvedValueOnce({ data: updatedFarm } as any);

    const result = await profileService.updateFarmProfile({ farm_name: 'Nouvelle Ferme' });

    expect(mockApiService.patch).toHaveBeenCalledWith(
      expect.stringContaining('/farm/'),
      { farm_name: 'Nouvelle Ferme' }
    );
    expect(result).toEqual(expect.objectContaining(updatedFarm));
    expect(result.annual_production_target_kg).toBeNull();
  });
});
