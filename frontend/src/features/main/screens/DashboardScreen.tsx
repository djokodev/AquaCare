import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store/store';
import {
  clearCurrentCycle,
  fetchDashboardData,
  fetchProductionCycles,
  setCurrentCycle,
} from '@/features/aquaculture/store/aquacultureSlice';
import { fetchNotifications } from '@/features/notifications/store/notificationSlice';
import {
  confirmOrderReceipt,
  fetchOrderStatistics,
  fetchOrders,
} from '@/features/commerce/store/commerceSlice';
import { offlineService } from '@/services/offlineService';
import HarvestModal from '@/components/modals/HarvestModal';
import PartialHarvestModal from '@/components/modals/PartialHarvestModal';
import PartialHarvestHistoryModal from '@/components/modals/PartialHarvestHistoryModal';
import DashboardHeader from '../components/DashboardHeader';
import QuickActionsPreview from '../components/QuickActionsPreview';
import QuickActionsSheet from '../components/QuickActionsSheet';
import { ProductionCycle } from '@/types/aquaculture';
import { AQUACARE_COLORS } from '@/constants/colors';
import { formatNumber, formatCurrency } from '@/utils';
import { useAuth } from '@/hooks/useAuth';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';

import MetricCard from '../components/MetricCard';
import { AppText, Button, Card, ErrorState, LoadingState } from '@/components/ui';
import {
  calculateDashboardBusinessMetrics,
} from '../utils/dashboardCalculations';

export default function DashboardScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { displayName, loadFarmProfile } = useAuth();
  const dispatch = useDispatch<AppDispatch>();

  const [harvestModalVisible, setHarvestModalVisible] = useState(false);
  const [partialHarvestModalVisible, setPartialHarvestModalVisible] = useState(false);
  const [partialHarvestHistoryModalVisible, setPartialHarvestHistoryModalVisible] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<ProductionCycle | null>(null);
  const [actionsSheetVisible, setActionsSheetVisible] = useState(false);
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const [currentCycleUnitCount, setCurrentCycleUnitCount] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { dashboardData, loading, error, currentCycle } = useSelector(
    (state: RootState) => state.aquaculture
  );
  const { unreadCount } = useSelector((state: RootState) => state.notifications);
  const { items: ordersList } = useSelector((state: RootState) => state.commerce.orders);

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
    }, [currentCycle?.id, dispatch])
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
    () => ordersList.filter((order) => order.status === 'delivered'),
    [ordersList]
  );

  const activeCycles = dashboardData?.active_cycles || [];
  const canSwitchCycle = activeCycles.length > 1;
  const currentCycleInList = currentCycle
    ? activeCycles.find((cycle) => cycle.id === currentCycle.id)
    : undefined;
  const primaryActiveCycle = currentCycleInList || activeCycles[0] || null;
  const sessionCycle = currentCycleInList || primaryActiveCycle;
  const primaryCycleHasProductionUnits = Boolean(
    primaryActiveCycle?.infrastructure_type && primaryActiveCycle.infrastructure_type.length > 0
  );
  const cycleHasProductionUnits = primaryCycleHasProductionUnits || (currentCycleUnitCount ?? 0) > 0;
  const dashboardBusinessMetrics = useMemo(
    () => calculateDashboardBusinessMetrics(activeCycles, currentCycleInList),
    [activeCycles, currentCycleInList]
  );
  useEffect(() => {
    let cancelled = false;
    setCurrentCycleUnitCount(null);

    const loadCurrentCycleUnitCount = async () => {
      if (!primaryActiveCycle) {
        return;
      }

      try {
        const cycleDashboard = await aquacultureService.getCycleDashboard(primaryActiveCycle.id);

        if (!cancelled) {
          setCurrentCycleUnitCount(cycleDashboard.summary.total_allocations);
        }
      } catch {
        if (!cancelled) {
          setCurrentCycleUnitCount(null);
        }
      }
    };

    void loadCurrentCycleUnitCount();

    return () => {
      cancelled = true;
    };
  }, [primaryActiveCycle?.id]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([
      loadFarmProfile(),
      dispatch(fetchDashboardData(undefined)),
      dispatch(fetchNotifications({ cycleId: currentCycle?.id })),
      dispatch(fetchOrders()),
    ]).finally(() => {
      setRefreshing(false);
    });
  }, [currentCycle?.id, dispatch, loadFarmProfile]);

  const dashboardMetricCards = useMemo(() => {
    if (primaryCycleHasProductionUnits) {
      return [
        {
          value: formatCurrency(dashboardBusinessMetrics.estimatedMarketValueFcfa),
          label: t('dashboardEstimatedMarketValue'),
        },
        {
          value: formatCurrency(dashboardBusinessMetrics.directProductionCostFcfa),
          label: t('dashboardDirectProductionCost'),
        },
        {
          value: formatNumber(dashboardData?.total_fish_count ?? 0, undefined, 0),
          label: t('dashboardEstimatedCurrentFish'),
        },
        {
          value:
            dashboardBusinessMetrics.timeRemainingDays === null
              ? '-'
              : formatNumber(dashboardBusinessMetrics.timeRemainingDays, t('days'), 0),
          label: t('dashboardTimeRemainingCycle'),
        },
      ];
    }

    return [
        {
          value: formatCurrency(dashboardBusinessMetrics.estimatedMarketValueFcfa),
          label: t('dashboardEstimatedMarketValue'),
        },
        {
          value: formatCurrency(dashboardBusinessMetrics.feedCostConsumedFcfa),
          label: t('dashboardFeedCostConsumed'),
        },
        {
          value:
            dashboardBusinessMetrics.timeRemainingDays === null
              ? '-'
              : formatNumber(dashboardBusinessMetrics.timeRemainingDays, t('days'), 0),
          label: t('dashboardTimeRemainingCycle'),
        },
        {
          value: formatCurrency(dashboardBusinessMetrics.directProductionCostFcfa),
          label: t('dashboardDirectProductionCost'),
        },
      ];
  }, [dashboardBusinessMetrics, dashboardData?.total_fish_count, primaryCycleHasProductionUnits, t]);

  useEffect(() => {
    if (activeCycles.length === 0) {
      if (currentCycle) {
        dispatch(clearCurrentCycle());
      }
      return;
    }

    if (activeCycles.length === 1) {
      if (currentCycle?.id !== activeCycles[0].id) {
        dispatch(setCurrentCycle(activeCycles[0]));
      }
      return;
    }

    if (!currentCycleInList) {
      dispatch(clearCurrentCycle());
    } else if (currentCycleInList.id !== currentCycle?.id) {
      dispatch(setCurrentCycle(currentCycleInList));
    }
  }, [activeCycles, currentCycle, currentCycleInList, dispatch]);

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
      'Notifications',
      currentCycle
        ? {
            cycleId: currentCycle.id,
            cycleName: currentCycle.cycle_name,
          }
        : undefined
    );
  };

  const handleSettingsPress = () => {
    navigation.navigate('ProfileStack', { screen: 'Settings' });
  };

  const handleProductionUnitsPress = () => {
    if (!primaryActiveCycle) {
      return;
    }

    navigation.navigate('ProductionUnitsHub', { cycleId: primaryActiveCycle.id });
  };

  const handleStorePress = () => {
    if (!primaryActiveCycle) {
      return;
    }

    navigation.navigate('Store', { cycleId: primaryActiveCycle.id });
  };

  const handleCycleReportPress = () => {
    if (!primaryActiveCycle) {
      return;
    }

    navigation.navigate('Reports', {
      scope: 'cycle',
      cycleId: primaryActiveCycle.id,
    });
  };

  const handleConfirmOrderReceipt = (orderId: string, orderNumber: string) => {
    Alert.alert(
      t('confirmReceiptTitle'),
      t('confirmReceiptMessage', { orderNumber }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            try {
              setConfirmingOrderId(orderId);
              await dispatch(confirmOrderReceipt(orderId)).unwrap();
              await Promise.all([
                dispatch(fetchOrders()),
                dispatch(fetchOrderStatistics()),
              ]);
              Alert.alert(t('success'), t('confirmReceiptSuccess'));
            } catch {
              Alert.alert(t('error'), t('confirmReceiptError'));
            } finally {
              setConfirmingOrderId(null);
            }
          },
        },
      ]
    );
  };

  if (error && !dashboardData) {
    return (
      <ScrollView
        className="flex-1 bg-cream"
        refreshControl={
          <RefreshControl refreshing={refreshing || loading.dashboard} onRefresh={onRefresh} />
        }
      >
        <DashboardHeader
          displayName={displayName}
          unreadCount={unreadCount}
          onNotificationsPress={handleNotificationsPress}
          onSettingsPress={handleSettingsPress}
        />

        <ErrorState message={error} actionLabel={t('retry')} onAction={onRefresh} />
      </ScrollView>
    );
  }

  return (
    <View className="flex-1 bg-cream">
      {/* Header Sticky - Outside ScrollView */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
        }}
      >
        <DashboardHeader
          displayName={displayName}
          unreadCount={unreadCount}
          onNotificationsPress={handleNotificationsPress}
          onSettingsPress={handleSettingsPress}
        />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing || loading.dashboard} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingTop: 140 }}
      >

      <View className="px-5 py-5">
        <Card variant="outlined" style={{ marginBottom: 16 }}>
          <AppText variant="cardTitle" style={{ marginBottom: 12 }}>
            {t('cycleDashboardTitle')}
          </AppText>
          {loading.dashboard && !dashboardData ? (
            <LoadingState message={t('loadingData', { defaultValue: 'Chargement des données...' })} compact />
          ) : (
            <View className="flex-row flex-wrap gap-3">
              {dashboardMetricCards.map((card) => (
                <MetricCard
                  key={card.label}
                  value={card.value}
                  label={card.label}
                />
              ))}
            </View>
          )}
        </Card>
      </View>

      {sessionCycle ? (
        <View className="px-5 pb-1">
          <TouchableOpacity
            testID="session-active-cycle-card"
            className={`bg-white rounded-xl p-4 border border-aquacare-primary flex-row items-center justify-between shadow-sm ${
              canSwitchCycle ? '' : 'opacity-70'
            }`}
            disabled={!canSwitchCycle}
            onPress={
              canSwitchCycle
                ? () => navigation.navigate('CycleSessionEntry', { showBackToDashboard: true })
                : undefined
            }
          >
            <View className="flex-1 mr-3">
              <AppText
                className={`text-xs font-semibold uppercase tracking-wide ${
                  canSwitchCycle ? 'text-gray-light' : 'text-gray-light/80'
                }`}
              >
                {t('sessionActiveCycleLabel')}
              </AppText>
              <AppText variant="bodyStrong" style={{ marginTop: 4 }}>
                {sessionCycle.cycle_name}
              </AppText>
              {canSwitchCycle ? (
                <AppText variant="helper" color="link" style={{ marginTop: 4 }}>
                  {t('changeSessionCycle', { defaultValue: 'Changer de cycle' })}
                </AppText>
              ) : null}
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={canSwitchCycle ? AQUACARE_COLORS.GREEN_PRIMARY : AQUACARE_COLORS.GRAY_LIGHT}
            />
          </TouchableOpacity>
        </View>
      ) : null}

      {pendingDeliveryConfirmations.length > 0 && (
        <View className="px-5 pb-2">
          <Card variant="elevated" style={{ marginBottom: 8 }}>
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-1 mr-3">
                <AppText variant="bodyStrong">
                  {t('ordersPendingConfirmationTitle', { count: pendingDeliveryConfirmations.length })}
                </AppText>
                <AppText variant="caption" color="muted" style={{ marginTop: 4 }}>
                  {t('ordersPendingConfirmationDescription')}
                </AppText>
              </View>
              <Button
                label={t('ordersHistory')}
                onPress={() => navigation.navigate('OrdersHistory')}
                variant="outline"
                size="small"
                fullWidth={false}
              />
            </View>

            {pendingDeliveryConfirmations.slice(0, 2).map((order) => {
              const total = Number.parseFloat(order.total || '0');
              const isConfirming = confirmingOrderId === order.id;
              return (
                <Card key={order.id} variant="outlined" style={{ padding: 12, marginBottom: 8 }}>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
                      <AppText variant="label">{order.order_number}</AppText>
                      <AppText variant="caption" color="muted" style={{ marginTop: 4 }}>
                        {Number.isFinite(total) ? `${total.toLocaleString()} FCFA` : order.total}
                      </AppText>
                    </View>
                    <Button
                      label={t('confirmReceiptAction')}
                      size="small"
                      fullWidth={false}
                      loading={isConfirming}
                      onPress={() => handleConfirmOrderReceipt(order.id, order.order_number)}
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
              <TouchableOpacity
                className="mt-2 bg-white rounded-xl p-4 border border-aquacare-primary flex-row items-center justify-between"
                onPress={handleProductionUnitsPress}
              >
                <AppText variant="bodyStrong" color="link" style={{ flex: 1, marginRight: 12 }}>
                  {t('productionUnitsDashboardCta')}
                </AppText>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={AQUACARE_COLORS.GREEN_PRIMARY}
                />
              </TouchableOpacity>

              <TouchableOpacity
                className="mt-3 bg-white rounded-xl p-4 border border-aquacare-primary flex-row items-center justify-between"
                onPress={handleStorePress}
              >
                <AppText variant="bodyStrong" color="link" style={{ flex: 1, marginRight: 12 }}>
                  {t('storeTitle')}
                </AppText>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={AQUACARE_COLORS.GREEN_PRIMARY}
                />
              </TouchableOpacity>

              <TouchableOpacity
                className="mt-3 bg-white rounded-xl p-4 border border-aquacare-primary flex-row items-center justify-between"
                onPress={handleCycleReportPress}
              >
                <AppText variant="bodyStrong" color="link" style={{ flex: 1, marginRight: 12 }}>
                  {t('reportCycleTitle')}
                </AppText>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={AQUACARE_COLORS.GREEN_PRIMARY}
                />
              </TouchableOpacity>

              <TouchableOpacity
                className="mt-3 bg-white rounded-xl p-4 border border-aquacare-primary flex-row items-center justify-between"
                onPress={() => navigation.navigate('CreateFarm')}
              >
                <AppText variant="bodyStrong" color="link" style={{ flex: 1, marginRight: 12 }}>
                  {t('createNewCycleDashboardTitle')}
                </AppText>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={AQUACARE_COLORS.GREEN_PRIMARY}
                />
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : null}

      <HarvestModal
        visible={harvestModalVisible}
        onClose={closeHarvestModal}
        cycle={selectedCycle}
        onSuccess={handleHarvestSuccess}
        onContactBuyer={() => navigation.navigate('Chat')}
        onNextCycle={(cycleId) => navigation.navigate('PostHarvestConsolidation', { harvestedCycleId: cycleId })}
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
          cycleContext={sessionCycle?.id ? { cycleId: sessionCycle.id } : undefined}
          onPartialHarvestCycle={cycleHasProductionUnits ? undefined : openCyclePartialHarvestModal}
          onHarvestCycle={openCycleHarvestModal}
          hideGlobalCycleOperationalActions={cycleHasProductionUnits}
        />
      ) : null}
      </ScrollView>
    </View>
  );
}
