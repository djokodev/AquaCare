import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useRef } from "react";
import {
  View,
  ScrollView,
  RefreshControl,
  Alert,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/store/store";
import {
  clearCurrentCycle,
  fetchDashboardData,
  fetchProductionCycles,
  setCurrentCycle,
} from "@/features/aquaculture/store/aquacultureSlice";
import { fetchNotifications } from "@/features/notifications/store/notificationSlice";
import {
  confirmOrderReceipt,
  fetchOrderStatistics,
  fetchOrders,
} from "@/features/commerce/store/commerceSlice";
import { offlineService } from "@/services/offlineService";
import HarvestModal from "@/components/modals/HarvestModal";
import PartialHarvestModal from "@/components/modals/PartialHarvestModal";
import PartialHarvestHistoryModal from "@/components/modals/PartialHarvestHistoryModal";
import DashboardHeader from "../components/DashboardHeader";
import QuickActionsPreview from "../components/QuickActionsPreview";
import QuickActionsSheet from "../components/QuickActionsSheet";
import { CycleDashboard, ProductionCycle } from "@/types/aquaculture";
import { useAuth } from "@/hooks/useAuth";
import { aquacultureService } from "@/features/aquaculture/services/aquacultureService";
import {
  AppText,
  Button,
  Card,
  DashboardHeroCard,
  DashboardMetricCard,
  DashboardSection,
  ErrorState,
  formatDashboardCurrency,
  formatDashboardNumber,
  InlineAlert,
  InteractiveCard,
  LoadingState,
} from "@/components/ui";
import { colors, spacing } from "@/theme";
import { useDashboardSyncStatus } from "@/hooks/useDashboardSyncStatus";
import { dashboardSyncService } from "@/services/dashboardSyncService";

interface DashboardActionCardProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

function DashboardActionCard({
  label,
  onPress,
  disabled = false,
  testID,
}: DashboardActionCardProps) {
  return (
    <InteractiveCard
      testID={testID}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      primaryBorder
      style={styles.actionCard}
    >
      <AppText
        variant="bodyStrong"
        color={disabled ? "muted" : "link"}
        style={styles.actionLabel}
      >
        {label}
      </AppText>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={disabled ? colors.text.muted : colors.brand.primary}
      />
    </InteractiveCard>
  );
}

export default function DashboardScreen({ navigation }: any) {
  const { t, i18n } = useTranslation();
  const { displayName, loadFarmProfile } = useAuth();
  const dispatch = useDispatch<AppDispatch>();

  const [harvestModalVisible, setHarvestModalVisible] = useState(false);
  const [partialHarvestModalVisible, setPartialHarvestModalVisible] =
    useState(false);
  const [
    partialHarvestHistoryModalVisible,
    setPartialHarvestHistoryModalVisible,
  ] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<ProductionCycle | null>(
    null,
  );
  const [actionsSheetVisible, setActionsSheetVisible] = useState(false);
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(
    null,
  );
  const [currentCycleUnitCount, setCurrentCycleUnitCount] = useState<
    number | null
  >(null);
  const [currentCycleDashboard, setCurrentCycleDashboard] =
    useState<CycleDashboard | null>(null);
  const [cycleDashboardLoading, setCycleDashboardLoading] = useState(false);
  const [cycleDashboardRefreshing, setCycleDashboardRefreshing] = useState(false);
  const [cycleDashboardError, setCycleDashboardError] = useState<string | null>(null);
  const cycleDashboardRequestRef = useRef(0);
  const [refreshing, setRefreshing] = useState(false);

  const { dashboardData, cycles, loading, error, currentCycle } = useSelector(
    (state: RootState) => state.aquaculture,
  );
  const { unreadCount } = useSelector(
    (state: RootState) => state.notifications,
  );
  const { items: ordersList } = useSelector(
    (state: RootState) => state.commerce.orders,
  );

  useEffect(() => {
    const initializeDashboard = async () => {
      tryGlobalOfflineSync();
      dispatch(fetchDashboardData(undefined));
      dispatch(fetchProductionCycles());
      dispatch(fetchOrders());
    };

    initializeDashboard();
  }, [dispatch]);

  useEffect(() => {
    dispatch(fetchNotifications({ cycleId: currentCycle?.id }));
  }, [currentCycle?.id, dispatch]);

  // Rafraîchir les notifications à chaque retour sur le dashboard (ex: après création commande)
  useFocusEffect(
    useCallback(() => {
      dispatch(fetchNotifications({ cycleId: currentCycle?.id }));
      dispatch(fetchOrders());
    }, [currentCycle?.id, dispatch]),
  );

  const tryGlobalOfflineSync = async () => {
    try {
      const hasPending = await offlineService.hasAnyPendingSync();
      if (hasPending) {
        const result = await offlineService.syncAllOfflineData();

        if (result.success > 0) {
          dispatch(fetchDashboardData(undefined));
          dispatch(fetchProductionCycles());
        }
      }
    } catch (err) {
      // Sync error handled silently
    }
  };

  const pendingDeliveryConfirmations = useMemo(
    () => ordersList.filter((order) => order.status === "delivered"),
    [ordersList],
  );

  const dashboardCycles = dashboardData?.active_cycles ?? [];
  const availableSessionCycles = useMemo(
    () => cycles.filter((cycle) => cycle.status === "active"),
    [cycles],
  );
  const canSwitchCycle = availableSessionCycles.length > 1;
  const activeCycles = dashboardCycles;
  const currentCycleInList = currentCycle
    ? activeCycles.find((cycle) => cycle.id === currentCycle.id)
    : undefined;
  const primaryActiveCycle = currentCycleInList || activeCycles[0] || null;
  const currentSessionCycle = currentCycle
    ? availableSessionCycles.find((cycle) => cycle.id === currentCycle.id)
    : undefined;
  const sessionCycle =
    currentSessionCycle ??
    availableSessionCycles[0] ??
    dashboardCycles[0] ??
    null;
  const primaryCycleHasProductionUnits = Boolean(
    primaryActiveCycle?.infrastructure_type &&
    primaryActiveCycle.infrastructure_type.length > 0,
  );
  const cycleHasProductionUnits =
    primaryCycleHasProductionUnits || (currentCycleUnitCount ?? 0) > 0;
  const locale = i18n.language?.startsWith("fr") ? "fr-FR" : "en-US";
  const primaryActiveCycleId = primaryActiveCycle?.id ?? null;
  const { lastSyncedAt, refreshLastSyncedAt } =
    useDashboardSyncStatus("cycle", primaryActiveCycleId);
  const loadCurrentCycleDashboard = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    const requestId = cycleDashboardRequestRef.current + 1;
    cycleDashboardRequestRef.current = requestId;

    if (!primaryActiveCycleId) {
      setCurrentCycleDashboard(null);
      setCurrentCycleUnitCount(null);
      setCycleDashboardError(null);
      setCycleDashboardLoading(false);
      setCycleDashboardRefreshing(false);
      return false;
    }

    setCycleDashboardError(null);
    if (mode === "refresh") {
      setCycleDashboardRefreshing(true);
    } else {
      setCycleDashboardLoading(true);
    }

    try {
      const cycleDashboard = await aquacultureService.getCycleDashboard(primaryActiveCycleId);
      if (requestId !== cycleDashboardRequestRef.current) {
        return false;
      }
      setCurrentCycleDashboard(cycleDashboard);
      setCurrentCycleUnitCount(cycleDashboard.summary.total_allocations);
      await dashboardSyncService.markSuccessful("cycle", primaryActiveCycleId);
      await refreshLastSyncedAt();
      return true;
    } catch {
      if (requestId === cycleDashboardRequestRef.current) {
        setCycleDashboardError("cycleDashboardLoadError");
      }
      return false;
    } finally {
      if (requestId === cycleDashboardRequestRef.current) {
        setCycleDashboardLoading(false);
        setCycleDashboardRefreshing(false);
      }
    }
  }, [primaryActiveCycleId, refreshLastSyncedAt]);

  useEffect(() => {
    setCurrentCycleDashboard(null);
    setCurrentCycleUnitCount(null);
    setCycleDashboardError(null);
    void loadCurrentCycleDashboard();
  }, [loadCurrentCycleDashboard, primaryActiveCycleId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([
      loadFarmProfile(),
      dispatch(fetchDashboardData(undefined)),
      loadCurrentCycleDashboard("refresh"),
      dispatch(fetchProductionCycles()),
      dispatch(fetchNotifications({ cycleId: currentCycle?.id })),
      dispatch(fetchOrders()),
    ]).finally(() => {
      setRefreshing(false);
    });
  }, [currentCycle?.id, dispatch, loadCurrentCycleDashboard, loadFarmProfile]);

  const cycleSummary = currentCycleDashboard?.summary;
  const cycleDashboardInitialLoading = Boolean(
    primaryActiveCycleId && !cycleSummary && !cycleDashboardError,
  );

  useEffect(() => {
    if (availableSessionCycles.length === 0) {
      if (currentCycle) {
        dispatch(clearCurrentCycle());
      }
      return;
    }

    if (availableSessionCycles.length === 1) {
      if (currentCycle?.id !== availableSessionCycles[0].id) {
        dispatch(setCurrentCycle(availableSessionCycles[0]));
      }
      return;
    }

    if (!currentCycleInList) {
      dispatch(clearCurrentCycle());
    } else if (currentCycleInList.id !== currentCycle?.id) {
      dispatch(setCurrentCycle(currentCycleInList));
    }
  }, [availableSessionCycles, currentCycle, dispatch]);

  const openCycleHarvestModal = useCallback(() => {
    if (!sessionCycle) {
      return;
    }
    setSelectedCycle(sessionCycle);
    setHarvestModalVisible(true);
  }, [sessionCycle]);

  const openCyclePartialHarvestModal = useCallback(() => {
    if (!sessionCycle) {
      return;
    }
    setSelectedCycle(sessionCycle);
    setPartialHarvestModalVisible(true);
  }, [sessionCycle]);

  const closeHarvestModal = () => {
    setHarvestModalVisible(false);
    setSelectedCycle(null);
  };

  const closePartialHarvestModal = () => {
    setPartialHarvestModalVisible(false);
    setSelectedCycle(null);
  };

  const handleHarvestSuccess = () => {
    dispatch(fetchDashboardData(undefined));
  };

  const handleNotificationsPress = () => {
    navigation.navigate(
      "Notifications",
      currentCycle
        ? {
            cycleId: currentCycle.id,
            cycleName: currentCycle.cycle_name,
          }
        : undefined,
    );
  };

  const handleSettingsPress = () => {
    navigation.navigate("ProfileStack", { screen: "Settings" });
  };

  const handleProductionUnitsPress = () => {
    if (!primaryActiveCycle) {
      return;
    }

    navigation.navigate("ProductionUnitsHub", {
      cycleId: primaryActiveCycle.id,
    });
  };

  const handleStorePress = () => {
    if (!primaryActiveCycle) {
      return;
    }

    navigation.navigate("Store", { cycleId: primaryActiveCycle.id });
  };

  const handleCycleReportPress = () => {
    if (!primaryActiveCycle) {
      return;
    }

    navigation.navigate("Reports", {
      scope: "cycle",
      cycleId: primaryActiveCycle.id,
    });
  };

  const handleConfirmOrderReceipt = (orderId: string, orderNumber: string) => {
    Alert.alert(
      t("confirmReceiptTitle"),
      t("confirmReceiptMessage", { orderNumber }),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("confirm"),
          onPress: async () => {
            try {
              setConfirmingOrderId(orderId);
              await dispatch(confirmOrderReceipt(orderId)).unwrap();
              await Promise.all([
                dispatch(fetchOrders()),
                dispatch(fetchOrderStatistics()),
              ]);
              Alert.alert(t("success"), t("confirmReceiptSuccess"));
            } catch {
              Alert.alert(t("error"), t("confirmReceiptError"));
            } finally {
              setConfirmingOrderId(null);
            }
          },
        },
      ],
    );
  };

  if (error && !dashboardData) {
    return (
      <ScrollView
        className="flex-1 bg-dashboard"
        refreshControl={
          <RefreshControl
            refreshing={refreshing || loading.dashboard || cycleDashboardRefreshing}
            onRefresh={onRefresh}
          />
        }
      >
        <DashboardHeader
          displayName={displayName}
          unreadCount={unreadCount}
          onNotificationsPress={handleNotificationsPress}
          onSettingsPress={handleSettingsPress}
        />

        <ErrorState
          message={error}
          actionLabel={t("retry")}
          onAction={onRefresh}
        />
      </ScrollView>
    );
  }

  return (
    <View style={styles.dashboardRoot}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing || loading.dashboard || cycleDashboardRefreshing}
            onRefresh={onRefresh}
          />
        }
      >
        <DashboardHeader
          displayName={displayName}
          unreadCount={unreadCount}
          onNotificationsPress={handleNotificationsPress}
          onSettingsPress={handleSettingsPress}
        />
        <View style={styles.dashboardSectionContainer}>
          <DashboardSection
            title={t("cycleDashboardTitle")}
            lastSyncedAt={lastSyncedAt}
          >
            {(cycleDashboardLoading || cycleDashboardInitialLoading) && !cycleSummary ? (
              <LoadingState
                message={t("cycleDashboardLoading")}
                compact
              />
            ) : cycleDashboardError && !cycleSummary ? (
              <ErrorState
                message={t(cycleDashboardError)}
                actionLabel={t("retry")}
                onAction={() => void loadCurrentCycleDashboard("refresh")}
              />
            ) : (
              <>
                {cycleDashboardError ? (
                  <InlineAlert tone="error" message={t(cycleDashboardError)} />
                ) : null}
                <DashboardHeroCard
                  label={t("dashboardEstimatedMarketValue")}
                  value={formatDashboardCurrency(
                    cycleSummary?.estimated_market_value_fcfa,
                    locale,
                  )}
                  unit={t("dashboardDirectProductionCostUnit")}
                  helper={
                    cycleSummary?.estimated_market_value_fcfa == null
                      ? cycleSummary?.biomass_data_available === false
                        ? t("dashboardUnitsMissingWeighing", {
                            count: cycleSummary.units_missing_biomass_data_count,
                          })
                        : t("dashboardMissingSellingPrice")
                      : undefined
                  }
                  unavailableLabel={t("dashboardCalculationUnavailable")}
                  progress={cycleSummary?.cycle_progress_pct}
                  progressLabel={t("dashboardCycleProgress")}
                  locale={locale}
                />
                <View style={styles.dashboardGrid}>
                  <DashboardMetricCard
                    label={t("dashboardDirectProductionCost")}
                    value={formatDashboardCurrency(
                      cycleSummary?.direct_production_cost_fcfa,
                      locale,
                    )}
                    unit={t("dashboardDirectProductionCostUnit")}
                    unavailableLabel={t("dashboardDataUnavailable")}
                  />
                  <DashboardMetricCard
                    label={t("currentFish")}
                    value={formatDashboardNumber(
                      cycleSummary?.total_estimated_current_fish_count,
                      locale,
                      { maximumFractionDigits: 0 },
                    )}
                    tone="slate"
                    unavailableLabel={t("dashboardDataUnavailable")}
                  />
                  <DashboardMetricCard
                    label={t("dashboardTimeRemainingCycle")}
                    value={formatDashboardNumber(
                      cycleSummary?.days_remaining,
                      locale,
                      { maximumFractionDigits: 0 },
                    )}
                    unit={t("days")}
                    tone="info"
                    layout="fullWidthCompact"
                    unavailableLabel={t("dashboardDataUnavailable")}
                  />
                </View>
              </>
            )}
          </DashboardSection>
        </View>

        {sessionCycle ? (
          <View className="px-5 pb-1">
            {canSwitchCycle ? (
              <InteractiveCard
                testID="session-active-cycle-card"
                accessibilityLabel={sessionCycle.cycle_name}
                primaryBorder
                onPress={() =>
                  navigation.navigate("CycleSessionEntry", {
                    showBackToDashboard: true,
                  })
                }
                style={styles.sessionCard}
              >
                <View className="flex-1 mr-3">
                  <AppText variant="bodyStrong">
                    {sessionCycle.cycle_name}
                  </AppText>
                  {canSwitchCycle ? (
                    <AppText
                      variant="helper"
                      color="link"
                      style={{ marginTop: 4 }}
                    >
                      {t("changeSessionCycle", {
                        defaultValue: "Changer de cycle",
                      })}
                    </AppText>
                  ) : null}
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={
                    canSwitchCycle ? colors.brand.primary : colors.text.muted
                  }
                />
              </InteractiveCard>
            ) : (
              <Card
                testID="session-active-cycle-card"
                variant="outlined"
                style={[styles.sessionCard, styles.inactiveSessionCard]}
              >
                <AppText variant="bodyStrong" style={styles.sessionName}>
                  {sessionCycle.cycle_name}
                </AppText>
              </Card>
            )}
          </View>
        ) : null}

        {pendingDeliveryConfirmations.length > 0 && (
          <View className="px-5 pb-2">
            <Card variant="elevated" style={{ marginBottom: 8 }}>
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-1 mr-3">
                  <AppText variant="bodyStrong">
                    {t("ordersPendingConfirmationTitle", {
                      count: pendingDeliveryConfirmations.length,
                    })}
                  </AppText>
                  <AppText
                    variant="caption"
                    color="muted"
                    style={{ marginTop: 4 }}
                  >
                    {t("ordersPendingConfirmationDescription")}
                  </AppText>
                </View>
                <Button
                  label={t("ordersHistory")}
                  onPress={() => navigation.navigate("OrdersHistory")}
                  variant="outline"
                  size="small"
                  fullWidth={false}
                />
              </View>

              {pendingDeliveryConfirmations.slice(0, 2).map((order) => {
                const total = Number.parseFloat(order.total || "0");
                const isConfirming = confirmingOrderId === order.id;
                return (
                  <Card
                    key={order.id}
                    variant="outlined"
                    style={{ padding: 12, marginBottom: 8 }}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 mr-3">
                        <AppText variant="label">{order.order_number}</AppText>
                        <AppText
                          variant="caption"
                          color="muted"
                          style={{ marginTop: 4 }}
                        >
                          {Number.isFinite(total)
                            ? `${total.toLocaleString()} FCFA`
                            : order.total}
                        </AppText>
                      </View>
                      <Button
                        label={t("confirmReceiptAction")}
                        size="small"
                        fullWidth={false}
                        loading={isConfirming}
                        onPress={() =>
                          handleConfirmOrderReceipt(
                            order.id,
                            order.order_number,
                          )
                        }
                      />
                    </View>
                  </Card>
                );
              })}
            </Card>
          </View>
        )}

        {!cycleHasProductionUnits ? (
          <QuickActionsPreview
            onOpenSheet={() => setActionsSheetVisible(true)}
            hasActiveCycles={activeCycles.length > 0}
            unreadCount={unreadCount}
            navigation={navigation}
            scope="cycle"
            hideGlobalCycleOperationalActions={cycleHasProductionUnits}
          />
        ) : null}

        {sessionCycle ? (
          <View className="px-5 py-5">
            {primaryActiveCycle && (
              <>
                <DashboardActionCard
                  testID="dashboard-action-production-units"
                  label={t("productionUnitsDashboardCta")}
                  onPress={handleProductionUnitsPress}
                />
                <DashboardActionCard
                  testID="dashboard-action-store"
                  label={t("storeTitle")}
                  onPress={handleStorePress}
                />
                <DashboardActionCard
                  testID="dashboard-action-report"
                  label={t("reportCycleTitle")}
                  onPress={handleCycleReportPress}
                />
                <DashboardActionCard
                  testID="dashboard-action-create-cycle"
                  label={t("createNewCycleDashboardTitle")}
                  onPress={() => navigation.navigate("CreateFarm")}
                />
              </>
            )}
          </View>
        ) : null}

        <HarvestModal
          visible={harvestModalVisible}
          onClose={closeHarvestModal}
          cycle={selectedCycle}
          onSuccess={handleHarvestSuccess}
          onContactBuyer={() => navigation.navigate("Chat")}
          onNextCycle={(cycleId) =>
            navigation.navigate("PostHarvestConsolidation", {
              harvestedCycleId: cycleId,
            })
          }
        />

        <PartialHarvestModal
          visible={partialHarvestModalVisible}
          onClose={closePartialHarvestModal}
          cycle={selectedCycle}
          onSuccess={handleHarvestSuccess}
        />

        <PartialHarvestHistoryModal
          visible={partialHarvestHistoryModalVisible}
          onClose={() => setPartialHarvestHistoryModalVisible(false)}
          cycle={selectedCycle}
        />

        {!cycleHasProductionUnits ? (
          <QuickActionsSheet
            visible={actionsSheetVisible}
            onClose={() => setActionsSheetVisible(false)}
            unreadCount={unreadCount}
            navigation={navigation}
            scope="cycle"
            cycleContext={
              sessionCycle?.id ? { cycleId: sessionCycle.id } : undefined
            }
            onPartialHarvestCycle={
              cycleHasProductionUnits ? undefined : openCyclePartialHarvestModal
            }
            onHarvestCycle={openCycleHarvestModal}
            hideGlobalCycleOperationalActions={cycleHasProductionUnits}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  dashboardRoot: { flex: 1, backgroundColor: colors.surface.dashboard },
  dashboardSectionContainer: { paddingHorizontal: spacing[5], paddingVertical: spacing[5] },
  dashboardGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing[3] },
  sessionCard: { marginBottom: spacing[1] },
  actionCard: {
    marginTop: spacing[3],
  },
  actionLabel: { flex: 1, marginRight: spacing[3] },
  inactiveSessionCard: {
    backgroundColor: colors.surface.disabled,
    borderColor: colors.border.default,
  },
  sessionName: {},
});
