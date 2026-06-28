import { apiService } from '@/services/api';
import { API_CONFIG } from '@/constants/api';
import logger from '@/utils/logger';
import {
  ProductionCycle,
  CycleLog,
  FeedingPlan,
  FeedPhase,
  SanitaryLog,
  DashboardData,
  ProductionReport,
  ReportType,
  SyncPayload,
  SyncResponse,
  CreateCycleForm,
  DailyLogForm,
  SanitaryLogForm,
  CycleStatistics,
  NutritionalGuide,
  Species,
  ReactNativeUploadFile,
  PartialHarvest,
  PartialHarvestData,
  CycleHarvestResponse,
  ActiveSanitaryIssueGroup,
  ProductionUnit,
  CycleUnitAllocation,
  ProductionUnitCreatePayload,
  CycleUnitAllocationCreatePayload,
} from '@/types/aquaculture';

interface PaginatedResponse<T> {
  results?: T[];
}

type ListResponse<T> = PaginatedResponse<T> | T[];

type CycleComparisonResponse = Record<string, unknown>;

const extractResults = <T>(data: ListResponse<T>): T[] => {
  if (Array.isArray(data)) {
    return data;
  }
  return data.results ?? [];
};

const isUnauthorizedError = (error: unknown): boolean => {
  const axiosErr = error as { response?: { status?: number } };
  return axiosErr?.response?.status === 401;
};

const isReactNativeUploadFile = (photo: unknown): photo is ReactNativeUploadFile => {
  if (!photo || typeof photo !== 'object') {
    return false;
  }

  const candidate = photo as Partial<ReactNativeUploadFile>;
  return (
    typeof candidate.uri === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.name === 'string'
  );
};

/**
 * Service API pour le module aquaculture AquaCare
 *
 * Gere toutes les interactions avec le backend Django aquaculture.
 */
class AquacultureService {
  private readonly baseUrl = '/aquaculture';
  private readonly inFlightDashboardRequests = new Map<string, Promise<DashboardData>>();

  // =================== DASHBOARD ===================

  async getDashboardData(
    cycleId?: string,
    options?: { lightweight?: boolean }
  ): Promise<DashboardData> {
    const lightweight = options?.lightweight === true;
    const requestKey = `${cycleId || '__all_cycles__'}:${lightweight ? 'lite' : 'full'}`;
    const inFlightRequest = this.inFlightDashboardRequests.get(requestKey);
    if (inFlightRequest) {
      return inFlightRequest;
    }

    const requestPromise = (async () => {
      try {
        const query = new URLSearchParams();
        if (cycleId) {
          query.append('cycle_id', cycleId);
        }
        if (lightweight) {
          query.append('lightweight', 'true');
        }
        const queryString = query.toString();
        const params = queryString ? `?${queryString}` : '';
        const response = await apiService.get<DashboardData>(`${this.baseUrl}/dashboard/${params}`);
        return response.data;
      } catch (error) {
        // 401 deja gere par l'interceptor axios (refresh + auto-logout) — eviter de
        // declencher la LogBox d'Expo pendant la transition logout.
        if (!isUnauthorizedError(error)) {
          logger.error('Erreur lors de la recuperation du dashboard:', error);
        }
        throw error;
      } finally {
        this.inFlightDashboardRequests.delete(requestKey);
      }
    })();

    this.inFlightDashboardRequests.set(requestKey, requestPromise);

    try {
      return await requestPromise;
    } finally {
      // Garantit un nettoyage même si un caller abandonne la promesse.
      this.inFlightDashboardRequests.delete(requestKey);
    }
  }

  // =================== REPORTS ===================

  async getReports(params?: {
    report_type?: ReportType;
    status?: 'draft' | 'validated';
    cycle_id?: string;
  }): Promise<ProductionReport[]> {
    try {
      const query = new URLSearchParams();
      if (params?.report_type) {
        query.append('report_type', params.report_type);
      }
      if (params?.status) {
        query.append('status', params.status);
      }
      if (params?.cycle_id) {
        query.append('cycle_id', params.cycle_id);
      }

      const queryString = query.toString();
      const url = `${this.baseUrl}/reports/${queryString ? `?${queryString}` : ''}`;

      const response = await apiService.get<ListResponse<ProductionReport>>(url);
      return extractResults(response.data);
    } catch (error) {
      logger.error('Erreur lors de la recuperation des rapports:', error);
      throw error;
    }
  }

  async getReport(id: string): Promise<ProductionReport> {
    try {
      const response = await apiService.get<ProductionReport>(`${this.baseUrl}/reports/${id}/`);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la recuperation du rapport ${id}:`, error);
      throw error;
    }
  }

  async generateReport(payload: {
    report_type: ReportType;
    reference_date?: string;
    cycle_id?: string;
  }): Promise<ProductionReport> {
    try {
      const response = await apiService.post<ProductionReport>(
        `${this.baseUrl}/reports/generate/`,
        payload
      );
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la generation du rapport:', error);
      throw error;
    }
  }

  async regenerateReport(id: string): Promise<ProductionReport> {
    try {
      const response = await apiService.post<ProductionReport>(`${this.baseUrl}/reports/${id}/regenerate/`);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la regeneration du rapport ${id}:`, error);
      throw error;
    }
  }

  async validateReport(id: string): Promise<ProductionReport> {
    try {
      const response = await apiService.post<ProductionReport>(`${this.baseUrl}/reports/${id}/validate/`);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la validation du rapport ${id}:`, error);
      throw error;
    }
  }

  async sendReportEmail(id: string): Promise<ProductionReport> {
    try {
      const response = await apiService.post<ProductionReport>(`${this.baseUrl}/reports/${id}/send-email/`);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de l'envoi email du rapport ${id}:`, error);
      throw error;
    }
  }

  async markReportWhatsAppShared(
    id: string,
    payload?: { recipient?: string; metadata?: Record<string, unknown> }
  ): Promise<ProductionReport> {
    try {
      const response = await apiService.post<ProductionReport>(
        `${this.baseUrl}/reports/${id}/mark-whatsapp-shared/`,
        payload || {}
      );
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors du marquage WhatsApp du rapport ${id}:`, error);
      throw error;
    }
  }

  getReportDownloadUrl(id: string): string {
    return `${API_CONFIG.baseURL}${this.baseUrl}/reports/${id}/download/`;
  }

  async deleteReport(id: string): Promise<void> {
    try {
      await apiService.delete(`${this.baseUrl}/reports/${id}/delete/`);
    } catch (error) {
      logger.error(`Erreur lors de la suppression du rapport ${id}:`, error);
      throw error;
    }
  }

  // =================== PRODUCTION CYCLES ===================

  async getProductionCycles(): Promise<ProductionCycle[]> {
    try {
      const response = await apiService.get<ListResponse<ProductionCycle>>(`${this.baseUrl}/cycles/`);
      return extractResults(response.data);
    } catch (error) {
      logger.error('Erreur lors de la recuperation des cycles:', error);
      throw error;
    }
  }

  async getProductionCycle(id: string): Promise<ProductionCycle> {
    try {
      const response = await apiService.get<ProductionCycle>(`${this.baseUrl}/cycles/${id}/`);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la recuperation du cycle ${id}:`, error);
      throw error;
    }
  }

  async createProductionCycle(cycleData: CreateCycleForm): Promise<ProductionCycle> {
    try {
      const payload: CreateCycleForm = {
        ...cycleData,
        client_uuid: cycleData.client_uuid ?? this.generateClientUUID(),
      };
      const response = await apiService.post<ProductionCycle>(`${this.baseUrl}/cycles/`, payload);
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la creation du cycle:', error);
      throw error;
    }
  }

  async createProductionUnit(unitData: ProductionUnitCreatePayload): Promise<ProductionUnit> {
    try {
      const response = await apiService.post<ProductionUnit>(
        `${this.baseUrl}/production-units/`,
        unitData
      );
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la creation de l\'unite de production:', error);
      throw error;
    }
  }

  async createCycleUnitAllocation(
    allocationData: CycleUnitAllocationCreatePayload
  ): Promise<CycleUnitAllocation> {
    try {
      const response = await apiService.post<CycleUnitAllocation>(
        `${this.baseUrl}/cycle-unit-allocations/`,
        allocationData
      );
      return response.data;
    } catch (error) {
      logger.error("Erreur lors de la creation de l'allocation de cycle:", error);
      throw error;
    }
  }

  async getCycleUnitAllocations(cycleId: string): Promise<CycleUnitAllocation[]> {
    try {
      const response = await apiService.get<ListResponse<CycleUnitAllocation>>(
        `${this.baseUrl}/cycle-unit-allocations/?cycle_id=${cycleId}`
      );
      return extractResults(response.data);
    } catch (error) {
      logger.error(`Erreur lors de la recuperation des allocations du cycle ${cycleId}:`, error);
      throw error;
    }
  }

  async updateProductionCycle(id: string, cycleData: Partial<ProductionCycle>): Promise<ProductionCycle> {
    try {
      const response = await apiService.put<ProductionCycle>(`${this.baseUrl}/cycles/${id}/`, cycleData);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la mise a jour du cycle ${id}:`, error);
      throw error;
    }
  }

  async patchProductionCycle(id: string, cycleData: Partial<ProductionCycle>): Promise<ProductionCycle> {
    try {
      const response = await apiService.patch<ProductionCycle>(`${this.baseUrl}/cycles/${id}/`, cycleData);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la mise a jour partielle du cycle ${id}:`, error);
      throw error;
    }
  }

  async deleteProductionCycle(id: string): Promise<void> {
    try {
      await apiService.delete(`${this.baseUrl}/cycles/${id}/`);
    } catch (error) {
      logger.error(`Erreur lors de la suppression du cycle ${id}:`, error);
      throw error;
    }
  }

  async harvestCycle(
    id: string,
    harvestData: {
      harvest_date: string;
      final_count: number;
      final_average_weight: number;
    }
  ): Promise<CycleHarvestResponse> {
    try {
      const response = await apiService.post<CycleHarvestResponse>(
        `${this.baseUrl}/cycles/${id}/harvest/`,
        harvestData
      );
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la recolte du cycle ${id}:`, error);
      throw error;
    }
  }

  async partialHarvestCycle(
    id: string,
    data: PartialHarvestData
  ): Promise<{ cycle: ProductionCycle; partial_harvest: PartialHarvest; message: string }> {
    try {
      const payload: PartialHarvestData = {
        ...data,
        client_uuid: data.client_uuid ?? this.generateClientUUID(),
      };
      const response = await apiService.post<{ cycle: ProductionCycle; partial_harvest: PartialHarvest; message: string }>(
        `${this.baseUrl}/cycles/${id}/partial-harvest/`,
        payload
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async getPartialHarvests(id: string): Promise<PartialHarvest[]> {
    try {
      const response = await apiService.get<ListResponse<PartialHarvest>>(
        `${this.baseUrl}/cycles/${id}/partial-harvests/`
      );
      return extractResults(response.data);
    } catch (error) {
      logger.error(`Erreur lors de la récupération des récoltes partielles du cycle ${id}:`, error);
      throw error;
    }
  }

  async getCycleStatistics(id: string): Promise<CycleStatistics> {
    try {
      const response = await apiService.get<CycleStatistics>(`${this.baseUrl}/cycles/${id}/statistics/`);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la recuperation des statistiques du cycle ${id}:`, error);
      throw error;
    }
  }

  async getCycleComparison(id: string): Promise<CycleComparisonResponse> {
    try {
      const response = await apiService.get<CycleComparisonResponse>(`${this.baseUrl}/cycles/${id}/comparison/`);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la comparaison du cycle ${id}:`, error);
      throw error;
    }
  }

  async getHarvestedCycles(): Promise<ProductionCycle[]> {
    try {
      const response = await apiService.get<ListResponse<ProductionCycle>>(`${this.baseUrl}/cycles/?status=harvested`);
      return extractResults(response.data);
    } catch (error) {
      logger.error('Erreur lors de la recuperation des cycles recoltes:', error);
      throw error;
    }
  }

  // =================== DAILY LOGS ===================

  async getCycleLogs(
    cycleId?: string,
    options?: { cycleUnitAllocationId?: string }
  ): Promise<CycleLog[]> {
    try {
      const query = new URLSearchParams();
      if (cycleId) {
        query.append('cycle_id', cycleId);
      }
      if (options?.cycleUnitAllocationId) {
        query.append('cycle_unit_allocation', options.cycleUnitAllocationId);
      }
      const params = query.toString() ? `?${query.toString()}` : '';
      const response = await apiService.get<ListResponse<CycleLog>>(`${this.baseUrl}/cycle-logs/${params}`);
      return extractResults(response.data);
    } catch (error) {
      logger.error('Erreur lors de la recuperation des logs:', error);
      throw error;
    }
  }

  async createCycleLog(cycleId: string, logData: DailyLogForm): Promise<CycleLog> {
    try {
      const payload = {
        cycle: cycleId,
        ...logData,
        client_uuid: logData.client_uuid ?? this.generateClientUUID(),
      };

      const response = await apiService.post<CycleLog>(`${this.baseUrl}/cycle-logs/`, payload);
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la creation du log:', error);
      throw error;
    }
  }

  async updateCycleLog(id: string, logData: Partial<DailyLogForm>): Promise<CycleLog> {
    try {
      const response = await apiService.put<CycleLog>(`${this.baseUrl}/cycle-logs/${id}/`, logData);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la mise a jour du log ${id}:`, error);
      throw error;
    }
  }

  async deleteCycleLog(id: string): Promise<void> {
    try {
      await apiService.delete(`${this.baseUrl}/cycle-logs/${id}/`);
    } catch (error) {
      logger.error(`Erreur lors de la suppression du log ${id}:`, error);
      throw error;
    }
  }

  async bulkCreateCycleLogs(logs: Partial<CycleLog>[]): Promise<CycleLog[]> {
    try {
      const response = await apiService.post<{ logs: CycleLog[]; created: number }>(
        `${this.baseUrl}/cycle-logs/bulk_create/`,
        { logs }
      );
      return response.data.logs;
    } catch (error) {
      logger.error('Erreur lors de la creation en masse des logs:', error);
      throw error;
    }
  }

  // =================== SANITARY LOGS ===================

  async getSanitaryLogs(
    cycleId?: string,
    options?: { cycleUnitAllocationId?: string }
  ): Promise<SanitaryLog[]> {
    try {
      const query = new URLSearchParams();
      if (cycleId) {
        query.append('cycle_id', cycleId);
      }
      if (options?.cycleUnitAllocationId) {
        query.append('cycle_unit_allocation', options.cycleUnitAllocationId);
      }
      const params = query.toString() ? `?${query.toString()}` : '';
      const response = await apiService.get<ListResponse<SanitaryLog>>(`${this.baseUrl}/sanitary-logs/${params}`);
      return extractResults(response.data);
    } catch (error) {
      logger.error('Erreur lors de la recuperation des logs sanitaires:', error);
      throw error;
    }
  }

  async createSanitaryLog(cycleId: string, logData: SanitaryLogForm): Promise<SanitaryLog> {
    try {
      const clientUuid = logData.client_uuid ?? this.generateClientUUID();
      const formData = new FormData();
      formData.append('cycle', cycleId);
      formData.append('event_date', logData.event_date);
      formData.append('event_type', logData.event_type);
      formData.append('symptoms', logData.symptoms);
      formData.append('client_uuid', clientUuid);
      formData.append('created_offline', logData.created_offline ? 'true' : 'false');
      if (logData.cycle_unit_allocation) {
        formData.append('cycle_unit_allocation', logData.cycle_unit_allocation);
      }

      if (logData.affected_count !== undefined) {
        formData.append('affected_count', logData.affected_count.toString());
      }
      if (logData.treatment_applied) {
        formData.append('treatment_applied', logData.treatment_applied);
      }
      if (logData.medication_used) {
        formData.append('medication_used', logData.medication_used);
      }
      if (logData.dosage) {
        formData.append('dosage', logData.dosage);
      }
      if (logData.treatment_duration_days !== undefined) {
        formData.append('treatment_duration_days', logData.treatment_duration_days.toString());
      }
      if (logData.notes) {
        formData.append('notes', logData.notes);
      }

      if (logData.photo) {
        if (logData.photo instanceof File) {
          formData.append('photo', logData.photo);
        } else if (isReactNativeUploadFile(logData.photo)) {
          formData.append('photo', logData.photo as unknown as Blob);
        } else {
          logger.warn('Format photo non reconnu, photo ignoree.');
        }
      }

      const response = await apiService.post<SanitaryLog>(`${this.baseUrl}/sanitary-logs/`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la creation du log sanitaire:', error);
      throw error;
    }
  }

  async resolveSanitaryIssue(id: string): Promise<SanitaryLog> {
    try {
      const response = await apiService.post<SanitaryLog>(`${this.baseUrl}/sanitary-logs/${id}/resolve/`);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la resolution du probleme sanitaire ${id}:`, error);
      throw error;
    }
  }

  async getActiveSanitaryIssues(): Promise<ActiveSanitaryIssueGroup[]> {
    try {
      const response = await apiService.get<ActiveSanitaryIssueGroup[]>(
        `${this.baseUrl}/sanitary-logs/active_issues/`
      );
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la recuperation des problemes sanitaires actifs:', error);
      throw error;
    }
  }

  // =================== SYNCHRONISATION OFFLINE ===================

  async synchronize(payload: SyncPayload): Promise<SyncResponse> {
    try {
      const response = await apiService.post<SyncResponse>(`${this.baseUrl}/sync/`, payload);
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de la synchronisation:', error);
      throw error;
    }
  }

  // =================== PLANS D'ALIMENTATION ===================

  async getActiveCycles(): Promise<ProductionCycle[]> {
    try {
      const response = await apiService.get<ListResponse<ProductionCycle>>(`${this.baseUrl}/cycles/?status=active`);
      return extractResults(response.data);
    } catch (error) {
      logger.error('Erreur lors de la recuperation des cycles actifs:', error);
      throw error;
    }
  }

  async getFeedingPlans(cycleId: string): Promise<FeedingPlan[]> {
    try {
      const response = await apiService.get<ListResponse<FeedingPlan>>(`${this.baseUrl}/feeding-plans/?cycle=${cycleId}`);
      return extractResults(response.data);
    } catch (error) {
      logger.error("Erreur lors de la recuperation des plans d'alimentation:", error);
      throw error;
    }
  }

  async getCycleFeedPhases(cycleId: string): Promise<{ feeding_phases: FeedPhase[] }> {
    try {
      const response = await apiService.get<{ feeding_phases: FeedPhase[] }>(
        `${this.baseUrl}/cycles/${cycleId}/feed-phases/`
      );
      return response.data;
    } catch (error) {
      logger.error('Erreur lors du chargement des phases aliments:', error);
      throw error;
    }
  }

  async generateFeedingPlan(cycleId: string): Promise<FeedingPlan[]> {
    try {
      const response = await apiService.post<FeedingPlan[]>(`${this.baseUrl}/feeding-plans/generate/`, {
        cycle_id: cycleId,
      });
      return response.data;
    } catch (error) {
      logger.error("Erreur lors de la generation du plan d'alimentation:", error);
      throw error;
    }
  }

  // =================== GUIDES NUTRITIONNELS ===================

  async getAllNutritionalGuides(): Promise<NutritionalGuide[]> {
    try {
      const response = await apiService.get<ListResponse<NutritionalGuide>>(`${this.baseUrl}/nutritional-guides/`);
      return extractResults(response.data);
    } catch (error) {
      logger.error('Erreur lors de la recuperation des guides nutritionnels:', error);
      throw error;
    }
  }

  async getNutritionalGuidesBySpecies(species: Species): Promise<NutritionalGuide[]> {
    try {
      const response = await apiService.get<ListResponse<NutritionalGuide>>(
        `${this.baseUrl}/nutritional-guides/?species=${species}`
      );
      return extractResults(response.data);
    } catch (error) {
      logger.error(`Erreur lors de la recuperation des guides pour ${species}:`, error);
      throw error;
    }
  }

  async getNutritionalGuideById(id: string): Promise<NutritionalGuide> {
    try {
      const response = await apiService.get<NutritionalGuide>(`${this.baseUrl}/nutritional-guides/${id}/`);
      return response.data;
    } catch (error) {
      logger.error(`Erreur lors de la recuperation du guide ${id}:`, error);
      throw error;
    }
  }

  async findGuideForWeight(species: Species, currentWeight: number): Promise<NutritionalGuide | null> {
    try {
      const guides = await this.getNutritionalGuidesBySpecies(species);

      const sortedGuides = [...guides].sort((a, b) => a.min_weight - b.min_weight);

      for (const guide of sortedGuides) {
        if (currentWeight >= guide.min_weight && currentWeight <= guide.max_weight) {
          return guide;
        }
      }

      return sortedGuides[sortedGuides.length - 1] ?? null;
    } catch (error) {
      logger.error('Erreur lors de la recherche du guide par poids:', error);
      throw error;
    }
  }

  // =================== UTILITAIRES PRIVES ===================

  private generateClientUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char: string) => {
      const random = (Math.random() * 16) | 0;
      const value = char === 'x' ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  prepareOfflineData<T extends Record<string, unknown>>(
    data: T
  ): T & {
    client_uuid: string;
    created_offline: boolean;
  } {
    return {
      ...data,
      client_uuid: this.generateClientUUID(),
      created_offline: true,
    };
  }

  canSynchronize(data: Array<{ client_uuid?: unknown }>): boolean {
    return data.length > 0 && data.every((item) => typeof item.client_uuid === 'string' && item.client_uuid.length > 0);
  }
}

export const aquacultureService = new AquacultureService();
