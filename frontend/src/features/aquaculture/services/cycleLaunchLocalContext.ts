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

export type FeedReferenceIdentity =
  | { kind: "id"; value: string }
  | { kind: "client_uuid"; value: string };

interface FeedReferenceSelectionInput {
  reference: FarmFeedReference;
  species: string;
  farmProfileId?: string;
}

interface OpeningStockFeedReferenceInput {
  stock: CycleLaunchOpeningStockInput;
  currentFeedReferences: FarmFeedReference[];
  pendingSnapshots: FarmFeedReference[];
}

export interface ResolvedOpeningStockFeedReference {
  reference: FarmFeedReference | null;
  identityKind: FeedReferenceIdentity["kind"] | null;
  unavailable: boolean;
}

const belongsToFarm = (
  reference: FarmFeedReference,
  farmProfileId?: string,
): boolean => !farmProfileId || reference.farm_profile === farmProfileId;

export const isFeedReferenceSelectable = ({
  reference,
  species,
  farmProfileId,
}: FeedReferenceSelectionInput): boolean =>
  reference.species === species && belongsToFarm(reference, farmProfileId);

const getOpeningStockFeedReferenceIdentity = (
  stock: CycleLaunchOpeningStockInput,
): FeedReferenceIdentity | null => {
  if (stock.feed_reference_id) {
    return { kind: "id", value: stock.feed_reference_id };
  }
  if (stock.feed_reference_client_uuid) {
    return {
      kind: "client_uuid",
      value: stock.feed_reference_client_uuid,
    };
  }
  return null;
};

const matchesIdentity = (
  reference: FarmFeedReference,
  identity: FeedReferenceIdentity,
): boolean =>
  identity.kind === "id"
    ? reference.id === identity.value
    : reference.client_uuid === identity.value;

export const resolveOpeningStockFeedReference = ({
  stock,
  currentFeedReferences,
  pendingSnapshots,
}: OpeningStockFeedReferenceInput): ResolvedOpeningStockFeedReference => {
  const identity = getOpeningStockFeedReferenceIdentity(stock);
  if (!identity) {
    return {
      reference: null,
      identityKind: null,
      unavailable: false,
    };
  }
  const currentReference =
    currentFeedReferences.find((reference) =>
      matchesIdentity(reference, identity),
    ) ?? null;
  const reference =
    currentReference
    ?? pendingSnapshots.find((snapshot) =>
      matchesIdentity(snapshot, identity),
    )
    ?? null;

  return {
    reference,
    identityKind: identity.kind,
    unavailable: currentReference === null,
  };
};

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
  const feedReferences: FarmFeedReference[] = [];
  const seenIds = new Set<string>();
  const seenClientUuids = new Set<string>();
  const addReference = (reference: FarmFeedReference): void => {
    if (
      seenIds.has(reference.id)
      || (
        reference.client_uuid !== null
        && seenClientUuids.has(reference.client_uuid)
      )
    ) {
      return;
    }
    feedReferences.push(reference);
    seenIds.add(reference.id);
    if (reference.client_uuid !== null) {
      seenClientUuids.add(reference.client_uuid);
    }
  };

  currentFeedReferences
    .filter((reference) => belongsToFarm(reference, farmProfileId))
    .forEach(addReference);

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
    .forEach(addReference);

  return {
    productionUnits: selectedUnits,
    feedReferences,
  };
};
