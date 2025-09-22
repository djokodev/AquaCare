import AsyncStorage from '@react-native-async-storage/async-storage';
import { aquacultureService } from './aquacultureService';
import { DailyLogForm, CreateCycleForm, SanitaryLogForm } from '@/types/aquaculture';

/**
 * Service de gestion des données offline pour MAVECAM AquaCare
 *
 * Fonctionnalités :
 * - Sauvegarde locale des saisies quand pas de connexion
 * - Synchronisation automatique à la reconnexion
 * - Gestion des conflits et déduplication
 * - Support offline-first selon architecture backend
 */

interface OfflineCycleLog {
  id: string;
  cycleId: string;
  logData: DailyLogForm;
  timestamp: number;
  synced: boolean;
}

interface OfflineNewCycle {
  id: string;
  cycleData: CreateCycleForm;
  timestamp: number;
  synced: boolean;
}

interface OfflineSanitaryLog {
  id: string;
  cycleId: string;
  sanitaryData: SanitaryLogForm;
  timestamp: number;
  synced: boolean;
}

const STORAGE_KEYS = {
  OFFLINE_CYCLE_LOGS: 'aquacare_offline_cycle_logs',
  OFFLINE_NEW_CYCLES: 'aquacare_offline_new_cycles',
  OFFLINE_SANITARY_LOGS: 'aquacare_offline_sanitary_logs',
  LAST_SYNC: 'aquacare_last_sync',
};

class OfflineService {

  /**
   * Sauvegarde un log de cycle en local
   */
  async saveCycleLogOffline(cycleId: string, logData: DailyLogForm): Promise<string> {
    try {
      const logId = this.generateOfflineId();

      const offlineLog: OfflineCycleLog = {
        id: logId,
        cycleId,
        logData: {
          ...logData,
          log_date: logData.log_date || new Date().toISOString().split('T')[0],
        },
        timestamp: Date.now(),
        synced: false,
      };

      // Récupérer les logs existants
      const existingLogs = await this.getOfflineCycleLogs();

      // Ajouter le nouveau log
      const updatedLogs = [...existingLogs, offlineLog];

      // Sauvegarder
      await AsyncStorage.setItem(
        STORAGE_KEYS.OFFLINE_CYCLE_LOGS,
        JSON.stringify(updatedLogs)
      );

      console.log('📱 Log sauvegardé offline:', logId);
      return logId;

    } catch (error) {
      console.error('❌ Erreur sauvegarde offline:', error);
      throw new Error('Impossible de sauvegarder en local');
    }
  }

  /**
   * Récupère tous les logs offline non synchronisés
   */
  async getOfflineCycleLogs(): Promise<OfflineCycleLog[]> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_CYCLE_LOGS);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('❌ Erreur lecture logs offline:', error);
      return [];
    }
  }

  /**
   * Récupère les logs offline non synchronisés
   */
  async getPendingSyncLogs(): Promise<OfflineCycleLog[]> {
    const logs = await this.getOfflineCycleLogs();
    return logs.filter(log => !log.synced);
  }

  /**
   * Synchronise tous les logs offline avec le backend
   */
  async syncOfflineLogs(): Promise<{ success: number; failed: number }> {
    const pendingLogs = await this.getPendingSyncLogs();

    if (pendingLogs.length === 0) {
      console.log('✅ Aucun log à synchroniser');
      return { success: 0, failed: 0 };
    }

    console.log(`🔄 Synchronisation de ${pendingLogs.length} logs...`);

    let successCount = 0;
    let failedCount = 0;

    for (const log of pendingLogs) {
      try {
        // Tentative de synchronisation avec le backend
        await aquacultureService.createCycleLog(log.cycleId, log.logData);

        // Marquer comme synchronisé
        await this.markLogAsSynced(log.id);
        successCount++;

        console.log(`✅ Log ${log.id} synchronisé`);

      } catch (error) {
        console.error(`❌ Erreur sync log ${log.id}:`, error);
        failedCount++;
      }
    }

    // Sauvegarder timestamp dernière sync
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, Date.now().toString());

    console.log(`📊 Sync terminée: ${successCount} succès, ${failedCount} échecs`);

    return { success: successCount, failed: failedCount };
  }

  /**
   * Marque un log comme synchronisé
   */
  async markLogAsSynced(logId: string): Promise<void> {
    try {
      const logs = await this.getOfflineCycleLogs();
      const updatedLogs = logs.map(log =>
        log.id === logId ? { ...log, synced: true } : log
      );

      await AsyncStorage.setItem(
        STORAGE_KEYS.OFFLINE_CYCLE_LOGS,
        JSON.stringify(updatedLogs)
      );
    } catch (error) {
      console.error('❌ Erreur marquage sync:', error);
    }
  }

  /**
   * Nettoie les logs synchronisés anciens (> 30 jours)
   */
  async cleanupSyncedLogs(): Promise<number> {
    try {
      const logs = await this.getOfflineCycleLogs();
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

      const activeLogs = logs.filter(log =>
        !log.synced || log.timestamp > thirtyDaysAgo
      );

      const removedCount = logs.length - activeLogs.length;

      if (removedCount > 0) {
        await AsyncStorage.setItem(
          STORAGE_KEYS.OFFLINE_CYCLE_LOGS,
          JSON.stringify(activeLogs)
        );
        console.log(`🧹 Nettoyage: ${removedCount} logs supprimés`);
      }

      return removedCount;
    } catch (error) {
      console.error('❌ Erreur nettoyage:', error);
      return 0;
    }
  }

  /**
   * Vérifie s'il y a des logs en attente de synchronisation
   */
  async hasPendingSync(): Promise<boolean> {
    const pending = await this.getPendingSyncLogs();
    return pending.length > 0;
  }

  /**
   * Récupère le nombre de logs en attente
   */
  async getPendingCount(): Promise<number> {
    const pending = await this.getPendingSyncLogs();
    return pending.length;
  }

  /**
   * Récupère la date de dernière synchronisation
   */
  async getLastSyncDate(): Promise<Date | null> {
    try {
      const timestamp = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
      return timestamp ? new Date(parseInt(timestamp)) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Vérifie si on a une connexion réseau
   */
  async isOnline(): Promise<boolean> {
    try {
      // Test simple avec l'API backend
      const response = await fetch('https://www.google.com', {
        method: 'HEAD',
        cache: 'no-cache'
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Génère un ID unique pour les données offline
   */
  private generateOfflineId(): string {
    return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ================== NOUVEAUX CYCLES ==================

  /**
   * Sauvegarde un nouveau cycle en local
   */
  async saveNewCycleOffline(cycleData: CreateCycleForm): Promise<string> {
    try {
      const cycleId = this.generateOfflineId();

      const offlineCycle: OfflineNewCycle = {
        id: cycleId,
        cycleData: {
          ...cycleData,
          start_date: cycleData.start_date || new Date().toISOString().split('T')[0],
        },
        timestamp: Date.now(),
        synced: false,
      };

      const existingCycles = await this.getOfflineNewCycles();
      const updatedCycles = [...existingCycles, offlineCycle];

      await AsyncStorage.setItem(
        STORAGE_KEYS.OFFLINE_NEW_CYCLES,
        JSON.stringify(updatedCycles)
      );

      console.log('📱 Nouveau cycle sauvegardé offline:', cycleId);
      return cycleId;

    } catch (error) {
      console.error('❌ Erreur sauvegarde cycle offline:', error);
      throw new Error('Impossible de sauvegarder le cycle en local');
    }
  }

  /**
   * Récupère tous les nouveaux cycles offline
   */
  async getOfflineNewCycles(): Promise<OfflineNewCycle[]> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_NEW_CYCLES);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('❌ Erreur lecture cycles offline:', error);
      return [];
    }
  }

  // ================== JOURNAL SANITAIRE ==================

  /**
   * Sauvegarde un log sanitaire en local
   */
  async saveSanitaryLogOffline(cycleId: string, sanitaryData: SanitaryLogForm): Promise<string> {
    try {
      const logId = this.generateOfflineId();

      const offlineLog: OfflineSanitaryLog = {
        id: logId,
        cycleId,
        sanitaryData: {
          ...sanitaryData,
          event_date: sanitaryData.event_date || new Date().toISOString().split('T')[0],
        },
        timestamp: Date.now(),
        synced: false,
      };

      const existingLogs = await this.getOfflineSanitaryLogs();
      const updatedLogs = [...existingLogs, offlineLog];

      await AsyncStorage.setItem(
        STORAGE_KEYS.OFFLINE_SANITARY_LOGS,
        JSON.stringify(updatedLogs)
      );

      console.log('📱 Log sanitaire sauvegardé offline:', logId);
      return logId;

    } catch (error) {
      console.error('❌ Erreur sauvegarde log sanitaire offline:', error);
      throw new Error('Impossible de sauvegarder le log sanitaire en local');
    }
  }

  /**
   * Récupère tous les logs sanitaires offline
   */
  async getOfflineSanitaryLogs(): Promise<OfflineSanitaryLog[]> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_SANITARY_LOGS);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('❌ Erreur lecture logs sanitaires offline:', error);
      return [];
    }
  }

  // ================== SYNCHRONISATION GLOBALE ==================

  /**
   * Synchronise TOUS les types de données offline
   */
  async syncAllOfflineData(): Promise<{ success: number; failed: number; details: any }> {
    console.log('🔄 Début synchronisation globale...');

    const results = {
      success: 0,
      failed: 0,
      details: {
        cycleLogs: { success: 0, failed: 0 },
        newCycles: { success: 0, failed: 0 },
        sanitaryLogs: { success: 0, failed: 0 }
      }
    };

    // 1. Synchroniser les logs de cycles
    try {
      const cycleLogsResult = await this.syncOfflineLogs();
      results.success += cycleLogsResult.success;
      results.failed += cycleLogsResult.failed;
      results.details.cycleLogs = cycleLogsResult;
    } catch (error) {
      console.error('❌ Erreur sync cycle logs:', error);
    }

    // 2. Synchroniser les nouveaux cycles
    try {
      const newCyclesResult = await this.syncOfflineNewCycles();
      results.success += newCyclesResult.success;
      results.failed += newCyclesResult.failed;
      results.details.newCycles = newCyclesResult;
    } catch (error) {
      console.error('❌ Erreur sync nouveaux cycles:', error);
    }

    // 3. Synchroniser les logs sanitaires
    try {
      const sanitaryLogsResult = await this.syncOfflineSanitaryLogs();
      results.success += sanitaryLogsResult.success;
      results.failed += sanitaryLogsResult.failed;
      results.details.sanitaryLogs = sanitaryLogsResult;
    } catch (error) {
      console.error('❌ Erreur sync logs sanitaires:', error);
    }

    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, Date.now().toString());

    console.log(`📊 Sync globale terminée: ${results.success} succès, ${results.failed} échecs`);
    return results;
  }

  /**
   * Synchronise les nouveaux cycles offline
   */
  async syncOfflineNewCycles(): Promise<{ success: number; failed: number }> {
    const pendingCycles = await this.getOfflineNewCycles();
    const unsyncedCycles = pendingCycles.filter(cycle => !cycle.synced);

    if (unsyncedCycles.length === 0) {
      return { success: 0, failed: 0 };
    }

    console.log(`🔄 Synchronisation de ${unsyncedCycles.length} nouveaux cycles...`);

    let successCount = 0;
    let failedCount = 0;

    for (const cycle of unsyncedCycles) {
      try {
        // Appel API pour créer le cycle
        await aquacultureService.createProductionCycle(cycle.cycleData);

        await this.markNewCycleAsSynced(cycle.id);
        successCount++;
        console.log(`✅ Cycle ${cycle.id} synchronisé`);

      } catch (error) {
        console.error(`❌ Erreur sync cycle ${cycle.id}:`, error);
        failedCount++;
      }
    }

    return { success: successCount, failed: failedCount };
  }

  /**
   * Synchronise les logs sanitaires offline
   */
  async syncOfflineSanitaryLogs(): Promise<{ success: number; failed: number }> {
    const pendingLogs = await this.getOfflineSanitaryLogs();
    const unsyncedLogs = pendingLogs.filter(log => !log.synced);

    if (unsyncedLogs.length === 0) {
      return { success: 0, failed: 0 };
    }

    console.log(`🔄 Synchronisation de ${unsyncedLogs.length} logs sanitaires...`);

    let successCount = 0;
    let failedCount = 0;

    for (const log of unsyncedLogs) {
      try {
        // Appel API pour créer le log sanitaire
        await aquacultureService.createSanitaryLog(log.cycleId, log.sanitaryData);

        await this.markSanitaryLogAsSynced(log.id);
        successCount++;
        console.log(`✅ Log sanitaire ${log.id} synchronisé`);

      } catch (error) {
        console.error(`❌ Erreur sync log sanitaire ${log.id}:`, error);
        failedCount++;
      }
    }

    return { success: successCount, failed: failedCount };
  }

  /**
   * Marque un nouveau cycle comme synchronisé
   */
  async markNewCycleAsSynced(cycleId: string): Promise<void> {
    try {
      const cycles = await this.getOfflineNewCycles();
      const updatedCycles = cycles.map(cycle =>
        cycle.id === cycleId ? { ...cycle, synced: true } : cycle
      );

      await AsyncStorage.setItem(
        STORAGE_KEYS.OFFLINE_NEW_CYCLES,
        JSON.stringify(updatedCycles)
      );
    } catch (error) {
      console.error('❌ Erreur marquage cycle sync:', error);
    }
  }

  /**
   * Marque un log sanitaire comme synchronisé
   */
  async markSanitaryLogAsSynced(logId: string): Promise<void> {
    try {
      const logs = await this.getOfflineSanitaryLogs();
      const updatedLogs = logs.map(log =>
        log.id === logId ? { ...log, synced: true } : log
      );

      await AsyncStorage.setItem(
        STORAGE_KEYS.OFFLINE_SANITARY_LOGS,
        JSON.stringify(updatedLogs)
      );
    } catch (error) {
      console.error('❌ Erreur marquage log sanitaire sync:', error);
    }
  }

  /**
   * Vérifie s'il y a des données en attente (tous types)
   */
  async hasAnyPendingSync(): Promise<boolean> {
    const pendingCycleLogs = await this.hasPendingSync();
    const pendingNewCycles = (await this.getOfflineNewCycles()).some(c => !c.synced);
    const pendingSanitaryLogs = (await this.getOfflineSanitaryLogs()).some(l => !l.synced);

    return pendingCycleLogs || pendingNewCycles || pendingSanitaryLogs;
  }

  /**
   * Récupère le nombre total de données en attente
   */
  async getTotalPendingCount(): Promise<number> {
    const pendingCycleLogs = await this.getPendingCount();
    const pendingNewCycles = (await this.getOfflineNewCycles()).filter(c => !c.synced).length;
    const pendingSanitaryLogs = (await this.getOfflineSanitaryLogs()).filter(l => !l.synced).length;

    return pendingCycleLogs + pendingNewCycles + pendingSanitaryLogs;
  }

  /**
   * Reset complet des données offline (pour débogage)
   */
  async resetOfflineData(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_CYCLE_LOGS);
    await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_NEW_CYCLES);
    await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_SANITARY_LOGS);
    await AsyncStorage.removeItem(STORAGE_KEYS.LAST_SYNC);
    console.log('🔄 Données offline réinitialisées');
  }
}

export const offlineService = new OfflineService();