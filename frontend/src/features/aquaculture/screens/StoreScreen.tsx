import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';

import { AQUACARE_COLORS } from '@/constants/colors';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { fetchCycleFeedStatus } from '@/features/aquaculture/store/aquacultureSlice';
import DashboardMetricCard from '@/features/main/components/MetricCard';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AppDispatch, RootState } from '@/store/store';
import { CycleStore } from '@/types/aquaculture';
import { formatCurrency, formatNumber } from '@/utils';

type NavigationProp = StackNavigationProp<RootStackParamList, 'Store'>;

interface AxiosErrorShape {
  response?: {
    data?: {
      detail?: string;
      message?: string;
      error?: string;
    };
  };
  message?: string;
}

const extractErrorMessage = (error: unknown, fallback: string): string => {
  const candidate = error as AxiosErrorShape;
  const data = candidate.response?.data;
  if (typeof data?.detail === 'string') {
    return data.detail;
  }
  if (typeof data?.message === 'string') {
    return data.message;
  }
  if (typeof data?.error === 'string') {
    return data.error;
  }
  if (typeof candidate.message === 'string') {
    return candidate.message;
  }
  return fallback;
};

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const generateClientUuid = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
};

const toNumber = (value: string | number | null | undefined): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function StoreScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp<RootStackParamList, 'Store'>>();
  const dispatch = useDispatch<AppDispatch>();
  const currentCycle = useSelector((state: RootState) => state.aquaculture.currentCycle);
  const cycleFeedStatus = useSelector((state: RootState) => state.aquaculture.cycleFeedStatus.data);

  const cycleId = route.params?.cycleId || currentCycle?.id || null;

  const [store, setStore] = useState<CycleStore | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [label, setLabel] = useState('');
  const [quantityKg, setQuantityKg] = useState('');
  const [totalCostFcfa, setTotalCostFcfa] = useState('');
  const [entryDate, setEntryDate] = useState(todayIsoDate());
  const [note, setNote] = useState('');
  const storeNavigationParams = cycleId ? { cycleId, source: 'store' as const } : undefined;

  const loadStore = useCallback(async () => {
    if (!cycleId) {
      setStore(null);
      setError(t('storeNoCycleSelected'));
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = await aquacultureService.getCycleStore(cycleId);
      setStore(payload);
    } catch (caughtError) {
      setStore(null);
      setError(extractErrorMessage(caughtError, t('storeLoadError')));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cycleId, t]);

  useFocusEffect(
    useCallback(() => {
      void loadStore();
      if (cycleId) {
        dispatch(fetchCycleFeedStatus(cycleId));
      }
    }, [loadStore, cycleId, dispatch])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStore();
    if (cycleId) {
      dispatch(fetchCycleFeedStatus(cycleId));
    }
  };

  const openManualModal = () => {
    setLabel('');
    setQuantityKg('');
    setTotalCostFcfa('');
    setEntryDate(todayIsoDate());
    setNote('');
    setManualModalVisible(true);
  };

  const handleOpenProducts = () => navigation.navigate('ProductCatalog', storeNavigationParams);
  const handleOpenCart = () => navigation.navigate('Cart', storeNavigationParams);
  const handleOpenOrders = () => navigation.navigate('OrdersHistory', storeNavigationParams);
  const handleOrderCycleNeed = () => {
    if (!cycleId) {
      Alert.alert(t('error'), t('storeNoCycleSelected'));
      return;
    }

    navigation.navigate('CycleFeedPhases', { cycleId });
  };

  const handleSubmitManualStock = async () => {
    if (!cycleId) {
      Alert.alert(t('error'), t('storeNoCycleSelected'));
      return;
    }

    if (!label.trim() || !quantityKg.trim() || !totalCostFcfa.trim() || !entryDate.trim()) {
      Alert.alert(t('error'), t('storeManualValidationError'));
      return;
    }

    try {
      setSubmitting(true);
      await aquacultureService.declareCycleStoreManualStock(cycleId, {
        label: label.trim(),
        quantity_kg: quantityKg.trim(),
        total_cost_fcfa: totalCostFcfa.trim(),
        entry_date: entryDate.trim(),
        note: note.trim(),
        client_uuid: generateClientUuid(),
        created_offline: false,
      });
      setManualModalVisible(false);
      await loadStore();
      Alert.alert(t('success'), t('storeManualSubmitSuccess'));
    } catch (caughtError) {
      Alert.alert(t('error'), extractErrorMessage(caughtError, t('storeManualSubmitError')));
    } finally {
      setSubmitting(false);
    }
  };

  const remainingToOrderValue =
    cycleFeedStatus
      ? formatNumber(cycleFeedStatus.bags_remaining_to_order, t('bags'), 0)
      : '-';

  return (
    <View className="flex-1 bg-cream">
      <View className="bg-white px-5 pt-16 pb-5 flex-row items-center justify-between shadow">
        <TouchableOpacity onPress={() => navigation.goBack()} className="w-10">
          <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.GRAY_DARK} />
        </TouchableOpacity>
        <View className="flex-1 items-center px-3">
          <Text className="text-2xl font-bold text-gray-dark">{t('storeTitle')}</Text>
        </View>
        <TouchableOpacity onPress={handleRefresh} className="w-10 items-end">
          <Ionicons name="refresh-outline" size={24} color={AQUACARE_COLORS.GREEN_PRIMARY} />
        </TouchableOpacity>
      </View>

      {loading && !store ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={AQUACARE_COLORS.GREEN_PRIMARY} />
          <Text className="mt-3 text-base text-gray-light">{t('loading')}</Text>
        </View>
      ) : error && !store ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="alert-circle-outline" size={52} color={AQUACARE_COLORS.ERROR} />
          <Text className="text-center text-base text-[#991b1b] mt-3">{error}</Text>
          <TouchableOpacity
            className="mt-5 bg-aquacare-primary px-6 py-3 rounded-lg"
            onPress={handleRefresh}
          >
            <Text className="text-white text-base font-semibold">{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {store ? (
            <>
              <View className="bg-white rounded-xl p-4 mb-4">
                <Text className="text-lg font-bold text-gray-dark mb-3">
                  {t('storeStatusTitle')}
                </Text>
                <View className="flex-row flex-wrap gap-3">
                  <DashboardMetricCard
                    value={formatNumber(toNumber(store.summary.estimated_feed_remaining_kg), t('kg'), 2)}
                    label={t('storeFeedRemaining')}
                  />
                  <DashboardMetricCard
                    value={formatNumber(toNumber(store.summary.feed_consumed_kg), t('kg'), 2)}
                    label={t('storeFeedConsumed')}
                  />
                  <DashboardMetricCard
                    value={formatCurrency(toNumber(store.summary.feed_expenses_fcfa))}
                    label={t('storeFeedExpenses')}
                  />
                  <DashboardMetricCard
                    value={remainingToOrderValue}
                    label={t('storeNeedRemaining')}
                  />
                </View>
              </View>

              {store?.summary.stock_tracking_started_at ? (
                <Text className="text-xs text-gray-light mb-4">
                  {t('storeTrackingSince')}{' '}
                  {new Date(store.summary.stock_tracking_started_at).toLocaleDateString(
                    i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US'
                  )}
                </Text>
              ) : null}
            </>
          ) : null}

          <View className="bg-white rounded-2xl p-4 border border-[#dbe3d9] mb-4">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-bold text-gray-dark">{t('storePendingOrdersTitle')}</Text>
              <View className="rounded-full bg-cream px-3 py-1">
                <Text className="text-xs font-semibold text-aquacare-primary">
                  {store ? formatNumber(store.summary.pending_orders_count, undefined, 0) : '0'}
                </Text>
              </View>
            </View>

            {store?.pending_orders.length ? (
              <View className="gap-3">
                {store.pending_orders.map((order) => (
                  <View
                    key={order.id}
                    className="rounded-xl border border-[#edf4ea] bg-cream/40 p-3"
                  >
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1">
                        <Text className="text-sm font-semibold text-gray-dark">
                          {order.order_number}
                        </Text>
                        <Text className="text-xs text-gray-light mt-1">
                          {t('storePendingOrdersFeedEquivalent')}{' '}
                          {formatNumber(toNumber(order.estimated_feed_kg), t('kg'), 2)}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-sm font-semibold text-aquacare-primary">
                          {formatCurrency(toNumber(order.total_fcfa))}
                        </Text>
                        <Text className="text-xs text-gray-light mt-1">{order.status}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View className="rounded-xl border border-dashed border-[#d7e3d5] bg-[#f8fbf8] p-4">
                <Text className="text-sm font-semibold text-gray-dark">
                  {t('storePendingOrdersEmptyTitle')}
                </Text>
                <Text className="text-xs text-gray-light mt-1">
                  {t('storePendingOrdersEmptyDescription')}
                </Text>
              </View>
            )}
          </View>

          <View className="bg-white rounded-2xl p-4 border border-[#dbe3d9]">
            <Text className="text-base font-bold text-gray-dark mb-3">{t('storeActionsTitle')}</Text>

            <TouchableOpacity
              className="flex-row items-center justify-between rounded-xl bg-aquacare-primary px-4 py-3 mb-3"
              onPress={openManualModal}
            >
              <Text className="text-white text-sm font-semibold">{t('storeManualSubmit')}</Text>
            </TouchableOpacity>

            <View className="gap-3">
              <TouchableOpacity
                className="flex-row items-center justify-between rounded-xl border border-[#dbe3d9] bg-cream px-4 py-4"
                onPress={handleOpenProducts}
              >
                <Text className="text-sm font-semibold text-gray-dark">{t('storeViewProducts')}</Text>
                <Ionicons name="chevron-forward" size={20} color={AQUACARE_COLORS.GREEN_PRIMARY} />
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-row items-center justify-between rounded-xl border border-[#dbe3d9] bg-cream px-4 py-4"
                onPress={handleOpenCart}
              >
                <Text className="text-sm font-semibold text-gray-dark">{t('storeViewCart')}</Text>
                <Ionicons name="chevron-forward" size={20} color={AQUACARE_COLORS.GREEN_PRIMARY} />
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-row items-center justify-between rounded-xl border border-[#dbe3d9] bg-cream px-4 py-4"
                onPress={handleOpenOrders}
              >
                <Text className="text-sm font-semibold text-gray-dark">{t('storeViewOrders')}</Text>
                <Ionicons name="chevron-forward" size={20} color={AQUACARE_COLORS.GREEN_PRIMARY} />
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-row items-center justify-between rounded-xl border border-[#dbe3d9] bg-cream px-4 py-4"
                onPress={handleOrderCycleNeed}
              >
                <Text className="text-sm font-semibold text-gray-dark">{t('storeOrderCycleNeed')}</Text>
                <Ionicons name="chevron-forward" size={20} color={AQUACARE_COLORS.GREEN_PRIMARY} />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      <Modal
        visible={manualModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setManualModalVisible(false)}
      >
        <View className="flex-1 bg-black/40 justify-end">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View className="bg-white rounded-t-3xl p-5">
              <View className="flex-row items-start justify-between mb-4">
                <View className="flex-1 mr-3">
                  <Text className="text-xl font-bold text-gray-dark">{t('storeManualFormTitle')}</Text>
                  <Text className="text-sm text-gray-light mt-1">
                    {t('storeManualFormDescription')}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setManualModalVisible(false)}>
                  <Ionicons name="close" size={24} color={AQUACARE_COLORS.GRAY_DARK} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                <View className="mb-3">
                  <Text className="text-sm font-semibold text-gray-dark mb-2">{t('storeManualLabel')}</Text>
                  <TextInput
                    className="bg-cream rounded-xl px-4 py-3 text-base text-gray-dark"
                    value={label}
                    onChangeText={setLabel}
                    placeholder={t('storeManualLabelPlaceholder')}
                    placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
                  />
                </View>

                <View className="flex-row gap-3 mb-3">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-gray-dark mb-2">
                      {t('storeManualQuantity')}
                    </Text>
                    <TextInput
                      className="bg-cream rounded-xl px-4 py-3 text-base text-gray-dark"
                      value={quantityKg}
                      onChangeText={setQuantityKg}
                      keyboardType="decimal-pad"
                      placeholder={t('storeManualQuantityPlaceholder')}
                      placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-gray-dark mb-2">
                      {t('storeManualTotalCost')}
                    </Text>
                    <TextInput
                      className="bg-cream rounded-xl px-4 py-3 text-base text-gray-dark"
                      value={totalCostFcfa}
                      onChangeText={setTotalCostFcfa}
                      keyboardType="decimal-pad"
                      placeholder={t('storeManualTotalCostPlaceholder')}
                      placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
                    />
                  </View>
                </View>

                <View className="mb-3">
                  <Text className="text-sm font-semibold text-gray-dark mb-2">{t('storeManualDate')}</Text>
                  <TextInput
                    className="bg-cream rounded-xl px-4 py-3 text-base text-gray-dark"
                    value={entryDate}
                    onChangeText={setEntryDate}
                    placeholder={t('storeManualDatePlaceholder')}
                    placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
                  />
                </View>

                <View className="mb-4">
                  <Text className="text-sm font-semibold text-gray-dark mb-2">{t('storeManualNote')}</Text>
                  <TextInput
                    className="bg-cream rounded-xl px-4 py-3 text-base text-gray-dark min-h-[96px]"
                    value={note}
                    onChangeText={setNote}
                    placeholder={t('storeManualNotePlaceholder')}
                    placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
                    multiline
                    textAlignVertical="top"
                  />
                </View>

                <View className="flex-row gap-3">
                  <TouchableOpacity
                    className="flex-1 rounded-xl border border-gray-300 px-4 py-3 items-center"
                    onPress={() => setManualModalVisible(false)}
                    disabled={submitting}
                  >
                    <Text className="text-sm font-semibold text-gray-dark">{t('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className={`flex-1 rounded-xl px-4 py-3 items-center ${
                      submitting ? 'bg-gray-300' : 'bg-aquacare-primary'
                    }`}
                    onPress={handleSubmitManualStock}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color={AQUACARE_COLORS.WHITE} />
                    ) : (
                      <Text className="text-sm font-semibold text-white">{t('storeManualSubmit')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}
