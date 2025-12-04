import { apiService } from '@/services/api';
import {
  ProductionCycle,
  CycleLog,
  FeedingPlan,
  SanitaryLog,
  DashboardData,
  SyncPayload,
  SyncResponse,
  CreateCycleForm,
  DailyLogForm,
  SanitaryLogForm,
  CycleStatistics,
} from '@/types/aquaculture';

/**
 * Service API pour le module aquaculture MAVECAM AquaCare
 *
 * GÃ¨re toutes les interactions avec le backend Django aquaculture
 * selon les bonnes pratiques Axios et patterns officiels.
 *
 * FonctionnalitÃ©s :
 * - CRUD complet pour tous les modÃ¨les aquacoles
 * - Synchronisation offline-first avec dÃ©duplication UUID
 * - Upload de photos pour logs sanitaires
 * - Gestion automatique des tokens JWT via apiService
 */
class AquacultureService {
  private readonly baseUrl = '/aquaculture';

  // =================== DASHBOARD ===================

  /**
   * RÃ©cupÃ¨re les donnÃ©es complÃ¨tes du tableau de bord
   * GET@/services/api/aquaculture/dashboard/
   *
   * Retourne : cycles actifs, mÃ©triques agrÃ©gÃ©es, graphiques, notifications
   */
  async getDashboardData(): Promise<DashboardData> {
    try {
      const response = await apiService.get<DashboardData>(`${this.baseUrl}/dashboard/`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la rÃ©cupÃ©ration du dashboard:', error);
      throw error;
    }
  }

  // =================== PRODUCTION CYCLES ===================

  /**
   * Liste tous les cycles de production de l'utilisateur
   * GET@/services/api/aquaculture/cycles/
   */
  async getProductionCycles(): Promise<ProductionCycle[]> {
    try {
      const response = await apiService.get<{ results: ProductionCycle[] }>(`${this.baseUrl}/cycles/`);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Erreur lors de la rÃ©cupÃ©ration des cycles:', error);
      throw error;
    }
  }

  /**
   * RÃ©cupÃ¨re un cycle spÃ©cifique par ID
   * GET@/services/api/aquaculture/cycles/{id}/
   */
  async getProductionCycle(id: string): Promise<ProductionCycle> {
    try {
      const response = await apiService.get<ProductionCycle>(`${this.baseUrl}/cycles/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la rÃ©cupÃ©ration du cycle ${id}:`, error);
      throw error;
    }
  }

  /**
   * CrÃ©e un nouveau cycle de production
   * POST@/services/api/aquaculture/cycles/
   */
  async createProductionCycle(cycleData: CreateCycleForm): Promise<ProductionCycle> {
    try {
      const response = await apiService.post<ProductionCycle>(`${this.baseUrl}/cycles/`, cycleData);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la crÃ©ation du cycle:', error);
      throw error;
    }
  }

  /**
   * Met Ã  jour un cycle existant
   * PUT@/services/api/aquaculture/cycles/{id}/
   */
  async updateProductionCycle(id: string, cycleData: Partial<ProductionCycle>): Promise<ProductionCycle> {
    try {
      const response = await apiService.put<ProductionCycle>(`${this.baseUrl}/cycles/${id}/`, cycleData);
      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la mise Ã  jour du cycle ${id}:`, error);
      throw error;
    }
  }

  /**
   * Supprime un cycle
   * DELETE@/services/api/aquaculture/cycles/{id}/
   */
  async deleteProductionCycle(id: string): Promise<void> {
    try {
      await apiService.delete(`${this.baseUrl}/cycles/${id}/`);
    } catch (error) {
      console.error(`Erreur lors de la suppression du cycle ${id}:`, error);
      throw error;
    }
  }

  /**
   * Finalise un cycle (rÃ©colte)
   * POST@/services/api/aquaculture/cycles/{id}/harvest/
   */
  async harvestCycle(id: string, harvestData: {
    harvest_date: string;
    final_count: number;
    final_average_weight: number;
  }): Promise<ProductionCycle> {
    try {
      const response = await apiService.post<ProductionCycle>(
        `${this.baseUrl}/cycles/${id}/harvest/`,
        harvestData
      );
      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la rÃ©colte du cycle ${id}:`, error);
      throw error;
    }
  }

  /**
   * RÃ©cupÃ¨re les statistiques dÃ©taillÃ©es d'un cycle
   * GET@/services/api/aquaculture/cycles/{id}/statistics/
   */
  async getCycleStatistics(id: string): Promise<CycleStatistics> {
    try {
      const response = await apiService.get<CycleStatistics>(`${this.baseUrl}/cycles/${id}/statistics/`);
      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la rÃ©cupÃ©ration des statistiques du cycle ${id}:`, error);
      throw error;
    }
  }

  /**
   * Compare un cycle avec les cycles prÃ©cÃ©dents
   * GET@/services/api/aquaculture/cycles/{id}/comparison/
   */
  async getCycleComparison(id: string): Promise<any> {
    try {
      const response = await apiService.get(`${this.baseUrl}/cycles/${id}/comparison/`);
      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la comparaison du cycle ${id}:`, error);
      throw error;
    }
  }

  // =================== DAILY LOGS ===================

  /**
   * RÃ©cupÃ¨re les logs quotidiens (optionnellement filtrÃ©s par cycle)
   * GET@/services/api/aquaculture/cycle-logs/?cycle_id={id}
   */
  async getCycleLogs(cycleId?: string): Promise<CycleLog[]> {
    try {
      const params = cycleId ? `?cycle_id=${cycleId}` : '';
      const response = await apiService.get<{ results: CycleLog[] }>(`${this.baseUrl}/cycle-logs/${params}`);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Erreur lors de la rÃ©cupÃ©ration des logs:', error);
      throw error;
    }
  }

  /**
   * CrÃ©e un nouveau log quotidien
   * POST@/services/api/aquaculture/cycle-logs/
   */
  async createCycleLog(cycleId: string, logData: DailyLogForm): Promise<CycleLog> {
    try {
      const payload = {
        cycle: cycleId,
        ...logData,
        // Ajouter client_uuid pour synchronisation offline
        client_uuid: this.generateClientUUID()
      };

      const response = await apiService.post<CycleLog>(`${this.baseUrl}/cycle-logs/`, payload);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la crÃ©ation du log:', error);
      throw error;
    }
  }

  /**
   * Met Ã  jour un log existant
   * PUT@/services/api/aquaculture/cycle-logs/{id}/
   */
  async updateCycleLog(id: string, logData: Partial<DailyLogForm>): Promise<CycleLog> {
    try {
      const response = await apiService.put<CycleLog>(`${this.baseUrl}/cycle-logs/${id}/`, logData);
      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la mise Ã  jour du log ${id}:`, error);
      throw error;
    }
  }

  /**
   * Supprime un log
   * DELETE@/services/api/aquaculture/cycle-logs/{id}/
   */
  async deleteCycleLog(id: string): Promise<void> {
    try {
      await apiService.delete(`${this.baseUrl}/cycle-logs/${id}/`);
    } catch (error) {
      console.error(`Erreur lors de la suppression du log ${id}:`, error);
      throw error;
    }
  }

  /**
   * CrÃ©ation en masse pour synchronisation offline
   * POST@/services/api/aquaculture/cycle-logs/bulk_create/
   */
  async bulkCreateCycleLogs(logs: Partial<CycleLog>[]): Promise<CycleLog[]> {
    try {
      const response = await apiService.post<{ logs: CycleLog[]; created: number }>(
        `${this.baseUrl}/cycle-logs/bulk_create/`,
        { logs }
      );
      return response.data.logs;
    } catch (error) {
      console.error('Erreur lors de la crÃ©ation en masse des logs:', error);
      throw error;
    }
  }


  // =================== SANITARY LOGS ===================

  /**
   * RÃ©cupÃ¨re les logs sanitaires
   * GET@/services/api/aquaculture/sanitary-logs/
   */
  async getSanitaryLogs(cycleId?: string): Promise<SanitaryLog[]> {
    try {
      const params = cycleId ? `?cycle_id=${cycleId}` : '';
      const response = await apiService.get<{ results: SanitaryLog[] }>(`${this.baseUrl}/sanitary-logs/${params}`);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Erreur lors de la rÃ©cupÃ©ration des logs sanitaires:', error);
      throw error;
    }
  }

  /**
   * CrÃ©e un nouveau log sanitaire (avec support photo)
   * POST@/services/api/aquaculture/sanitary-logs/
   */
  async createSanitaryLog(cycleId: string, logData: SanitaryLogForm): Promise<SanitaryLog> {
    try {
      const formData = new FormData();
      formData.append('cycle', cycleId);
      formData.append('event_date', logData.event_date);
      formData.append('event_type', logData.event_type);
      formData.append('symptoms', logData.symptoms);

      if (logData.affected_count) {
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
      if (logData.treatment_duration_days) {
        formData.append('treatment_duration_days', logData.treatment_duration_days.toString());
      }

      // Ajouter la photo si prÃ©sente (React Native format)
      if (logData.photo) {
        if (logData.photo instanceof File) {
          // Format web standard
          formData.append('photo', logData.photo);
          console.log('ðŸ“¸ Photo ajoutÃ©e (File):', logData.photo.name, logData.photo.size, 'bytes');
        } else if (typeof logData.photo === 'object' && 'uri' in logData.photo) {
          // Format React Native
          formData.append('photo', logData.photo as any);
          console.log('ðŸ“¸ Photo ajoutÃ©e (RN):', (logData.photo as any).name, (logData.photo as any).uri);
        } else {
          console.warn('âš ï¸ Format photo non reconnu:', typeof logData.photo);
        }
      }

      // Debug: Afficher le contenu du FormData
      console.log('ðŸ“¦ FormData Ã  envoyer:');
      try {
        for (let [key, value] of (formData as any).entries()) {
          console.log(`  ${key}:`, value instanceof File ? `FILE(${value.name})` : value);
        }
      } catch (error) {
        console.log('  (FormData entries non disponible en React Native)');
      }

      const response = await apiService.post<SanitaryLog>(
        `${this.baseUrl}/sanitary-logs/`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la crÃ©ation du log sanitaire:', error);
      throw error;
    }
  }

  /**
   * Marque un problÃ¨me sanitaire comme rÃ©solu
   * POST@/services/api/aquaculture/sanitary-logs/{id}/resolve/
   */
  async resolveSanitaryIssue(id: string): Promise<SanitaryLog> {
    try {
      const response = await apiService.post<SanitaryLog>(
        `${this.baseUrl}/sanitary-logs/${id}/resolve/`
      );
      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la rÃ©solution du problÃ¨me sanitaire ${id}:`, error);
      throw error;
    }
  }

  /**
   * RÃ©cupÃ¨re tous les problÃ¨mes sanitaires non rÃ©solus
   * GET@/services/api/aquaculture/sanitary-logs/active_issues/
   */
  async getActiveSanitaryIssues(): Promise<Record<string, { cycle: string; issues: SanitaryLog[] }>> {
    try {
      const response = await apiService.get<Record<string, { cycle: string; issues: SanitaryLog[] }>>(`${this.baseUrl}/sanitary-logs/active_issues/`);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la rÃ©cupÃ©ration des problÃ¨mes sanitaires actifs:', error);
      throw error;
    }
  }

  // =================== SYNCHRONISATION OFFLINE ===================

  /**
   * Synchronisation complÃ¨te pour mode offline
   * POST@/services/api/aquaculture/sync/
   *
   * Envoie les donnÃ©es crÃ©Ã©es offline et rÃ©cupÃ¨re les mises Ã  jour du serveur
   */
  async synchronize(payload: SyncPayload): Promise<SyncResponse> {
    try {
      const response = await apiService.post<SyncResponse>(`${this.baseUrl}/sync/`, payload);
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la synchronisation:', error);
      throw error;
    }
  }

  // =================== NOTIFICATIONS ===================

  /**
   * RÃ©cupÃ¨re les notifications de l'utilisateur
   * GET@/services/api/aquaculture/notifications/
   */
  async getNotifications(): Promise<any[]> {
    try {
      const response = await apiService.get<{ results: any[] }>(`${this.baseUrl}/notifications/`);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Erreur lors de la rÃ©cupÃ©ration des notifications:', error);
      throw error;
    }
  }

  /**
   * RÃ©cupÃ¨re les cycles rÃ©coltÃ©s pour les statistiques
   * GET@/services/api/aquaculture/cycles/?status=harvested
   */
  async getHarvestedCycles(): Promise<any[]> {
    try {
      const response = await apiService.get<any>(`${this.baseUrl}/cycles/?status=harvested`);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Erreur lors de la rÃ©cupÃ©ration des cycles rÃ©coltÃ©s:', error);
      throw error;
    }
  }

  /**
   * Marque une notification comme lue
   * PATCH@/services/api/aquaculture/notifications/{id}/
   */
  async markNotificationAsRead(id: string): Promise<any> {
    try {
      const response = await apiService.patch<any>(`${this.baseUrl}/notifications/${id}/`, { is_read: true });
      return response.data;
    } catch (error) {
      console.error('Erreur lors du marquage de la notification comme lue:', error);
      throw error;
    }
  }

  /**
   * Marque toutes les notifications comme lues
   * POST@/services/api/aquaculture/notifications/mark_all_read/
   */
  async markAllNotificationsAsRead(): Promise<void> {
    try {
      await apiService.post(`${this.baseUrl}/notifications/mark_all_read/`);
    } catch (error) {
      console.error('Erreur lors du marquage des notifications comme lues:', error);
      throw error;
    }
  }

  /**
   * Supprime une notification spÃ©cifique
   * DELETE@/services/api/aquaculture/notifications/{id}/
   */
  async deleteNotification(id: string): Promise<void> {
    try {
      await apiService.delete(`${this.baseUrl}/notifications/${id}/`);
    } catch (error) {
      console.error(`Erreur lors de la suppression de la notification ${id}:`, error);
      throw error;
    }
  }

  // =================== PLANS D'ALIMENTATION ===================

  /**
   * RÃ©cupÃ¨re les cycles actifs pour les plans d'alimentation
   * GET@/services/api/aquaculture/cycles/?status=active
   */
  async getActiveCycles(): Promise<any[]> {
    try {
      const response = await apiService.get<any>(`${this.baseUrl}/cycles/?status=active`);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Erreur lors de la rÃ©cupÃ©ration des cycles actifs:', error);
      throw error;
    }
  }

  /**
   * RÃ©cupÃ¨re les plans d'alimentation d'un cycle
   * GET@/services/api/aquaculture/feeding-plans/?cycle={cycleId}
   */
  async getFeedingPlans(cycleId: string): Promise<any[]> {
    try {
      const response = await apiService.get<any>(`${this.baseUrl}/feeding-plans/?cycle=${cycleId}`);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Erreur lors de la rÃ©cupÃ©ration des plans d\'alimentation:', error);
      throw error;
    }
  }

  /**
   * GÃ©nÃ¨re un nouveau plan d'alimentation pour un cycle
   * POST@/services/api/aquaculture/feeding-plans/generate/
   */
  async generateFeedingPlan(cycleId: string): Promise<any[]> {
    try {
      const response = await apiService.post<any[]>(`${this.baseUrl}/feeding-plans/generate/`, {
        cycle_id: cycleId
      });
      return response.data;
    } catch (error) {
      console.error('Erreur lors de la gÃ©nÃ©ration du plan d\'alimentation:', error);
      throw error;
    }
  }

  /**
   * Supprime toutes les notifications lues (simule via suppression individuelle)
   */
  async deleteAllReadNotifications(): Promise<void> {
    try {
      // RÃ©cupÃ©rer d'abord toutes les notifications
      const allNotifications = await this.getNotifications();
      const readNotifications = allNotifications.filter(n => n.is_read);

      // Supprimer individuellement chaque notification lue
      const deletePromises = readNotifications.map(notification =>
        this.deleteNotification(notification.id)
      );

      await Promise.all(deletePromises);
    } catch (error) {
      console.error('Erreur lors de la suppression des notifications lues:', error);
      throw error;
    }
  }

  // =================== GUIDES NUTRITIONNELS ===================

  /**
   * RÃ©cupÃ¨re tous les guides nutritionnels
   * GET@/services/api/aquaculture/nutritional-guides/
   */
  async getAllNutritionalGuides(): Promise<any[]> {
    try {
      const response = await apiService.get<any>(`${this.baseUrl}/nutritional-guides/`);
      return response.data.results || response.data;
    } catch (error) {
      console.error('Erreur lors de la rÃ©cupÃ©ration des guides nutritionnels:', error);
      throw error;
    }
  }

  /**
   * RÃ©cupÃ¨re les guides nutritionnels pour une espÃ¨ce spÃ©cifique
   * GET@/services/api/aquaculture/nutritional-guides/?species={species}
   */
  async getNutritionalGuidesBySpecies(species: 'tilapia' | 'clarias'): Promise<any[]> {
    try {
      const response = await apiService.get<any>(`${this.baseUrl}/nutritional-guides/?species=${species}`);
      return response.data.results || response.data;
    } catch (error) {
      console.error(`Erreur lors de la rÃ©cupÃ©ration des guides pour ${species}:`, error);
      throw error;
    }
  }

  /**
   * RÃ©cupÃ¨re un guide nutritionnel spÃ©cifique par ID
   * GET@/services/api/aquaculture/nutritional-guides/{id}/
   */
  async getNutritionalGuideById(id: string): Promise<any> {
    try {
      const response = await apiService.get<any>(`${this.baseUrl}/nutritional-guides/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la rÃ©cupÃ©ration du guide ${id}:`, error);
      throw error;
    }
  }

  /**
   * Trouve le guide nutritionnel appropriÃ© selon le poids actuel
   * Utility function qui utilise getAllNutritionalGuides()
   */
  async findGuideForWeight(species: 'tilapia' | 'clarias', currentWeight: number): Promise<any | null> {
    try {
      const guides = await this.getNutritionalGuidesBySpecies(species);

      // Trier par poids minimum croissant
      const sortedGuides = guides.sort((a, b) => a.min_weight - b.min_weight);

      // Trouver le guide correspondant au poids
      for (const guide of sortedGuides) {
        if (currentWeight >= guide.min_weight && currentWeight <= guide.max_weight) {
          return guide;
        }
      }

      // Si aucun guide exact, retourner le dernier (pour poissons trÃ¨s gros)
      return sortedGuides[sortedGuides.length - 1] || null;
    } catch (error) {
      console.error('Erreur lors de la recherche du guide par poids:', error);
      throw error;
    }
  }


  // =================== UTILITAIRES PRIVÃ‰S ===================

  /**
   * GÃ©nÃ¨re un UUID client pour la dÃ©duplication offline
   * Utilise crypto.randomUUID() si disponible, sinon fallback
   */
  private generateClientUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    // Fallback UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * PrÃ©pare les donnÃ©es pour la synchronisation offline
   * Ajoute les mÃ©tadonnÃ©es nÃ©cessaires (client_uuid, created_offline, etc.)
   */
  prepareOfflineData<T extends Record<string, any>>(data: T): T & {
    client_uuid: string;
    created_offline: boolean;
  } {
    return {
      ...data,
      client_uuid: this.generateClientUUID(),
      created_offline: true
    };
  }

  /**
   * VÃ©rifie si les donnÃ©es peuvent Ãªtre synchronisÃ©es
   * Utile pour valider avant l'envoi
   */
  canSynchronize(data: any[]): boolean {
    return data.length > 0 && data.every(item =>
      item.client_uuid && typeof item.client_uuid === 'string'
    );
  }
}

// Export de l'instance singleton
export const aquacultureService = new AquacultureService();




