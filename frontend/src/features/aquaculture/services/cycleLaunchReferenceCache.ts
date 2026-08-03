import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  FarmFeedReference,
  ProductionUnit,
} from '@/types/aquaculture';

const CACHE_VERSION = 1;
const CACHE_PREFIX = 'aquacare_cycle_launch_references_v1';
const updateQueues = new Map<string, Promise<void>>();

export interface CycleLaunchReferenceCache {
  version: typeof CACHE_VERSION;
  farmProfileId: string;
  productionUnits: ProductionUnit[];
  feedReferences: FarmFeedReference[];
  updatedAt: number;
}

const storageKey = (farmProfileId: string) =>
  `${CACHE_PREFIX}:${farmProfileId}`;

const emptyCache = (farmProfileId: string): CycleLaunchReferenceCache => ({
  version: CACHE_VERSION,
  farmProfileId,
  productionUnits: [],
  feedReferences: [],
  updatedAt: Date.now(),
});

const load = async (
  farmProfileId: string,
): Promise<CycleLaunchReferenceCache | null> => {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(storageKey(farmProfileId));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CycleLaunchReferenceCache>;
    if (
      parsed.version !== CACHE_VERSION
      || parsed.farmProfileId !== farmProfileId
      || !Array.isArray(parsed.productionUnits)
      || !Array.isArray(parsed.feedReferences)
    ) {
      return null;
    }
    return parsed as CycleLaunchReferenceCache;
  } catch {
    return null;
  }
};

const update = async (
  farmProfileId: string,
  values: Partial<
    Pick<CycleLaunchReferenceCache, 'productionUnits' | 'feedReferences'>
  >,
): Promise<void> => {
  const previousUpdate =
    updateQueues.get(farmProfileId) ?? Promise.resolve();
  const currentUpdate = previousUpdate
    .catch(() => undefined)
    .then(async () => {
      const current =
        (await load(farmProfileId)) ?? emptyCache(farmProfileId);
      await AsyncStorage.setItem(
        storageKey(farmProfileId),
        JSON.stringify({ ...current, ...values, updatedAt: Date.now() }),
      );
    });
  updateQueues.set(farmProfileId, currentUpdate);
  try {
    await currentUpdate;
  } finally {
    if (updateQueues.get(farmProfileId) === currentUpdate) {
      updateQueues.delete(farmProfileId);
    }
  }
};

export const cycleLaunchReferenceCache = {
  load,
  cacheProductionUnits: (
    farmProfileId: string,
    productionUnits: ProductionUnit[],
  ) => update(farmProfileId, { productionUnits }),
  cacheFeedReferences: (
    farmProfileId: string,
    feedReferences: FarmFeedReference[],
  ) => update(farmProfileId, { feedReferences }),
};
