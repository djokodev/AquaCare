import { CycleStore } from '@/types/aquaculture';
import { offlineService } from '@/services/offlineService';

interface OfflineProjectionResult {
  store: CycleStore;
  pendingStockCount: number;
  pendingLogCount: number;
}

const emptySummary: CycleStore['summary'] = {
  manual_feed_kg: '0.00',
  received_order_feed_kg: '0.00',
  total_feed_added_kg: '0.00',
  feed_consumed_kg: '0.00',
  estimated_feed_remaining_kg: '0.00',
  feed_expenses_fcfa: '0.00',
  pending_orders_count: 0,
  pending_order_amount_fcfa: '0.00',
  pending_order_feed_kg: '0.00',
  total_feed_needed_kg: null,
  feed_need_remaining_kg: null,
  secured_feed_kg: null,
  feed_to_secure_kg: null,
  stock_tracking_started_at: null,
  unclassified_stock_kg: '0.00',
};

const numeric = (value: string | number | null | undefined): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

interface ProjectedStockGroup {
  key: string;
  item: CycleStore['stock_items'][number];
}

const identityKey = (
  feedReferenceId: string | null | undefined,
  feedReferenceClientUuid: string | null | undefined,
  clientToServer: Map<string, string>,
  fallback: string,
): string => {
  if (feedReferenceId) return `server:${feedReferenceId}`;
  if (feedReferenceClientUuid) {
    const serverId = clientToServer.get(feedReferenceClientUuid);
    return serverId ? `server:${serverId}` : `client:${feedReferenceClientUuid}`;
  }
  return fallback;
};

/**
 * Projette les dépendances locales dans le même contrat que le Magasin serveur.
 * L'ordre des dépendances est intentionnel : référence, stock, puis journal.
 */
export const projectOfflineStore = async (
  cycleId: string,
  serverStore: CycleStore | null,
  pendingLabel: string,
): Promise<OfflineProjectionResult> => {
  const [stockDeclarations, localReferences, localLogs] = await Promise.all([
    typeof offlineService.getOfflineStockDeclarations === 'function'
      ? offlineService.getOfflineStockDeclarations() : Promise.resolve([]),
    typeof offlineService.getOfflineFeedReferences === 'function'
      ? offlineService.getOfflineFeedReferences() : Promise.resolve([]),
    typeof offlineService.getPendingSyncLogs === 'function'
      ? offlineService.getPendingSyncLogs() : Promise.resolve([]),
  ]);
  const pendingStocks = stockDeclarations.filter((item) => item.cycleId === cycleId && !item.synced);
  const pendingLogs = localLogs.filter((item) => item.cycleId === cycleId && !item.synced);
  const clientToServer = new Map(
    localReferences
      .filter((reference) => reference.serverId)
      .map((reference) => [reference.clientUuid, reference.serverId as string]),
  );
  const base: CycleStore = serverStore ? {
    ...serverStore,
    calculation_warnings: serverStore.calculation_warnings ?? [],
    summary: { ...emptySummary, ...(serverStore.summary ?? {}) },
    stock_items: serverStore.stock_items ?? [],
    pending_orders: serverStore.pending_orders ?? [],
    unclassified_entries: serverStore.unclassified_entries ?? [],
  } : {
    cycle_id: cycleId,
    calculation_status: 'incomplete',
    calculation_source: 'offline_projection',
    calculated_at: new Date().toISOString(),
    calculation_warnings: [],
    summary: { ...emptySummary },
    status: 'not_started',
    stock_items: [],
    pending_orders: [],
    stock_tracking_started_at: null,
    unclassified_entries: [],
  };

  const groups = new Map<string, ProjectedStockGroup>();
  const mergeItem = (
    item: CycleStore['stock_items'][number],
    key: string,
  ) => {
    const current = groups.get(key);
    if (!current) {
      groups.set(key, { key, item: { ...item } });
      return;
    }
    current.item = {
      ...current.item,
      feed_reference_id: current.item.feed_reference_id ?? item.feed_reference_id,
      feed_reference_client_uuid:
        current.item.feed_reference_client_uuid ?? item.feed_reference_client_uuid,
      pending_sync: Boolean(current.item.pending_sync || item.pending_sync),
      quantity_added_kg: (
        numeric(current.item.quantity_added_kg) + numeric(item.quantity_added_kg)
      ).toFixed(2),
      quantity_consumed_kg: (
        numeric(current.item.quantity_consumed_kg) + numeric(item.quantity_consumed_kg)
      ).toFixed(2),
      quantity_available_kg: (
        numeric(current.item.quantity_available_kg) + numeric(item.quantity_available_kg)
      ).toFixed(2),
    };
  };

  base.stock_items.forEach((item, index) => {
    mergeItem(
      item,
      identityKey(
        item.feed_reference_id,
        item.feed_reference_client_uuid,
        clientToServer,
        `server-legacy:${index}`,
      ),
    );
  });

  pendingStocks.forEach((item) => {
    const reference = localReferences.find(
      (candidate) => candidate.clientUuid === item.feedReferenceClientUuid,
    );
    const resolvedServerId = item.payload.feed_reference_id
      ?? (item.feedReferenceClientUuid
        ? clientToServer.get(item.feedReferenceClientUuid)
        : undefined);
    const pendingItem = {
      feed_reference_id: resolvedServerId ?? null,
      feed_reference_client_uuid: item.feedReferenceClientUuid ?? null,
      source: reference?.payload.source ?? null,
      species: reference?.payload.species ?? null,
      label: reference?.payload.name ?? pendingLabel,
      feed_size_mm: reference?.payload.pellet_size_mm ?? null,
      quantity_added_kg: item.payload.quantity_kg,
      quantity_consumed_kg: '0.00',
      quantity_available_kg: item.payload.quantity_kg,
      pending_sync: true,
    } satisfies CycleStore['stock_items'][number];
    mergeItem(
      pendingItem,
      identityKey(
        resolvedServerId,
        item.feedReferenceClientUuid,
        clientToServer,
        `pending-stock:${item.id}`,
      ),
    );
  });

  const pendingStockKg = pendingStocks.reduce((total, item) => total + numeric(item.payload.quantity_kg), 0);
  const pendingCost = pendingStocks.reduce((total, item) => total + numeric(item.payload.total_cost_fcfa), 0);
  let pendingConsumedKg = 0;
  let hasOfflineStockConflict = false;
  pendingLogs.forEach((log) => {
    const quantity = numeric(log.logData.feed_quantity);
    if (quantity <= 0) return;
    pendingConsumedKg += quantity;
    const referenceId = log.logData.feed_reference ?? null;
    const referenceClientUuid = log.logData.feed_reference_client_uuid ?? null;
    const key = identityKey(
      referenceId,
      referenceClientUuid,
      clientToServer,
      `orphan-log:${log.id}`,
    );
    const group = groups.get(key);
    if (!group) {
      hasOfflineStockConflict = true;
      return;
    }
    const available = numeric(group.item.quantity_available_kg) - quantity;
    group.item = {
      ...group.item,
      quantity_consumed_kg: (
        numeric(group.item.quantity_consumed_kg) + quantity
      ).toFixed(2),
      quantity_available_kg: available.toFixed(2),
    };
    if (available < 0) hasOfflineStockConflict = true;
  });
  const projectedItems = Array.from(groups.values(), ({ item }) => item);
  const remaining = projectedItems.reduce(
    (total, item) => total + numeric(item.quantity_available_kg),
    0,
  );
  const feedToSecure = base.summary.feed_to_secure_kg === null
    ? null
    : (numeric(base.summary.feed_to_secure_kg) - pendingStockKg + pendingConsumedKg).toFixed(2);
  const projected: CycleStore = {
    ...base,
    calculation_status: pendingStocks.length || pendingLogs.length ? 'incomplete' : base.calculation_status,
    calculation_warnings: [
      ...base.calculation_warnings,
      ...(pendingStocks.length ? ['offline_stock_pending'] : []),
      ...(pendingLogs.length ? ['offline_log_pending'] : []),
      ...(hasOfflineStockConflict ? ['offline_stock_conflict'] : []),
    ].filter((warning, index, warnings) => warnings.indexOf(warning) === index),
    summary: {
      ...base.summary,
      manual_feed_kg: (numeric(base.summary.manual_feed_kg) + pendingStockKg).toFixed(2),
      total_feed_added_kg: (numeric(base.summary.total_feed_added_kg) + pendingStockKg).toFixed(2),
      feed_consumed_kg: (numeric(base.summary.feed_consumed_kg) + pendingConsumedKg).toFixed(2),
      estimated_feed_remaining_kg: remaining.toFixed(2),
      feed_expenses_fcfa: (numeric(base.summary.feed_expenses_fcfa) + pendingCost).toFixed(2),
      feed_to_secure_kg: feedToSecure,
    },
    stock_items: projectedItems,
    status: hasOfflineStockConflict
      ? 'check_stock'
      : serverStore
        ? base.status
        : (projectedItems.length > 0 ? 'ok' : base.status),
  };
  return {
    store: projected,
    pendingStockCount: pendingStocks.length,
    pendingLogCount: pendingLogs.length,
  };
};
