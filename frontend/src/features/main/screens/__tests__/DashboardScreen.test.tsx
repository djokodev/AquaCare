import React from "react";
import { Alert, StyleSheet } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ScrollView } from "react-native";
import { useDispatch, useSelector } from "react-redux";

import DashboardScreen from "../DashboardScreen";
import { ProductionCycle } from "@/types/aquaculture";
import { offlineService } from "@/services/offlineService";
import { aquacultureService } from "@/features/aquaculture/services/aquacultureService";
import {
  fetchDashboardData,
  fetchProductionCycles,
} from "@/features/aquaculture/store/aquacultureSlice";
import { fetchNotifications } from "@/features/notifications/store/notificationSlice";
import { fetchOrders } from "@/features/commerce/store/commerceSlice";
import { colors } from "@/theme";

const mockDispatch = jest.fn();
const mockLoadProfile = jest.fn();

jest.mock("react-redux", () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "cycleDashboardTitle") {
        return "Dashboard du cycle";
      }
      if (key === "productionUnitsCount") {
        return `${options?.count} unités`;
      }
      if (key === "dashboardUnitsMissingWeighing") {
        return options?.count === 1
          ? "1 unité sans pesée"
          : `${options?.count} unités sans pesée`;
      }
      return key;
    },
    i18n: {
      language: "fr",
    },
  }),
  initReactI18next: {
    type: "3rdParty",
    init: jest.fn(),
  },
}));

jest.mock("@/features/aquaculture/store/aquacultureSlice", () => ({
  clearCurrentCycle: jest.fn(() => ({ type: "aquaculture/clearCurrentCycle" })),
  fetchDashboardData: jest.fn(() => ({
    type: "aquaculture/fetchDashboardData",
  })),
  fetchProductionCycles: jest.fn(() => ({
    type: "aquaculture/fetchProductionCycles",
  })),
  setCurrentCycle: jest.fn((cycle: unknown) => ({
    type: "aquaculture/setCurrentCycle",
    payload: cycle,
  })),
}));

jest.mock("@/features/notifications/store/notificationSlice", () => ({
  fetchNotifications: jest.fn((params: unknown) => ({
    type: "notifications/fetch",
    payload: params,
  })),
}));

jest.mock("@/features/commerce/store/commerceSlice", () => ({
  confirmOrderReceipt: jest.fn(),
  fetchOrderStatistics: jest.fn(),
  fetchOrders: jest.fn(() => ({ type: "commerce/fetchOrders" })),
}));

jest.mock("@/features/aquaculture/services/aquacultureService", () => ({
  aquacultureService: {
    getCycleDashboard: jest.fn(),
  },
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    displayName: "Jean Test",
    loadProfile: mockLoadProfile,
    loadFarmProfile: mockLoadProfile,
  }),
}));

jest.mock("@/services/offlineService", () => ({
  offlineService: {
    hasAnyPendingSync: jest.fn(),
    syncAllOfflineData: jest.fn(),
    getOfflineCycleLaunches: jest.fn(),
    syncOfflineCycleLaunches: jest.fn(),
    deletePendingCycleLaunch: jest.fn(),
  },
}));

jest.mock("@/features/main/components/DashboardHeader", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/modals/HarvestModal", () => ({
  __esModule: true,
  default: () => null,
}));

describe("features/main/screens/DashboardScreen", () => {
  const mockUseSelector = useSelector as unknown as jest.Mock;
  const mockOffline = offlineService as jest.Mocked<typeof offlineService>;
  const mockGetCycleDashboard =
    aquacultureService.getCycleDashboard as jest.Mock;
  const mockFetchDashboardData = fetchDashboardData as unknown as jest.Mock;
  const mockFetchProductionCycles = fetchProductionCycles as unknown as jest.Mock;
  const mockFetchNotifications = fetchNotifications as unknown as jest.Mock;
  const mockFetchOrders = fetchOrders as unknown as jest.Mock;
  const navigation = {
    navigate: jest.fn(),
  } as any;

  const cycleA: ProductionCycle = {
    id: "cycle-a",
    farm_profile: "farm-1",
    cycle_name: "Cycle A",
    species: "tilapia",
    pond_identifier: "P1",
    pond_surface_m2: 100,
    start_date: "2026-01-01",
    initial_count: 1000,
    initial_average_weight: 10,
    initial_biomass: 10,
    current_count: 900,
    current_average_weight: 120,
    current_biomass: 108,
    total_feed_consumed: 120,
    survival_rate: 88,
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };

  const cycleB: ProductionCycle = {
    ...cycleA,
    id: "cycle-b",
    cycle_name: "Cycle B",
    pond_identifier: "P2",
  };

  const cycleWithUnits: ProductionCycle = {
    ...cycleA,
    id: "cycle-unit",
    cycle_name: "Cycle Unit",
    pond_identifier: "Bac 1",
    infrastructure_type: ["tank", "pond"],
  };

  const archivedCycle: ProductionCycle = {
    ...cycleA,
    id: "cycle-archived",
    cycle_name: "Archived Cycle",
    status: "harvested",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDispatch.mockImplementation(() => ({
      unwrap: jest.fn().mockResolvedValue({}),
    }));
    mockLoadProfile.mockResolvedValue(undefined);
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    mockOffline.hasAnyPendingSync.mockResolvedValue(false);
    mockOffline.syncAllOfflineData.mockResolvedValue({
      attempted: 0,
      success: 0,
      failed: 0,
      details: {} as any,
    });
    mockOffline.getOfflineCycleLaunches.mockResolvedValue([]);
    mockOffline.syncOfflineCycleLaunches.mockResolvedValue({
      attempted: 0,
      success: 0,
      failed: 0,
      skippedOffline: 0,
      uncertain: 0,
      rejected: 0,
      skippedRejected: 0,
    });
    mockOffline.deletePendingCycleLaunch.mockResolvedValue();
    mockGetCycleDashboard.mockResolvedValue({
      summary: {
        total_allocations: 3,
        total_estimated_current_fish_count: 1800,
        estimated_market_value_fcfa: '302400000.00',
        direct_production_cost_fcfa: '225000.00',
        cycle_progress_pct: 61,
        days_remaining: 70,
      },
    });
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          dashboardData: {
            active_cycles_count: 2,
            total_biomass: 216,
            total_fish_count: 1800,
            average_fcr: 1.8,
            average_survival_rate: 88,
            active_cycles: [cycleA, cycleB],
            recent_logs: [],
            current_feeding_plans: [],
            pending_notifications: [],
          },
          cycles: [cycleA, cycleB, archivedCycle],
          loading: {
            dashboard: false,
            cycles: false,
            logs: false,
            sync: false,
          },
          error: null,
          currentCycle: cycleA,
        },
        notifications: {
          unreadCount: 0,
        },
        commerce: {
          orders: {
            items: [],
            statistics: null,
            loading: false,
            error: null,
          },
        },
      }),
    );
  });

  it("masque la suppression après une tentative réelle de lancement", async () => {
    mockOffline.getOfflineCycleLaunches.mockResolvedValue([{
      id: "launch-1",
      payload: {
        cycle: { cycle_name: "Cycle verrouillé" },
        launch_kind: "additional_cycle",
      },
      attempted: true,
      sync_status: "uncertain",
    } as any]);

    const { getByText, queryByText } = render(
      <DashboardScreen navigation={navigation} />,
    );
    await waitFor(() => expect(getByText("Cycle verrouillé")).toBeTruthy());
    expect(queryByText("delete")).toBeNull();
    expect(queryByText("edit")).toBeNull();
    expect(getByText("retry")).toBeTruthy();
  });

  it("affiche la cause traduite d un rejet sans aucune action dangereuse", async () => {
    mockOffline.getOfflineCycleLaunches.mockResolvedValue([{
      id: "launch-rejected",
      payload: {
        cycle: { cycle_name: "Cycle rejeté" },
        launch_kind: "additional_cycle",
      },
      attempted: true,
      sync_status: "rejected",
      last_error_code: "cycle_launch_unit_already_allocated",
      last_http_status: 409,
    } as any]);

    const { getByText, queryByText } = render(
      <DashboardScreen navigation={navigation} />,
    );
    await waitFor(() => expect(getByText("Cycle rejeté")).toBeTruthy());
    expect(getByText("cycleLaunchRejectedStatus")).toBeTruthy();
    expect(
      getByText(
        "cycleLaunchRejectedCause: cycleLaunchUnitAlreadyAllocated",
      ),
    ).toBeTruthy();
    expect(queryByText("retry")).toBeNull();
    expect(queryByText("edit")).toBeNull();
    expect(queryByText("delete")).toBeNull();
  });

  it("affiche le fallback contrôlé d un code de rejet inconnu", async () => {
    mockOffline.getOfflineCycleLaunches.mockResolvedValue([{
      id: "launch-rejected-unknown",
      payload: {
        cycle: { cycle_name: "Cycle à corriger" },
        launch_kind: "additional_cycle",
      },
      attempted: true,
      sync_status: "rejected",
      last_error_code: "unknown",
      last_error_message: "La configuration doit être corrigée.",
      last_http_status: 400,
    } as any]);

    const { getByText } = render(
      <DashboardScreen navigation={navigation} />,
    );
    await waitFor(() => expect(getByText("Cycle à corriger")).toBeTruthy());
    expect(
      getByText(
        "cycleLaunchRejectedCause: La configuration doit être corrigée.",
      ),
    ).toBeTruthy();
  });

  it("garde édition et suppression pour un lancement pending non tenté", async () => {
    mockOffline.getOfflineCycleLaunches.mockResolvedValue([{
      id: "launch-pending",
      payload: {
        cycle: { cycle_name: "Cycle modifiable" },
        launch_kind: "additional_cycle",
      },
      attempted: false,
      sync_status: "pending",
    } as any]);

    const { getByText } = render(
      <DashboardScreen navigation={navigation} />,
    );
    await waitFor(() => expect(getByText("Cycle modifiable")).toBeTruthy());
    expect(getByText("edit")).toBeTruthy();
    expect(getByText("delete")).toBeTruthy();
    expect(getByText("retry")).toBeTruthy();
  });

  it.each([
    ["uncertain", "cycleLaunchLockedAfterAttempt", true],
    ["rejected", "cycleLaunchRejectedStatus", false],
  ] as const)(
    "attend la sync silencieuse et affiche immédiatement le statut %s",
    async (syncStatus, expectedStatus, retryVisible) => {
      let launches = [{
        id: `launch-${syncStatus}`,
        payload: {
          cycle: { cycle_name: `Cycle ${syncStatus}` },
          launch_kind: "additional_cycle",
        },
        attempted: false,
        sync_status: "pending",
      }] as any[];
      mockOffline.hasAnyPendingSync.mockResolvedValue(true);
      mockOffline.getOfflineCycleLaunches.mockImplementation(async () =>
        launches.map((launch) => ({ ...launch })),
      );
      mockOffline.syncAllOfflineData.mockImplementation(async () => {
        await Promise.resolve();
        launches = [{
          ...launches[0],
          attempted: true,
          sync_status: syncStatus,
          ...(syncStatus === "rejected"
            ? {
                last_error_code: "cycle_launch_unit_already_allocated",
                last_http_status: 409,
              }
            : {}),
        }];
        return {
          attempted: 1,
          success: 0,
          failed: 1,
          uncertain: syncStatus === "uncertain" ? 1 : 0,
          rejected: syncStatus === "rejected" ? 1 : 0,
          details: {} as any,
        };
      });

      const { getByText, queryByText } = render(
        <DashboardScreen navigation={navigation} />,
      );

      await waitFor(() => expect(getByText(expectedStatus)).toBeTruthy());
      expect(queryByText("edit")).toBeNull();
      expect(queryByText("delete")).toBeNull();
      if (retryVisible) {
        expect(getByText("retry")).toBeTruthy();
      } else {
        expect(queryByText("retry")).toBeNull();
        expect(
          getByText(
            "cycleLaunchRejectedCause: cycleLaunchUnitAlreadyAllocated",
          ),
        ).toBeTruthy();
      }
    },
  );

  it("ne mute pas artificiellement un pending lorsque la sync est sautée offline", async () => {
    const pendingLaunch = {
      id: "launch-offline",
      payload: {
        cycle: { cycle_name: "Cycle toujours modifiable" },
        launch_kind: "additional_cycle",
      },
      attempted: false,
      sync_status: "pending",
    } as any;
    mockOffline.hasAnyPendingSync.mockResolvedValue(true);
    mockOffline.getOfflineCycleLaunches.mockResolvedValue([pendingLaunch]);
    mockOffline.syncAllOfflineData.mockResolvedValue({
      attempted: 0,
      success: 0,
      failed: 0,
      skippedOffline: 1,
      details: {} as any,
    });

    const { getByText } = render(
      <DashboardScreen navigation={navigation} />,
    );

    await waitFor(() =>
      expect(getByText("Cycle toujours modifiable")).toBeTruthy(),
    );
    expect(getByText("edit")).toBeTruthy();
    expect(getByText("delete")).toBeTruthy();
    expect(mockOffline.getOfflineCycleLaunches).toHaveBeenCalledTimes(2);
  });

  it("rafraîchit les données serveur et retire une carte synchronisée", async () => {
    let launches = [{
      id: "launch-synced",
      payload: {
        cycle: { cycle_name: "Cycle synchronisé" },
        launch_kind: "additional_cycle",
      },
      attempted: false,
      sync_status: "pending",
    }] as any[];
    mockOffline.hasAnyPendingSync.mockResolvedValue(true);
    mockOffline.getOfflineCycleLaunches.mockImplementation(async () =>
      launches.map((launch) => ({ ...launch })),
    );
    mockOffline.syncAllOfflineData.mockImplementation(async () => {
      launches = [{
        ...launches[0],
        attempted: true,
        sync_status: "synced",
        response: { productionCycle: cycleB },
      }];
      return {
        attempted: 1,
        success: 1,
        failed: 0,
        details: {} as any,
      };
    });

    const { queryByText } = render(
      <DashboardScreen navigation={navigation} />,
    );

    await waitFor(() => {
      expect(mockLoadProfile).toHaveBeenCalled();
      expect(mockFetchDashboardData).toHaveBeenCalledWith(undefined);
      expect(mockFetchProductionCycles).toHaveBeenCalled();
    });
    expect(queryByText("Cycle synchronisé")).toBeNull();
  });

  it.each(["uncertain", "rejected"] as const)(
    "recharge la carte après un Retry qui finit en %s sans succès",
    async (syncStatus) => {
      let launches = [{
        id: `manual-${syncStatus}`,
        payload: {
          cycle: { cycle_name: `Retry ${syncStatus}` },
          launch_kind: "additional_cycle",
        },
        attempted: false,
        sync_status: "pending",
      }] as any[];
      mockOffline.getOfflineCycleLaunches.mockImplementation(async () =>
        launches.map((launch) => ({ ...launch })),
      );
      mockOffline.syncOfflineCycleLaunches.mockImplementation(async () => {
        launches = [{
          ...launches[0],
          attempted: true,
          sync_status: syncStatus,
          ...(syncStatus === "rejected"
            ? { last_error_code: "validation_error", last_http_status: 400 }
            : {}),
        }];
        return {
          attempted: 1,
          success: 0,
          failed: 1,
          skippedOffline: 0,
          uncertain: syncStatus === "uncertain" ? 1 : 0,
          rejected: syncStatus === "rejected" ? 1 : 0,
          skippedRejected: 0,
        };
      });

      const screen = render(<DashboardScreen navigation={navigation} />);
      await waitFor(() =>
        expect(screen.getByText(`Retry ${syncStatus}`)).toBeTruthy(),
      );
      fireEvent.press(screen.getByText("retry"));

      await waitFor(() => {
        expect(screen.queryByText("edit")).toBeNull();
        expect(screen.queryByText("delete")).toBeNull();
      });
      if (syncStatus === "rejected") {
        expect(screen.queryByText("retry")).toBeNull();
      } else {
        expect(screen.getByText("cycleLaunchLockedAfterAttempt")).toBeTruthy();
      }
    },
  );

  it("garde le sélecteur disponible quand le dashboard est scoped mais deux cycles sont actifs", async () => {
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          dashboardData: { ...({ active_cycles: [cycleA] } as any) },
          cycles: [cycleA, cycleB, archivedCycle],
          loading: {
            dashboard: false,
            cycles: false,
            logs: false,
            sync: false,
          },
          error: null,
          currentCycle: cycleA,
        },
        notifications: { unreadCount: 0 },
        commerce: {
          orders: { items: [], statistics: null, loading: false, error: null },
        },
      }),
    );

    const { getByTestId, getByText } = render(
      <DashboardScreen navigation={navigation} />,
    );
    expect(getByText("changeSessionCycle")).toBeTruthy();
    fireEvent.press(getByTestId("session-active-cycle-card"));
    expect(navigation.navigate).toHaveBeenCalledWith("CycleSessionEntry", {
      showBackToDashboard: true,
    });
  });

  it("rend les quatre actions du dashboard avec une surface interactive bordée", () => {
    const { getByTestId } = render(
      <DashboardScreen navigation={navigation} />,
    );

    [
      "dashboard-action-production-units",
      "dashboard-action-store",
      "dashboard-action-report",
      "dashboard-action-create-cycle",
    ].forEach((testID) => {
      const style = StyleSheet.flatten(
        getByTestId(`${testID}-surface`).props.style,
      );

      expect(style.borderWidth).toBe(1);
      expect(style.borderColor).toBe(colors.brand.primary);
      expect(style.backgroundColor).toBe(colors.surface.card);
      expect(style.flexDirection).toBe("row");
      expect(style.alignItems).toBe("center");
      expect(style.justifyContent).toBe("space-between");
      expect(style.minHeight).toBeGreaterThanOrEqual(56);
    });
  });

  it("permet de rouvrir le selecteur de cycle depuis le dashboard", async () => {
    const { getByText, queryByText } = render(
      <DashboardScreen navigation={navigation} />,
    );

    expect(getByText("Dashboard du cycle")).toBeTruthy();
    await waitFor(() => {
      expect(getByText("dashboardEstimatedMarketValue")).toBeTruthy();
      expect(getByText("currentFish")).toBeTruthy();
      expect(getByText("dashboardTimeRemainingCycle")).toBeTruthy();
      expect(getByText("dashboardDirectProductionCost")).toBeTruthy();
    });
    expect(queryByText("sessionActiveCycleLabel")).toBeNull();
    expect(getByText("Cycle A")).toBeTruthy();
    expect(queryByText("Cycle A #1")).toBeNull();
    expect(queryByText("Cycle B #2")).toBeNull();
    await waitFor(() => {
      expect(getByText("storeTitle")).toBeTruthy();
      expect(getByText("createNewCycleDashboardTitle")).toBeTruthy();
      expect(queryByText("storeDashboardSubtitle")).toBeNull();
    });

    fireEvent.press(getByText("storeTitle"));
    expect(navigation.navigate).toHaveBeenCalledWith("Store", {
      cycleId: cycleA.id,
    });

    fireEvent.press(getByText("changeSessionCycle"));
    expect(navigation.navigate).toHaveBeenCalledWith("CycleSessionEntry", {
      showBackToDashboard: true,
    });
  });

  it("desactive la session active quand un seul cycle est disponible", async () => {
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          dashboardData: {
            active_cycles_count: 1,
            total_biomass: 216,
            total_fish_count: 1800,
            average_fcr: 1.8,
            average_survival_rate: 88,
            active_cycles: [cycleA],
            recent_logs: [],
            current_feeding_plans: [],
            pending_notifications: [],
          },
          cycles: [cycleA, archivedCycle],
          loading: {
            dashboard: false,
            cycles: false,
            logs: false,
            sync: false,
          },
          error: null,
          currentCycle: cycleA,
        },
        notifications: {
          unreadCount: 0,
        },
        commerce: {
          orders: {
            items: [],
            statistics: null,
            loading: false,
            error: null,
          },
        },
      }),
    );

    const { getByTestId, getByText, queryByText } = render(
      <DashboardScreen navigation={navigation} />,
    );

    const sessionCard = getByTestId("session-active-cycle-card");

    expect(queryByText("sessionActiveCycleLabel")).toBeNull();
    expect(getByText("Cycle A")).toBeTruthy();
    expect(queryByText("changeSessionCycle")).toBeNull();

    fireEvent.press(sessionCard);

    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it("rafraichit aussi le profil ferme lors du pull-to-refresh", async () => {
    const { UNSAFE_getByType } = render(
      <DashboardScreen navigation={navigation} />,
    );

    await waitFor(() =>
      expect(mockFetchProductionCycles).toHaveBeenCalled(),
    );
    mockLoadProfile.mockClear();
    mockFetchDashboardData.mockClear();
    mockFetchProductionCycles.mockClear();
    mockFetchNotifications.mockClear();
    mockFetchOrders.mockClear();

    const scrollView = UNSAFE_getByType(ScrollView);

    await act(async () => {
      scrollView.props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(mockLoadProfile).toHaveBeenCalledTimes(1);
    });

    expect(mockLoadProfile).toHaveBeenCalledTimes(1);
    expect(mockFetchDashboardData).toHaveBeenCalledWith(undefined);
    expect(mockFetchProductionCycles).toHaveBeenCalledTimes(1);
    expect(mockFetchNotifications).toHaveBeenCalledWith({
      cycleId: cycleA.id,
    });
    expect(mockFetchOrders).toHaveBeenCalled();
  });

  it("ouvre le flux de creation de cycle depuis le dashboard", async () => {
    const { getByText } = render(<DashboardScreen navigation={navigation} />);

    await waitFor(() => {
      expect(getByText("createNewCycleDashboardTitle")).toBeTruthy();
    });

    fireEvent.press(getByText("createNewCycleDashboardTitle"));

    expect(navigation.navigate).toHaveBeenCalledWith("CreateFarm");
  });

  it("affiche un CTA vers les unites en production pour le cycle actif", async () => {
    const { getByText } = render(<DashboardScreen navigation={navigation} />);

    expect(getByText("productionUnitsDashboardCta")).toBeTruthy();

    fireEvent.press(getByText("productionUnitsDashboardCta"));

    expect(navigation.navigate).toHaveBeenCalledWith("ProductionUnitsHub", {
      cycleId: cycleA.id,
    });
  });

  it("masque les actions operationnelles pour un cycle avec unites", async () => {
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          dashboardData: {
            active_cycles_count: 1,
            total_biomass: 450,
            total_fish_count: 2700,
            average_fcr: 1.8,
            average_survival_rate: 88,
            active_cycles: [cycleWithUnits],
            recent_logs: [],
            current_feeding_plans: [],
            pending_notifications: [],
          },
          cycles: [cycleWithUnits, archivedCycle],
          loading: {
            dashboard: false,
            cycles: false,
            logs: false,
            sync: false,
          },
          error: null,
          currentCycle: cycleWithUnits,
        },
        notifications: {
          unreadCount: 0,
        },
        commerce: {
          orders: {
            items: [],
            statistics: null,
            loading: false,
            error: null,
          },
        },
      }),
    );

    const { getByText, queryByText } = render(
      <DashboardScreen navigation={navigation} />,
    );

    await waitFor(() => {
      expect(getByText("Dashboard du cycle")).toBeTruthy();
      expect(getByText("dashboardEstimatedMarketValue")).toBeTruthy();
      expect(getByText("dashboardDirectProductionCost")).toBeTruthy();
      expect(getByText("currentFish")).toBeTruthy();
      expect(getByText("dashboardTimeRemainingCycle")).toBeTruthy();
      expect(queryByText("sessionActiveCycleLabel")).toBeNull();
      expect(getByText("Cycle Unit")).toBeTruthy();
      expect(getByText("productionUnitsDashboardCta")).toBeTruthy();
      expect(getByText("reportCycleTitle")).toBeTruthy();
      expect(getByText("storeTitle")).toBeTruthy();
      expect(queryByText("viewAllActions")).toBeNull();
      expect(queryByText("storeDashboardSubtitle")).toBeNull();
    });

    fireEvent.press(getByText("reportCycleTitle"));
    expect(navigation.navigate).toHaveBeenCalledWith("Reports", {
      scope: "cycle",
      cycleId: cycleWithUnits.id,
    });

    expect(mockGetCycleDashboard).toHaveBeenCalledWith("cycle-unit");
  });

  it.each([
    [1, "1 unité sans pesée"],
    [2, "2 unités sans pesée"],
  ])("affiche le compteur de pesées manquantes pour %p unité(s)", async (count, expected) => {
    mockGetCycleDashboard.mockResolvedValueOnce({
      summary: {
        total_allocations: 3,
        total_estimated_current_fish_count: 2700,
        estimated_market_value_fcfa: null,
        estimated_current_biomass_kg: null,
        biomass_data_available: false,
        units_missing_biomass_data_count: count,
        direct_production_cost_fcfa: '225000.00',
        cycle_progress_pct: 61,
        days_remaining: 70,
      },
    });

    const { getByText } = render(<DashboardScreen navigation={navigation} />);

    await waitFor(() => expect(getByText(expected)).toBeTruthy());
    expect(getByText('2\u202f700')).toBeTruthy();
  });

  it("priorise le prix manquant lorsque toutes les biomasses sont disponibles", async () => {
    mockGetCycleDashboard.mockResolvedValueOnce({
      summary: {
        total_allocations: 3,
        total_estimated_current_fish_count: 2700,
        estimated_market_value_fcfa: null,
        estimated_current_biomass_kg: '120.00',
        biomass_data_available: true,
        units_missing_biomass_data_count: 0,
        direct_production_cost_fcfa: '225000.00',
        cycle_progress_pct: 61,
        days_remaining: 70,
      },
    });

    const { getByText, queryByText } = render(<DashboardScreen navigation={navigation} />);
    await waitFor(() => expect(getByText('dashboardMissingSellingPrice')).toBeTruthy());
    expect(queryByText('1 unité sans pesée')).toBeNull();
  });
});
