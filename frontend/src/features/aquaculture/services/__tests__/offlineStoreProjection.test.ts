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
    expect(result.store.summary.estimated_feed_remaining_kg).toBe('12.00');
    expect(result.store.calculation_warnings).toEqual(['offline_stock_pending', 'offline_log_pending']);
  });
});
