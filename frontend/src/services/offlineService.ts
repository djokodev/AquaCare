import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_CONFIG } from '@/constants/api';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { CreateCycleForm, DailyLogForm, SanitaryLogForm, SyncPayload } from '@/types/aquaculture';
import logger from '@/utils/logger';

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

interface SyncCounter {
  success: number;
  failed: number;
}

interface OfflineSyncDetails {
  cycleLogs: SyncCounter;
  newCycles: SyncCounter;
  sanitaryLogs: SyncCounter;
}

interface OfflineSyncResult extends SyncCounter {
  details: OfflineSyncDetails;
}

const STORAGE_KEYS = {
  OFFLINE_CYCLE_LOGS: 'aquacare_offline_cycle_logs',
  OFFLINE_NEW_CYCLES: 'aquacare_offline_new_cycles',
  OFFLINE_SANITARY_LOGS: 'aquacare_offline_sanitary_logs',
  LAST_SYNC: 'aquacare_last_sync',
};

class OfflineService {
  private static readonly BULK_SYNC_DEVICE_ID = 'mobile-offline-sync';
  private syncPromise: Promise<OfflineSyncResult> | null = null;

  async saveCycleLogOffline(cycleId: string, logData: DailyLogForm): Promise<string> {
    try {
      const logId = this.generateOfflineId();
      const offlineLog: OfflineCycleLog = {
        id: logId,
        cycleId,
        logData: {
          ...logData,
          log_date: logData.log_date || this.today(),
          client_uuid: logData.client_uuid ?? this.generateClientUUID(),
          created_offline: true,
        },
        timestamp: Date.now(),
        synced: false,
      };

      const existingLogs = await this.getOfflineCycleLogs();
      await this.persist(STORAGE_KEYS.OFFLINE_CYCLE_LOGS, [...existingLogs, offlineLog]);

      logger.log('Log sauvegarde offline:', logId);
      return logId;
    } catch (error) {
      logger.error('Erreur sauvegarde log offline:', error);
      throw new Error('Impossible de sauvegarder en local');
    }
  }

  async getOfflineCycleLogs(): Promise<OfflineCycleLog[]> {
    return this.readList<OfflineCycleLog>(STORAGE_KEYS.OFFLINE_CYCLE_LOGS, 'Erreur lecture logs offline');
  }

  async getPendingSyncLogs(): Promise<OfflineCycleLog[]> {
    const logs = await this.getOfflineCycleLogs();
    return logs.filter((log) => !log.synced);
  }

  async syncOfflineLogs(): Promise<SyncCounter> {
    const pendingLogs = await this.getPendingSyncLogs();
    if (pendingLogs.length === 0) {
      logger.log('Aucun log a synchroniser');
      return { success: 0, failed: 0 };
    }

    let success = 0;
    let failed = 0;
    for (const log of pendingLogs) {
      try {
        await aquacultureService.createCycleLog(log.cycleId, log.logData);
        await this.markLogAsSynced(log.id);
        success += 1;
      } catch (error) {
        logger.error(`Erreur sync log ${log.id}:`, error);
        failed += 1;
      }
    }

    await this.touchLastSync();
    return { success, failed };
  }

  async markLogAsSynced(logId: string): Promise<void> {
    const logs = await this.getOfflineCycleLogs();
    await this.persist(
      STORAGE_KEYS.OFFLINE_CYCLE_LOGS,
      logs.map((log) => (log.id === logId ? { ...log, synced: true } : log))
    );
  }

  private async markLogsAsSynced(logIds: string[]): Promise<void> {
    if (logIds.length === 0) {
      return;
    }
    const syncedIds = new Set(logIds);
    const logs = await this.getOfflineCycleLogs();
    await this.persist(
      STORAGE_KEYS.OFFLINE_CYCLE_LOGS,
      logs.map((log) => (syncedIds.has(log.id) ? { ...log, synced: true } : log))
    );
  }

  async cleanupSyncedLogs(): Promise<number> {
    try {
      const logs = await this.getOfflineCycleLogs();
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const activeLogs = logs.filter((log) => !log.synced || log.timestamp > thirtyDaysAgo);
      const removedCount = logs.length - activeLogs.length;

      if (removedCount > 0) {
        await this.persist(STORAGE_KEYS.OFFLINE_CYCLE_LOGS, activeLogs);
      }

      return removedCount;
    } catch (error) {
      logger.error('Erreur nettoyage logs offline:', error);
      return 0;
    }
  }

  async hasPendingSync(): Promise<boolean> {
    return (await this.getPendingSyncLogs()).length > 0;
  }

  async getPendingCount(): Promise<number> {
    return (await this.getPendingSyncLogs()).length;
  }

  async getLastSyncDate(): Promise<Date | null> {
    try {
      const timestamp = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
      return timestamp ? new Date(Number.parseInt(timestamp, 10)) : null;
    } catch {
      return null;
    }
  }

  async isOnline(): Promise<boolean> {
    try {
      const response = await fetch(`${API_CONFIG.baseURL}/health/`, {
        method: 'HEAD',
        cache: 'no-cache',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async saveNewCycleOffline(cycleData: CreateCycleForm): Promise<string> {
    try {
      const cycleId = this.generateOfflineId();
      const offlineCycle: OfflineNewCycle = {
        id: cycleId,
        cycleData: {
          ...cycleData,
          start_date: cycleData.start_date || this.today(),
          client_uuid: cycleData.client_uuid ?? this.generateClientUUID(),
          created_offline: true,
        },
        timestamp: Date.now(),
        synced: false,
      };

      const existingCycles = await this.getOfflineNewCycles();
      await this.persist(STORAGE_KEYS.OFFLINE_NEW_CYCLES, [...existingCycles, offlineCycle]);

      logger.log('Nouveau cycle sauvegarde offline:', cycleId);
      return cycleId;
    } catch (error) {
      logger.error('Erreur sauvegarde cycle offline:', error);
      throw new Error('Impossible de sauvegarder le cycle en local');
    }
  }

  async getOfflineNewCycles(): Promise<OfflineNewCycle[]> {
    return this.readList<OfflineNewCycle>(STORAGE_KEYS.OFFLINE_NEW_CYCLES, 'Erreur lecture cycles offline');
  }

  async saveSanitaryLogOffline(cycleId: string, sanitaryData: SanitaryLogForm): Promise<string> {
    try {
      const logId = this.generateOfflineId();
      const offlineLog: OfflineSanitaryLog = {
        id: logId,
        cycleId,
        sanitaryData: {
          ...sanitaryData,
          event_date: sanitaryData.event_date || this.today(),
          client_uuid: sanitaryData.client_uuid ?? this.generateClientUUID(),
          created_offline: true,
        },
        timestamp: Date.now(),
        synced: false,
      };

      const existingLogs = await this.getOfflineSanitaryLogs();
      await this.persist(STORAGE_KEYS.OFFLINE_SANITARY_LOGS, [...existingLogs, offlineLog]);

      logger.log('Log sanitaire sauvegarde offline:', logId);
      return logId;
    } catch (error) {
      logger.error('Erreur sauvegarde log sanitaire offline:', error);
      throw new Error('Impossible de sauvegarder le log sanitaire en local');
    }
  }

  async getOfflineSanitaryLogs(): Promise<OfflineSanitaryLog[]> {
    return this.readList<OfflineSanitaryLog>(
      STORAGE_KEYS.OFFLINE_SANITARY_LOGS,
      'Erreur lecture logs sanitaires offline'
    );
  }

  async syncAllOfflineData(): Promise<OfflineSyncResult> {
    if (this.syncPromise) {
      return this.syncPromise;
    }

    this.syncPromise = this.performSyncAllOfflineData().finally(() => {
      this.syncPromise = null;
    });

    return this.syncPromise;
  }

  private async performSyncAllOfflineData(): Promise<OfflineSyncResult> {
    const pendingCycleLogs = await this.getPendingSyncLogs();
    const pendingNewCycles = (await this.getOfflineNewCycles()).filter((cycle) => !cycle.synced);
    const pendingSanitaryLogs = (await this.getOfflineSanitaryLogs()).filter((log) => !log.synced);

    if (
      pendingCycleLogs.length === 0 &&
      pendingNewCycles.length === 0 &&
      pendingSanitaryLogs.length === 0
    ) {
      return {
        success: 0,
        failed: 0,
        details: {
          cycleLogs: { success: 0, failed: 0 },
          newCycles: { success: 0, failed: 0 },
          sanitaryLogs: { success: 0, failed: 0 },
        },
      };
    }

    const bulkResult = await this.tryBulkSync(
      pendingCycleLogs,
      pendingNewCycles,
      pendingSanitaryLogs
    );
    if (bulkResult) {
      return bulkResult;
    }

    const results: OfflineSyncResult = {
      success: 0,
      failed: 0,
      details: {
        cycleLogs: { success: 0, failed: 0 },
        newCycles: { success: 0, failed: 0 },
        sanitaryLogs: { success: 0, failed: 0 },
      },
    };

    results.details.cycleLogs = await this.syncOfflineLogs();
    results.details.newCycles = await this.syncOfflineNewCycles();
    results.details.sanitaryLogs = await this.syncOfflineSanitaryLogs();

    results.success =
      results.details.cycleLogs.success +
      results.details.newCycles.success +
      results.details.sanitaryLogs.success;
    results.failed =
      results.details.cycleLogs.failed +
      results.details.newCycles.failed +
      results.details.sanitaryLogs.failed;

    await this.touchLastSync();
    return results;
  }

  private async tryBulkSync(
    pendingCycleLogs: OfflineCycleLog[],
    pendingNewCycles: OfflineNewCycle[],
    pendingSanitaryLogs: OfflineSanitaryLog[]
  ): Promise<OfflineSyncResult | null> {
    const lastSyncDate = await this.getLastSyncDate();
    const payload: SyncPayload = {
      cycle_logs: pendingCycleLogs.map((log) => ({
        ...log.logData,
        cycle: log.cycleId,
      })),
      sanitary_logs: pendingSanitaryLogs.map((log) => {
        const { photo, ...rest } = log.sanitaryData;
        const sanitizedPhoto = typeof photo === 'string' ? photo : undefined;
        return {
          ...rest,
          ...(sanitizedPhoto ? { photo: sanitizedPhoto } : {}),
          cycle: log.cycleId,
        };
      }),
      new_cycles: pendingNewCycles.map((cycle) => cycle.cycleData),
      device_id: OfflineService.BULK_SYNC_DEVICE_ID,
      ...(lastSyncDate ? { last_sync: lastSyncDate.toISOString() } : {}),
    };

    try {
      const response = await aquacultureService.synchronize(payload);
      if (response.status !== 'success' || (response.errors?.length ?? 0) > 0) {
        return null;
      }

      await Promise.all([
        this.markLogsAsSynced(pendingCycleLogs.map((log) => log.id)),
        this.markNewCyclesAsSynced(pendingNewCycles.map((cycle) => cycle.id)),
        this.markSanitaryLogsAsSynced(pendingSanitaryLogs.map((log) => log.id)),
      ]);
      await this.touchLastSync();

      const cycleLogsSuccess = pendingCycleLogs.length;
      const newCyclesSuccess = pendingNewCycles.length;
      const sanitaryLogsSuccess = pendingSanitaryLogs.length;
      const success = cycleLogsSuccess + newCyclesSuccess + sanitaryLogsSuccess;

      return {
        success,
        failed: 0,
        details: {
          cycleLogs: { success: cycleLogsSuccess, failed: 0 },
          newCycles: { success: newCyclesSuccess, failed: 0 },
          sanitaryLogs: { success: sanitaryLogsSuccess, failed: 0 },
        },
      };
    } catch (error) {
      logger.warn('Bulk sync indisponible, fallback en mode unitaire:', error);
      return null;
    }
  }

  async syncOfflineNewCycles(): Promise<SyncCounter> {
    const pendingCycles = (await this.getOfflineNewCycles()).filter((cycle) => !cycle.synced);
    let success = 0;
    let failed = 0;

    for (const cycle of pendingCycles) {
      try {
        await aquacultureService.createProductionCycle(cycle.cycleData);
        await this.markNewCycleAsSynced(cycle.id);
        success += 1;
      } catch (error) {
        logger.error(`Erreur sync cycle ${cycle.id}:`, error);
        failed += 1;
      }
    }

    return { success, failed };
  }

  async syncOfflineSanitaryLogs(): Promise<SyncCounter> {
    const pendingLogs = (await this.getOfflineSanitaryLogs()).filter((log) => !log.synced);
    let success = 0;
    let failed = 0;

    for (const log of pendingLogs) {
      try {
        await aquacultureService.createSanitaryLog(log.cycleId, log.sanitaryData);
        await this.markSanitaryLogAsSynced(log.id);
        success += 1;
      } catch (error) {
        logger.error(`Erreur sync log sanitaire ${log.id}:`, error);
        failed += 1;
      }
    }

    return { success, failed };
  }

  async markNewCycleAsSynced(cycleId: string): Promise<void> {
    const cycles = await this.getOfflineNewCycles();
    await this.persist(
      STORAGE_KEYS.OFFLINE_NEW_CYCLES,
      cycles.map((cycle) => (cycle.id === cycleId ? { ...cycle, synced: true } : cycle))
    );
  }

  private async markNewCyclesAsSynced(cycleIds: string[]): Promise<void> {
    if (cycleIds.length === 0) {
      return;
    }
    const syncedIds = new Set(cycleIds);
    const cycles = await this.getOfflineNewCycles();
    await this.persist(
      STORAGE_KEYS.OFFLINE_NEW_CYCLES,
      cycles.map((cycle) => (syncedIds.has(cycle.id) ? { ...cycle, synced: true } : cycle))
    );
  }

  async markSanitaryLogAsSynced(logId: string): Promise<void> {
    const logs = await this.getOfflineSanitaryLogs();
    await this.persist(
      STORAGE_KEYS.OFFLINE_SANITARY_LOGS,
      logs.map((log) => (log.id === logId ? { ...log, synced: true } : log))
    );
  }

  private async markSanitaryLogsAsSynced(logIds: string[]): Promise<void> {
    if (logIds.length === 0) {
      return;
    }
    const syncedIds = new Set(logIds);
    const logs = await this.getOfflineSanitaryLogs();
    await this.persist(
      STORAGE_KEYS.OFFLINE_SANITARY_LOGS,
      logs.map((log) => (syncedIds.has(log.id) ? { ...log, synced: true } : log))
    );
  }

  async hasAnyPendingSync(): Promise<boolean> {
    const pendingCycleLogs = await this.hasPendingSync();
    const pendingNewCycles = (await this.getOfflineNewCycles()).some((cycle) => !cycle.synced);
    const pendingSanitaryLogs = (await this.getOfflineSanitaryLogs()).some((log) => !log.synced);

    return pendingCycleLogs || pendingNewCycles || pendingSanitaryLogs;
  }

  async getTotalPendingCount(): Promise<number> {
    const pendingCycleLogs = await this.getPendingCount();
    const pendingNewCycles = (await this.getOfflineNewCycles()).filter((cycle) => !cycle.synced).length;
    const pendingSanitaryLogs = (await this.getOfflineSanitaryLogs()).filter((log) => !log.synced).length;

    return pendingCycleLogs + pendingNewCycles + pendingSanitaryLogs;
  }

  async resetOfflineData(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_CYCLE_LOGS);
    await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_NEW_CYCLES);
    await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_SANITARY_LOGS);
    await AsyncStorage.removeItem(STORAGE_KEYS.LAST_SYNC);
    logger.log('Donnees offline reinitialisees');
  }

  private async readList<T>(key: string, errorMessage: string): Promise<T[]> {
    try {
      const stored = await AsyncStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T[]) : [];
    } catch (error) {
      logger.error(`${errorMessage}:`, error);
      return [];
    }
  }

  private async persist<T>(key: string, value: T[]): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  }

  private async touchLastSync(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, Date.now().toString());
  }

  private today(): string {
    return new Date().toISOString().split('T')[0];
  }

  private generateOfflineId(): string {
    return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

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
}

export const offlineService = new OfflineService();
