import { buildPendingLaunchLocalContext } from "../cycleLaunchLocalContext";

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
} as const;

const obsoleteReference = {
  ...currentReference,
  id: "feed-old",
  client_uuid: "11111111-1111-4111-8111-111111111111",
  name: "Ancien aliment",
  pellet_size_mm: "2.00",
};

const stock = {
  local_id: "stock-1",
  feed_reference_id: "feed-old",
  quantity_kg: "25.00",
  cost_status: "unknown",
  total_cost_fcfa: null,
  note: "",
} as const;

describe("buildPendingLaunchLocalContext", () => {
  it("preserves one obsolete snapshot while any pending stock references it", () => {
    const context = buildPendingLaunchLocalContext({
      selectedUnits: [],
      currentFeedReferences: [currentReference] as any,
      previousFeedReferenceSnapshots: [
        obsoleteReference,
        obsoleteReference,
      ] as any,
      initialFeedStocks: [stock, { ...stock, local_id: "stock-2" }] as any,
      farmProfileId: "farm-1",
    });

    expect(context.feedReferences).toEqual([
      currentReference,
      obsoleteReference,
    ]);
  });

  it("drops an obsolete snapshot after its last stock line is removed", () => {
    const context = buildPendingLaunchLocalContext({
      selectedUnits: [],
      currentFeedReferences: [currentReference] as any,
      previousFeedReferenceSnapshots: [obsoleteReference] as any,
      initialFeedStocks: [],
      farmProfileId: "farm-1",
    });

    expect(context.feedReferences).toEqual([currentReference]);
  });

  it("ignores a referenced snapshot belonging to another farm", () => {
    const context = buildPendingLaunchLocalContext({
      selectedUnits: [],
      currentFeedReferences: [currentReference] as any,
      previousFeedReferenceSnapshots: [{
        ...obsoleteReference,
        farm_profile: "farm-2",
      }] as any,
      initialFeedStocks: [stock] as any,
      farmProfileId: "farm-1",
    });

    expect(context.feedReferences).toEqual([currentReference]);
  });
});
