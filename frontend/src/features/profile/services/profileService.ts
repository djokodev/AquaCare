import * as SecureStore from 'expo-secure-store';

import { API_ENDPOINTS, STORAGE_KEYS } from '@/constants/api';
import { apiService } from '@/services/api';
import type {
  FarmProfile,
  FarmProfileApiResponse,
  UpdateFarmProfilePayload,
  UpdateUserProfilePayload,
} from '@/features/profile/types/profile';
import type { User } from '@/features/auth/types/auth';
import { normalizeFarmProfile } from '@/features/profile/services/farmProfileMapper';

class ProfileService {
  async getProfile(): Promise<User> {
    const response = await apiService.get<User>(API_ENDPOINTS.AUTH.PROFILE);
    await SecureStore.setItemAsync(
      STORAGE_KEYS.USER_DATA,
      JSON.stringify(response.data)
    );
    return response.data;
  }

  async updateProfile(profileData: UpdateUserProfilePayload): Promise<User> {
    const response = await apiService.patch<User>(
      API_ENDPOINTS.AUTH.PROFILE,
      profileData
    );
    await SecureStore.setItemAsync(
      STORAGE_KEYS.USER_DATA,
      JSON.stringify(response.data)
    );
    return response.data;
  }

  async getFarmProfile(): Promise<FarmProfile | null> {
    try {
      const response = await apiService.get<FarmProfileApiResponse>(
        API_ENDPOINTS.AUTH.FARM_PROFILE
      );
      return normalizeFarmProfile(response.data);
    } catch (error: unknown) {
      const axiosErr = error as { response?: { status: number } };
      if (axiosErr.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async updateFarmProfile(farmData: UpdateFarmProfilePayload): Promise<FarmProfile> {
    const response = await apiService.patch<FarmProfileApiResponse>(
      API_ENDPOINTS.AUTH.FARM_PROFILE,
      farmData
    );
    return normalizeFarmProfile(response.data);
  }
}

export const profileService = new ProfileService();
