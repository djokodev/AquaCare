import type {
  CycleLaunchOpeningStockInput,
  FarmFeedReference,
} from "@/types/aquaculture";
import {
  buildPendingLaunchLocalContext,
  isFeedReferenceSelectable,
  resolveOpeningStockFeedReference,
  validateOpeningStockFeedReferences,
} from "../cycleLaunchLocalContext";

const currentReference = {
  id: "feed-new",
  client_uuid: null,
  farm_profile: "farm-1",
  source: "external",
  catalog_product_id: null,
  name: "Nouvel aliment",
  species: "tilapia",
  pellet_size_mm: "3.00",
  brand: "Marque récente",
  protein_percentage: null,
  lipid_percentage: null,
  package_weight_kg: null,
} satisfies FarmFeedReference;

const obsoleteReference = {
  ...currentReference,
  id: "feed-old",
  client_uuid: "11111111-1111-4111-8111-111111111111",
  name: "Ancien aliment",
  pellet_size_mm: "2.00",
} satisfies FarmFeedReference;

const stock = {
  local_id: "stock-1",
  feed_reference_id: "feed-old",
  quantity_kg: "25.00",
  cost_status: "unknown",
  total_cost_fcfa: null,
  note: "",
} satisfies CycleLaunchOpeningStockInput;

const clientUuidStock = {
  ...stock,
  feed_reference_id: undefined,
  feed_reference_client_uuid: obsoleteReference.client_uuid,
} satisfies CycleLaunchOpeningStockInput;

describe("feed reference selection and resolution", () => {
  it("accepts only a reference for the active species and farm", () => {
    expect(isFeedReferenceSelectable({
      reference: currentReference,
      species: "tilapia",
      farmProfileId: "farm-1",
    })).toBe(true);
    expect(isFeedReferenceSelectable({
      reference: currentReference,
      species: "clarias",
      farmProfileId: "farm-1",
    })).toBe(false);
    expect(isFeedReferenceSelectable({
      reference: currentReference,
      species: "tilapia",
      farmProfileId: "farm-2",
    })).toBe(false);
  });

  it("does not accept a stale id absent from current references", () => {
    expect(
      [currentReference].find(
        (reference) =>
          reference.id === stock.feed_reference_id
          && isFeedReferenceSelectable({
            reference,
            species: "tilapia",
            farmProfileId: "farm-1",
          }),
      ),
    ).toBeUndefined();
  });

  it("resolves a server id from current references before snapshots", () => {
    expect(resolveOpeningStockFeedReference({
      stock: { ...stock, feed_reference_id: currentReference.id },
      currentFeedReferences: [currentReference],
      pendingSnapshots: [{
        ...currentReference,
        name: "Ancien nom",
      }],
    })).toEqual({
      reference: currentReference,
      identityKind: "id",
      unavailable: false,
    });
  });

  it("resolves a client uuid from the server even when its id changed", () => {
    const synchronizedReference = {
      ...obsoleteReference,
      id: "server-new",
      name: "Nom serveur",
    } satisfies FarmFeedReference;

    expect(resolveOpeningStockFeedReference({
      stock: clientUuidStock,
      currentFeedReferences: [synchronizedReference],
      pendingSnapshots: [obsoleteReference],
    })).toEqual({
      reference: synchronizedReference,
      identityKind: "client_uuid",
      unavailable: false,
    });
  });

  it("falls back to a client uuid snapshot and marks it unavailable", () => {
    expect(resolveOpeningStockFeedReference({
      stock: clientUuidStock,
      currentFeedReferences: [currentReference],
      pendingSnapshots: [obsoleteReference],
    })).toEqual({
      reference: obsoleteReference,
      identityKind: "client_uuid",
      unavailable: true,
    });
  });

  it("never matches a server id against a client uuid", () => {
    const collidingReference = {
      ...currentReference,
      id: obsoleteReference.client_uuid,
      client_uuid: null,
    } satisfies FarmFeedReference;

    expect(resolveOpeningStockFeedReference({
      stock: clientUuidStock,
      currentFeedReferences: [collidingReference],
      pendingSnapshots: [],
    })).toEqual({
      reference: null,
      identityKind: "client_uuid",
      unavailable: true,
    });
  });
});

describe("validateOpeningStockFeedReferences", () => {
  it("accepts a compatible historical snapshot but not a new stale line", () => {
    expect(validateOpeningStockFeedReferences({
      stocks: [stock],
      species: "tilapia",
      farmProfileId: "farm-1",
      currentFeedReferences: [currentReference],
      pendingSnapshots: [obsoleteReference],
      historicalPendingStockLocalIds: new Set([stock.local_id]),
    })).toEqual({ valid: true });

    expect(validateOpeningStockFeedReferences({
      stocks: [stock],
      species: "tilapia",
      farmProfileId: "farm-1",
      currentFeedReferences: [currentReference],
      pendingSnapshots: [obsoleteReference],
      historicalPendingStockLocalIds: new Set(),
    })).toEqual({
      valid: false,
      stockLocalId: stock.local_id,
      reason: "reference_not_found",
    });
  });

  it("rejects an id reference for another species", () => {
    expect(validateOpeningStockFeedReferences({
      stocks: [{ ...stock, feed_reference_id: currentReference.id }],
      species: "clarias",
      farmProfileId: "farm-1",
      currentFeedReferences: [currentReference],
      pendingSnapshots: [],
    })).toEqual({
      valid: false,
      stockLocalId: stock.local_id,
      reason: "species_mismatch",
    });
  });

  it("rejects a client uuid reference for another species", () => {
    expect(validateOpeningStockFeedReferences({
      stocks: [clientUuidStock],
      species: "clarias",
      farmProfileId: "farm-1",
      currentFeedReferences: [obsoleteReference],
      pendingSnapshots: [],
    })).toEqual({
      valid: false,
      stockLocalId: clientUuidStock.local_id,
      reason: "species_mismatch",
    });
  });

  it("rejects a client uuid snapshot belonging to another farm", () => {
    expect(validateOpeningStockFeedReferences({
      stocks: [clientUuidStock],
      species: "tilapia",
      farmProfileId: "farm-1",
      currentFeedReferences: [],
      pendingSnapshots: [{
        ...obsoleteReference,
        farm_profile: "farm-2",
      }],
      historicalPendingStockLocalIds: new Set([clientUuidStock.local_id]),
    })).toEqual({
      valid: false,
      stockLocalId: clientUuidStock.local_id,
      reason: "farm_mismatch",
    });
  });

  it("rejects an external feed for another species", () => {
    const externalStock = {
      ...stock,
      feed_reference_id: undefined,
      external_feed: {
        client_uuid: "external-1",
        name: "Aliment externe",
        pellet_size_mm: "2.00",
        species: "tilapia" as const,
      },
    } satisfies CycleLaunchOpeningStockInput;

    expect(validateOpeningStockFeedReferences({
      stocks: [externalStock],
      species: "clarias",
      farmProfileId: "farm-1",
      currentFeedReferences: [],
      pendingSnapshots: [],
    })).toEqual({
      valid: false,
      stockLocalId: stock.local_id,
      reason: "species_mismatch",
    });
  });

  it("rejects mixed identities without matching id to client uuid", () => {
    expect(validateOpeningStockFeedReferences({
      stocks: [{
        ...stock,
        feed_reference_client_uuid: obsoleteReference.client_uuid ?? undefined,
      }],
      species: "tilapia",
      farmProfileId: "farm-1",
      currentFeedReferences: [obsoleteReference],
      pendingSnapshots: [],
    })).toEqual({
      valid: false,
      stockLocalId: stock.local_id,
      reason: "invalid_identity",
    });
  });
});

describe("buildPendingLaunchLocalContext", () => {
  it("preserves one obsolete snapshot while any id stock references it", () => {
    const context = buildPendingLaunchLocalContext({
      selectedUnits: [],
      currentFeedReferences: [currentReference],
      previousFeedReferenceSnapshots: [
        obsoleteReference,
        obsoleteReference,
      ],
      initialFeedStocks: [stock, { ...stock, local_id: "stock-2" }],
      farmProfileId: "farm-1",
    });

    expect(context.feedReferences).toEqual([
      currentReference,
      obsoleteReference,
    ]);
  });

  it("preserves one client uuid snapshot until its last stock is removed", () => {
    const twoStocks = [
      clientUuidStock,
      { ...clientUuidStock, local_id: "stock-2" },
    ];
    const withTwoStocks = buildPendingLaunchLocalContext({
      selectedUnits: [],
      currentFeedReferences: [currentReference],
      previousFeedReferenceSnapshots: [
        obsoleteReference,
        obsoleteReference,
      ],
      initialFeedStocks: twoStocks,
      farmProfileId: "farm-1",
    });
    const withOneStock = buildPendingLaunchLocalContext({
      selectedUnits: [],
      currentFeedReferences: [currentReference],
      previousFeedReferenceSnapshots: withTwoStocks.feedReferences,
      initialFeedStocks: [twoStocks[0]],
      farmProfileId: "farm-1",
    });
    const withoutStock = buildPendingLaunchLocalContext({
      selectedUnits: [],
      currentFeedReferences: [currentReference],
      previousFeedReferenceSnapshots: withOneStock.feedReferences,
      initialFeedStocks: [],
      farmProfileId: "farm-1",
    });

    expect(withTwoStocks.feedReferences).toEqual([
      currentReference,
      obsoleteReference,
    ]);
    expect(withOneStock.feedReferences).toEqual([
      currentReference,
      obsoleteReference,
    ]);
    expect(withoutStock.feedReferences).toEqual([currentReference]);
  });

  it("deduplicates a synchronized reference by client uuid and keeps server data", () => {
    const synchronizedReference = {
      ...obsoleteReference,
      id: "server-new",
      name: "Nom serveur",
    } satisfies FarmFeedReference;
    const context = buildPendingLaunchLocalContext({
      selectedUnits: [],
      currentFeedReferences: [synchronizedReference],
      previousFeedReferenceSnapshots: [obsoleteReference],
      initialFeedStocks: [clientUuidStock],
      farmProfileId: "farm-1",
    });

    expect(context.feedReferences).toEqual([synchronizedReference]);
  });

  it("keeps an exact id snapshot beside a server reference with the same client uuid", () => {
    const synchronizedReference = {
      ...obsoleteReference,
      id: "server-new",
      name: "Nom serveur",
    } satisfies FarmFeedReference;
    const context = buildPendingLaunchLocalContext({
      selectedUnits: [],
      currentFeedReferences: [synchronizedReference],
      previousFeedReferenceSnapshots: [obsoleteReference],
      initialFeedStocks: [stock],
      farmProfileId: "farm-1",
    });

    expect(context.feedReferences).toEqual([
      synchronizedReference,
      obsoleteReference,
    ]);
    expect(resolveOpeningStockFeedReference({
      stock,
      currentFeedReferences: [synchronizedReference],
      pendingSnapshots: context.feedReferences,
    })).toEqual({
      reference: obsoleteReference,
      identityKind: "id",
      unavailable: true,
    });
  });

  it("preserves both identities for mixed id and client uuid stocks", () => {
    const synchronizedReference = {
      ...obsoleteReference,
      id: "server-new",
      name: "Nom serveur",
    } satisfies FarmFeedReference;
    const context = buildPendingLaunchLocalContext({
      selectedUnits: [],
      currentFeedReferences: [synchronizedReference],
      previousFeedReferenceSnapshots: [obsoleteReference],
      initialFeedStocks: [stock, clientUuidStock],
      farmProfileId: "farm-1",
    });

    expect(context.feedReferences).toEqual([
      synchronizedReference,
      obsoleteReference,
    ]);
    expect(resolveOpeningStockFeedReference({
      stock: clientUuidStock,
      currentFeedReferences: [synchronizedReference],
      pendingSnapshots: context.feedReferences,
    })).toMatchObject({
      reference: synchronizedReference,
      identityKind: "client_uuid",
      unavailable: false,
    });
  });

  it("removes the old id snapshot when only the client uuid stock remains", () => {
    const synchronizedReference = {
      ...obsoleteReference,
      id: "server-new",
      name: "Nom serveur",
    } satisfies FarmFeedReference;
    const withMixedStocks = buildPendingLaunchLocalContext({
      selectedUnits: [],
      currentFeedReferences: [synchronizedReference],
      previousFeedReferenceSnapshots: [obsoleteReference],
      initialFeedStocks: [stock, clientUuidStock],
      farmProfileId: "farm-1",
    });
    const withClientUuidOnly = buildPendingLaunchLocalContext({
      selectedUnits: [],
      currentFeedReferences: [synchronizedReference],
      previousFeedReferenceSnapshots: withMixedStocks.feedReferences,
      initialFeedStocks: [clientUuidStock],
      farmProfileId: "farm-1",
    });

    expect(withClientUuidOnly.feedReferences).toEqual([synchronizedReference]);
  });

  it("ignores a referenced snapshot belonging to another farm", () => {
    const context = buildPendingLaunchLocalContext({
      selectedUnits: [],
      currentFeedReferences: [currentReference],
      previousFeedReferenceSnapshots: [{
        ...obsoleteReference,
        farm_profile: "farm-2",
      }],
      initialFeedStocks: [clientUuidStock],
      farmProfileId: "farm-1",
    });

    expect(context.feedReferences).toEqual([currentReference]);
  });
});
