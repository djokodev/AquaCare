import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FeedingPlan } from '@/types/aquaculture';
import {
  scheduleFeedingAlarms,
  cancelFeedingAlarms,
  getMealTimes,
  formatMealTime,
  FeedingAlarmMessages,
} from '../utils/alarmScheduler';
import logger from '@/utils/logger';

const ALARM_REGISTRY_KEY = 'feeding_alarm_registry_v1';
const FEEDING_ALARMS_ENABLED_KEY = 'feeding_alarms_enabled_v1';

type AlarmRegistry = Record<string, { ids: string[]; cycleId: string; updatedAt: string }>;

export type AlarmSyncStatus = 'scheduled' | 'disabled' | 'permission_denied' | 'error';

export interface AlarmSyncResult {
  status: AlarmSyncStatus;
  scheduledCount: number;
}

/**
 * Hook pour gérer le cycle de vie des alarmes locales de nourrissage.
 * Les IDs des notifications sont persistés dans AsyncStorage pour
 * survivre aux redémarrages de l'app.
 */
export const useLocalFeedingAlarms = () => {
  const loadRegistry = useCallback(async (): Promise<AlarmRegistry> => {
    try {
      const raw = await AsyncStorage.getItem(ALARM_REGISTRY_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as AlarmRegistry;
      return parsed || {};
    } catch (error) {
      logger.warn('Registry alarmes invalide, reset automatique', error);
      return {};
    }
  }, []);

  const saveRegistry = useCallback(async (registry: AlarmRegistry): Promise<void> => {
    await AsyncStorage.setItem(ALARM_REGISTRY_KEY, JSON.stringify(registry));
  }, []);

  const cancelPlanEntry = useCallback(
    async (planId: string, registry: AlarmRegistry): Promise<boolean> => {
      const entry = registry[planId];
      if (!entry || entry.ids.length === 0) {
        delete registry[planId];
        return false;
      }

      await cancelFeedingAlarms(entry.ids);
      delete registry[planId];
      return true;
    },
    []
  );

  /**
   * Planifie des alarmes pour un plan et sauvegarde les IDs
   */
  const scheduleAlarms = useCallback(
    async (
      plan: FeedingPlan,
      cycleName: string,
      messages: FeedingAlarmMessages
    ): Promise<AlarmSyncResult> => {
      try {
        const registry = await loadRegistry();
        await cancelPlanEntry(plan.id, registry);

        const result = await scheduleFeedingAlarms(plan, cycleName, messages);
        if (!result.permissionGranted) {
          await saveRegistry(registry);
          return { status: 'permission_denied', scheduledCount: 0 };
        }

        registry[plan.id] = {
          ids: result.ids,
          cycleId: plan.cycle,
          updatedAt: new Date().toISOString(),
        };
        await saveRegistry(registry);

        return { status: 'scheduled', scheduledCount: result.ids.length };
      } catch (error) {
        logger.error('Erreur planification alarmes nourrissage:', error);
        return { status: 'error', scheduledCount: 0 };
      }
    },
    [cancelPlanEntry, loadRegistry, saveRegistry]
  );

  /**
   * Annule et supprime les alarmes pour un plan donné
   */
  const cancelAlarms = useCallback(async (planId: string): Promise<void> => {
    try {
      const registry = await loadRegistry();
      await cancelPlanEntry(planId, registry);
      await saveRegistry(registry);
    } catch (error) {
      logger.error('Erreur annulation alarmes nourrissage:', error);
    }
  }, [cancelPlanEntry, loadRegistry, saveRegistry]);

  /**
   * Retourne true si des alarmes actives existent pour ce plan
   */
  const hasActiveAlarms = useCallback(async (planId: string): Promise<boolean> => {
    try {
      const registry = await loadRegistry();
      return Boolean(registry[planId]?.ids?.length);
    } catch {
      return false;
    }
  }, [loadRegistry]);

  const getAlarmsEnabled = useCallback(async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(FEEDING_ALARMS_ENABLED_KEY);
      if (value === null) {
        return true;
      }
      return value === 'true';
    } catch {
      return true;
    }
  }, []);

  const setAlarmsEnabled = useCallback(async (enabled: boolean): Promise<void> => {
    await AsyncStorage.setItem(FEEDING_ALARMS_ENABLED_KEY, enabled ? 'true' : 'false');
  }, []);

  const reconcileCycleAlarms = useCallback(
    async ({
      cycleId,
      cycleName,
      activePlans,
      enabled,
      messages,
    }: {
      cycleId: string;
      cycleName: string;
      activePlans: FeedingPlan[];
      enabled: boolean;
      messages: FeedingAlarmMessages;
    }): Promise<AlarmSyncResult> => {
      try {
        const registry = await loadRegistry();
        const activePlanIds = new Set(activePlans.map((plan) => plan.id));

        let scheduledCount = 0;
        let permissionDenied = false;

        for (const [planId, entry] of Object.entries(registry)) {
          if (entry.cycleId !== cycleId) {
            continue;
          }
          if (!enabled || !activePlanIds.has(planId)) {
            await cancelPlanEntry(planId, registry);
          }
        }

        if (enabled) {
          for (const plan of activePlans) {
            await cancelPlanEntry(plan.id, registry);
            const result = await scheduleFeedingAlarms(plan, cycleName, messages);
            if (!result.permissionGranted) {
              permissionDenied = true;
              continue;
            }
            registry[plan.id] = {
              ids: result.ids,
              cycleId,
              updatedAt: new Date().toISOString(),
            };
            scheduledCount += result.ids.length;
          }
        }

        await saveRegistry(registry);

        if (!enabled) {
          return { status: 'disabled', scheduledCount: 0 };
        }
        if (permissionDenied) {
          return { status: 'permission_denied', scheduledCount: 0 };
        }
        return { status: 'scheduled', scheduledCount };
      } catch (error) {
        logger.error('Erreur reconciliation alarmes nourrissage:', error);
        return { status: 'error', scheduledCount: 0 };
      }
    },
    [cancelPlanEntry, loadRegistry, saveRegistry]
  );

  /**
   * Retourne les horaires formatés pour un nombre de repas donné
   * Ex: ["08h00", "17h00"]
   */
  const getFormattedMealTimes = useCallback((mealsPerDay: number): string[] => {
    return getMealTimes(mealsPerDay).map(formatMealTime);
  }, []);

  return {
    scheduleAlarms,
    cancelAlarms,
    hasActiveAlarms,
    reconcileCycleAlarms,
    getAlarmsEnabled,
    setAlarmsEnabled,
    getFormattedMealTimes,
  };
};
