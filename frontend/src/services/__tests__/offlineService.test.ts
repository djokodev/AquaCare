import AsyncStorage from '@react-native-async-storage/async-storage';
import { offlineService } from '../offlineService';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    createCycleLog: jest.fn(),
    createProductionCycle: jest.fn(),
    createSanitaryLog: jest.fn(),
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

  it('getLastSyncDate et resetOfflineData fonctionnent', async () => {
    await AsyncStorage.setItem('aquacare_last_sync', '1735689600000');

    const last = await offlineService.getLastSyncDate();
    expect(last?.toISOString()).toBe('2025-01-01T00:00:00.000Z');

    await offlineService.saveCycleLogOffline('cycle-1', { log_date: '2026-02-20' } as any);
    await offlineService.resetOfflineData();

    expect(await AsyncStorage.getItem('aquacare_offline_cycle_logs')).toBeNull();
    expect(await AsyncStorage.getItem('aquacare_offline_new_cycles')).toBeNull();
    expect(await AsyncStorage.getItem('aquacare_offline_sanitary_logs')).toBeNull();
    expect(await AsyncStorage.getItem('aquacare_last_sync')).toBeNull();
  });

  it('isOnline retourne true/false selon le fetch', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: true } as any);
    await expect(offlineService.isOnline()).resolves.toBe(true);

    global.fetch = jest.fn().mockRejectedValueOnce(new Error('offline'));
    await expect(offlineService.isOnline()).resolves.toBe(false);
  });
});
