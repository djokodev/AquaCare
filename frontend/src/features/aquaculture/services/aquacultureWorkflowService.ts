import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { offlineService } from '@/services/offlineService';
import { CycleLog, CreateCycleForm, DailyLogForm, ProductionCycle, SanitaryLog, SanitaryLogForm } from '@/types/aquaculture';
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
 * Cree un cycle en ligne, fallback automatique offline sur erreur reseau.
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
  try {
    const createdLog = await aquacultureService.createCycleLog(cycleId, logData);
    return { mode: 'online', data: createdLog };
  } catch (error: unknown) {
    if (isNetworkError(error)) {
      await offlineService.saveCycleLogOffline(cycleId, logData);
      return { mode: 'offline' };
    }
    throw error;
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
