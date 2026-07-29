import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import NewCycleScreen from "../NewCycleScreen";
import { aquacultureService } from "@/features/aquaculture/services/aquacultureService";
import { offlineService } from "@/services/offlineService";
import { useDispatch } from "react-redux";
import { useAuth } from "@/hooks/useAuth";
import { isNetworkError, parseApiError } from "@/utils/errorParser";
import { getBusinessIsoDate } from "@/utils/businessDate";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cycleLaunchReferenceCache } from "@/features/aquaculture/services/cycleLaunchReferenceCache";
import type {
  CycleLaunchOpeningStockInput,
  CycleLaunchRequest,
  FarmFeedReference,
} from "@/types/aquaculture";

jest.mock("react-redux", () => ({
  useDispatch: jest.fn(),
}));

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    SafeAreaView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock("@/hooks/useAuth", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@/features/aquaculture/services/aquacultureService", () => ({
  aquacultureService: {
    getProductionUnits: jest.fn(),
    getFarmFeedReferences: jest.fn(),
    launchProductionCycle: jest.fn(),
  },
}));

jest.mock("@/services/offlineService", () => ({
  offlineService: {
    hasAnyPendingSync: jest.fn(),
    syncAllOfflineData: jest.fn(),
    isOnline: jest.fn(),
    saveCycleLaunchOffline: jest.fn(),
    updatePendingCycleLaunch: jest.fn(),
    saveNewCycleOffline: jest.fn(),
  },
}));

jest.mock("@/utils/errorParser", () => ({
  parseApiError: jest.fn(),
  logApiError: jest.fn(),
  isNetworkError: jest.fn().mockReturnValue(false),
}));

jest.mock("@/utils/logger", () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
}));

describe("features/aquaculture/screens/NewCycleScreen", () => {
  const mockDispatch = jest.fn();
  const mockService = aquacultureService as jest.Mocked<
    typeof aquacultureService
  >;
  const mockOffline = offlineService as jest.Mocked<typeof offlineService>;
  const mockUseAuth = useAuth as jest.Mock;
  const mockIsNetworkError = isNetworkError as jest.Mock;
  const mockParseApiError = parseApiError as jest.Mock;
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    reset: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
  } as any;
  const units = [
    {
      id: "unit-1",
      farm_profile: "farm-1",
      name: "Bassin A",
      unit_type: "tank",
      volume_m3: 10,
      surface_m2: null,
      recommended_capacity: 3000,
      status: "active",
      created_at: "",
      updated_at: "",
    },
    {
      id: "unit-2",
      farm_profile: "farm-1",
      name: "Bassin B",
      unit_type: "tank",
      volume_m3: 8,
      surface_m2: null,
      recommended_capacity: 2400,
      status: "active",
      created_at: "",
      updated_at: "",
    },
  ] as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme Test" },
    });
    mockOffline.hasAnyPendingSync.mockResolvedValue(false);
    mockOffline.syncAllOfflineData.mockResolvedValue({
      success: 0,
      failed: 0,
    } as any);
    mockOffline.isOnline.mockResolvedValue(true);
    mockOffline.saveCycleLaunchOffline.mockResolvedValue(undefined as any);
    mockOffline.updatePendingCycleLaunch.mockResolvedValue(undefined as any);
    mockService.getProductionUnits.mockResolvedValue(units);
    mockService.getFarmFeedReferences.mockResolvedValue([]);
    mockIsNetworkError.mockReturnValue(false);
    mockService.launchProductionCycle.mockResolvedValue({
      productionCycle: { id: "cycle-2" },
    } as any);
    mockParseApiError.mockReturnValue({ message: "Erreur de validation" });
  });

  const fillValidForm = (getByTestId: any, getByText: any) => {
    fireEvent.press(getByText("tilapia"));
    fireEvent.press(getByTestId("newCycleUnit-unit-1"));
    fireEvent.changeText(getByTestId("newCycleInitialCount"), "1500");
    fireEvent.changeText(getByTestId("newCycleInitialWeight"), "12");
    fireEvent.changeText(getByTestId("newCycleTargetWeight"), "350");
    fireEvent.changeText(getByTestId("newCycleDuration"), "150");
    fireEvent.changeText(getByTestId("newCycleSurvival"), "95");
    fireEvent.changeText(getByTestId("newCycleSellingPrice"), "2800");
    fireEvent.changeText(getByTestId("newCycleAllocation-unit-1"), "1500");
  };

  const buildPendingLaunchWithStocks = (
    initialFeedStocks: CycleLaunchOpeningStockInput[],
  ): CycleLaunchRequest => ({
    launch_uuid: "55555555-5555-4555-8555-555555555555",
    launch_kind: "additional_cycle",
    cycle: {
      onboarding_mode: "ongoing",
      species: "tilapia",
      start_date: "2026-06-01",
      initial_count: 2000,
      initial_average_weight: null,
      target_harvest_weight_g: 350,
      planned_cycle_duration_days: 150,
      expected_survival_rate_pct: 95,
      planned_selling_price_per_kg_fcfa: 2800,
      fingerlings_cost_fcfa: 0,
      other_operational_costs_fcfa: 0,
      created_offline: true,
    },
    tracking_baseline: {
      tracking_start_date: "2026-07-20",
      fish_count: 1850,
      average_weight_g: "75",
      biomass_kg: null,
    },
    production_units: [{
      local_id: "existing-unit-1",
      source: "existing",
      production_unit_id: "unit-1",
    }],
    allocations: [{
      production_unit_local_id: "existing-unit-1",
      fish_count: 1850,
    }],
    initial_feed_stocks: initialFeedStocks,
  });

  const buildFeedReference = (
    overrides: Partial<FarmFeedReference> = {},
  ): FarmFeedReference => ({
    id: "feed-current",
    client_uuid: null,
    farm_profile: "farm-1",
    source: "external",
    catalog_product_id: null,
    name: "Aliment courant",
    species: "tilapia",
    pellet_size_mm: "2.00",
    brand: "",
    protein_percentage: null,
    lipid_percentage: null,
    package_weight_kg: null,
    ...overrides,
  });

  const fillValidOngoingForm = (
    screen: ReturnType<typeof render>,
  ): void => {
    const trackingDate = getBusinessIsoDate();
    const startDate = new Date(`${trackingDate}T12:00:00Z`);
    startDate.setUTCDate(startDate.getUTCDate() - 30);

    fireEvent.press(screen.getByText("ongoingCycleMode"));
    fireEvent.press(screen.getByText("tilapia"));
    fireEvent.press(screen.getByTestId("newCycleUnit-unit-1"));
    fireEvent.changeText(screen.getByTestId("newCycleInitialCount"), "2000");
    fireEvent.changeText(
      screen.getByTestId("newCycleStartDate"),
      startDate.toISOString().slice(0, 10),
    );
    fireEvent.changeText(
      screen.getByTestId("newCycleTrackingDate"),
      trackingDate,
    );
    fireEvent.changeText(screen.getByTestId("newCycleTrackingCount"), "1850");
    fireEvent.changeText(screen.getByTestId("newCycleTrackingWeight"), "75");
    fireEvent.changeText(screen.getByTestId("newCycleTargetWeight"), "350");
    fireEvent.changeText(screen.getByTestId("newCycleDuration"), "150");
    fireEvent.changeText(screen.getByTestId("newCycleSurvival"), "95");
    fireEvent.changeText(screen.getByTestId("newCycleSellingPrice"), "2800");
    fireEvent.changeText(
      screen.getByTestId("newCycleAllocation-unit-1"),
      "1850",
    );
  };

  it("lance un cycle supplémentaire avec une unité existante en un seul appel", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    const { getByTestId, getByText } = render(
      <NewCycleScreen navigation={navigation} />,
    );

    await waitFor(() =>
      expect(mockService.getProductionUnits).toHaveBeenCalledWith({
        status: "active",
        purpose: "production",
      }),
    );
    fillValidForm(getByTestId, getByText);
    fireEvent.press(getByText("createCycle"));

    await waitFor(() =>
      expect(mockService.launchProductionCycle).toHaveBeenCalledTimes(1),
    );
    const payload = mockService.launchProductionCycle.mock.calls[0][0];
    expect(payload.launch_kind).toBe("additional_cycle");
    expect(payload.production_units).toEqual([
      {
        local_id: "existing-unit-1",
        source: "existing",
        production_unit_id: "unit-1",
      },
    ]);
    expect(payload.allocations).toEqual([
      { production_unit_local_id: "existing-unit-1", fish_count: 1500 },
    ]);
    expect(payload.cycle.cycle_name).toBeUndefined();
    expect(alertSpy).toHaveBeenCalledWith(
      "success",
      "cycleCreatedSuccess",
      expect.any(Array),
    );
    expect(mockOffline.saveNewCycleOffline).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("transmet le nom de cycle personnalisé après trim", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    const { getByTestId, getByText } = render(
      <NewCycleScreen navigation={navigation} />,
    );

    await waitFor(() =>
      expect(mockService.getProductionUnits).toHaveBeenCalled(),
    );
    fillValidForm(getByTestId, getByText);
    fireEvent.changeText(getByTestId("newCycleName"), "  Cycle Test  ");
    fireEvent.press(getByText("createCycle"));

    await waitFor(() =>
      expect(mockService.launchProductionCycle).toHaveBeenCalledTimes(1),
    );
    expect(
      mockService.launchProductionCycle.mock.calls[0][0].cycle.cycle_name,
    ).toBe("Cycle Test");
    alertSpy.mockRestore();
  });

  it("bloque la soumission sans unité sélectionnée", async () => {
    const { getByText } = render(<NewCycleScreen navigation={navigation} />);

    await waitFor(() =>
      expect(mockService.getProductionUnits).toHaveBeenCalled(),
    );
    fireEvent.press(getByText("createCycle"));

    expect(mockService.launchProductionCycle).not.toHaveBeenCalled();
  });

  it("affiche les champs ongoing et accepte un poids historique absent", async () => {
    const trackingDate = getBusinessIsoDate();
    const startDate = new Date(`${trackingDate}T12:00:00Z`);
    startDate.setUTCDate(startDate.getUTCDate() - 30);
    const historicalStartDate = startDate.toISOString().slice(0, 10);
    const { getByTestId, getByText } = render(
      <NewCycleScreen navigation={navigation} />,
    );

    await waitFor(() =>
      expect(mockService.getProductionUnits).toHaveBeenCalled(),
    );
    expect(() => getByTestId("newCycleTrackingDate")).toThrow();

    fireEvent.press(getByText("ongoingCycleMode"));
    fireEvent.press(getByText("tilapia"));
    fireEvent.press(getByTestId("newCycleUnit-unit-1"));
    fireEvent.changeText(getByTestId("newCycleInitialCount"), "2000");
    fireEvent.changeText(getByTestId("newCycleStartDate"), historicalStartDate);
    fireEvent.changeText(getByTestId("newCycleTrackingDate"), trackingDate);
    fireEvent.changeText(getByTestId("newCycleTrackingCount"), "1850");
    fireEvent.changeText(getByTestId("newCycleTrackingWeight"), "75");
    fireEvent.changeText(getByTestId("newCycleTargetWeight"), "350");
    fireEvent.changeText(getByTestId("newCycleDuration"), "150");
    fireEvent.changeText(getByTestId("newCycleSurvival"), "95");
    fireEvent.changeText(getByTestId("newCycleSellingPrice"), "2800");
    fireEvent.changeText(getByTestId("newCycleAllocation-unit-1"), "1850");
    fireEvent.press(getByText("startTracking"));

    await waitFor(() =>
      expect(mockService.launchProductionCycle).toHaveBeenCalledTimes(1),
    );
    const payload = mockService.launchProductionCycle.mock.calls[0][0];
    expect(payload.cycle).toMatchObject({
      onboarding_mode: "ongoing",
      initial_count: 2000,
      initial_average_weight: null,
    });
    expect(payload.tracking_baseline).toEqual({
      tracking_start_date: trackingDate,
      fish_count: 1850,
      average_weight_g: "75",
      biomass_kg: null,
    });
    expect(payload.allocations[0].fish_count).toBe(1850);
  });

  it("conserve exactement le lancement agrégé après une réponse réseau incertaine", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    mockIsNetworkError.mockReturnValueOnce(true);
    mockService.launchProductionCycle.mockRejectedValueOnce(
      new Error("Network Error"),
    );
    const { getByTestId, getByText } = render(
      <NewCycleScreen navigation={navigation} />,
    );

    await waitFor(() =>
      expect(mockService.getProductionUnits).toHaveBeenCalled(),
    );
    fillValidForm(getByTestId, getByText);
    fireEvent.press(getByText("createCycle"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("saved", "cycleLaunchPendingAfterAttempt"),
    );
    expect(mockOffline.saveCycleLaunchOffline).toHaveBeenCalledWith(
      mockService.launchProductionCycle.mock.calls[0][0],
      {
        attempted: true,
        localContext: {
          productionUnits: [units[0]],
          feedReferences: [],
        },
      },
    );
    expect(mockOffline.saveNewCycleOffline).not.toHaveBeenCalled();
    expect(getByTestId("newCycleInitialCount").props.value).toBe("1500");
    alertSpy.mockRestore();
  });

  it("édite un lancement ongoing avec ses snapshots sans aucun accès réseau", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    mockOffline.isOnline.mockResolvedValue(false);
    const launchUuid = "22222222-2222-4222-8222-222222222222";
    const offlineLaunch = {
      launch_uuid: launchUuid,
      launch_kind: "additional_cycle",
      cycle: {
        onboarding_mode: "ongoing",
        species: "tilapia",
        start_date: "2026-06-01",
        initial_count: 2000,
        initial_average_weight: null,
        target_harvest_weight_g: 350,
        planned_cycle_duration_days: 150,
        expected_survival_rate_pct: 95,
        planned_selling_price_per_kg_fcfa: 2800,
        fingerlings_cost_fcfa: 0,
        other_operational_costs_fcfa: 0,
        created_offline: true,
      },
      tracking_baseline: {
        tracking_start_date: "2026-07-20",
        fish_count: 1850,
        average_weight_g: "75",
        biomass_kg: null,
      },
      production_units: [{
        local_id: "existing-unit-1",
        source: "existing",
        production_unit_id: "unit-1",
      }],
      allocations: [{
        production_unit_local_id: "existing-unit-1",
        fish_count: 1850,
      }],
      initial_feed_stocks: [],
    } as any;
    const route = {
      params: {
        editingOfflineLaunchId: launchUuid,
        offlineLaunch,
        offlineLaunchContext: {
          productionUnits: [units[0]],
          feedReferences: [],
        },
      },
    } as any;

    const { getByTestId, getByText } = render(
      <NewCycleScreen navigation={navigation} route={route} />,
    );

    await waitFor(() =>
      expect(getByTestId("newCycleAllocation-unit-1").props.value).toBe("1850"),
    );
    expect(mockService.getProductionUnits).not.toHaveBeenCalled();
    expect(getByTestId("newCycleInitialCount").props.value).toBe("2000");
    expect(getByTestId("newCycleTrackingCount").props.value).toBe("1850");

    fireEvent.changeText(getByTestId("newCycleTrackingCount"), "1800");
    fireEvent.changeText(getByTestId("newCycleAllocation-unit-1"), "1800");
    fireEvent.press(getByText("startTracking"));

    await waitFor(() =>
      expect(mockOffline.updatePendingCycleLaunch).toHaveBeenCalledTimes(1),
    );
    expect(mockOffline.updatePendingCycleLaunch).toHaveBeenCalledWith(
      launchUuid,
      expect.objectContaining({
        launch_uuid: launchUuid,
        cycle: expect.objectContaining({
          initial_count: 2000,
          created_offline: true,
        }),
        tracking_baseline: expect.objectContaining({ fish_count: 1800 }),
        allocations: [{
          production_unit_local_id: "existing-unit-1",
          fish_count: 1800,
        }],
      }),
      {
        localContext: {
          productionUnits: [units[0]],
          feedReferences: [],
        },
      },
    );
    expect(mockService.launchProductionCycle).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("conserve le même launch_uuid lors d un retry", async () => {
    mockService.launchProductionCycle
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ productionCycle: { id: "cycle-2" } } as any);
    mockIsNetworkError.mockReturnValue(true);
    const { getByTestId, getByText } = render(
      <NewCycleScreen navigation={navigation} />,
    );

    await waitFor(() =>
      expect(mockService.getProductionUnits).toHaveBeenCalled(),
    );
    fillValidForm(getByTestId, getByText);
    fireEvent.press(getByText("createCycle"));
    await waitFor(() =>
      expect(mockService.launchProductionCycle).toHaveBeenCalledTimes(1),
    );
    fireEvent.press(getByText("createCycle"));
    await waitFor(() =>
      expect(mockService.launchProductionCycle).toHaveBeenCalledTimes(2),
    );

    expect(mockService.launchProductionCycle.mock.calls[0][0].launch_uuid).toBe(
      mockService.launchProductionCycle.mock.calls[1][0].launch_uuid,
    );
  });

  it("affiche une erreur métier sans effacer les valeurs saisies", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    mockService.launchProductionCycle.mockRejectedValueOnce({
      response: { data: { detail: "invalid" } },
    });
    mockParseApiError.mockReturnValue({ message: "Erreur de validation" });
    const { getByTestId, getByText } = render(
      <NewCycleScreen navigation={navigation} />,
    );

    await waitFor(() =>
      expect(mockService.getProductionUnits).toHaveBeenCalled(),
    );
    fillValidForm(getByTestId, getByText);
    fireEvent.press(getByText("createCycle"));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("error", "Erreur de validation", [
        { text: "ok", style: "cancel" },
      ]),
    );
    expect(getByTestId("newCycleInitialCount").props.value).toBe("1500");
    alertSpy.mockRestore();
  });

  it.each([
    ["cycle_launch_unit_already_allocated", "cycleLaunchUnitAlreadyAllocated"],
    ["cycle_launch_unit_capacity_exceeded", "cycleLaunchUnitCapacityExceeded"],
  ])(
    "conserve le formulaire sur erreur métier de lancement %s",
    async (code, translationKey) => {
      const alertSpy = jest
        .spyOn(Alert, "alert")
        .mockImplementation(() => undefined);
      mockService.launchProductionCycle.mockRejectedValueOnce({
        response: { status: 409, data: { code, detail: "business error" } },
      });
      mockParseApiError.mockReturnValue({
        code,
        message: "business error",
      });
      const { getByTestId, getByText } = render(
        <NewCycleScreen navigation={navigation} />,
      );

      await waitFor(() =>
        expect(mockService.getProductionUnits).toHaveBeenCalled(),
      );
      fillValidForm(getByTestId, getByText);
      fireEvent.press(getByText("createCycle"));

      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith("error", translationKey, [
          { text: "ok", style: "cancel" },
        ]),
      );
      expect(getByTestId("newCycleInitialCount").props.value).toBe("1500");
      expect(mockOffline.saveNewCycleOffline).not.toHaveBeenCalled();
      expect(
        mockService.launchProductionCycle.mock.calls[0][0].launch_uuid,
      ).toBeTruthy();
      alertSpy.mockRestore();
    },
  );

  it("recharge unités et aliments du cache après un vrai remontage hors ligne", async () => {
    const feedReferences = [{
      id: "feed-1",
      farm_profile: "farm-1",
      name: "Tilapia 2 mm",
      species: "tilapia",
      pellet_size_mm: "2.00",
    }] as any;
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme Test" },
    });
    mockService.getFarmFeedReferences.mockResolvedValue(feedReferences);

    const online = render(<NewCycleScreen navigation={navigation} />);
    await waitFor(() =>
      expect(mockService.getFarmFeedReferences).toHaveBeenCalledWith("farm-1"),
    );
    online.unmount();

    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme Test" },
    });
    mockOffline.isOnline.mockResolvedValue(false);
    const offline = render(<NewCycleScreen navigation={navigation} />);

    await waitFor(() =>
      expect(offline.getByTestId("newCycleUnit-unit-1")).toBeTruthy(),
    );
    fireEvent.press(offline.getByText("ongoingCycleMode"));
    fireEvent.press(offline.getByText("tilapia"));
    fireEvent.press(offline.getByText("existingFeedReference"));
    expect(offline.getByText("Tilapia 2 mm")).toBeTruthy();
    expect(mockService.getProductionUnits).not.toHaveBeenCalled();
    expect(mockService.getFarmFeedReferences).not.toHaveBeenCalled();
  });

  it("ignore le cache d une autre ferme au démarrage hors ligne", async () => {
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme 1" },
    });
    const online = render(<NewCycleScreen navigation={navigation} />);
    await waitFor(() =>
      expect(mockService.getProductionUnits).toHaveBeenCalled(),
    );
    online.unmount();

    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-2", farm_name: "Ferme 2" },
    });
    mockOffline.isOnline.mockResolvedValue(false);
    const offline = render(<NewCycleScreen navigation={navigation} />);
    await waitFor(() =>
      expect(offline.getByText("cycleLaunchOfflineReferencesEmpty")).toBeTruthy(),
    );
    expect(offline.queryByTestId("newCycleUnit-unit-1")).toBeNull();
  });

  it("purge les unités en mémoire lors d un changement de ferme", async () => {
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme 1" },
    });
    const screen = render(<NewCycleScreen navigation={navigation} />);
    await waitFor(() =>
      expect(screen.getByTestId("newCycleUnit-unit-1")).toBeTruthy(),
    );

    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-2", farm_name: "Ferme 2" },
    });
    mockOffline.isOnline.mockResolvedValue(false);
    screen.rerender(<NewCycleScreen navigation={navigation} />);

    await waitFor(() =>
      expect(screen.getByText("cycleLaunchOfflineReferencesEmpty")).toBeTruthy(),
    );
    expect(screen.queryByTestId("newCycleUnit-unit-1")).toBeNull();
  });

  it("conserve le cache affiché quand le rafraîchissement serveur échoue", async () => {
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme Test" },
    });
    const firstMount = render(<NewCycleScreen navigation={navigation} />);
    await waitFor(() =>
      expect(mockService.getProductionUnits).toHaveBeenCalled(),
    );
    firstMount.unmount();

    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme Test" },
    });
    mockOffline.isOnline.mockResolvedValue(true);
    mockService.getProductionUnits.mockRejectedValue(new Error("server down"));
    mockService.getFarmFeedReferences.mockRejectedValue(new Error("server down"));
    const fallback = render(<NewCycleScreen navigation={navigation} />);

    await waitFor(() =>
      expect(mockService.getProductionUnits).toHaveBeenCalled(),
    );
    expect(fallback.getByTestId("newCycleUnit-unit-1")).toBeTruthy();
    expect(fallback.queryByText("productionUnitsLoadError")).toBeNull();
  });

  it("remplace les unités obsolètes du cache après un refresh réussi", async () => {
    const obsolete = {
      ...units[1],
      id: "unit-obsolete",
      name: "Bassin obsolète",
    };
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme Test" },
    });
    await cycleLaunchReferenceCache.cacheProductionUnits(
      "farm-1",
      [units[0], obsolete] as any,
    );
    mockService.getProductionUnits.mockResolvedValue([units[0]]);

    const screen = render(<NewCycleScreen navigation={navigation} />);
    await waitFor(() =>
      expect(screen.getByTestId("newCycleUnit-unit-1")).toBeTruthy(),
    );
    expect(screen.queryByTestId("newCycleUnit-unit-obsolete")).toBeNull();
    await waitFor(async () =>
      expect(
        (await cycleLaunchReferenceCache.load("farm-1"))?.productionUnits,
      ).toEqual([units[0]]),
    );
  });

  it("remplace les références alimentaires obsolètes après succès serveur", async () => {
    const oldReference = {
      id: "feed-old",
      farm_profile: "farm-1",
      name: "Ancien aliment",
      species: "tilapia",
      pellet_size_mm: "2.00",
    };
    const newReference = {
      ...oldReference,
      id: "feed-new",
      name: "Nouvel aliment",
    };
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme Test" },
    });
    await cycleLaunchReferenceCache.cacheFeedReferences(
      "farm-1",
      [oldReference] as any,
    );
    mockService.getFarmFeedReferences.mockResolvedValue(
      [newReference] as any,
    );

    const screen = render(<NewCycleScreen navigation={navigation} />);
    await waitFor(() =>
      expect(mockService.getFarmFeedReferences).toHaveBeenCalledWith("farm-1"),
    );
    fireEvent.press(screen.getByText("ongoingCycleMode"));
    fireEvent.press(screen.getByText("tilapia"));
    fireEvent.press(screen.getByText("existingFeedReference"));
    expect(screen.getByText("Nouvel aliment")).toBeTruthy();
    expect(screen.queryByText("Ancien aliment")).toBeNull();
  });

  it("invalide une sélection du cache retirée par le refresh serveur", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    const oldReference = buildFeedReference({
      id: "feed-old",
      name: "Ancien aliment",
    });
    const newReference = buildFeedReference({
      id: "feed-new",
      name: "Nouvel aliment",
    });
    let resolveServerReferences:
      ((references: FarmFeedReference[]) => void) | undefined;
    const serverReferencesPromise = new Promise<FarmFeedReference[]>(
      (resolve) => {
        resolveServerReferences = resolve;
      },
    );
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme Test" },
    });
    await cycleLaunchReferenceCache.cacheFeedReferences(
      "farm-1",
      [oldReference],
    );
    mockService.getFarmFeedReferences.mockReturnValue(serverReferencesPromise);

    const screen = render(<NewCycleScreen navigation={navigation} />);
    fireEvent.press(screen.getByText("ongoingCycleMode"));
    fireEvent.press(screen.getByText("tilapia"));
    fireEvent.press(screen.getByText("existingFeedReference"));
    await waitFor(() =>
      expect(screen.getByLabelText("Ancien aliment")).toBeTruthy(),
    );
    fireEvent.press(screen.getByLabelText("Ancien aliment"));
    fireEvent.changeText(screen.getByTestId("newCycleStockQuantity"), "25");

    await act(async () => {
      resolveServerReferences?.([newReference]);
      await serverReferencesPromise;
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("Ancien aliment")).toBeNull();
      expect(screen.getByLabelText("Nouvel aliment")).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId("newCycleAddOpeningStock"));

    expect(alertSpy).toHaveBeenCalledWith(
      "error",
      "cycleLaunchFeedReferenceNotFound",
    );
    expect(screen.queryByText("25 kg · unknownCost")).toBeNull();
    alertSpy.mockRestore();
  });

  it("conserve une sélection encore valide après le refresh serveur", async () => {
    const currentReference = buildFeedReference();
    let resolveServerReferences:
      ((references: FarmFeedReference[]) => void) | undefined;
    const serverReferencesPromise = new Promise<FarmFeedReference[]>(
      (resolve) => {
        resolveServerReferences = resolve;
      },
    );
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme Test" },
    });
    await cycleLaunchReferenceCache.cacheFeedReferences(
      "farm-1",
      [currentReference],
    );
    mockService.getFarmFeedReferences.mockReturnValue(serverReferencesPromise);

    const screen = render(<NewCycleScreen navigation={navigation} />);
    fireEvent.press(screen.getByText("ongoingCycleMode"));
    fireEvent.press(screen.getByText("tilapia"));
    fireEvent.press(screen.getByText("existingFeedReference"));
    await waitFor(() =>
      expect(screen.getByLabelText("Aliment courant")).toBeTruthy(),
    );
    fireEvent.press(screen.getByLabelText("Aliment courant"));

    await act(async () => {
      resolveServerReferences?.([currentReference]);
      await serverReferencesPromise;
    });

    await waitFor(() =>
      expect(
        screen.getByTestId("newCycleFeedReference-feed-current").props
          .accessibilityState.selected,
      ).toBe(true),
    );
  });

  it("invalide la référence sélectionnée après un changement d espèce", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    const tilapiaReference = buildFeedReference();
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme Test" },
    });
    mockService.getFarmFeedReferences.mockResolvedValue([tilapiaReference]);

    const screen = render(<NewCycleScreen navigation={navigation} />);
    fireEvent.press(screen.getByText("ongoingCycleMode"));
    fireEvent.press(screen.getByText("tilapia"));
    fireEvent.press(screen.getByText("existingFeedReference"));
    await waitFor(() =>
      expect(screen.getByLabelText("Aliment courant")).toBeTruthy(),
    );
    fireEvent.press(screen.getByLabelText("Aliment courant"));
    fireEvent.press(screen.getByText("clarias"));
    fireEvent.changeText(screen.getByTestId("newCycleStockQuantity"), "25");
    fireEvent.press(screen.getByTestId("newCycleAddOpeningStock"));

    expect(alertSpy).toHaveBeenCalledWith(
      "error",
      "cycleLaunchFeedReferenceNotFound",
    );
    alertSpy.mockRestore();
  });

  it("invalide la référence sélectionnée après un changement de ferme", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    const farmOneReference = buildFeedReference({
      id: "feed-farm-1",
      name: "Aliment ferme 1",
    });
    const farmTwoReference = buildFeedReference({
      id: "feed-farm-2",
      farm_profile: "farm-2",
      name: "Aliment ferme 2",
    });
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme 1" },
    });
    mockService.getFarmFeedReferences.mockImplementation(async (farmId) =>
      farmId === "farm-1" ? [farmOneReference] : [farmTwoReference],
    );

    const screen = render(<NewCycleScreen navigation={navigation} />);
    fireEvent.press(screen.getByText("ongoingCycleMode"));
    fireEvent.press(screen.getByText("tilapia"));
    fireEvent.press(screen.getByText("existingFeedReference"));
    await waitFor(() =>
      expect(screen.getByLabelText("Aliment ferme 1")).toBeTruthy(),
    );
    fireEvent.press(screen.getByLabelText("Aliment ferme 1"));

    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-2", farm_name: "Ferme 2" },
    });
    screen.rerender(<NewCycleScreen navigation={navigation} />);
    await waitFor(() => {
      expect(screen.queryByLabelText("Aliment ferme 1")).toBeNull();
      expect(screen.getByLabelText("Aliment ferme 2")).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId("newCycleStockQuantity"), "25");
    fireEvent.press(screen.getByTestId("newCycleAddOpeningStock"));

    expect(alertSpy).toHaveBeenCalledWith(
      "error",
      "cycleLaunchFeedReferenceNotFound",
    );
    alertSpy.mockRestore();
  });

  it("bloque une ligne déjà ajoutée après changement d espèce puis la revalide au retour", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    const tilapiaReference = buildFeedReference();
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme Test" },
    });
    mockService.getFarmFeedReferences.mockResolvedValue([tilapiaReference]);

    const screen = render(<NewCycleScreen navigation={navigation} />);
    await waitFor(() =>
      expect(mockService.getProductionUnits).toHaveBeenCalled(),
    );
    fillValidOngoingForm(screen);
    fireEvent.press(screen.getByText("existingFeedReference"));
    await waitFor(() =>
      expect(screen.getByLabelText("Aliment courant")).toBeTruthy(),
    );
    fireEvent.press(screen.getByLabelText("Aliment courant"));
    fireEvent.changeText(screen.getByTestId("newCycleStockQuantity"), "25");
    fireEvent.press(screen.getByTestId("newCycleAddOpeningStock"));
    expect(screen.getByText("25 kg · unknownCost")).toBeTruthy();

    fireEvent.press(screen.getByText("clarias"));
    expect(
      screen.getByText("cycleLaunchFeedReferenceSpeciesMismatch"),
    ).toBeTruthy();
    fireEvent.press(screen.getByText("startTracking"));

    expect(alertSpy).toHaveBeenCalledWith(
      "error",
      "cycleLaunchFeedReferenceSpeciesMismatch",
    );
    expect(mockService.launchProductionCycle).not.toHaveBeenCalled();
    expect(mockOffline.saveCycleLaunchOffline).not.toHaveBeenCalled();
    expect(mockOffline.updatePendingCycleLaunch).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText("tilapia"));
    expect(
      screen.queryByText("cycleLaunchFeedReferenceSpeciesMismatch"),
    ).toBeNull();
    fireEvent.press(screen.getByText("startTracking"));
    await waitFor(() =>
      expect(mockService.launchProductionCycle).toHaveBeenCalledTimes(1),
    );
    alertSpy.mockRestore();
  });

  it("bloque une ligne déjà ajoutée après changement de ferme", async () => {
    const alertSpy = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    const farmOneReference = buildFeedReference({
      id: "feed-farm-1",
      name: "Aliment ferme 1",
    });
    const farmTwoReference = buildFeedReference({
      id: "feed-farm-2",
      farm_profile: "farm-2",
      name: "Aliment ferme 2",
    });
    const farmTwoUnit = {
      ...units[0],
      id: "unit-farm-2",
      farm_profile: "farm-2",
      name: "Bassin ferme 2",
    };
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme 1" },
    });
    mockService.getProductionUnits
      .mockResolvedValueOnce(units)
      .mockResolvedValueOnce([farmTwoUnit]);
    mockService.getFarmFeedReferences.mockImplementation(async (farmId) =>
      farmId === "farm-1" ? [farmOneReference] : [farmTwoReference],
    );

    const screen = render(<NewCycleScreen navigation={navigation} />);
    await waitFor(() =>
      expect(mockService.getProductionUnits).toHaveBeenCalled(),
    );
    fillValidOngoingForm(screen);
    fireEvent.press(screen.getByText("existingFeedReference"));
    await waitFor(() =>
      expect(screen.getByLabelText("Aliment ferme 1")).toBeTruthy(),
    );
    fireEvent.press(screen.getByLabelText("Aliment ferme 1"));
    fireEvent.changeText(screen.getByTestId("newCycleStockQuantity"), "25");
    fireEvent.press(screen.getByTestId("newCycleAddOpeningStock"));

    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-2", farm_name: "Ferme 2" },
    });
    screen.rerender(<NewCycleScreen navigation={navigation} />);
    await waitFor(() =>
      expect(screen.getByTestId("newCycleUnit-unit-farm-2")).toBeTruthy(),
    );
    fireEvent.press(screen.getByTestId("newCycleUnit-unit-farm-2"));
    fireEvent.changeText(
      screen.getByTestId("newCycleAllocation-unit-farm-2"),
      "1850",
    );

    expect(screen.getByText("Aliment ferme 1")).toBeTruthy();
    expect(
      screen.getByText("cycleLaunchFeedReferenceFarmMismatch"),
    ).toBeTruthy();
    fireEvent.press(screen.getByText("startTracking"));

    expect(alertSpy).toHaveBeenCalledWith(
      "error",
      "cycleLaunchFeedReferenceFarmMismatch",
    );
    expect(mockService.launchProductionCycle).not.toHaveBeenCalled();
    expect(mockOffline.saveCycleLaunchOffline).not.toHaveBeenCalled();
    expect(mockOffline.updatePendingCycleLaunch).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("ignore une ancienne réponse alimentaire après changement de ferme", async () => {
    const farmOneReference = buildFeedReference({
      id: "feed-farm-1",
      name: "Aliment ferme 1",
    });
    const farmTwoReference = buildFeedReference({
      id: "feed-farm-2",
      farm_profile: "farm-2",
      name: "Aliment ferme 2",
    });
    let resolveFarmOneReferences:
      ((references: FarmFeedReference[]) => void) | undefined;
    const farmOneReferencesPromise = new Promise<FarmFeedReference[]>(
      (resolve) => {
        resolveFarmOneReferences = resolve;
      },
    );
    const cacheFeedSpy = jest.spyOn(
      cycleLaunchReferenceCache,
      "cacheFeedReferences",
    );
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme 1" },
    });
    mockService.getFarmFeedReferences.mockImplementation((farmId) =>
      farmId === "farm-1"
        ? farmOneReferencesPromise
        : Promise.resolve([farmTwoReference]),
    );

    const screen = render(<NewCycleScreen navigation={navigation} />);
    fireEvent.press(screen.getByText("ongoingCycleMode"));
    fireEvent.press(screen.getByText("tilapia"));
    fireEvent.press(screen.getByText("existingFeedReference"));
    await waitFor(() =>
      expect(mockService.getFarmFeedReferences).toHaveBeenCalledWith("farm-1"),
    );

    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-2", farm_name: "Ferme 2" },
    });
    screen.rerender(<NewCycleScreen navigation={navigation} />);
    await waitFor(() =>
      expect(screen.getByLabelText("Aliment ferme 2")).toBeTruthy(),
    );

    await act(async () => {
      resolveFarmOneReferences?.([farmOneReference]);
      await farmOneReferencesPromise;
    });

    expect(screen.getByLabelText("Aliment ferme 2")).toBeTruthy();
    expect(screen.queryByLabelText("Aliment ferme 1")).toBeNull();
    expect(cacheFeedSpy).toHaveBeenCalledWith(
      "farm-2",
      [farmTwoReference],
    );
    expect(cacheFeedSpy).not.toHaveBeenCalledWith(
      "farm-1",
      expect.any(Array),
    );
    cacheFeedSpy.mockRestore();
  });

  it("ignore une ancienne erreur d unités après changement de ferme", async () => {
    const farmTwoUnit = {
      ...units[0],
      id: "unit-farm-2",
      farm_profile: "farm-2",
      name: "Bassin ferme 2",
    };
    let rejectFarmOneUnits: ((reason?: unknown) => void) | undefined;
    const farmOneUnitsPromise = new Promise<typeof units>(
      (_resolve, reject) => {
        rejectFarmOneUnits = reject;
      },
    );
    const cacheUnitsSpy = jest.spyOn(
      cycleLaunchReferenceCache,
      "cacheProductionUnits",
    );
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme 1" },
    });
    mockService.getProductionUnits
      .mockReturnValueOnce(farmOneUnitsPromise)
      .mockResolvedValueOnce([farmTwoUnit]);

    const screen = render(<NewCycleScreen navigation={navigation} />);
    await waitFor(() =>
      expect(mockService.getProductionUnits).toHaveBeenCalledTimes(1),
    );

    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-2", farm_name: "Ferme 2" },
    });
    screen.rerender(<NewCycleScreen navigation={navigation} />);
    await waitFor(() =>
      expect(screen.getByTestId("newCycleUnit-unit-farm-2")).toBeTruthy(),
    );

    await act(async () => {
      rejectFarmOneUnits?.(new Error("ancienne erreur"));
      await farmOneUnitsPromise.catch(() => undefined);
    });

    expect(screen.getByTestId("newCycleUnit-unit-farm-2")).toBeTruthy();
    expect(screen.queryByTestId("newCycleUnit-unit-1")).toBeNull();
    expect(screen.queryByText("productionUnitsLoadError")).toBeNull();
    expect(cacheUnitsSpy).toHaveBeenCalledWith("farm-2", [farmTwoUnit]);
    expect(cacheUnitsSpy).not.toHaveBeenCalledWith(
      "farm-1",
      expect.any(Array),
    );
    cacheUnitsSpy.mockRestore();
  });

  it("préserve le snapshot alimentaire utilisé pendant un round-trip pending", async () => {
    const oldReference = {
      id: "feed-old",
      client_uuid: null,
      farm_profile: "farm-1",
      source: "external",
      catalog_product_id: null,
      name: "Ancien aliment",
      species: "tilapia",
      pellet_size_mm: "2.00",
      brand: "Ancienne marque",
      protein_percentage: "32.00",
      lipid_percentage: null,
      package_weight_kg: "25.00",
    };
    const newReference = {
      ...oldReference,
      id: "feed-new",
      name: "Nouvel aliment",
      pellet_size_mm: "3.00",
    };
    const launchUuid = "44444444-4444-4444-8444-444444444444";
    const offlineLaunch = {
      launch_uuid: launchUuid,
      launch_kind: "additional_cycle",
      cycle: {
        onboarding_mode: "ongoing",
        species: "tilapia",
        start_date: "2026-06-01",
        initial_count: 2000,
        initial_average_weight: null,
        target_harvest_weight_g: 350,
        planned_cycle_duration_days: 150,
        expected_survival_rate_pct: 95,
        planned_selling_price_per_kg_fcfa: 2800,
        fingerlings_cost_fcfa: 0,
        other_operational_costs_fcfa: 0,
        created_offline: true,
      },
      tracking_baseline: {
        tracking_start_date: "2026-07-20",
        fish_count: 1850,
        average_weight_g: "75",
        biomass_kg: null,
      },
      production_units: [{
        local_id: "existing-unit-1",
        source: "existing",
        production_unit_id: "unit-1",
      }],
      allocations: [{
        production_unit_local_id: "existing-unit-1",
        fish_count: 1850,
      }],
      initial_feed_stocks: [{
        local_id: "stock-old",
        feed_reference_id: "feed-old",
        quantity_kg: "25.00",
        cost_status: "unknown",
        total_cost_fcfa: null,
        note: "Reliquat historique",
      }],
    } as any;
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme Test" },
    });
    mockService.getProductionUnits.mockResolvedValue([units[0]]);
    mockService.getFarmFeedReferences.mockResolvedValue([newReference] as any);
    const route = {
      params: {
        editingOfflineLaunchId: launchUuid,
        offlineLaunch,
        offlineLaunchContext: {
          productionUnits: [units[0]],
          feedReferences: [oldReference],
        },
      },
    } as any;

    const firstMount = render(
      <NewCycleScreen navigation={navigation} route={route} />,
    );
    await waitFor(() =>
      expect(
        firstMount.getAllByText("cycleLaunchReferenceUnavailable").length,
      ).toBeGreaterThan(0),
    );
    expect(firstMount.getByText("Ancien aliment")).toBeTruthy();
    expect(firstMount.getByText("2.00 mm")).toBeTruthy();
    fireEvent.press(firstMount.getByText("existingFeedReference"));
    expect(firstMount.getByLabelText("Nouvel aliment")).toBeTruthy();
    expect(firstMount.queryByLabelText("Ancien aliment")).toBeNull();

    fireEvent.press(firstMount.getByText("startTracking"));
    await waitFor(() =>
      expect(mockOffline.updatePendingCycleLaunch).toHaveBeenCalledTimes(1),
    );
    const updatedPayload =
      mockOffline.updatePendingCycleLaunch.mock.calls[0][1];
    const updatedContext =
      mockOffline.updatePendingCycleLaunch.mock.calls[0][2]?.localContext;
    expect(updatedContext?.feedReferences).toEqual([
      newReference,
      oldReference,
    ]);
    firstMount.unmount();

    const secondMount = render(
      <NewCycleScreen
        navigation={navigation}
        route={{
          params: {
            editingOfflineLaunchId: launchUuid,
            offlineLaunch: updatedPayload,
            offlineLaunchContext: updatedContext,
          },
        } as any}
      />,
    );
    await waitFor(() =>
      expect(
        secondMount.getAllByText("cycleLaunchReferenceUnavailable").length,
      ).toBeGreaterThan(0),
    );
    expect(secondMount.getByText("Ancien aliment")).toBeTruthy();
    expect(secondMount.getByText("2.00 mm")).toBeTruthy();

    fireEvent.press(secondMount.getByText("remove"));
    fireEvent.press(secondMount.getByText("startTracking"));
    await waitFor(() =>
      expect(mockOffline.updatePendingCycleLaunch).toHaveBeenCalledTimes(2),
    );
    expect(
      mockOffline.updatePendingCycleLaunch.mock.calls[1][2]?.localContext
        ?.feedReferences,
    ).toEqual([newReference]);
  });

  it("préserve et réaffiche un snapshot pending identifié par client UUID", async () => {
    const oldReference = buildFeedReference({
      id: "snapshot-old",
      client_uuid: "client-old",
      name: "Ancien aliment client",
      pellet_size_mm: "2.00",
    });
    const stock = {
      local_id: "stock-client-old",
      feed_reference_client_uuid: "client-old",
      quantity_kg: "25.00",
      cost_status: "unknown",
      total_cost_fcfa: null,
      note: "Reliquat client",
    } satisfies CycleLaunchOpeningStockInput;
    const offlineLaunch = buildPendingLaunchWithStocks([stock]);
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme Test" },
    });
    mockService.getProductionUnits.mockResolvedValue([units[0]]);
    mockService.getFarmFeedReferences.mockResolvedValue([]);

    const firstMount = render(
      <NewCycleScreen
        navigation={navigation}
        route={{
          params: {
            editingOfflineLaunchId: offlineLaunch.launch_uuid,
            offlineLaunch,
            offlineLaunchContext: {
              productionUnits: [units[0]],
              feedReferences: [oldReference],
            },
          },
        } as unknown as React.ComponentProps<typeof NewCycleScreen>["route"]}
      />,
    );
    await waitFor(() =>
      expect(
        firstMount.getAllByText("cycleLaunchReferenceUnavailable").length,
      ).toBeGreaterThan(0),
    );
    expect(firstMount.getByText("Ancien aliment client")).toBeTruthy();
    expect(firstMount.getByText("2.00 mm")).toBeTruthy();

    fireEvent.press(firstMount.getByText("startTracking"));
    await waitFor(() =>
      expect(mockOffline.updatePendingCycleLaunch).toHaveBeenCalledTimes(1),
    );
    const updatedPayload =
      mockOffline.updatePendingCycleLaunch.mock.calls[0][1];
    const updatedContext =
      mockOffline.updatePendingCycleLaunch.mock.calls[0][2]?.localContext;
    expect(updatedPayload.initial_feed_stocks).toEqual([stock]);
    expect(updatedPayload.initial_feed_stocks?.[0].feed_reference_id).toBeUndefined();
    expect(updatedContext?.feedReferences).toEqual([oldReference]);
    firstMount.unmount();

    const secondMount = render(
      <NewCycleScreen
        navigation={navigation}
        route={{
          params: {
            editingOfflineLaunchId: offlineLaunch.launch_uuid,
            offlineLaunch: updatedPayload,
            offlineLaunchContext: updatedContext,
          },
        } as unknown as React.ComponentProps<typeof NewCycleScreen>["route"]}
      />,
    );
    await waitFor(() =>
      expect(secondMount.getByText("Ancien aliment client")).toBeTruthy(),
    );
    expect(secondMount.getByText("2.00 mm")).toBeTruthy();
    expect(
      secondMount.getAllByText("cycleLaunchReferenceUnavailable").length,
    ).toBeGreaterThan(0);
  });

  it("priorise les métadonnées serveur pour un client UUID sans changer le payload", async () => {
    const clientUuid = "client-synchronized";
    const snapshot = buildFeedReference({
      id: "local-old",
      client_uuid: clientUuid,
      name: "Ancien nom",
    });
    const serverReference = buildFeedReference({
      id: "server-new",
      client_uuid: clientUuid,
      name: "Nom serveur",
      pellet_size_mm: "3.00",
    });
    const stock = {
      local_id: "stock-client-synchronized",
      feed_reference_client_uuid: clientUuid,
      quantity_kg: "25.00",
      cost_status: "unknown",
      total_cost_fcfa: null,
      note: "",
    } satisfies CycleLaunchOpeningStockInput;
    const offlineLaunch = buildPendingLaunchWithStocks([stock]);
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme Test" },
    });
    mockService.getProductionUnits.mockResolvedValue([units[0]]);
    mockService.getFarmFeedReferences.mockResolvedValue([serverReference]);

    const screen = render(
      <NewCycleScreen
        navigation={navigation}
        route={{
          params: {
            editingOfflineLaunchId: offlineLaunch.launch_uuid,
            offlineLaunch,
            offlineLaunchContext: {
              productionUnits: [units[0]],
              feedReferences: [snapshot],
            },
          },
        } as unknown as React.ComponentProps<typeof NewCycleScreen>["route"]}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Nom serveur")).toBeTruthy(),
    );
    expect(screen.queryByText("Ancien nom")).toBeNull();
    expect(screen.getByText("3.00 mm")).toBeTruthy();
    expect(screen.queryByText("cycleLaunchReferenceUnavailable")).toBeNull();

    fireEvent.press(screen.getByText("startTracking"));
    await waitFor(() =>
      expect(mockOffline.updatePendingCycleLaunch).toHaveBeenCalledTimes(1),
    );
    const savedPayload =
      mockOffline.updatePendingCycleLaunch.mock.calls[0][1];
    expect(savedPayload.initial_feed_stocks).toEqual([stock]);
    expect(savedPayload.initial_feed_stocks?.[0].feed_reference_id).toBeUndefined();
    expect(
      mockOffline.updatePendingCycleLaunch.mock.calls[0][2]?.localContext
        ?.feedReferences,
    ).toEqual([serverReference]);
  });

  it("conserve et signale le snapshot d une unité pending devenue indisponible", async () => {
    const obsolete = {
      ...units[1],
      id: "unit-obsolete",
      name: "Bassin obsolète",
    };
    const offlineLaunch = {
      launch_uuid: "33333333-3333-4333-8333-333333333333",
      launch_kind: "additional_cycle",
      cycle: {
        onboarding_mode: "ongoing",
        species: "tilapia",
        start_date: "2026-01-01",
        initial_count: 1000,
        planned_cycle_duration_days: 180,
        expected_survival_rate_pct: 95,
        created_offline: true,
      },
      tracking_baseline: {
        tracking_start_date: "2026-02-01",
        fish_count: 900,
        average_weight_g: "50",
        biomass_kg: null,
      },
      production_units: [{
        local_id: "existing-unit-obsolete",
        source: "existing",
        production_unit_id: "unit-obsolete",
      }],
      allocations: [{
        production_unit_local_id: "existing-unit-obsolete",
        fish_count: 900,
      }],
      initial_feed_stocks: [],
    };
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme Test" },
    });
    mockService.getProductionUnits.mockResolvedValue([units[0]]);

    const screen = render(
      <NewCycleScreen
        navigation={navigation}
        route={{
          params: {
            editingOfflineLaunchId: offlineLaunch.launch_uuid,
            offlineLaunch,
            offlineLaunchContext: {
              productionUnits: [obsolete],
              feedReferences: [],
            },
          },
        } as any}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("cycleLaunchPendingUnitUnavailable")).toBeTruthy(),
    );
    expect(screen.getByTestId("newCycleUnit-unit-obsolete")).toBeTruthy();
    expect(
      screen.getByTestId("newCycleAllocation-unit-obsolete").props.value,
    ).toBe("900");
    expect(
      screen.getByTestId("newCycleUnit-unit-obsolete").props
        .accessibilityState.disabled,
    ).toBe(true);
  });

  it("bloque immédiatement la soumission pendant le bootstrap d une nouvelle ferme", async () => {
    const abortDashboard = jest.fn();
    mockDispatch.mockReturnValue({ abort: abortDashboard });
    const farmTwoUnit = {
      ...units[0],
      id: "unit-farm-2",
      farm_profile: "farm-2",
      name: "Bassin ferme 2",
    };
    let resolveFarmTwoUnits:
      ((productionUnits: typeof units) => void) | undefined;
    const farmTwoUnitsPromise = new Promise<typeof units>((resolve) => {
      resolveFarmTwoUnits = resolve;
    });
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme 1" },
    });
    mockService.getProductionUnits
      .mockResolvedValueOnce(units)
      .mockReturnValueOnce(farmTwoUnitsPromise);

    const screen = render(<NewCycleScreen navigation={navigation} />);
    await waitFor(() =>
      expect(screen.getByTestId("newCycleUnit-unit-1")).toBeTruthy(),
    );
    fillValidOngoingForm(screen);
    await waitFor(() =>
      expect(
        screen.getByTestId("newCycleSubmit").props.accessibilityState.disabled,
      ).toBe(false),
    );

    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-2", farm_name: "Ferme 2" },
    });
    screen.rerender(<NewCycleScreen navigation={navigation} />);

    await waitFor(() => {
      expect(abortDashboard).toHaveBeenCalled();
      expect(screen.getByText("cycleLaunchFarmContextLoading")).toBeTruthy();
      expect(
        screen.getByTestId("newCycleSubmit").props.accessibilityState.disabled,
      ).toBe(true);
    });
    fireEvent.press(screen.getByTestId("newCycleSubmit"));
    expect(mockService.launchProductionCycle).not.toHaveBeenCalled();
    expect(mockOffline.saveCycleLaunchOffline).not.toHaveBeenCalled();
    expect(mockOffline.updatePendingCycleLaunch).not.toHaveBeenCalled();

    await act(async () => {
      resolveFarmTwoUnits?.([farmTwoUnit] as typeof units);
      await farmTwoUnitsPromise;
    });
  });

  it("annule la sauvegarde si la ferme change pendant isOnline", async () => {
    let resolveSaveConnectivity: ((online: boolean) => void) | undefined;
    const saveConnectivityPromise = new Promise<boolean>((resolve) => {
      resolveSaveConnectivity = resolve;
    });
    mockOffline.isOnline
      .mockResolvedValueOnce(true)
      .mockReturnValueOnce(saveConnectivityPromise)
      .mockResolvedValue(true);
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-1", farm_name: "Ferme 1" },
    });

    const screen = render(<NewCycleScreen navigation={navigation} />);
    await waitFor(() =>
      expect(screen.getByTestId("newCycleUnit-unit-1")).toBeTruthy(),
    );
    fillValidOngoingForm(screen);
    await waitFor(() =>
      expect(
        screen.getByTestId("newCycleSubmit").props.accessibilityState.disabled,
      ).toBe(false),
    );
    fireEvent.press(screen.getByTestId("newCycleSubmit"));

    await waitFor(() =>
      expect(mockOffline.isOnline).toHaveBeenCalledTimes(2),
    );
    mockUseAuth.mockReturnValue({
      farmProfile: { id: "farm-2", farm_name: "Ferme 2" },
    });
    screen.rerender(<NewCycleScreen navigation={navigation} />);
    await act(async () => {
      resolveSaveConnectivity?.(false);
      await saveConnectivityPromise;
    });

    expect(mockService.launchProductionCycle).not.toHaveBeenCalled();
    expect(mockOffline.saveCycleLaunchOffline).not.toHaveBeenCalled();
    expect(mockOffline.updatePendingCycleLaunch).not.toHaveBeenCalled();
  });

  it("affiche le calendrier ongoing avec la durée restante inclusive", async () => {
    const { getByTestId, getByText } = render(
      <NewCycleScreen navigation={navigation} />,
    );
    await waitFor(() => expect(mockService.getProductionUnits).toHaveBeenCalled());
    fireEvent.press(getByText("ongoingCycleMode"));
    fireEvent.press(getByText("tilapia"));
    fireEvent.changeText(getByTestId("newCycleInitialCount"), "2000");
    fireEvent.changeText(getByTestId("newCycleStartDate"), "2026-06-01");
    fireEvent.changeText(getByTestId("newCycleTrackingDate"), "2026-07-20");
    fireEvent.changeText(getByTestId("newCycleDuration"), "150");

    expect(getByTestId("ongoingTotalDuration")).toBeTruthy();
    expect(getByTestId("ongoingPlannedHarvestDate")).toBeTruthy();
    expect(getByTestId("ongoingRemainingDuration")).toBeTruthy();
  });

  it("bloque localement une baseline à la récolte sans requête HTTP", async () => {
    const { getByTestId, getByText } = render(
      <NewCycleScreen navigation={navigation} />,
    );
    await waitFor(() => expect(mockService.getProductionUnits).toHaveBeenCalled());
    fireEvent.press(getByText("ongoingCycleMode"));
    fireEvent.press(getByText("tilapia"));
    fireEvent.press(getByTestId("newCycleUnit-unit-1"));
    fireEvent.changeText(getByTestId("newCycleInitialCount"), "2000");
    fireEvent.changeText(getByTestId("newCycleStartDate"), "2026-01-01");
    fireEvent.changeText(getByTestId("newCycleTrackingDate"), "2026-05-30");
    fireEvent.changeText(getByTestId("newCycleTrackingCount"), "1800");
    fireEvent.changeText(getByTestId("newCycleTrackingWeight"), "75");
    fireEvent.changeText(getByTestId("newCycleTargetWeight"), "350");
    fireEvent.changeText(getByTestId("newCycleDuration"), "150");
    fireEvent.changeText(getByTestId("newCycleSurvival"), "95");
    fireEvent.changeText(getByTestId("newCycleAllocation-unit-1"), "1800");

    expect(getByText("ongoingCyclePlannedHarvestElapsed")).toBeTruthy();
    fireEvent.press(getByTestId("newCycleSubmit"));
    expect(mockService.launchProductionCycle).not.toHaveBeenCalled();
    expect(mockOffline.saveCycleLaunchOffline).not.toHaveBeenCalled();
  });

  it("bloque localement une récolte déjà passée sans requête HTTP", async () => {
    const { getByTestId, getByText } = render(
      <NewCycleScreen navigation={navigation} />,
    );
    await waitFor(() => expect(mockService.getProductionUnits).toHaveBeenCalled());
    fireEvent.press(getByText("ongoingCycleMode"));
    fireEvent.press(getByText("tilapia"));
    fireEvent.press(getByTestId("newCycleUnit-unit-1"));
    fireEvent.changeText(getByTestId("newCycleInitialCount"), "2000");
    fireEvent.changeText(getByTestId("newCycleStartDate"), "2026-01-01");
    fireEvent.changeText(getByTestId("newCycleTrackingDate"), "2026-05-29");
    fireEvent.changeText(getByTestId("newCycleTrackingCount"), "1800");
    fireEvent.changeText(getByTestId("newCycleTrackingWeight"), "75");
    fireEvent.changeText(getByTestId("newCycleTargetWeight"), "350");
    fireEvent.changeText(getByTestId("newCycleDuration"), "150");
    fireEvent.changeText(getByTestId("newCycleSurvival"), "95");
    fireEvent.changeText(getByTestId("newCycleAllocation-unit-1"), "1800");

    expect(getByText("ongoingCyclePlannedHarvestElapsed")).toBeTruthy();
    fireEvent.press(getByTestId("newCycleSubmit"));
    expect(mockService.launchProductionCycle).not.toHaveBeenCalled();
    expect(mockOffline.saveCycleLaunchOffline).not.toHaveBeenCalled();
  });
});
