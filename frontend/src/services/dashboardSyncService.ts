import AsyncStorage from '@react-native-async-storage/async-storage';

export type DashboardSyncDomain = 'cycle' | 'unit' | 'store' | 'orders';
export type DashboardSyncContext = string | null | undefined;

const STORAGE_KEY_PREFIX = 'aquacare_dashboard_last_successful_sync';
const getStorageKey = (domain: DashboardSyncDomain, context?: DashboardSyncContext) => (
  `${STORAGE_KEY_PREFIX}:${domain}:${context || 'global'}`
);

export const dashboardSyncService = {
  async get(domain: DashboardSyncDomain, context?: DashboardSyncContext): Promise<number | null> {
    try {
      const value = await AsyncStorage.getItem(getStorageKey(domain, context));
      if (!value) {
        return null;
      }
      const timestamp = Number(value);
      return Number.isFinite(timestamp) ? timestamp : null;
    } catch {
      return null;
    }
  },

  async markSuccessful(
    domain: DashboardSyncDomain,
    context?: DashboardSyncContext,
    timestamp = Date.now(),
  ): Promise<void> {
    try {
      await AsyncStorage.setItem(getStorageKey(domain, context), String(timestamp));
    } catch {
      // A storage failure must not turn a successful network response into an error.
    }
  },

  async clear(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const dashboardKeys = keys.filter((key) => key.startsWith(`${STORAGE_KEY_PREFIX}:`));
      if (dashboardKeys.length > 0) {
        await AsyncStorage.multiRemove(dashboardKeys);
      }
    } catch {
      // Logout must continue even if local metadata cleanup fails.
    }
  },
};
