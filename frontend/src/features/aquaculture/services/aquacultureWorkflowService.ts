import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { offlineService } from '@/services/offlineService';
import {
  CycleLog,
  CreateCycleForm,
  CycleStore,
  CycleStoreManualStockPayload,
  DailyLogForm,
  FarmFeedReferenceCreatePayload,
  ProductionCycle,
  SanitaryLog,
  SanitaryLogForm,
} from '@/types/aquaculture';
import { isNetworkError } from '@/utils/errorParser';
import logger from '@/utils/logger';

export type OnlineOrOffline<T> =
  | { mode: 'online'; data: T }
  | { mode: 'offline' };

/**
 * Tente une synchronisation silencieuse des donnees offline.
 * Ne remonte pas d'erreur bloquante a l'UI.
 */
export const runSilentOfflineSync = async (
  onSuccessfulSync?: () => void
): Promise<boolean> => {
  try {
    const hasPending = await offlineService.hasAnyPendingSync();
    if (!hasPending) {
      return false;
    }

    const result = await offlineService.syncAllOfflineData();
    if (result.success > 0) {
      onSuccessfulSync?.();
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Erreur synchronisation silencieuse aquaculture:', error);
    return false;
  }
};

/**
 * @deprecated Legacy sync compatibility only. Modern cycle screens must use
 * launchProductionCycle and keep an incomplete form in memory when offline.
 */
export const createProductionCycleWithOfflineFallback = async (
  cycleData: CreateCycleForm
): Promise<OnlineOrOffline<ProductionCycle>> => {
  try {
    const createdCycle = await aquacultureService.createProductionCycle(cycleData);
    return { mode: 'online', data: createdCycle };
  } catch (error: unknown) {
    if (isNetworkError(error)) {
      await offlineService.saveNewCycleOffline(cycleData);
      return { mode: 'offline' };
    }
    throw error;
  }
};

/**
 * Cree un log quotidien en ligne, fallback automatique offline sur erreur reseau.
 */
export const createCycleLogWithOfflineFallback = async (
  cycleId: string,
  logData: DailyLogForm
): Promise<OnlineOrOffline<CycleLog>> => {
  if (logData.feed_reference_client_uuid) {
    const pendingStocks = await offlineService.getOfflineStockDeclarations();
    const hasPendingDependency = pendingStocks.some(
      (item) => !item.synced && item.cycleId === cycleId
        && item.feedReferenceClientUuid === logData.feed_reference_client_uuid,
    );
    if (hasPendingDependency) {
      await offlineService.saveCycleLogOffline(cycleId, logData);
      return { mode: 'offline' };
    }
  }
  try {
    const createdLog = await aquacultureService.createCycleLog(cycleId, {
      ...logData,
      created_offline: false,
    });
    return { mode: 'online', data: createdLog };
  } catch (error: unknown) {
    if (isNetworkError(error)) {
      await offlineService.saveCycleLogOffline(cycleId, logData);
      return { mode: 'offline' };
    }
    throw error;
  }
};

export const declareManualStockWithOfflineFallback = async (
  cycleId: string,
  stockPayload: CycleStoreManualStockPayload,
  feedReferencePayload?: FarmFeedReferenceCreatePayload,
): Promise<OnlineOrOffline<CycleStore>> => {
  let resolvedStockPayload = { ...stockPayload };
  if (feedReferencePayload) {
    try {
      const reference = await aquacultureService.createFarmFeedReference({
        ...feedReferencePayload,
        created_offline: false,
      });
      resolvedStockPayload = {
        ...resolvedStockPayload,
        feed_reference_id: reference.id,
        feed_reference_client_uuid: feedReferencePayload.client_uuid,
      };
    } catch (error: unknown) {
      if (!isNetworkError(error)) throw error;
      await offlineService.saveFeedReferenceOffline(feedReferencePayload);
      await offlineService.saveStockDeclarationOffline(cycleId, {
        ...resolvedStockPayload,
        feed_reference_client_uuid: feedReferencePayload.client_uuid,
      });
      return { mode: 'offline' };
    }
  }

  try {
    const store = await aquacultureService.declareCycleStoreManualStock(cycleId, {
      ...resolvedStockPayload,
      created_offline: false,
    });
    return { mode: 'online', data: store };
  } catch (error: unknown) {
    if (!isNetworkError(error)) throw error;
    await offlineService.saveStockDeclarationOffline(cycleId, resolvedStockPayload);
    return { mode: 'offline' };
  }
};

/**
 * Cree un log sanitaire en ligne, fallback automatique offline sur erreur reseau.
 */
export const createSanitaryLogWithOfflineFallback = async (
  cycleId: string,
  logData: SanitaryLogForm
): Promise<OnlineOrOffline<SanitaryLog>> => {
  try {
    const createdLog = await aquacultureService.createSanitaryLog(cycleId, logData);
    return { mode: 'online', data: createdLog };
  } catch (error: unknown) {
    if (isNetworkError(error)) {
      await offlineService.saveSanitaryLogOffline(cycleId, logData);
      return { mode: 'offline' };
    }
    throw error;
  }
};
