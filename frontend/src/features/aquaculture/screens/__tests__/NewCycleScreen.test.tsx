import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import NewCycleScreen from "../NewCycleScreen";
import { aquacultureService } from "@/features/aquaculture/services/aquacultureService";
import { offlineService } from "@/services/offlineService";
import { useDispatch } from "react-redux";
import { useAuth } from "@/hooks/useAuth";
import { isNetworkError, parseApiError } from "@/utils/errorParser";
import { getBusinessIsoDate } from "@/utils/businessDate";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
    mockUseAuth.mockReturnValue({ farmProfile: { farm_name: "Ferme Test" } });
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
});
