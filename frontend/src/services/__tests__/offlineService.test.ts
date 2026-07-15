import AsyncStorage from '@react-native-async-storage/async-storage';
import { offlineService } from '../offlineService';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    createCycleLog: jest.fn(),
    createProductionCycle: jest.fn(),
    createSanitaryLog: jest.fn(),
    createCalibrationTank: jest.fn(),
    calibrateAllocation: jest.fn(),
    harvestProductionUnitAllocation: jest.fn(),
    harvestCycle: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('services/offlineService', () => {
  const mockAquaculture = aquacultureService as jest.Mocked<typeof aquacultureService>;
  const realFetch = global.fetch;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('sauvegarde et relit un cycle log offline avec date par defaut', async () => {
    const id = await offlineService.saveCycleLogOffline('cycle-1', { mortality_count: 2 } as any);

    expect(id.startsWith('offline_')).toBe(true);

    const logs = await offlineService.getOfflineCycleLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].cycleId).toBe('cycle-1');
    expect(logs[0].logData.log_date).toBe(new Date().toISOString().split('T')[0]);
    expect(logs[0].synced).toBe(false);

    const pending = await offlineService.getPendingSyncLogs();
    expect(pending).toHaveLength(1);
    expect(await offlineService.hasPendingSync()).toBe(true);
    expect(await offlineService.getPendingCount()).toBe(1);
  });

  it('preserve les champs quotidiens et hebdomadaires additionnels en offline', async () => {
    await offlineService.saveCycleLogOffline('cycle-1', {
      mortality_reason: 'Stress',
      feed_quantity: 12.5,
      feed_type: 'Dibaq 2mm',
      feed_size_mm: 2.0,
      dissolved_oxygen: 6.2,
      ammonia_level: 0.3,
      feeding_times: ['08:00', '12:00', '16:00'],
      sample_count: 25,
      sample_total_weight: 2800,
    } as any);

    const [savedLog] = await offlineService.getOfflineCycleLogs();
    expect(savedLog.logData.mortality_reason).toBe('Stress');
    expect(savedLog.logData.feed_quantity).toBe(12.5);
    expect(savedLog.logData.feed_type).toBe('Dibaq 2mm');
    expect(savedLog.logData.feed_size_mm).toBe(2.0);
    expect(savedLog.logData.dissolved_oxygen).toBe(6.2);
    expect(savedLog.logData.ammonia_level).toBe(0.3);
    expect(savedLog.logData.feeding_times).toEqual(['08:00', '12:00', '16:00']);
    expect(savedLog.logData.sample_count).toBe(25);
    expect(savedLog.logData.sample_total_weight).toBe(2800);
  });

  it('syncOfflineLogs synchronise succes/erreurs et met last_sync', async () => {
    await offlineService.saveCycleLogOffline('cycle-1', { log_date: '2026-02-20', mortality_count: 1 } as any);
    await offlineService.saveCycleLogOffline('cycle-2', { log_date: '2026-02-20', mortality_count: 3 } as any);

    mockAquaculture.createCycleLog
      .mockResolvedValueOnce({ id: 'ok' } as any)
      .mockRejectedValueOnce(new Error('API KO'));

    const result = await offlineService.syncOfflineLogs();

    expect(result).toEqual({ success: 1, failed: 1 });

    const logs = await offlineService.getOfflineCycleLogs();
    const syncedCount = logs.filter((l) => l.synced).length;
    expect(syncedCount).toBe(1);

    const lastSync = await AsyncStorage.getItem('aquacare_last_sync');
    expect(Number(lastSync)).toBeGreaterThan(0);
  });

  it('cleanupSyncedLogs supprime uniquement les logs synchronises trop anciens', async () => {
    const now = Date.now();
    await AsyncStorage.setItem(
      'aquacare_offline_cycle_logs',
      JSON.stringify([
        {
          id: 'old-synced',
          cycleId: 'c1',
          logData: {},
          timestamp: now - 31 * 24 * 60 * 60 * 1000,
          synced: true,
        },
        {
          id: 'recent-synced',
          cycleId: 'c2',
          logData: {},
          timestamp: now,
          synced: true,
        },
        {
          id: 'pending',
          cycleId: 'c3',
          logData: {},
          timestamp: now - 60 * 24 * 60 * 60 * 1000,
          synced: false,
        },
      ])
    );

    const removed = await offlineService.cleanupSyncedLogs();
    expect(removed).toBe(1);

    const remaining = await offlineService.getOfflineCycleLogs();
    expect(remaining.map((l) => l.id)).toEqual(expect.arrayContaining(['recent-synced', 'pending']));
    expect(remaining.some((l) => l.id === 'old-synced')).toBe(false);
  });

  it('gere les nouveaux cycles offline et leur synchronisation', async () => {
    await offlineService.saveNewCycleOffline({ cycle_name: 'Cycle A' } as any);
    await offlineService.saveNewCycleOffline({ cycle_name: 'Cycle B' } as any);

    mockAquaculture.createProductionCycle
      .mockResolvedValueOnce({ id: 'srv-1' } as any)
      .mockRejectedValueOnce(new Error('KO'));

    const result = await offlineService.syncOfflineNewCycles();
    expect(result).toEqual({ success: 1, failed: 1 });

    const cycles = await offlineService.getOfflineNewCycles();
    expect(cycles.filter((c) => c.synced)).toHaveLength(1);
  });

  it('gere les logs sanitaires offline et leur synchronisation', async () => {
    await offlineService.saveSanitaryLogOffline('cycle-1', { event_type: 'disease' } as any);
    await offlineService.saveSanitaryLogOffline('cycle-2', { event_type: 'injury' } as any);

    mockAquaculture.createSanitaryLog
      .mockResolvedValueOnce({ id: 'srv-s1' } as any)
      .mockRejectedValueOnce(new Error('KO'));

    const result = await offlineService.syncOfflineSanitaryLogs();
    expect(result).toEqual({ success: 1, failed: 1 });

    const logs = await offlineService.getOfflineSanitaryLogs();
    expect(logs.filter((l) => l.synced)).toHaveLength(1);
  });

  it('syncAllOfflineData agregre les 3 types avec details', async () => {
    await offlineService.saveCycleLogOffline('cycle-1', { log_date: '2026-02-20' } as any);
    await offlineService.saveNewCycleOffline({ cycle_name: 'Cycle full' } as any);
    await offlineService.saveSanitaryLogOffline('cycle-1', { event_type: 'treatment' } as any);

    mockAquaculture.createCycleLog.mockResolvedValue({ id: 'x' } as any);
    mockAquaculture.createProductionCycle.mockResolvedValue({ id: 'y' } as any);
    mockAquaculture.createSanitaryLog.mockResolvedValue({ id: 'z' } as any);

    const result = await offlineService.syncAllOfflineData();

    expect(result.success).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.details.cycleLogs.success).toBe(1);
    expect(result.details.newCycles.success).toBe(1);
    expect(result.details.sanitaryLogs.success).toBe(1);
  });

  it('hasAnyPendingSync et getTotalPendingCount reflettent tous les types', async () => {
    await offlineService.saveCycleLogOffline('cycle-1', { log_date: '2026-02-20' } as any);
    await offlineService.saveNewCycleOffline({ cycle_name: 'Cycle pending' } as any);
    await offlineService.saveSanitaryLogOffline('cycle-1', { event_type: 'other' } as any);

    expect(await offlineService.hasAnyPendingSync()).toBe(true);
    expect(await offlineService.getTotalPendingCount()).toBe(3);
  });

  it('le fallback de calibrage marque seulement les éléments réussis', async () => {
    await offlineService.saveCalibrationTankOffline({ name: 'Bac A', volume_m3: 10 });
    await offlineService.saveCalibrationTankOffline({ name: 'Bac B', volume_m3: 8 });
    await offlineService.saveCalibrationOperationOffline('allocation-1', {
      client_uuid: 'operation-1',
      source_allocation_id: 'allocation-1',
      destination_production_unit_id: 'tank-1',
      calibrated_at: new Date().toISOString(),
      transferred_count: 100,
      transferred_average_weight_g: 120,
    });

    mockAquaculture.createCalibrationTank
      .mockResolvedValueOnce({ id: 'tank-a' } as any)
      .mockRejectedValueOnce(new Error('KO'));
    mockAquaculture.calibrateAllocation.mockResolvedValueOnce({ operation: { id: 'op-1' } } as any);

    expect(await offlineService.syncOfflineCalibrationTanks()).toEqual({ success: 1, failed: 1 });
    expect(await offlineService.syncOfflineCalibrationOperations()).toEqual({ success: 1, failed: 0 });

    const tanks = await offlineService.getOfflineCalibrationTanks();
    expect(tanks.filter((item) => item.synced)).toHaveLength(1);
    expect(tanks.filter((item) => !item.synced)).toHaveLength(1);
    const operations = await offlineService.getOfflineCalibrationOperations();
    expect(operations[0].synced).toBe(true);
    expect(mockAquaculture.calibrateAllocation).toHaveBeenCalledWith(
      'allocation-1',
      expect.objectContaining({ source_allocation_id: 'allocation-1' }),
    );
  });

  it('getLastSyncDate et resetOfflineData fonctionnent', async () => {
    await AsyncStorage.setItem('aquacare_last_sync', '1735689600000');

    const last = await offlineService.getLastSyncDate();
    expect(last?.toISOString()).toBe('2025-01-01T00:00:00.000Z');

    await offlineService.saveCycleLogOffline('cycle-1', { log_date: '2026-02-20' } as any);
    await offlineService.resetOfflineData();

    expect(await AsyncStorage.getItem('aquacare_offline_cycle_logs')).toBeNull();
    expect(await AsyncStorage.getItem('aquacare_offline_new_cycles')).toBeNull();
    expect(await AsyncStorage.getItem('aquacare_offline_sanitary_logs')).toBeNull();
    expect(await AsyncStorage.getItem('aquacare_offline_final_harvests')).toBeNull();
    expect(await AsyncStorage.getItem('aquacare_last_sync')).toBeNull();
  });

  it('sauvegarde une récolte finale sans duplication et conserve son datetime métier', async () => {
    const harvestData = {
      client_uuid: '00000000-0000-4000-8000-000000000010',
      harvest_date: '2026-07-14',
      final_harvested_at: '2026-07-14T17:00:00.000Z',
      final_count: 300,
      final_average_weight: 300,
      total_harvested_weight: 90,
      harvest_notes: 'Récolte physique',
      created_offline: false,
    };

    const firstId = await offlineService.saveFinalHarvestOffline('allocation-1', 'cycle-1', harvestData);
    const secondId = await offlineService.saveFinalHarvestOffline('allocation-1', 'cycle-1', harvestData);
    const items = await offlineService.getOfflineFinalHarvests();

    expect(secondId).toBe(firstId);
    expect(items).toHaveLength(1);
    expect(items[0].harvestData.final_harvested_at).toBe('2026-07-14T17:00:00.000Z');
    expect(items[0].harvestData.client_uuid).toBe(harvestData.client_uuid);
    expect(items[0].harvestData.created_offline).toBe(true);
    expect(items[0].synced).toBe(false);
  });

  it('rejette un même client_uuid local lorsque le payload de récolte diffère', async () => {
    const harvestData = {
      client_uuid: '00000000-0000-4000-8000-000000000014',
      harvest_date: '2026-07-14',
      final_harvested_at: '2026-07-14T17:00:00.000Z',
      final_count: 300,
      final_average_weight: 300,
      total_harvested_weight: 90,
      created_offline: true,
    };
    await offlineService.saveFinalHarvestOffline('allocation-1', 'cycle-1', harvestData);

    await expect(offlineService.saveFinalHarvestOffline('allocation-1', 'cycle-1', {
      ...harvestData,
      final_count: 299,
    })).rejects.toThrow('final_harvest_idempotency_conflict');
    await expect(offlineService.getOfflineFinalHarvests()).resolves.toHaveLength(1);
  });

  it('ordonne le fallback calibrage et récolte selon leur datetime métier', async () => {
    await offlineService.saveFinalHarvestOffline('allocation-1', 'cycle-1', {
      client_uuid: '00000000-0000-4000-8000-000000000015',
      harvest_date: '2026-07-14',
      final_harvested_at: '2026-07-14T18:00:00.000Z',
      final_count: 300,
      final_average_weight: 300,
      total_harvested_weight: 90,
      created_offline: true,
    });
    await offlineService.saveCalibrationOperationOffline('allocation-1', {
      client_uuid: '00000000-0000-4000-8000-000000000016',
      source_allocation_id: 'allocation-1',
      destination_production_unit_id: 'unit-2',
      calibrated_at: '2026-07-14T12:00:00.000Z',
      transferred_count: 100,
      created_offline: true,
    });
    mockAquaculture.calibrateAllocation.mockResolvedValue({} as any);
    mockAquaculture.harvestProductionUnitAllocation.mockResolvedValue({
      final_harvest: { reconciliation_status: 'reconciled' },
    } as any);

    await expect(offlineService.syncAllOfflineData()).resolves.toEqual(expect.objectContaining({
      success: 2,
      failed: 0,
    }));

    expect(mockAquaculture.calibrateAllocation).toHaveBeenCalledTimes(1);
    expect(mockAquaculture.harvestProductionUnitAllocation).toHaveBeenCalledTimes(1);
    expect(mockAquaculture.calibrateAllocation.mock.invocationCallOrder[0]).toBeLessThan(
      mockAquaculture.harvestProductionUnitAllocation.mock.invocationCallOrder[0],
    );
  });

  it('synchronise une récolte pending et ne marque pas une récolte en échec', async () => {
    const base = {
      client_uuid: '00000000-0000-4000-8000-000000000011',
      harvest_date: '2026-07-14',
      final_harvested_at: '2026-07-14T17:00:00.000Z',
      final_count: 300,
      final_average_weight: 300,
      total_harvested_weight: 90,
      created_offline: true,
    };
    await offlineService.saveFinalHarvestOffline('allocation-1', 'cycle-1', base);
    await offlineService.saveFinalHarvestOffline('allocation-2', 'cycle-2', {
      ...base,
      client_uuid: '00000000-0000-4000-8000-000000000012',
    });
    mockAquaculture.harvestProductionUnitAllocation
      .mockResolvedValueOnce({
        final_harvest: { reconciliation_status: 'pending' },
      } as any)
      .mockRejectedValueOnce(new Error('offline'));

    await expect(offlineService.syncOfflineFinalHarvests()).resolves.toEqual({
      success: 1,
      failed: 1,
    });
    const items = await offlineService.getOfflineFinalHarvests();
    expect(items[0]).toEqual(expect.objectContaining({
      synced: true,
      serverAccepted: true,
      reconciliationStatus: 'pending',
    }));
    expect(items[1].synced).toBe(false);

    mockAquaculture.harvestProductionUnitAllocation.mockResolvedValueOnce({
      final_harvest: { reconciliation_status: 'reconciled' },
    } as any);
    await expect(offlineService.syncOfflineFinalHarvests()).resolves.toEqual({
      success: 1,
      failed: 0,
    });
    expect(mockAquaculture.harvestProductionUnitAllocation).toHaveBeenCalledTimes(3);
    expect(mockAquaculture.harvestProductionUnitAllocation.mock.calls[1][1].client_uuid).toBe(
      mockAquaculture.harvestProductionUnitAllocation.mock.calls[2][1].client_uuid,
    );
  });

  it('applique un delta serveur qui réconcilie une récolte déjà acceptée pending', async () => {
    const clientUuid = '00000000-0000-4000-8000-000000000013';
    await offlineService.saveFinalHarvestOffline('allocation-1', 'cycle-1', {
      client_uuid: clientUuid,
      harvest_date: '2026-07-14',
      final_harvested_at: '2026-07-14T17:00:00.000Z',
      final_count: 300,
      final_average_weight: 300,
      total_harvested_weight: 90,
      created_offline: true,
    });
    const [saved] = await offlineService.getOfflineFinalHarvests();
    await offlineService.markFinalHarvestAsSynced(saved.id, 'pending');

    await offlineService.applyFinalHarvestServerUpdates([{
      client_uuid: clientUuid,
      reconciliation_status: 'reconciled',
    } as any]);

    const [updated] = await offlineService.getOfflineFinalHarvests();
    expect(updated).toEqual(expect.objectContaining({
      synced: true,
      serverAccepted: true,
      reconciliationStatus: 'reconciled',
    }));
  });

  it('isOnline retourne true/false selon le fetch', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: true } as any);
    await expect(offlineService.isOnline()).resolves.toBe(true);

    global.fetch = jest.fn().mockRejectedValueOnce(new Error('offline'));
    await expect(offlineService.isOnline()).resolves.toBe(false);
  });
});
