import { API_ENDPOINTS } from '@/constants/api';
import { normalizeFarmProfile } from '@/features/profile/services/farmProfileMapper';
import { apiService } from '@/services/api';
import type { FarmProfile, FarmProfileApiResponse } from '@/features/profile/types/profile';
import type {
  CycleSimulationInput,
  CycleSimulationResult,
  FarmSetupData,
} from '@/features/aquaculture/types/farmSetup';

class FarmSetupService {
  async completeFarmSetup(setupData: FarmSetupData): Promise<FarmProfile> {
    const response = await apiService.post<FarmProfileApiResponse>(
      API_ENDPOINTS.AQUACULTURE.PRODUCTION_PLAN_SETUP,
      setupData
    );
    return normalizeFarmProfile(response.data);
  }

  async simulateCycle(params: CycleSimulationInput): Promise<CycleSimulationResult> {
    const response = await apiService.post<CycleSimulationResult>(
      API_ENDPOINTS.AQUACULTURE.PRODUCTION_PLAN_SIMULATE,
      params
    );
    return response.data;
  }
}

export const farmSetupService = new FarmSetupService();
