import AsyncStorage from '@react-native-async-storage/async-storage';

import { cycleLaunchReferenceCache } from '../cycleLaunchReferenceCache';

describe('cycleLaunchReferenceCache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('persists references by farm and ignores another farm cache', async () => {
    const units = [{ id: 'unit-1', name: 'Bassin A' }] as any;
    const references = [{ id: 'feed-1', name: 'Aliment A' }] as any;
    await cycleLaunchReferenceCache.cacheProductionUnits('farm-1', units);
    await cycleLaunchReferenceCache.cacheFeedReferences('farm-1', references);

    await expect(cycleLaunchReferenceCache.load('farm-1')).resolves.toMatchObject({
      version: 1,
      farmProfileId: 'farm-1',
      productionUnits: units,
      feedReferences: references,
    });
    await expect(cycleLaunchReferenceCache.load('farm-2')).resolves.toBeNull();
  });
});
