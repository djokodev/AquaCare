import AsyncStorage from '@react-native-async-storage/async-storage';

import { dashboardSyncService } from '../dashboardSyncService';

describe('dashboardSyncService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('persists successful timestamps independently by domain', async () => {
    await dashboardSyncService.markSuccessful('cycle', 1000);
    await dashboardSyncService.markSuccessful('orders', 2000);
    expect(await dashboardSyncService.get('cycle')).toBe(1000);
    expect(await dashboardSyncService.get('orders')).toBe(2000);
    expect(await dashboardSyncService.get('store')).toBeNull();
  });

  it('reads malformed storage defensively', async () => {
    await AsyncStorage.setItem('aquacare_dashboard_last_successful_sync:cycle', 'invalid');
    expect(await dashboardSyncService.get('cycle')).toBeNull();
  });

  it('clears every domain timestamp', async () => {
    await dashboardSyncService.markSuccessful('cycle', 1000);
    await dashboardSyncService.markSuccessful('store', 2000);
    await dashboardSyncService.clear();
    expect(await dashboardSyncService.get('cycle')).toBeNull();
    expect(await dashboardSyncService.get('store')).toBeNull();
  });
});
