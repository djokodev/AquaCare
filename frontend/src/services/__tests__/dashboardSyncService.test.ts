import AsyncStorage from '@react-native-async-storage/async-storage';

import { dashboardSyncService } from '../dashboardSyncService';

describe('dashboardSyncService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('persists successful timestamps independently by domain', async () => {
    await dashboardSyncService.markSuccessful('cycle', 'cycle-a', 1000);
    await dashboardSyncService.markSuccessful('orders', undefined, 2000);
    expect(await dashboardSyncService.get('cycle', 'cycle-a')).toBe(1000);
    expect(await dashboardSyncService.get('orders')).toBe(2000);
    expect(await dashboardSyncService.get('store', 'cycle-a')).toBeNull();
  });

  it('reads malformed storage defensively', async () => {
    await AsyncStorage.setItem('aquacare_dashboard_last_successful_sync:cycle:cycle-a', 'invalid');
    expect(await dashboardSyncService.get('cycle', 'cycle-a')).toBeNull();
  });

  it('clears every domain timestamp', async () => {
    await dashboardSyncService.markSuccessful('cycle', 'cycle-a', 1000);
    await dashboardSyncService.markSuccessful('store', 'cycle-a', 2000);
    await dashboardSyncService.clear();
    expect(await dashboardSyncService.get('cycle', 'cycle-a')).toBeNull();
    expect(await dashboardSyncService.get('store', 'cycle-a')).toBeNull();
  });
});
