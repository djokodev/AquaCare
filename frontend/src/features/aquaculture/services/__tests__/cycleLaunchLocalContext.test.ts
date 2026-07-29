import type {
  CycleLaunchOpeningStockInput,
  FarmFeedReference,
} from "@/types/aquaculture";
import {
  buildPendingLaunchLocalContext,
  isFeedReferenceSelectable,
  resolveOpeningStockFeedReference,
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
