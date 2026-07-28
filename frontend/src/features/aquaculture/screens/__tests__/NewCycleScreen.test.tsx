import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import NewCycleScreen from "../NewCycleScreen";
import { aquacultureService } from "@/features/aquaculture/services/aquacultureService";
import { offlineService } from "@/services/offlineService";
import { useDispatch } from "react-redux";
import { useAuth } from "@/hooks/useAuth";
import { isNetworkError, parseApiError } from "@/utils/errorParser";

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
    launchProductionCycle: jest.fn(),
  },
}));

jest.mock("@/services/offlineService", () => ({
  offlineService: {
    hasAnyPendingSync: jest.fn(),
    syncAllOfflineData: jest.fn(),
    isOnline: jest.fn(),
    saveCycleLaunchOffline: jest.fn(),
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

  beforeEach(() => {
    jest.clearAllMocks();
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    mockUseAuth.mockReturnValue({ farmProfile: { farm_name: "Ferme Test" } });
    mockOffline.hasAnyPendingSync.mockResolvedValue(false);
    mockOffline.syncAllOfflineData.mockResolvedValue({
      success: 0,
      failed: 0,
    } as any);
    mockOffline.isOnline.mockResolvedValue(true);
    mockOffline.saveCycleLaunchOffline.mockResolvedValue(undefined as any);
    mockService.getProductionUnits.mockResolvedValue(units);
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
      { attempted: true },
    );
    expect(mockOffline.saveNewCycleOffline).not.toHaveBeenCalled();
    expect(getByTestId("newCycleInitialCount").props.value).toBe("1500");
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
});
