import { createCycleLogWithOfflineFallback } from '../aquacultureWorkflowService';
import { aquacultureService } from '../aquacultureService';
import { offlineService } from '@/services/offlineService';

jest.mock('../aquacultureService', () => ({
  aquacultureService: {
    createCycleLog: jest.fn(),
    updateCycleLog: jest.fn(),
  },
}));

jest.mock('@/services/offlineService', () => ({
  offlineService: {
    getOfflineStockDeclarations: jest.fn(),
    getOfflineFeedReferences: jest.fn(),
    saveCycleLogOffline: jest.fn(),
    findPendingCycleLogForScope: jest.fn(),
    markLogAsSynced: jest.fn(),
  },
}));

describe('createCycleLogWithOfflineFallback', () => {
  const service = aquacultureService as jest.Mocked<typeof aquacultureService>;
  const offline = offlineService as jest.Mocked<typeof offlineService>;

  beforeEach(() => {
    jest.clearAllMocks();
    offline.getOfflineStockDeclarations.mockResolvedValue([]);
    offline.getOfflineFeedReferences.mockResolvedValue([]);
    offline.findPendingCycleLogForScope.mockResolvedValue(null);
  });

  it('met a jour le journal serveur et marque la projection locale comme synchronisee', async () => {
    service.updateCycleLog.mockResolvedValue({ id: 'server-log-1' } as any);
    offline.findPendingCycleLogForScope.mockResolvedValue({
      id: 'offline-log-1',
      cycleId: 'cycle-1',
      logData: { log_date: '2026-07-23' },
      fingerprint: 'fingerprint',
      timestamp: 1,
      synced: false,
      server_log_id: 'server-log-1',
    });

    await createCycleLogWithOfflineFallback(
      'cycle-1',
      { log_date: '2026-07-23', cycle_unit_allocation: 'unit-1', feed_quantity: 4 },
      { serverLogId: 'server-log-1' },
    );

    expect(service.updateCycleLog).toHaveBeenCalledWith(
      'server-log-1',
      expect.objectContaining({ feed_quantity: 4 }),
    );
    expect(service.createCycleLog).not.toHaveBeenCalled();
    expect(offline.markLogAsSynced).toHaveBeenCalledWith('offline-log-1');
  });

  it('conserve la provenance offline lorsqu’un journal local est finalement cree en ligne', async () => {
    service.createCycleLog.mockResolvedValue({ id: 'server-log-1' } as any);
    offline.findPendingCycleLogForScope.mockResolvedValue({
      id: 'offline-log-1',
      cycleId: 'cycle-1',
      logData: { log_date: '2026-07-23', created_offline: true },
      fingerprint: 'fingerprint',
      timestamp: 1,
      synced: false,
    });

    await createCycleLogWithOfflineFallback('cycle-1', {
      log_date: '2026-07-23', cycle_unit_allocation: 'unit-1', feed_quantity: 4,
    });

    expect(service.createCycleLog).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({ created_offline: true }),
    );
    expect(service.updateCycleLog).not.toHaveBeenCalled();
    expect(offline.markLogAsSynced).toHaveBeenCalledWith('offline-log-1');
  });

  it('retarde le journal lorsque le stock pending partage le feed_reference_id et le cycle', async () => {
    offline.getOfflineStockDeclarations.mockResolvedValue([{
      id: 'stock-1', cycleId: 'cycle-1', clientUuid: 'stock-client', fingerprint: 'stock', synced: false, timestamp: 1,
      payload: { feed_reference_id: 'server-feed-1', quantity_kg: '20.00', total_cost_fcfa: '2000.00', entry_date: '2026-07-23' },
    }]);

    const result = await createCycleLogWithOfflineFallback('cycle-1', {
      log_date: '2026-07-23', feed_reference: 'server-feed-1', feed_quantity: 3,
    });

    expect(result).toEqual({ mode: 'offline' });
    expect(offline.saveCycleLogOffline).toHaveBeenCalledWith(
      'cycle-1',
      expect.objectContaining({ feed_reference: 'server-feed-1' }),
      { serverLogId: null },
    );
    expect(service.createCycleLog).not.toHaveBeenCalled();
  });

  it('ne bloque pas une declaration pending du meme aliment dans un autre cycle', async () => {
    offline.getOfflineStockDeclarations.mockResolvedValue([{
      id: 'stock-1', cycleId: 'cycle-2', clientUuid: 'stock-client', fingerprint: 'stock', synced: false, timestamp: 1,
      payload: { feed_reference_id: 'server-feed-1', quantity_kg: '20.00', total_cost_fcfa: '2000.00', entry_date: '2026-07-23' },
    }]);
    service.createCycleLog.mockResolvedValue({ id: 'server-log-1' } as any);

    const result = await createCycleLogWithOfflineFallback('cycle-1', {
      log_date: '2026-07-23', feed_reference: 'server-feed-1', feed_quantity: 3,
    });

    expect(result.mode).toBe('online');
    expect(service.createCycleLog).toHaveBeenCalled();
  });

  it('ne bloque pas un stock pending d’une autre reference dans le meme cycle', async () => {
    offline.getOfflineStockDeclarations.mockResolvedValue([{
      id: 'stock-1', cycleId: 'cycle-1', clientUuid: 'stock-client', fingerprint: 'stock', synced: false, timestamp: 1,
      payload: { feed_reference_id: 'server-feed-2', quantity_kg: '20.00', total_cost_fcfa: '2000.00', entry_date: '2026-07-23' },
    }]);
    service.createCycleLog.mockResolvedValue({ id: 'server-log-1' } as any);

    const result = await createCycleLogWithOfflineFallback('cycle-1', {
      log_date: '2026-07-23', feed_reference: 'server-feed-1', feed_quantity: 3,
    });

    expect(result.mode).toBe('online');
    expect(service.createCycleLog).toHaveBeenCalled();
    expect(offline.saveCycleLogOffline).not.toHaveBeenCalled();
  });
});
