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

interface OpeningStockFeedReferenceValidationInput {
  stocks: CycleLaunchOpeningStockInput[];
  species: string;
  farmProfileId?: string;
  currentFeedReferences: FarmFeedReference[];
  pendingSnapshots: FarmFeedReference[];
  historicalPendingStockLocalIds?: ReadonlySet<string>;
}

export interface ResolvedOpeningStockFeedReference {
  reference: FarmFeedReference | null;
  identityKind: FeedReferenceIdentity["kind"] | null;
  unavailable: boolean;
}

export type OpeningStockReferenceValidationReason =
  | "reference_not_found"
  | "species_mismatch"
  | "farm_mismatch"
  | "invalid_identity";

export type OpeningStockReferenceValidationResult =
  | { valid: true }
  | {
      valid: false;
      stockLocalId: string;
      reason: OpeningStockReferenceValidationReason;
    };

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

export const validateOpeningStockFeedReferences = ({
  stocks,
  species,
  farmProfileId,
  currentFeedReferences,
  pendingSnapshots,
  historicalPendingStockLocalIds,
}: OpeningStockFeedReferenceValidationInput): OpeningStockReferenceValidationResult => {
  for (const stock of stocks) {
    const identityCount = [
      stock.feed_reference_id,
      stock.feed_reference_client_uuid,
      stock.external_feed,
    ].filter(Boolean).length;
    if (identityCount !== 1) {
      return {
        valid: false,
        stockLocalId: stock.local_id,
        reason: "invalid_identity",
      };
    }
    if (stock.external_feed) {
      if (
        stock.external_feed.species
        && stock.external_feed.species !== species
      ) {
        return {
          valid: false,
          stockLocalId: stock.local_id,
          reason: "species_mismatch",
        };
      }
      continue;
    }

    const identity = getOpeningStockFeedReferenceIdentity(stock);
    if (!identity) {
      return {
        valid: false,
        stockLocalId: stock.local_id,
        reason: "invalid_identity",
      };
    }
    const currentReference = currentFeedReferences.find((reference) =>
      matchesIdentity(reference, identity),
    );
    const pendingSnapshot = pendingSnapshots.find((snapshot) =>
      matchesIdentity(snapshot, identity),
    );
    const canUsePendingSnapshot =
      historicalPendingStockLocalIds?.has(stock.local_id) ?? true;
    const reference =
      currentReference
      ?? (canUsePendingSnapshot ? pendingSnapshot : undefined);
    if (!reference) {
      if (
        pendingSnapshot
        && farmProfileId
        && pendingSnapshot.farm_profile !== farmProfileId
      ) {
        return {
          valid: false,
          stockLocalId: stock.local_id,
          reason: "farm_mismatch",
        };
      }
      if (pendingSnapshot && pendingSnapshot.species !== species) {
        return {
          valid: false,
          stockLocalId: stock.local_id,
          reason: "species_mismatch",
        };
      }
      return {
        valid: false,
        stockLocalId: stock.local_id,
        reason: "reference_not_found",
      };
    }
    if (
      farmProfileId
      && reference.farm_profile !== farmProfileId
    ) {
      return {
        valid: false,
        stockLocalId: stock.local_id,
        reason: "farm_mismatch",
      };
    }
    if (reference.species !== species) {
      return {
        valid: false,
        stockLocalId: stock.local_id,
        reason: "species_mismatch",
      };
    }
  }

  return { valid: true };
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
  const addReferenceById = (reference: FarmFeedReference): void => {
    if (seenIds.has(reference.id)) {
      return;
    }
    feedReferences.push(reference);
    seenIds.add(reference.id);
  };

  const currentFarmReferences = currentFeedReferences.filter((reference) =>
    belongsToFarm(reference, farmProfileId),
  );
  const previousFarmSnapshots = previousFeedReferenceSnapshots.filter(
    (reference) => belongsToFarm(reference, farmProfileId),
  );

  currentFarmReferences.forEach(addReferenceById);

  referencedIds.forEach((referencedId) => {
    if (currentFarmReferences.some((reference) => reference.id === referencedId)) {
      return;
    }
    const snapshot = previousFarmSnapshots.find(
      (reference) => reference.id === referencedId,
    );
    if (snapshot) {
      addReferenceById(snapshot);
    }
  });

  referencedClientUuids.forEach((referencedClientUuid) => {
    if (
      currentFarmReferences.some(
        (reference) => reference.client_uuid === referencedClientUuid,
      )
    ) {
      return;
    }
    const snapshot = previousFarmSnapshots.find(
      (reference) => reference.client_uuid === referencedClientUuid,
    );
    if (snapshot) {
      addReferenceById(snapshot);
    }
  });

  return {
    productionUnits: selectedUnits,
    feedReferences,
  };
};
