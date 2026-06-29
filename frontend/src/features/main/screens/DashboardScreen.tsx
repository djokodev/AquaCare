import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store/store';
import {
  clearCurrentCycle,
  fetchDashboardData,
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
import CyclePicker from '@/features/aquaculture/components/CyclePicker';
import DashboardHeader from '../components/DashboardHeader';
import QuickActionsPreview from '../components/QuickActionsPreview';
import QuickActionsSheet from '../components/QuickActionsSheet';
import { ProductionCycle } from '@/types/aquaculture';
import { AQUACARE_COLORS } from '@/constants/colors';
import { formatNumber, formatPercentage, formatCurrency } from '@/utils';
import { useAuth } from '@/hooks/useAuth';

import MetricCard from '../components/MetricCard';
import {
  calculateCycleEstimatedMarketValue,
  calculateDashboardBusinessMetrics,
} from '../utils/dashboardCalculations';

export default function DashboardScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { displayName } = useAuth();
  const dispatch = useDispatch<AppDispatch>();

  const [harvestModalVisible, setHarvestModalVisible] = useState(false);
  const [partialHarvestModalVisible, setPartialHarvestModalVisible] = useState(false);
  const [partialHarvestHistoryModalVisible, setPartialHarvestHistoryModalVisible] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<ProductionCycle | null>(null);
  const [actionsSheetVisible, setActionsSheetVisible] = useState(false);
  const [cycleSwitchModalVisible, setCycleSwitchModalVisible] = useState(false);
  const [pendingCycleId, setPendingCycleId] = useState<string | null>(null);
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);

  const { dashboardData, loading, error, currentCycle } = useSelector(
    (state: RootState) => state.aquaculture
  );
  const { unreadCount } = useSelector((state: RootState) => state.notifications);
  const { items: ordersList } = useSelector((state: RootState) => state.commerce.orders);

  useEffect(() => {
    const initializeDashboard = async () => {
      tryGlobalOfflineSync();
      dispatch(fetchDashboardData(undefined));
      dispatch(fetchNotifications());
      dispatch(fetchOrders());
    };

    initializeDashboard();
  }, [dispatch]);

  // Rafraîchir les notifications à chaque retour sur le dashboard (ex: après création commande)
  useFocusEffect(
    useCallback(() => {
      dispatch(fetchNotifications());
      dispatch(fetchOrders());
    }, [dispatch])
  );

  const tryGlobalOfflineSync = async () => {
    try {
      const hasPending = await offlineService.hasAnyPendingSync();
      if (hasPending) {
        const result = await offlineService.syncAllOfflineData();

        if (result.success > 0) {
          dispatch(fetchDashboardData(undefined));
        }
      }
    } catch (err) {
      // Sync error handled silently
    }
  };

  const onRefresh = useCallback(() => {
    dispatch(fetchDashboardData(undefined));
    dispatch(fetchNotifications());
    dispatch(fetchOrders());
  }, [dispatch]);

  const pendingDeliveryConfirmations = useMemo(
    () => ordersList.filter((order) => order.status === 'delivered'),
    [ordersList]
  );

  const activeCycles = dashboardData?.active_cycles || [];
  const currentCycleInList = currentCycle
    ? activeCycles.find((cycle) => cycle.id === currentCycle.id)
    : undefined;
  const primaryActiveCycle = currentCycleInList || activeCycles[0] || null;
  const primaryCycleHasProductionUnits = Boolean(
    primaryActiveCycle?.infrastructure_type && primaryActiveCycle.infrastructure_type.length > 0
  );
  const dashboardBusinessMetrics = useMemo(
    () => calculateDashboardBusinessMetrics(activeCycles, currentCycleInList),
    [activeCycles, currentCycleInList]
  );
  const requiresCycleSelection = activeCycles.length > 1 && !currentCycleInList;
  const cycleCards = useMemo(
    () =>
      activeCycles.map((cycle) => ({
        ...cycle,
        unitCount: Array.isArray(cycle.infrastructure_type) ? cycle.infrastructure_type.length : 0,
        cycleAgeDays: Math.floor(
          (Date.now() - new Date(cycle.start_date).getTime()) / (1000 * 60 * 60 * 24)
        ),
        estimatedMarketValueFcfa: calculateCycleEstimatedMarketValue(cycle),
      })),
    [activeCycles]
  );
  const dashboardMetricCards = useMemo(() => {
    if (primaryCycleHasProductionUnits) {
      return [
        {
          icon: 'cash-outline' as const,
          color: AQUACARE_COLORS.GREEN_PRIMARY,
          value: formatCurrency(dashboardBusinessMetrics.estimatedMarketValueFcfa),
          label: t('dashboardEstimatedMarketValue'),
          animationType: 'pulse' as const,
        },
        {
          icon: 'calculator-outline' as const,
          color: AQUACARE_COLORS.SUCCESS,
          value: formatCurrency(dashboardBusinessMetrics.directProductionCostFcfa),
          label: t('dashboardDirectProductionCost'),
          animationType: 'bounce' as const,
        },
        {
          icon: 'fish-outline' as const,
          color: AQUACARE_COLORS.GREEN_LIGHT,
          value: formatNumber(dashboardData?.total_fish_count ?? 0, undefined, 0),
          label: t('dashboardEstimatedCurrentFish'),
          animationType: 'wave' as const,
        },
        {
          icon: 'time-outline' as const,
          color: AQUACARE_COLORS.GREEN_DARK,
          value:
            dashboardBusinessMetrics.timeRemainingDays === null
              ? '-'
              : formatNumber(dashboardBusinessMetrics.timeRemainingDays, t('days'), 0),
          label: t('dashboardTimeRemainingCycle'),
          animationType: 'bounce' as const,
        },
      ];
    }

    return [
      {
        icon: 'cash-outline' as const,
        color: AQUACARE_COLORS.GREEN_PRIMARY,
        value: formatCurrency(dashboardBusinessMetrics.estimatedMarketValueFcfa),
        label: t('dashboardEstimatedMarketValue'),
        animationType: 'pulse' as const,
      },
      {
        icon: 'restaurant-outline' as const,
        color: AQUACARE_COLORS.GREEN_LIGHT,
        value: formatCurrency(dashboardBusinessMetrics.feedCostConsumedFcfa),
        label: t('dashboardFeedCostConsumed'),
        animationType: 'wave' as const,
      },
      {
        icon: 'time-outline' as const,
        color: AQUACARE_COLORS.GREEN_DARK,
        value:
          dashboardBusinessMetrics.timeRemainingDays === null
            ? '-'
            : formatNumber(dashboardBusinessMetrics.timeRemainingDays, t('days'), 0),
        label: t('dashboardTimeRemainingCycle'),
        animationType: 'bounce' as const,
      },
      {
        icon: 'calculator-outline' as const,
        color: AQUACARE_COLORS.SUCCESS,
        value: formatCurrency(dashboardBusinessMetrics.directProductionCostFcfa),
        label: t('dashboardDirectProductionCost'),
        animationType: 'bounce' as const,
      },
    ];
  }, [dashboardBusinessMetrics, dashboardData?.total_fish_count, primaryCycleHasProductionUnits, t]);

  useEffect(() => {
    if (activeCycles.length === 0) {
      if (currentCycle) {
        dispatch(clearCurrentCycle());
      }
      setCycleSwitchModalVisible(false);
      setPendingCycleId(null);
      return;
    }

    if (activeCycles.length === 1) {
      if (currentCycle?.id !== activeCycles[0].id) {
        dispatch(setCurrentCycle(activeCycles[0]));
      }
      setCycleSwitchModalVisible(false);
      setPendingCycleId(null);
      return;
    }

    if (!currentCycleInList) {
      dispatch(clearCurrentCycle());
      setCycleSwitchModalVisible(true);
      setPendingCycleId(null);
    } else if (currentCycleInList.id !== currentCycle?.id) {
      dispatch(setCurrentCycle(currentCycleInList));
    }
  }, [activeCycles, currentCycle, currentCycleInList, dispatch]);

  const openHarvestChoice = (cycle: ProductionCycle) => {
    setSelectedCycle(cycle);
    Alert.alert(
      t('harvestTypeTitle'),
      '',
      [
        {
          text: t('partialHarvestOption'),
          onPress: () => setPartialHarvestModalVisible(true),
        },
        {
          text: t('completeHarvest'),
          onPress: () => setHarvestModalVisible(true),
        },
        { text: t('cancel'), style: 'cancel', onPress: () => setSelectedCycle(null) },
      ]
    );
  };

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
    navigation.navigate('Notifications');
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
              await Promise.all([dispatch(fetchOrders()), dispatch(fetchOrderStatistics())]);
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

  const openCycleSwitchModal = () => {
    if (activeCycles.length < 2) {
      return;
    }
    setPendingCycleId(currentCycleInList?.id || null);
    setCycleSwitchModalVisible(true);
  };

  const closeCycleSwitchModal = () => {
    if (requiresCycleSelection) {
      return;
    }
    setCycleSwitchModalVisible(false);
    setPendingCycleId(currentCycleInList?.id || null);
  };

  const confirmCycleSwitch = () => {
    if (!pendingCycleId) {
      return;
    }

    const selected = activeCycles.find((cycle) => cycle.id === pendingCycleId);
    if (!selected) {
      return;
    }

    dispatch(setCurrentCycle(selected));
    dispatch(fetchDashboardData({ cycleId: selected.id }));
    setCycleSwitchModalVisible(false);
    setPendingCycleId(null);
  };

  if (error && !dashboardData) {
    return (
      <ScrollView
        className="flex-1 bg-cream"
        refreshControl={
          <RefreshControl refreshing={loading.dashboard} onRefresh={onRefresh} />
        }
      >
        <DashboardHeader
          displayName={displayName}
          unreadCount={unreadCount}
          onNotificationsPress={handleNotificationsPress}
          onSettingsPress={handleSettingsPress}
        />

        <View className="flex-1 items-center justify-center px-5 py-10">
          <Ionicons name="alert-circle" size={48} color={AQUACARE_COLORS.ERROR} />
          <Text className="text-base text-[#dc2626] text-center mt-3 mb-5">{error}</Text>
          <TouchableOpacity
            className="bg-aquacare-primary px-6 py-3 rounded-lg"
            onPress={onRefresh}
          >
            <Text className="text-white text-base font-semibold">{t('retry', { defaultValue: 'Réessayer' })}</Text>
          </TouchableOpacity>
        </View>
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
          <RefreshControl refreshing={loading.dashboard} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingTop: 140 }}
      >

      <View className="px-5 py-5">
        {loading.dashboard && !dashboardData ? (
          <View className="items-center justify-center py-10">
            <ActivityIndicator size="large" color={AQUACARE_COLORS.GREEN_PRIMARY} />
            <Text className="text-base text-gray-light mt-3">
              {t('loadingData', { defaultValue: 'Chargement des données...' })}
            </Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap justify-between">
            {dashboardMetricCards.map((card, index) => (
              <MetricCard
                key={card.label}
                icon={card.icon}
                color={card.color}
                value={card.value}
                label={card.label}
                index={index}
                animationType={card.animationType}
              />
            ))}
          </View>
        )}
      </View>

      {activeCycles.length > 1 && (
        <View className="px-5 pb-1 items-end">
          <TouchableOpacity
            className="px-3 py-2 rounded-lg border border-aquacare-primary bg-white"
            onPress={openCycleSwitchModal}
          >
            <Text className="text-sm font-semibold text-aquacare-primary">
              {t('changeSessionCycle', { defaultValue: 'Changer de cycle' })}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {pendingDeliveryConfirmations.length > 0 && (
        <View className="px-5 pb-2">
          <View className="bg-white rounded-xl p-4 shadow-sm">
            <View className="flex-row items-center justify-between mb-3">
              <View className="flex-1 mr-3">
                <Text className="text-base font-bold text-gray-dark">
                  {t('ordersPendingConfirmationTitle', { count: pendingDeliveryConfirmations.length })}
                </Text>
                <Text className="text-xs text-gray-light mt-1">
                  {t('ordersPendingConfirmationDescription')}
                </Text>
              </View>
              <TouchableOpacity
                className="px-3 py-2 rounded-lg border border-aquacare-primary"
                onPress={() => navigation.navigate('OrdersHistory')}
              >
                <Text className="text-sm font-semibold text-aquacare-primary">{t('ordersHistory')}</Text>
              </TouchableOpacity>
            </View>

            {pendingDeliveryConfirmations.slice(0, 2).map((order) => {
              const total = Number.parseFloat(order.total || '0');
              const isConfirming = confirmingOrderId === order.id;
              return (
                <View key={order.id} className="border border-gray-100 rounded-lg p-3 mb-2 last:mb-0">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
                      <Text className="text-sm font-semibold text-gray-dark">{order.order_number}</Text>
                      <Text className="text-xs text-gray-light mt-1">
                        {Number.isFinite(total) ? `${total.toLocaleString()} FCFA` : order.total}
                      </Text>
                    </View>
                    <TouchableOpacity
                      className={`px-3 py-2 rounded-lg ${isConfirming ? 'bg-gray-300' : 'bg-aquacare-primary'}`}
                      disabled={isConfirming}
                      onPress={() => handleConfirmOrderReceipt(order.id, order.order_number)}
                    >
                      {isConfirming ? (
                        <ActivityIndicator size="small" color={AQUACARE_COLORS.WHITE} />
                      ) : (
                        <Text className="text-white text-xs font-semibold">{t('confirmReceiptAction')}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {!primaryCycleHasProductionUnits ? (
        <QuickActionsPreview
          onOpenSheet={() => setActionsSheetVisible(true)}
          hasActiveCycles={activeCycles.length > 0}
          unreadCount={unreadCount}
          navigation={navigation}
          scope="cycle"
        />
      ) : null}

      {activeCycles.length > 0 && (
        <View className="px-5 py-5">

          {cycleCards.map((cycle) => (
            <View
              key={cycle.id}
              className="bg-white rounded-xl p-4 mb-3 border border-gray-200"
            >
              <View className="flex-row justify-between items-start">
                <View className="flex-1 mr-3">
                  <Text className="text-base font-bold text-gray-dark mb-1">{cycle.cycle_name}</Text>
                  <Text className="text-sm text-gray-light mb-1">
                    {cycle.species === 'clarias' ? t('catfish') : t('tilapia')}
                    {cycle.unitCount > 0
                      ? ` · ${t('productionUnitsCount', { count: cycle.unitCount })}`
                      : ` - ${cycle.pond_identifier}`}
                  </Text>
                  <Text className="text-xs text-gray-light">
                    {t('daysCount', { count: cycle.cycleAgeDays })} - {formatCurrency(cycle.estimatedMarketValueFcfa)} - {formatPercentage(cycle.survival_rate || 0)} {t('survivalRateShort')}
                  </Text>
                </View>

                {cycle.unitCount > 0 ? null : (
                  <TouchableOpacity
                    className="bg-aquacare-primary flex-row items-center py-2 px-3 rounded-lg"
                    onPress={() => openHarvestChoice(cycle)}
                  >
                    <Text className="text-white text-sm font-semibold ml-1">{t('harvest')}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {cycle.unitCount > 0 ? null : (
                <TouchableOpacity
                  style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  onPress={() => { setSelectedCycle(cycle); setPartialHarvestHistoryModalVisible(true); }}
                >
                  <Ionicons name="time-outline" size={14} color={AQUACARE_COLORS.GREEN_PRIMARY} />
                  <Text className="text-sm text-aquacare-primary">{t('partialHarvestHistory')}</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          {primaryActiveCycle && (
            <TouchableOpacity
              className="mt-2 bg-white rounded-xl p-4 border border-aquacare-primary flex-row items-center justify-between"
              onPress={handleProductionUnitsPress}
            >
              <View className="flex-1 mr-3">
                <Text className="text-base font-bold text-gray-dark">
                  {t('productionUnitsDashboardCta')}
                </Text>
                <Text className="text-xs text-gray-light mt-1">
                  {t('productionUnitsHubSubtitle')}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={AQUACARE_COLORS.GREEN_PRIMARY}
              />
            </TouchableOpacity>
          )}
        </View>
      )}

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

      {!primaryCycleHasProductionUnits ? (
        <QuickActionsSheet
          visible={actionsSheetVisible}
          onClose={() => setActionsSheetVisible(false)}
          unreadCount={unreadCount}
          navigation={navigation}
          scope="cycle"
        />
      ) : null}

      <Modal
        visible={cycleSwitchModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeCycleSwitchModal}
      >
        <View className="flex-1 bg-black/40 items-center justify-center px-4">
          <View className="bg-white w-full rounded-xl p-4">
            <Text className="text-lg font-bold text-gray-dark mb-1">
              {t('sessionCyclePickerTitle', { defaultValue: 'Sélection du cycle' })}
            </Text>
            <Text className="text-sm text-gray-light mb-4">
              {t('sessionCyclePickerDescription', {
                defaultValue: 'Choisissez le cycle sur lequel vous travaillez maintenant.',
              })}
            </Text>

            <CyclePicker
              cycles={activeCycles}
              selectedCycleId={pendingCycleId}
              onSelectCycle={setPendingCycleId}
            />

            <View className="flex-row justify-end gap-2 mt-3">
              {!requiresCycleSelection && (
                <TouchableOpacity
                  className="px-4 py-2 rounded-lg border border-gray-300"
                  onPress={closeCycleSwitchModal}
                >
                  <Text className="text-sm text-gray-dark">{t('cancel')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                className={`px-4 py-2 rounded-lg ${
                  pendingCycleId ? 'bg-aquacare-primary' : 'bg-gray-300'
                }`}
                disabled={!pendingCycleId}
                onPress={confirmCycleSwitch}
              >
                <Text className="text-sm text-white font-semibold">
                  {t('sessionCycleConfirm', { defaultValue: 'Confirmer le cycle' })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </ScrollView>
    </View>
  );
}
