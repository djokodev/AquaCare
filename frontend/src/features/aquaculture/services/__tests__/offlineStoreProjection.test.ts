import { projectOfflineStore } from '../offlineStoreProjection';
import { offlineService } from '@/services/offlineService';
import { CycleStore } from '@/types/aquaculture';

jest.mock('@/services/offlineService', () => ({
  offlineService: {
    getOfflineStockDeclarations: jest.fn(),
    getOfflineFeedReferences: jest.fn(),
    getPendingSyncLogs: jest.fn(),
  },
}));

describe('projectOfflineStore', () => {
  it('applique stock puis consommation locale à la disponibilité affichée', async () => {
    const store: CycleStore = {
      cycle_id: 'cycle-1',
      calculation_status: 'available',
      calculation_source: 'server',
      calculated_at: '2026-07-23T00:00:00Z',
      calculation_warnings: [],
      summary: {
        manual_feed_kg: '10.00', received_order_feed_kg: '0.00', total_feed_added_kg: '10.00',
        feed_consumed_kg: '0.00', estimated_feed_remaining_kg: '10.00', feed_expenses_fcfa: '0.00',
        pending_orders_count: 0, pending_order_amount_fcfa: '0.00', pending_order_feed_kg: '0.00',
        total_feed_needed_kg: null, feed_need_remaining_kg: '5.00', secured_feed_kg: '10.00',
        feed_to_secure_kg: '0.00', stock_tracking_started_at: '2026-07-23', unclassified_stock_kg: '0.00',
      },
      status: 'ok',
      stock_items: [],
      pending_orders: [],
      stock_tracking_started_at: '2026-07-23',
      unclassified_entries: [],
    };
    (offlineService.getOfflineStockDeclarations as jest.Mock).mockResolvedValue([{
      id: 'stock-1', cycleId: 'cycle-1', clientUuid: 'stock-client',
      feedReferenceClientUuid: 'feed-client', synced: false, timestamp: 1,
      payload: { feed_reference_client_uuid: 'feed-client', quantity_kg: '5.00', total_cost_fcfa: '1000.00' },
    }]);
    (offlineService.getOfflineFeedReferences as jest.Mock).mockResolvedValue([{
      id: 'feed-1', clientUuid: 'feed-client', synced: false, timestamp: 1,
      payload: { name: 'Aliment externe', source: 'external', species: 'tilapia', pellet_size_mm: '2.00' },
    }]);
    (offlineService.getPendingSyncLogs as jest.Mock).mockResolvedValue([{
      id: 'log-1', cycleId: 'cycle-1', synced: false, timestamp: 1,
      logData: { feed_reference_client_uuid: 'feed-client', feed_quantity: 3.00, log_date: '2026-07-23' },
    }]);

    const result = await projectOfflineStore('cycle-1', store, 'Pending stock');

    expect(result.pendingStockCount).toBe(1);
    expect(result.pendingLogCount).toBe(1);
    expect(result.store.stock_items[0].quantity_available_kg).toBe('2.00');
    expect(result.store.summary.estimated_feed_remaining_kg).toBe('2.00');
    expect(result.store.calculation_warnings).toEqual(['offline_stock_pending', 'offline_log_pending']);
  });

  it('conserve le stock non classifié sans le rendre utilisable par granulométrie', async () => {
    const store: CycleStore = {
      cycle_id: 'cycle-1',
      calculation_status: 'incomplete',
      calculation_source: 'server',
      calculated_at: '2026-07-23T00:00:00Z',
      calculation_warnings: [],
      summary: {
        manual_feed_kg: '0.00', received_order_feed_kg: '30.00', total_feed_added_kg: '30.00',
        feed_consumed_kg: '0.00', estimated_feed_remaining_kg: '30.00', feed_expenses_fcfa: '45000.00',
        pending_orders_count: 0, pending_order_amount_fcfa: '0.00', pending_order_feed_kg: '0.00',
        total_feed_needed_kg: '100.00', feed_need_remaining_kg: '100.00', secured_feed_kg: '0.00',
        feed_to_secure_kg: '100.00', stock_tracking_started_at: '2026-07-23', unclassified_stock_kg: '30.00',
      },
      status: 'check_stock',
      stock_items: [{
        feed_reference_id: null,
        source: null,
        species: null,
        label: 'Ancien aliment',
        feed_size_mm: '2.00',
        quantity_added_kg: '30.00',
        quantity_consumed_kg: '0.00',
        quantity_available_kg: '30.00',
      }],
      stock_by_size: [],
      available_pellet_sizes: ['2.00'],
      pending_orders: [],
      stock_tracking_started_at: '2026-07-23',
      unclassified_entries: [],
    };
    (offlineService.getOfflineStockDeclarations as jest.Mock).mockResolvedValue([]);
    (offlineService.getOfflineFeedReferences as jest.Mock).mockResolvedValue([]);
    (offlineService.getPendingSyncLogs as jest.Mock).mockResolvedValue([]);

    const result = await projectOfflineStore('cycle-1', store, 'Pending stock');

    expect(result.store.stock_items).toHaveLength(1);
    expect(result.store.stock_items[0].quantity_available_kg).toBe('30.00');
    expect(result.store.stock_by_size).toEqual([]);
    expect(result.store.summary.estimated_feed_remaining_kg).toBe('30.00');
    expect(result.store.summary.unclassified_stock_kg).toBe('30.00');
  });

  it('fusionne une declaration pending et un journal par feed_reference_id serveur', async () => {
    (offlineService.getOfflineStockDeclarations as jest.Mock).mockResolvedValue([{
      id: 'stock-server-id',
      cycleId: 'cycle-1',
      clientUuid: 'stock-client',
      synced: false,
      timestamp: 1,
      payload: {
        feed_reference_id: 'server-feed-1',
        quantity_kg: '20.00',
        total_cost_fcfa: '2000.00',
      },
    }]);
    (offlineService.getOfflineFeedReferences as jest.Mock).mockResolvedValue([]);
    (offlineService.getPendingSyncLogs as jest.Mock).mockResolvedValue([{
      id: 'log-1',
      cycleId: 'cycle-1',
      synced: false,
      timestamp: 1,
      logData: { feed_reference: 'server-feed-1', feed_quantity: 3, log_date: '2026-07-23' },
    }]);
    const store = {
      cycle_id: 'cycle-1', calculation_status: 'available', calculation_source: 'server',
      calculated_at: '2026-07-23T00:00:00Z', calculation_warnings: [], status: 'ok',
      summary: {
        manual_feed_kg: '0.00', received_order_feed_kg: '0.00', total_feed_added_kg: '0.00',
        feed_consumed_kg: '0.00', estimated_feed_remaining_kg: '0.00', feed_expenses_fcfa: '0.00',
        pending_orders_count: 0, pending_order_amount_fcfa: '0.00', pending_order_feed_kg: '0.00',
        total_feed_needed_kg: null, feed_need_remaining_kg: null, secured_feed_kg: null,
        feed_to_secure_kg: null, stock_tracking_started_at: null, unclassified_stock_kg: '0.00',
      },
      stock_items: [{
        feed_reference_id: 'server-feed-1', source: 'external', species: 'tilapia', label: 'Dibaq',
        feed_size_mm: '2.00', quantity_added_kg: '10.00', quantity_consumed_kg: '0.00',
        quantity_available_kg: '10.00',
      }], pending_orders: [], stock_tracking_started_at: null, unclassified_entries: [],
    } as CycleStore;

    const result = await projectOfflineStore('cycle-1', store, 'Pending stock');

    expect(result.store.stock_items).toHaveLength(1);
    expect(result.store.stock_items[0].quantity_available_kg).toBe('27.00');
    expect(result.store.calculation_warnings).toEqual(['offline_stock_pending', 'offline_log_pending']);
  });

  it('regroupe le stock serveur et local avant de soustraire chaque journal une fois', async () => {
    const store = {
      cycle_id: 'cycle-1',
      calculation_status: 'available',
      calculation_source: 'server',
      calculated_at: '2026-07-23T00:00:00Z',
      calculation_warnings: [],
      summary: {
        manual_feed_kg: '10.00', received_order_feed_kg: '0.00', total_feed_added_kg: '10.00',
        feed_consumed_kg: '0.00', estimated_feed_remaining_kg: '10.00', feed_expenses_fcfa: '0.00',
        pending_orders_count: 0, pending_order_amount_fcfa: '0.00', pending_order_feed_kg: '0.00',
        total_feed_needed_kg: null, feed_need_remaining_kg: null, secured_feed_kg: null,
        feed_to_secure_kg: null, stock_tracking_started_at: '2026-07-01', unclassified_stock_kg: '0.00',
      },
      status: 'ok',
      stock_items: [{
        feed_reference_id: 'server-feed-1',
        source: 'external',
        species: 'tilapia',
        label: 'Feed A',
        feed_size_mm: '2.00',
        quantity_added_kg: '10.00',
        quantity_consumed_kg: '0.00',
        quantity_available_kg: '10.00',
      }],
      pending_orders: [],
      stock_tracking_started_at: '2026-07-01',
      unclassified_entries: [],
    } satisfies CycleStore;
    (offlineService.getOfflineFeedReferences as jest.Mock).mockResolvedValue([{
      id: 'local-reference',
      clientUuid: 'feed-client',
      serverId: 'server-feed-1',
      synced: true,
      timestamp: 1,
      fingerprint: 'fingerprint',
      payload: {
        name: 'Feed A',
        source: 'external',
        species: 'tilapia',
        pellet_size_mm: '2.00',
      },
    }]);
    (offlineService.getOfflineStockDeclarations as jest.Mock).mockResolvedValue([{
      id: 'stock-1',
      cycleId: 'cycle-1',
      clientUuid: 'stock-client',
      feedReferenceClientUuid: 'feed-client',
      synced: false,
      timestamp: 1,
      fingerprint: 'stock-fingerprint',
      payload: {
        feed_reference_client_uuid: 'feed-client',
        quantity_kg: '50.00',
        total_cost_fcfa: '1000.00',
      },
    }]);
    (offlineService.getPendingSyncLogs as jest.Mock).mockResolvedValue([{
      id: 'log-1',
      cycleId: 'cycle-1',
      synced: false,
      timestamp: 1,
      logData: {
        feed_reference_client_uuid: 'feed-client',
        feed_quantity: 5,
        log_date: '2026-07-23',
      },
    }]);

    const result = await projectOfflineStore('cycle-1', store, 'Pending stock');

    expect(result.store.stock_items).toHaveLength(1);
    expect(result.store.stock_items[0].feed_reference_id).toBe('server-feed-1');
    expect(result.store.stock_items[0].quantity_added_kg).toBe('60.00');
    expect(result.store.stock_items[0].quantity_consumed_kg).toBe('5.00');
    expect(result.store.stock_items[0].quantity_available_kg).toBe('55.00');
    expect(result.store.summary.feed_consumed_kg).toBe('5.00');
    expect(result.store.summary.estimated_feed_remaining_kg).toBe('55.00');
  });

  it('signale un conflit sans masquer une projection négative', async () => {
    (offlineService.getOfflineFeedReferences as jest.Mock).mockResolvedValue([]);
    (offlineService.getOfflineStockDeclarations as jest.Mock).mockResolvedValue([]);
    (offlineService.getPendingSyncLogs as jest.Mock).mockResolvedValue([{
      id: 'log-1',
      cycleId: 'cycle-1',
      synced: false,
      timestamp: 1,
      logData: {
        feed_reference: 'feed-1',
        feed_quantity: 5,
        log_date: '2026-07-23',
      },
    }]);

    const result = await projectOfflineStore('cycle-1', null, 'Pending stock');

    expect(result.store.calculation_warnings).toContain('offline_stock_conflict');
    expect(result.store.status).toBe('check_stock');
  });

  it('additionne plusieurs déclarations et consomme chaque journal une fois', async () => {
    (offlineService.getOfflineFeedReferences as jest.Mock).mockResolvedValue([{
      id: 'reference-a',
      clientUuid: 'feed-a',
      synced: false,
      timestamp: 1,
      payload: {
        name: 'Feed A',
        source: 'external',
        species: 'tilapia',
        pellet_size_mm: '2.00',
      },
    }]);
    (offlineService.getOfflineStockDeclarations as jest.Mock).mockResolvedValue([
      {
        id: 'stock-20',
        cycleId: 'cycle-1',
        clientUuid: 'stock-client-20',
        feedReferenceClientUuid: 'feed-a',
        synced: false,
        timestamp: 1,
        payload: { quantity_kg: '20.00', total_cost_fcfa: '1000.00' },
      },
      {
        id: 'stock-30',
        cycleId: 'cycle-1',
        clientUuid: 'stock-client-30',
        feedReferenceClientUuid: 'feed-a',
        synced: false,
        timestamp: 2,
        payload: { quantity_kg: '30.00', total_cost_fcfa: '1500.00' },
      },
    ]);
    (offlineService.getPendingSyncLogs as jest.Mock).mockResolvedValue([
      {
        id: 'log-3',
        cycleId: 'cycle-1',
        synced: false,
        timestamp: 3,
        logData: { feed_reference_client_uuid: 'feed-a', feed_quantity: 3 },
      },
      {
        id: 'log-2',
        cycleId: 'cycle-1',
        synced: false,
        timestamp: 4,
        logData: { feed_reference_client_uuid: 'feed-a', feed_quantity: 2 },
      },
    ]);

    const result = await projectOfflineStore('cycle-1', null, 'Pending stock');

    expect(result.store.stock_items).toHaveLength(1);
    expect(result.store.stock_items[0].quantity_added_kg).toBe('50.00');
    expect(result.store.stock_items[0].quantity_consumed_kg).toBe('5.00');
    expect(result.store.stock_items[0].quantity_available_kg).toBe('45.00');
    expect(result.store.summary.estimated_feed_remaining_kg).toBe('45.00');
  });

  it('répartit une ration par granulométrie entre deux stocks offline', async () => {
    (offlineService.getOfflineFeedReferences as jest.Mock).mockResolvedValue([
      {
        id: 'reference-a', clientUuid: 'feed-a', synced: false, timestamp: 1,
        payload: { name: 'Feed A', source: 'external', species: 'tilapia', pellet_size_mm: '2.00' },
      },
      {
        id: 'reference-b', clientUuid: 'feed-b', synced: false, timestamp: 2,
        payload: { name: 'Feed B', source: 'external', species: 'tilapia', pellet_size_mm: '2.00' },
      },
    ]);
    (offlineService.getOfflineStockDeclarations as jest.Mock).mockResolvedValue([
      {
        id: 'stock-a', cycleId: 'cycle-1', clientUuid: 'stock-a', feedReferenceClientUuid: 'feed-a',
        synced: false, timestamp: 1, payload: { quantity_kg: '5.00', total_cost_fcfa: '1000.00' },
      },
      {
        id: 'stock-b', cycleId: 'cycle-1', clientUuid: 'stock-b', feedReferenceClientUuid: 'feed-b',
        synced: false, timestamp: 2, payload: { quantity_kg: '5.00', total_cost_fcfa: '1000.00' },
      },
    ]);
    (offlineService.getPendingSyncLogs as jest.Mock).mockResolvedValue([{
      id: 'log-size-only', cycleId: 'cycle-1', synced: false, timestamp: 3,
      logData: { feed_size_mm: '2.00', feed_quantity: 6, log_date: '2026-07-23' },
    }]);

    const result = await projectOfflineStore('cycle-1', null, 'Pending stock');

    expect(result.store.stock_by_size).toEqual([expect.objectContaining({
      feed_size_mm: '2.00',
      quantity_consumed_kg: '6.00',
      quantity_available_kg: '4.00',
    })]);
    expect(result.store.summary.estimated_feed_remaining_kg).toBe('4.00');
    expect(result.store.calculation_warnings).not.toContain('offline_stock_conflict');
    expect(result.store.stock_items.map((item) => item.quantity_consumed_kg)).toEqual(['5.00', '1.00']);
  });

  it('ne fusionne jamais deux références différentes portant le même nom', async () => {
    (offlineService.getOfflineFeedReferences as jest.Mock).mockResolvedValue([
      {
        id: 'reference-a',
        clientUuid: 'feed-a',
        synced: false,
        timestamp: 1,
        payload: {
          name: 'Même nom',
          source: 'external',
          species: 'tilapia',
          pellet_size_mm: '2.00',
        },
      },
      {
        id: 'reference-b',
        clientUuid: 'feed-b',
        synced: false,
        timestamp: 2,
        payload: {
          name: 'Même nom',
          source: 'external',
          species: 'tilapia',
          pellet_size_mm: '2.00',
        },
      },
    ]);
    (offlineService.getOfflineStockDeclarations as jest.Mock).mockResolvedValue([
      {
        id: 'stock-a',
        cycleId: 'cycle-1',
        clientUuid: 'stock-client-a',
        feedReferenceClientUuid: 'feed-a',
        synced: false,
        timestamp: 1,
        payload: { quantity_kg: '10.00', total_cost_fcfa: '1000.00' },
      },
      {
        id: 'stock-b',
        cycleId: 'cycle-1',
        clientUuid: 'stock-client-b',
        feedReferenceClientUuid: 'feed-b',
        synced: false,
        timestamp: 2,
        payload: { quantity_kg: '20.00', total_cost_fcfa: '2000.00' },
      },
    ]);
    (offlineService.getPendingSyncLogs as jest.Mock).mockResolvedValue([]);

    const result = await projectOfflineStore('cycle-1', null, 'Pending stock');

    expect(result.store.stock_items).toHaveLength(2);
    expect(result.store.stock_items.map((item) => item.quantity_available_kg).sort())
      .toEqual(['10.00', '20.00']);
  });
});
