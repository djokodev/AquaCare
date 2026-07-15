import AsyncStorage from '@react-native-async-storage/async-storage';

export type DashboardSyncDomain = 'cycle' | 'unit' | 'store' | 'orders';

const STORAGE_KEY_PREFIX = 'aquacare_dashboard_last_successful_sync';
const getStorageKey = (domain: DashboardSyncDomain) => `${STORAGE_KEY_PREFIX}:${domain}`;

export const dashboardSyncService = {
  async get(domain: DashboardSyncDomain): Promise<number | null> {
    try {
      const value = await AsyncStorage.getItem(getStorageKey(domain));
      if (!value) {
        return null;
      }
      const timestamp = Number(value);
      return Number.isFinite(timestamp) ? timestamp : null;
    } catch {
      return null;
    }
  },

  async markSuccessful(domain: DashboardSyncDomain, timestamp = Date.now()): Promise<void> {
    try {
      await AsyncStorage.setItem(getStorageKey(domain), String(timestamp));
    } catch {
      // A storage failure must not turn a successful network response into an error.
    }
  },

  async clear(): Promise<void> {
    try {
      await AsyncStorage.multiRemove(
        (['cycle', 'unit', 'store', 'orders'] as DashboardSyncDomain[]).map(getStorageKey),
      );
    } catch {
      // Logout must continue even if local metadata cleanup fails.
    }
  },
};
