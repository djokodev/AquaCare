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
    synchronize: jest.fn(),
    createFarmFeedReference: jest.fn(),
    declareCycleStoreManualStock: jest.fn(),
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

  it('synchronise aliment, stock puis journal et rejoue sans doublon', async () => {
    const calls: string[] = [];
    const feedClientUuid = '11111111-1111-4111-8111-111111111111';
    await offlineService.saveFeedReferenceOffline({
      farm_profile: 'farm-1',
      source: 'external',
      name: 'Aliment local',
      species: 'tilapia',
      pellet_size_mm: '2.00',
      client_uuid: feedClientUuid,
    });
    await offlineService.saveStockDeclarationOffline('cycle-1', {
      feed_reference_client_uuid: feedClientUuid,
      quantity_kg: '50.00',
      total_cost_fcfa: '50000.00',
      entry_date: '2026-07-20',
      client_uuid: '22222222-2222-4222-8222-222222222222',
    });
    await offlineService.saveCycleLogOffline('cycle-1', {
      log_date: '2026-07-20',
      feed_quantity: 5,
      feed_reference_client_uuid: feedClientUuid,
      client_uuid: '33333333-3333-4333-8333-333333333333',
    });
    mockAquaculture.createFarmFeedReference.mockImplementation(async () => {
      calls.push('reference');
      return { id: 'server-feed-1' } as any;
    });
    mockAquaculture.declareCycleStoreManualStock.mockImplementation(async () => {
      calls.push('stock');
      return { cycle_id: 'cycle-1' } as any;
    });
    mockAquaculture.createCycleLog.mockImplementation(async () => {
      calls.push('log');
      return { id: 'server-log-1' } as any;
    });

    const first = await offlineService.syncAllOfflineData();
    const second = await offlineService.syncAllOfflineData();

    expect(first.success).toBe(3);
    expect(first.failed).toBe(0);
    expect(calls).toEqual(['reference', 'stock', 'log']);
    expect(second.success).toBe(0);
    expect(mockAquaculture.createFarmFeedReference).toHaveBeenCalledTimes(1);
  });

  it('reprend au stock sans recréer la référence après une coupure', async () => {
    const feedClientUuid = '44444444-4444-4444-8444-444444444444';
    await offlineService.saveFeedReferenceOffline({
      farm_profile: 'farm-1', source: 'external', name: 'Starter externe', species: 'tilapia',
      pellet_size_mm: '2.00', client_uuid: feedClientUuid,
    });
    await offlineService.saveStockDeclarationOffline('cycle-1', {
      feed_reference_client_uuid: feedClientUuid,
      quantity_kg: '50.00', total_cost_fcfa: '50000.00', entry_date: '2026-07-20',
      client_uuid: '55555555-5555-4555-8555-555555555555',
    });
    await offlineService.saveCycleLogOffline('cycle-1', {
      log_date: '2026-07-20', feed_quantity: 5, feed_reference_client_uuid: feedClientUuid,
      client_uuid: '66666666-6666-4666-8666-666666666666',
    });
    mockAquaculture.createFarmFeedReference.mockResolvedValue({ id: 'server-feed-1' } as any);
    mockAquaculture.declareCycleStoreManualStock
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ cycle_id: 'cycle-1' } as any);
    mockAquaculture.createCycleLog.mockResolvedValue({ id: 'server-log-1' } as any);

    await offlineService.syncAllOfflineData();
    expect(mockAquaculture.createCycleLog).not.toHaveBeenCalled();
    await offlineService.syncAllOfflineData();

    expect(mockAquaculture.createFarmFeedReference).toHaveBeenCalledTimes(1);
    expect(mockAquaculture.declareCycleStoreManualStock).toHaveBeenCalledTimes(2);
    expect(mockAquaculture.createCycleLog).toHaveBeenCalledTimes(1);
  });

  it('refuse un replay local avec le même client_uuid et une autre identité', async () => {
    const payload = {
      farm_profile: 'farm-1', source: 'external' as const, name: 'Stable', species: 'tilapia' as const,
      pellet_size_mm: '2.00', client_uuid: '77777777-7777-4777-8777-777777777777',
    };
    await offlineService.saveFeedReferenceOffline(payload);

    await expect(offlineService.saveFeedReferenceOffline({ ...payload, pellet_size_mm: '3.00' }))
      .rejects.toThrow('feed_reference_idempotency_conflict');
  });

  it('remplace la saisie offline non synchronisee du meme jour et de la meme unite', async () => {
    const firstId = await offlineService.saveCycleLogOffline('cycle-1', {
      log_date: '2026-07-17',
      cycle_unit_allocation: 'allocation-1',
      client_uuid: 'daily-log-1',
      feed_quantity: 12.5,
    } as any);

    const replacementId = await offlineService.saveCycleLogOffline('cycle-1', {
      log_date: '2026-07-17',
      cycle_unit_allocation: 'allocation-1',
      client_uuid: 'daily-log-2',
      feed_quantity: 16.8,
    } as any);

    const logs = await offlineService.getOfflineCycleLogs();
    expect(logs).toHaveLength(1);
    expect(replacementId).toBe(firstId);
    expect(logs[0].logData.client_uuid).toBe('daily-log-1');
    expect(logs[0].logData.feed_quantity).toBe(16.8);
  });

  it('conserve des saisies offline separees pour deux unites', async () => {
    await offlineService.saveCycleLogOffline('cycle-1', {
      log_date: '2026-07-17',
      cycle_unit_allocation: 'allocation-1',
    } as any);
    await offlineService.saveCycleLogOffline('cycle-1', {
      log_date: '2026-07-17',
      cycle_unit_allocation: 'allocation-2',
    } as any);

    expect(await offlineService.getOfflineCycleLogs()).toHaveLength(2);
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

  it('rejoue après timeout la commande online avec le même UUID depuis la file offline', async () => {
    const clientUuid = '00000000-0000-4000-8000-000000000030';
    const onlinePayload = {
      client_uuid: clientUuid,
      harvest_date: '2026-07-14',
      final_harvested_at: '2026-07-14T17:00:00.000Z',
      final_count: 300,
      final_average_weight: 300,
      total_harvested_weight: 90,
      created_offline: false,
    };
    await offlineService.saveFinalHarvestOffline('allocation-1', 'cycle-1', onlinePayload);
    await offlineService.saveFinalHarvestOffline('allocation-1', 'cycle-1', {
      ...onlinePayload,
      created_offline: true,
    });
    mockAquaculture.harvestProductionUnitAllocation.mockResolvedValueOnce({
      idempotent_replay: true,
      final_harvest: {
        id: 'operation-id',
        client_uuid: clientUuid,
        reconciliation_status: 'reconciled',
      },
    } as any);

    await expect(offlineService.syncOfflineFinalHarvests()).resolves.toEqual({ success: 1, failed: 0 });

    expect(mockAquaculture.harvestProductionUnitAllocation).toHaveBeenCalledWith(
      'allocation-1',
      expect.objectContaining({ client_uuid: clientUuid, created_offline: true }),
    );
    const items = await offlineService.getOfflineFinalHarvests();
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(expect.objectContaining({ synced: true, reconciliationStatus: 'reconciled' }));
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

  it.each(['pending', 'reconciled'] as const)(
    'utilise le statut serveur %s pour une récolte globale offline',
    async (reconciliationStatus) => {
      const clientUuid = '00000000-0000-4000-8000-000000000021';
      await offlineService.saveFinalHarvestOffline('', 'cycle-1', {
        client_uuid: clientUuid,
        cycle_id: 'cycle-1',
        harvest_date: '2026-07-14',
        final_harvested_at: '2026-07-14T17:00:00.000Z',
        final_count: 300,
        final_average_weight: 300,
        total_harvested_weight: 90,
        created_offline: true,
      });
      mockAquaculture.harvestCycle.mockResolvedValueOnce({
        reconciliation_status: reconciliationStatus,
        idempotent_replay: true,
      } as any);

      await expect(offlineService.syncOfflineFinalHarvests()).resolves.toEqual({
        success: 1,
        failed: 0,
      });
      expect(await offlineService.getOfflineFinalHarvests()).toEqual([
        expect.objectContaining({
          synced: true,
          reconciliationStatus,
          harvestData: expect.objectContaining({ client_uuid: clientUuid }),
        }),
      ]);
    },
  );

  it('ne bloque pas une récolte avec un calibrage pending sans rapport', async () => {
    await offlineService.saveCalibrationOperationOffline('allocation-other', {
      client_uuid: '00000000-0000-4000-8000-000000000022',
      source_allocation_id: 'allocation-other',
      destination_production_unit_id: 'unit-other',
      calibrated_at: '2026-07-14T08:00:00.000Z',
      transferred_count: 10,
    }, 'cycle-other');
    mockAquaculture.calibrateAllocation.mockRejectedValue(new Error('offline'));

    await expect(offlineService.syncRelevantCalibrationOperationsForHarvest({
      cycleId: 'cycle-current',
      allocationId: 'allocation-current',
      productionUnitId: 'unit-current',
      harvestedAt: '2026-07-14T17:00:00.000Z',
    })).resolves.toEqual({ success: 0, failed: 0 });
    expect(mockAquaculture.calibrateAllocation).not.toHaveBeenCalled();
  });

  it('signale uniquement l’échec d’un calibrage pertinent', async () => {
    await offlineService.saveCalibrationOperationOffline('allocation-current', {
      client_uuid: '00000000-0000-4000-8000-000000000023',
      source_allocation_id: 'allocation-current',
      calibrated_at: '2026-07-14T08:00:00.000Z',
      transferred_count: 10,
    }, 'cycle-current');
    mockAquaculture.calibrateAllocation.mockRejectedValue(new Error('offline'));

    await expect(offlineService.syncRelevantCalibrationOperationsForHarvest({
      cycleId: 'cycle-current',
      allocationId: 'allocation-current',
      harvestedAt: '2026-07-14T17:00:00.000Z',
    })).resolves.toEqual({ success: 0, failed: 1 });
  });

  it('ne rejoue pas une récolte globale acceptée pendant un bulk partial_success', async () => {
    const acceptedHarvestUuid = '00000000-0000-4000-8000-000000000024';
    const rejectedCalibrationUuid = '00000000-0000-4000-8000-000000000025';
    await offlineService.saveFinalHarvestOffline('', 'cycle-1', {
      client_uuid: acceptedHarvestUuid,
      cycle_id: 'cycle-1',
      harvest_date: '2026-07-14',
      final_harvested_at: '2026-07-14T17:00:00.000Z',
      final_count: 300,
      final_average_weight: 300,
      total_harvested_weight: 90,
      created_offline: true,
    });
    await offlineService.saveCalibrationOperationOffline('allocation-1', {
      client_uuid: rejectedCalibrationUuid,
      source_allocation_id: 'allocation-1',
      calibrated_at: '2026-07-14T08:00:00.000Z',
      transferred_count: 10,
    }, 'cycle-1');
    mockAquaculture.synchronize.mockResolvedValueOnce({
      status: 'partial_success',
      accepted: {
        calibration_operations: [],
        final_harvests: [acceptedHarvestUuid],
      },
      items: [{
        type: 'final_harvest',
        client_uuid: acceptedHarvestUuid,
        status: 'accepted',
        reconciliation_status: 'pending',
      }],
      errors: [{ type: 'calibration_operation', error: 'invalid' }],
      server_updates: { final_harvests: [] },
    } as any);
    const result = await offlineService.syncAllOfflineData();

    expect(result.details.finalHarvests).toEqual({ success: 1, failed: 0 });
    expect(result.details.calibrationOperations).toEqual({ success: 0, failed: 1 });
    expect(mockAquaculture.harvestCycle).not.toHaveBeenCalled();
    expect(mockAquaculture.calibrateAllocation).not.toHaveBeenCalled();
    expect(await offlineService.getOfflineFinalHarvests()).toEqual([
      expect.objectContaining({
        synced: true,
        reconciliationStatus: 'pending',
        harvestData: expect.objectContaining({ client_uuid: acceptedHarvestUuid }),
      }),
    ]);
  });

  it('marque uniquement les UUID acceptés pour les six files en partial_success', async () => {
    await offlineService.saveNewCycleOffline({ client_uuid: 'cycle-ok' } as any);
    await offlineService.saveNewCycleOffline({ client_uuid: 'cycle-ko' } as any);
    await offlineService.saveCycleLogOffline('cycle-1', {
      client_uuid: 'log-ok',
      cycle_unit_allocation: 'allocation-1',
    } as any);
    await offlineService.saveCycleLogOffline('cycle-1', {
      client_uuid: 'log-ko',
      cycle_unit_allocation: 'allocation-2',
    } as any);
    await offlineService.saveSanitaryLogOffline('cycle-1', { client_uuid: 'sanitary-ok' } as any);
    await offlineService.saveSanitaryLogOffline('cycle-1', { client_uuid: 'sanitary-ko' } as any);
    await offlineService.saveCalibrationTankOffline({ client_uuid: 'tank-ok', name: 'OK', volume_m3: 5 });
    await offlineService.saveCalibrationTankOffline({ client_uuid: 'tank-ko', name: 'KO', volume_m3: 5 });
    await offlineService.saveCalibrationOperationOffline('allocation-1', {
      client_uuid: 'calibration-ok',
      source_allocation_id: 'allocation-1',
      calibrated_at: '2026-07-14T12:00:00.000Z',
      transferred_count: 10,
    });
    await offlineService.saveCalibrationOperationOffline('allocation-1', {
      client_uuid: 'calibration-ko',
      source_allocation_id: 'allocation-1',
      calibrated_at: '2026-07-14T13:00:00.000Z',
      transferred_count: 10,
    });
    const harvest = {
      cycle_id: 'cycle-1',
      harvest_date: '2026-07-14',
      final_harvested_at: '2026-07-14T18:00:00.000Z',
      final_count: 100,
      final_average_weight: 300,
      total_harvested_weight: 30,
      created_offline: true,
    };
    await offlineService.saveFinalHarvestOffline('', 'cycle-1', {
      ...harvest, client_uuid: 'harvest-ok',
    });
    await offlineService.saveFinalHarvestOffline('', 'cycle-1', {
      ...harvest, client_uuid: 'harvest-ko', final_count: 101,
    });
    mockAquaculture.synchronize.mockResolvedValueOnce({
      status: 'partial_success',
      accepted: {
        cycles: ['cycle-ok'],
        cycle_logs: ['log-ok'],
        sanitary_logs: ['sanitary-ok'],
        calibration_tanks: ['tank-ok'],
        calibration_operations: ['calibration-ok'],
        final_harvests: ['harvest-ok'],
      },
      items: [{
        type: 'final_harvest',
        client_uuid: 'harvest-ok',
        reconciliation_status: 'pending',
        operation_ids: ['operation-id'],
        operation_client_uuids: ['operation-uuid'],
      }],
      errors: [
        { type: 'cycle', client_uuid: 'cycle-ko' },
        { type: 'cycle_log', client_uuid: 'log-ko' },
        { type: 'sanitary_log', client_uuid: 'sanitary-ko' },
        { type: 'calibration_tank', client_uuid: 'tank-ko' },
        { type: 'calibration_operation', client_uuid: 'calibration-ko' },
        { type: 'final_harvest', client_uuid: 'harvest-ko' },
      ],
      server_updates: { final_harvests: [] },
    } as any);

    const result = await offlineService.syncAllOfflineData();

    expect(result).toEqual(expect.objectContaining({ success: 6, failed: 6 }));
    const syncedByUuid = <T extends { synced: boolean }>(
      items: T[], getUuid: (item: T) => string | undefined,
    ) => Object.fromEntries(items.map((item) => [getUuid(item), item.synced]));
    expect(syncedByUuid(await offlineService.getOfflineNewCycles(),
      (item) => item.cycleData.client_uuid)).toEqual({ 'cycle-ok': true, 'cycle-ko': false });
    expect(syncedByUuid(await offlineService.getOfflineCycleLogs(),
      (item) => item.logData.client_uuid)).toEqual({ 'log-ok': true, 'log-ko': false });
    expect(syncedByUuid(await offlineService.getOfflineSanitaryLogs(),
      (item) => item.sanitaryData.client_uuid)).toEqual({ 'sanitary-ok': true, 'sanitary-ko': false });
    expect(syncedByUuid(await offlineService.getOfflineCalibrationTanks(),
      (item) => item.tankData.client_uuid)).toEqual({ 'tank-ok': true, 'tank-ko': false });
    expect(syncedByUuid(await offlineService.getOfflineCalibrationOperations(),
      (item) => item.operationData.client_uuid)).toEqual({ 'calibration-ok': true, 'calibration-ko': false });
    expect(syncedByUuid(await offlineService.getOfflineFinalHarvests(),
      (item) => item.harvestData.client_uuid)).toEqual({ 'harvest-ok': true, 'harvest-ko': false });
    expect(mockAquaculture.createProductionCycle).not.toHaveBeenCalled();
    expect(mockAquaculture.createCycleLog).not.toHaveBeenCalled();
    expect(mockAquaculture.createSanitaryLog).not.toHaveBeenCalled();
    expect(mockAquaculture.createCalibrationTank).not.toHaveBeenCalled();
    expect(mockAquaculture.calibrateAllocation).not.toHaveBeenCalled();
    expect(mockAquaculture.harvestCycle).not.toHaveBeenCalled();
  });

  it('agrège les deltas des enfants d’une récolte globale avant de la réconcilier', async () => {
    await offlineService.saveFinalHarvestOffline('', 'cycle-1', {
      client_uuid: 'global-command',
      cycle_id: 'cycle-1',
      harvest_date: '2026-07-14',
      final_harvested_at: '2026-07-14T18:00:00.000Z',
      final_count: 300,
      final_average_weight: 300,
      total_harvested_weight: 90,
      created_offline: true,
    });
    const [saved] = await offlineService.getOfflineFinalHarvests();
    await offlineService.markFinalHarvestAsSynced(saved.id, 'pending', {
      operationIds: ['id-1', 'id-2'],
      operationClientUuids: ['child-1', 'child-2'],
    });

    await offlineService.applyFinalHarvestServerUpdates([{
      id: 'id-1', client_uuid: 'child-1', reconciliation_status: 'reconciled',
    } as any]);
    expect((await offlineService.getOfflineFinalHarvests())[0].reconciliationStatus).toBe('pending');

    await offlineService.applyFinalHarvestServerUpdates([{
      id: 'id-2', client_uuid: 'child-2', reconciliation_status: 'reconciled',
    } as any]);
    expect((await offlineService.getOfflineFinalHarvests())[0].reconciliationStatus).toBe('reconciled');
  });

  it('nettoie seulement les récoltes acceptées et réconciliées', async () => {
    const base = {
      cycle_id: 'cycle-1', harvest_date: '2026-07-14',
      final_harvested_at: '2026-07-14T18:00:00.000Z', final_count: 100,
      final_average_weight: 300, total_harvested_weight: 30, created_offline: true,
    };
    await offlineService.saveFinalHarvestOffline('', 'cycle-1', { ...base, client_uuid: 'pending' });
    await offlineService.saveFinalHarvestOffline('', 'cycle-1', { ...base, client_uuid: 'reconciled' });
    const items = await offlineService.getOfflineFinalHarvests();
    await offlineService.markFinalHarvestAsSynced(items[0].id, 'pending');
    await offlineService.markFinalHarvestAsSynced(items[1].id, 'reconciled');

    await expect(offlineService.cleanupSyncedFinalHarvests()).resolves.toBe(1);
    expect((await offlineService.getOfflineFinalHarvests()).map(
      (item) => item.harvestData.client_uuid,
    )).toEqual(['pending']);
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
