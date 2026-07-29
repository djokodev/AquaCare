import type {
  CycleLaunchOpeningStockInput,
  FarmFeedReference,
  ProductionUnit,
} from "@/types/aquaculture";

interface PendingLaunchLocalContextInput {
  selectedUnits: ProductionUnit[];
  currentFeedReferences: FarmFeedReference[];
  previousFeedReferenceSnapshots: FarmFeedReference[];
  initialFeedStocks: CycleLaunchOpeningStockInput[];
  farmProfileId?: string;
}

export interface PendingLaunchLocalContext {
  productionUnits: ProductionUnit[];
  feedReferences: FarmFeedReference[];
}

const belongsToFarm = (
  reference: FarmFeedReference,
  farmProfileId?: string,
): boolean => !farmProfileId || reference.farm_profile === farmProfileId;

export const buildPendingLaunchLocalContext = ({
  selectedUnits,
  currentFeedReferences,
  previousFeedReferenceSnapshots,
  initialFeedStocks,
  farmProfileId,
}: PendingLaunchLocalContextInput): PendingLaunchLocalContext => {
  const referencedIds = new Set(
    initialFeedStocks
      .map((stock) => stock.feed_reference_id)
      .filter((id): id is string => Boolean(id)),
  );
  const referencedClientUuids = new Set(
    initialFeedStocks
      .map((stock) => stock.feed_reference_client_uuid)
      .filter((id): id is string => Boolean(id)),
  );
  const feedReferencesById = new Map<string, FarmFeedReference>();

  currentFeedReferences
    .filter((reference) => belongsToFarm(reference, farmProfileId))
    .forEach((reference) => feedReferencesById.set(reference.id, reference));

  previousFeedReferenceSnapshots
    .filter((reference) => belongsToFarm(reference, farmProfileId))
    .filter(
      (reference) =>
        referencedIds.has(reference.id)
        || (
          reference.client_uuid !== null
          && referencedClientUuids.has(reference.client_uuid)
        ),
    )
    .forEach((reference) => {
      if (!feedReferencesById.has(reference.id)) {
        feedReferencesById.set(reference.id, reference);
      }
    });

  return {
    productionUnits: selectedUnits,
    feedReferences: Array.from(feedReferencesById.values()),
  };
};
