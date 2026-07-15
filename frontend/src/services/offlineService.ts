import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_CONFIG } from '@/constants/api';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { CalibrationRequest, CreateCalibrationTankForm, CreateCycleForm, DailyLogForm, FinalHarvestOperation, HarvestData, SanitaryLogForm, SyncPayload } from '@/types/aquaculture';
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

export interface OfflineCalibrationTank { id: string; tankData: CreateCalibrationTankForm; timestamp: number; synced: boolean; }
export interface OfflineCalibrationOperation { id: string; sourceAllocationId: string; operationData: CalibrationRequest; timestamp: number; synced: boolean; }
export interface OfflineFinalHarvest {
  id: string;
  allocationId: string;
  cycleId: string;
  harvestData: HarvestData;
  timestamp: number;
  synced: boolean;
  serverAccepted?: boolean;
  reconciliationStatus?: 'pending' | 'reconciled';
}

interface SyncCounter {
  success: number;
  failed: number;
}

interface OfflineSyncDetails {
  cycleLogs: SyncCounter;
  newCycles: SyncCounter;
  sanitaryLogs: SyncCounter;
  calibrationTanks?: SyncCounter;
  calibrationOperations?: SyncCounter;
  finalHarvests?: SyncCounter;
}

interface OfflineSyncResult extends SyncCounter {
  details: OfflineSyncDetails;
}

const STORAGE_KEYS = {
  OFFLINE_CYCLE_LOGS: 'aquacare_offline_cycle_logs',
  OFFLINE_NEW_CYCLES: 'aquacare_offline_new_cycles',
  OFFLINE_SANITARY_LOGS: 'aquacare_offline_sanitary_logs',
  OFFLINE_CALIBRATION_TANKS: 'aquacare_offline_calibration_tanks',
  OFFLINE_CALIBRATION_OPERATIONS: 'aquacare_offline_calibration_operations',
  OFFLINE_FINAL_HARVESTS: 'aquacare_offline_final_harvests',
  LAST_SYNC: 'aquacare_last_sync',
};

const finalHarvestFingerprint = (data: HarvestData): string => JSON.stringify({
  client_uuid: data.client_uuid,
  allocation_id: data.allocation_id ?? null,
  allocation_client_uuid: data.allocation_client_uuid ?? null,
  cycle_id: data.cycle_id ?? null,
  harvest_date: data.harvest_date,
  final_harvested_at: data.final_harvested_at,
  final_count: data.final_count,
  final_average_weight: data.final_average_weight,
  total_harvested_weight: data.total_harvested_weight,
  harvest_notes: data.harvest_notes ?? '',
  created_offline: data.created_offline,
  allow_pending_reconciliation: data.allow_pending_reconciliation ?? false,
});

class OfflineService {
  private static readonly BULK_SYNC_DEVICE_ID = 'mobile-offline-sync';
  private syncPromise: Promise<OfflineSyncResult> | null = null;

  async saveFinalHarvestOffline(
    allocationId: string,
    cycleId: string,
    harvestData: HarvestData,
  ): Promise<string> {
    const clientUuid = harvestData.client_uuid || this.generateClientUUID();
    const current = await this.getOfflineFinalHarvests();
    const normalizedHarvestData: HarvestData = {
      ...harvestData,
      client_uuid: clientUuid,
      allocation_id: harvestData.allocation_id ?? (allocationId || undefined),
      cycle_id: harvestData.cycle_id ?? cycleId,
      created_offline: true,
      allow_pending_reconciliation: true,
    };
    const duplicate = current.find((item) => item.harvestData.client_uuid === clientUuid);
    if (duplicate) {
      if (finalHarvestFingerprint(duplicate.harvestData) !== finalHarvestFingerprint(normalizedHarvestData)) {
        throw new Error('final_harvest_idempotency_conflict');
      }
      return duplicate.id;
    }
    const id = this.generateOfflineId();
    const item: OfflineFinalHarvest = {
      id,
      allocationId,
      cycleId,
      harvestData: normalizedHarvestData,
      timestamp: Date.now(),
      synced: false,
    };
    await this.persist(STORAGE_KEYS.OFFLINE_FINAL_HARVESTS, [...current, item]);
    return id;
  }

  async getOfflineFinalHarvests(): Promise<OfflineFinalHarvest[]> {
    return this.readList(
      STORAGE_KEYS.OFFLINE_FINAL_HARVESTS,
      'Erreur lecture récoltes finales offline',
    );
  }

  async getPendingFinalHarvests(): Promise<OfflineFinalHarvest[]> {
    return (await this.getOfflineFinalHarvests()).filter((item) => !item.synced);
  }

  async markFinalHarvestAsSynced(
    id: string,
    reconciliationStatus: 'pending' | 'reconciled',
  ): Promise<void> {
    const items = await this.getOfflineFinalHarvests();
    await this.persist(
      STORAGE_KEYS.OFFLINE_FINAL_HARVESTS,
      items.map((item) => item.id === id ? {
        ...item,
        synced: true,
        serverAccepted: true,
        reconciliationStatus,
      } : item),
    );
  }

  async applyFinalHarvestServerUpdates(
    operations: FinalHarvestOperation[],
  ): Promise<void> {
    if (operations.length === 0) return;
    const byClientUuid = new Map(
      operations.map((operation) => [operation.client_uuid, operation]),
    );
    const items = await this.getOfflineFinalHarvests();
    await this.persist(
      STORAGE_KEYS.OFFLINE_FINAL_HARVESTS,
      items.map((item) => {
        const operation = byClientUuid.get(item.harvestData.client_uuid);
        return operation ? {
          ...item,
          synced: true,
          serverAccepted: true,
          reconciliationStatus: operation.reconciliation_status,
        } : item;
      }),
    );
  }

  async syncOfflineFinalHarvests(): Promise<SyncCounter> {
    const pending = await this.getPendingFinalHarvests();
    let success = 0;
    let failed = 0;
    for (const item of pending) {
      try {
        if (item.allocationId) {
          const response = await aquacultureService.harvestProductionUnitAllocation(
            item.allocationId,
            item.harvestData,
          );
          await this.markFinalHarvestAsSynced(
            item.id,
            response.final_harvest.reconciliation_status,
          );
        } else {
          await aquacultureService.harvestCycle(item.cycleId, item.harvestData);
          await this.markFinalHarvestAsSynced(item.id, 'reconciled');
        }
        success += 1;
      } catch (error) {
        logger.error(`Erreur sync récolte finale ${item.id}:`, error);
        failed += 1;
      }
    }
    return { success, failed };
  }

  async cleanupSyncedFinalHarvests(): Promise<number> {
    const items = await this.getOfflineFinalHarvests();
    const active = items.filter((item) => !item.synced);
    await this.persist(STORAGE_KEYS.OFFLINE_FINAL_HARVESTS, active);
    return items.length - active.length;
  }

  async saveCalibrationTankOffline(tankData: CreateCalibrationTankForm): Promise<string> {
    const id = this.generateOfflineId();
    const item: OfflineCalibrationTank = { id, tankData: { ...tankData, client_uuid: tankData.client_uuid ?? this.generateClientUUID(), created_offline: true }, timestamp: Date.now(), synced: false };
    await this.persist(STORAGE_KEYS.OFFLINE_CALIBRATION_TANKS, [...await this.getOfflineCalibrationTanks(), item]);
    return id;
  }

  async getOfflineCalibrationTanks(): Promise<OfflineCalibrationTank[]> {
    return this.readList(STORAGE_KEYS.OFFLINE_CALIBRATION_TANKS, 'Erreur lecture bacs de calibrage offline');
  }

  async saveCalibrationOperationOffline(sourceAllocationId: string, operationData: CalibrationRequest): Promise<string> {
    const id = this.generateOfflineId();
    const item: OfflineCalibrationOperation = { id, sourceAllocationId, operationData: { ...operationData, source_allocation_id: operationData.source_allocation_id ?? sourceAllocationId, client_uuid: operationData.client_uuid || this.generateClientUUID(), created_offline: true }, timestamp: Date.now(), synced: false };
    const current = await this.getOfflineCalibrationOperations();
    if (!current.some((entry) => entry.operationData.client_uuid === item.operationData.client_uuid)) {
      await this.persist(STORAGE_KEYS.OFFLINE_CALIBRATION_OPERATIONS, [...current, item]);
    }
    return id;
  }

  async getOfflineCalibrationOperations(): Promise<OfflineCalibrationOperation[]> {
    return this.readList(STORAGE_KEYS.OFFLINE_CALIBRATION_OPERATIONS, 'Erreur lecture calibrages offline');
  }

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
    const pendingCalibrationTanks = (await this.getOfflineCalibrationTanks()).filter((item) => !item.synced);
    const pendingCalibrationOperations = (await this.getOfflineCalibrationOperations()).filter((item) => !item.synced);
    const pendingFinalHarvests = await this.getPendingFinalHarvests();

    if (
      pendingCycleLogs.length === 0 &&
      pendingNewCycles.length === 0 &&
      pendingSanitaryLogs.length === 0 && pendingCalibrationTanks.length === 0 &&
      pendingCalibrationOperations.length === 0 && pendingFinalHarvests.length === 0
    ) {
      return {
        success: 0,
        failed: 0,
        details: {
          cycleLogs: { success: 0, failed: 0 },
          newCycles: { success: 0, failed: 0 },
          sanitaryLogs: { success: 0, failed: 0 },
          calibrationTanks: { success: 0, failed: 0 },
          calibrationOperations: { success: 0, failed: 0 },
          finalHarvests: { success: 0, failed: 0 },
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
        calibrationTanks: { success: 0, failed: 0 },
        calibrationOperations: { success: 0, failed: 0 },
        finalHarvests: { success: 0, failed: 0 },
      },
    };

    results.details.cycleLogs = await this.syncOfflineLogs();
    results.details.newCycles = await this.syncOfflineNewCycles();
    results.details.sanitaryLogs = await this.syncOfflineSanitaryLogs();
    results.details.calibrationTanks = await this.syncOfflineCalibrationTanks();
    const businessOperations = await this.syncOfflineBusinessOperations();
    results.details.calibrationOperations = businessOperations.calibrationOperations;
    results.details.finalHarvests = businessOperations.finalHarvests;

    results.success =
      results.details.cycleLogs.success +
      results.details.newCycles.success +
      results.details.sanitaryLogs.success +
      (results.details.calibrationTanks?.success ?? 0) +
      (results.details.calibrationOperations?.success ?? 0) +
      (results.details.finalHarvests?.success ?? 0);
    results.failed =
      results.details.cycleLogs.failed +
      results.details.newCycles.failed +
      results.details.sanitaryLogs.failed +
      (results.details.calibrationTanks?.failed ?? 0) +
      (results.details.calibrationOperations?.failed ?? 0) +
      (results.details.finalHarvests?.failed ?? 0);

    await this.touchLastSync();
    return results;
  }

  private async tryBulkSync(
    pendingCycleLogs: OfflineCycleLog[],
    pendingNewCycles: OfflineNewCycle[],
    pendingSanitaryLogs: OfflineSanitaryLog[]
  ): Promise<OfflineSyncResult | null> {
    const lastSyncDate = await this.getLastSyncDate();
    const pendingCalibrationTanks = (await this.getOfflineCalibrationTanks()).filter((item) => !item.synced);
    const pendingCalibrationOperations = (await this.getOfflineCalibrationOperations()).filter((item) => !item.synced);
    const pendingFinalHarvests = await this.getPendingFinalHarvests();
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
      calibration_tanks: pendingCalibrationTanks.map((item) => item.tankData),
      calibration_operations: pendingCalibrationOperations.map((item) => item.operationData),
      final_harvests: pendingFinalHarvests.map((item) => item.harvestData),
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
        this.markCalibrationTanksAsSynced(pendingCalibrationTanks.map((item) => item.id)),
        this.markCalibrationOperationsAsSynced(pendingCalibrationOperations.map((item) => item.id)),
        ...pendingFinalHarvests.map((item) => {
          const serverOperation = response.server_updates.final_harvests?.find(
            (operation) => operation.client_uuid === item.harvestData.client_uuid,
          );
          return this.markFinalHarvestAsSynced(
            item.id,
            serverOperation?.reconciliation_status ?? 'pending',
          );
        }),
      ]);
      await this.applyFinalHarvestServerUpdates(
        response.server_updates.final_harvests ?? [],
      );
      await this.touchLastSync();

      const cycleLogsSuccess = pendingCycleLogs.length;
      const newCyclesSuccess = pendingNewCycles.length;
      const sanitaryLogsSuccess = pendingSanitaryLogs.length;
      const calibrationTanksSuccess = pendingCalibrationTanks.length;
      const calibrationOperationsSuccess = pendingCalibrationOperations.length;
      const finalHarvestsSuccess = pendingFinalHarvests.length;
      const success = cycleLogsSuccess + newCyclesSuccess + sanitaryLogsSuccess +
        calibrationTanksSuccess + calibrationOperationsSuccess + finalHarvestsSuccess;

      return {
        success,
        failed: 0,
        details: {
          cycleLogs: { success: cycleLogsSuccess, failed: 0 },
          newCycles: { success: newCyclesSuccess, failed: 0 },
          sanitaryLogs: { success: sanitaryLogsSuccess, failed: 0 },
          calibrationTanks: { success: calibrationTanksSuccess, failed: 0 },
          calibrationOperations: { success: calibrationOperationsSuccess, failed: 0 },
          finalHarvests: { success: finalHarvestsSuccess, failed: 0 },
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

  async syncOfflineCalibrationTanks(): Promise<SyncCounter> {
    const pending = (await this.getOfflineCalibrationTanks()).filter((item) => !item.synced);
    let success = 0;
    let failed = 0;
    for (const item of pending) {
      try {
        await aquacultureService.createCalibrationTank(item.tankData);
        await this.markCalibrationTanksAsSynced([item.id]);
        success += 1;
      } catch (error) {
        logger.error(`Erreur sync bac de calibrage ${item.id}:`, error);
        failed += 1;
      }
    }
    return { success, failed };
  }

  async syncOfflineCalibrationOperations(): Promise<SyncCounter> {
    const pending = (await this.getOfflineCalibrationOperations()).filter((item) => !item.synced);
    let success = 0;
    let failed = 0;
    for (const item of pending) {
      try {
        await aquacultureService.calibrateAllocation(item.sourceAllocationId, item.operationData);
        await this.markCalibrationOperationsAsSynced([item.id]);
        success += 1;
      } catch (error) {
        logger.error(`Erreur sync calibrage ${item.id}:`, error);
        failed += 1;
      }
    }
    return { success, failed };
  }

  private async syncOfflineBusinessOperations(): Promise<{
    calibrationOperations: SyncCounter;
    finalHarvests: SyncCounter;
  }> {
    const calibrationOperations = (await this.getOfflineCalibrationOperations())
      .filter((item) => !item.synced)
      .map((item) => ({
        type: 'calibration' as const,
        item,
        businessDatetime: item.operationData.calibrated_at,
        clientUuid: item.operationData.client_uuid,
      }));
    const finalHarvests = (await this.getOfflineFinalHarvests())
      .filter((item) => !item.synced)
      .map((item) => ({
        type: 'final_harvest' as const,
        item,
        businessDatetime: item.harvestData.final_harvested_at,
        clientUuid: item.harvestData.client_uuid,
      }));
    const operations = [...calibrationOperations, ...finalHarvests].sort((left, right) => {
      const datetimeDifference = Date.parse(left.businessDatetime) - Date.parse(right.businessDatetime);
      if (Number.isFinite(datetimeDifference) && datetimeDifference !== 0) return datetimeDifference;
      const timestampDifference = left.item.timestamp - right.item.timestamp;
      if (timestampDifference !== 0) return timestampDifference;
      return left.clientUuid.localeCompare(right.clientUuid);
    });
    const result = {
      calibrationOperations: { success: 0, failed: 0 },
      finalHarvests: { success: 0, failed: 0 },
    };

    for (const operation of operations) {
      try {
        if (operation.type === 'calibration') {
          await aquacultureService.calibrateAllocation(
            operation.item.sourceAllocationId,
            operation.item.operationData,
          );
          await this.markCalibrationOperationsAsSynced([operation.item.id]);
          result.calibrationOperations.success += 1;
        } else if (operation.item.allocationId) {
          const response = await aquacultureService.harvestProductionUnitAllocation(
            operation.item.allocationId,
            operation.item.harvestData,
          );
          await this.markFinalHarvestAsSynced(
            operation.item.id,
            response.final_harvest.reconciliation_status,
          );
          result.finalHarvests.success += 1;
        } else {
          await aquacultureService.harvestCycle(
            operation.item.cycleId,
            operation.item.harvestData,
          );
          await this.markFinalHarvestAsSynced(operation.item.id, 'reconciled');
          result.finalHarvests.success += 1;
        }
      } catch (error) {
        if (operation.type === 'calibration') {
          logger.error(`Erreur sync calibrage ${operation.item.id}:`, error);
          result.calibrationOperations.failed += 1;
        } else {
          logger.error(`Erreur sync récolte finale ${operation.item.id}:`, error);
          result.finalHarvests.failed += 1;
        }
      }
    }

    return result;
  }

  private async markCalibrationTanksAsSynced(ids: string[]): Promise<void> {
    const syncedIds = new Set(ids);
    const items = await this.getOfflineCalibrationTanks();
    await this.persist(
      STORAGE_KEYS.OFFLINE_CALIBRATION_TANKS,
      items.map((item) => (syncedIds.has(item.id) ? { ...item, synced: true } : item)),
    );
  }

  private async markCalibrationOperationsAsSynced(ids: string[]): Promise<void> {
    const syncedIds = new Set(ids);
    const items = await this.getOfflineCalibrationOperations();
    await this.persist(
      STORAGE_KEYS.OFFLINE_CALIBRATION_OPERATIONS,
      items.map((item) => (syncedIds.has(item.id) ? { ...item, synced: true } : item)),
    );
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
    const pendingCalibrationTanks = (await this.getOfflineCalibrationTanks()).some((item) => !item.synced);
    const pendingCalibrationOperations = (await this.getOfflineCalibrationOperations()).some((item) => !item.synced);
    const pendingFinalHarvests = (await this.getOfflineFinalHarvests()).some((item) => !item.synced);

    return pendingCycleLogs || pendingNewCycles || pendingSanitaryLogs || pendingCalibrationTanks ||
      pendingCalibrationOperations || pendingFinalHarvests;
  }

  async getTotalPendingCount(): Promise<number> {
    const pendingCycleLogs = await this.getPendingCount();
    const pendingNewCycles = (await this.getOfflineNewCycles()).filter((cycle) => !cycle.synced).length;
    const pendingSanitaryLogs = (await this.getOfflineSanitaryLogs()).filter((log) => !log.synced).length;
    const pendingCalibrationTanks = (await this.getOfflineCalibrationTanks()).filter((item) => !item.synced).length;
    const pendingCalibrationOperations = (await this.getOfflineCalibrationOperations()).filter((item) => !item.synced).length;
    const pendingFinalHarvests = (await this.getOfflineFinalHarvests()).filter((item) => !item.synced).length;

    return pendingCycleLogs + pendingNewCycles + pendingSanitaryLogs + pendingCalibrationTanks +
      pendingCalibrationOperations + pendingFinalHarvests;
  }

  async resetOfflineData(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_CYCLE_LOGS);
    await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_NEW_CYCLES);
    await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_SANITARY_LOGS);
    await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_CALIBRATION_TANKS);
    await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_CALIBRATION_OPERATIONS);
    await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_FINAL_HARVESTS);
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
