import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  InlineAlert,
  InteractiveCard,
  LoadingState,
  TextField,
} from '@/components/ui';
import { colors, spacing } from '@/theme';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { fetchCycleFeedStatus } from '@/features/aquaculture/store/aquacultureSlice';
import DashboardMetricCard from '@/features/main/components/MetricCard';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AppDispatch, RootState } from '@/store/store';
import { CycleStore } from '@/types/aquaculture';
import { formatCurrency, formatNumber } from '@/utils';
import { sanitizeUserFacingErrorMessage } from '@/utils/errorParser';
import { getOrderStatusLabelKey } from '@/features/commerce/utils/orderStatus';

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
  if (typeof error === 'string') {
    const sanitized = sanitizeUserFacingErrorMessage(error);
    return sanitized === 'UNKNOWN_ERROR' || sanitized.startsWith('AUTH_') ? fallback : sanitized;
  }
  const candidate = error as AxiosErrorShape;
  const data = candidate.response?.data;
  const shouldUseFallback = (message: string): boolean =>
    message === 'UNKNOWN_ERROR' || message.startsWith('AUTH_');
  if (typeof data?.detail === 'string') {
    const sanitized = sanitizeUserFacingErrorMessage(data.detail);
    return shouldUseFallback(sanitized) ? fallback : sanitized;
  }
  if (typeof data?.message === 'string') {
    const sanitized = sanitizeUserFacingErrorMessage(data.message);
    return shouldUseFallback(sanitized) ? fallback : sanitized;
  }
  if (typeof data?.error === 'string') {
    const sanitized = sanitizeUserFacingErrorMessage(data.error);
    return shouldUseFallback(sanitized) ? fallback : sanitized;
  }
  if (typeof candidate.message === 'string') {
    const sanitized = sanitizeUserFacingErrorMessage(candidate.message);
    return shouldUseFallback(sanitized) ? fallback : sanitized;
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
  const submissionLock = useRef(false);
  const storeNavigationParams = cycleId ? { cycleId, source: 'store' as const } : undefined;

  const loadStore = useCallback(async (preserveVisibleStore = false) => {
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
      if (!preserveVisibleStore) {
        setStore(null);
      }
      setError(extractErrorMessage(caughtError, t('storeLoadError')));
    } finally {
      setLoading(false);
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
    if (loading || refreshing) {
      return;
    }
    setRefreshing(true);
    try {
      await Promise.all([
        loadStore(true),
        cycleId ? dispatch(fetchCycleFeedStatus(cycleId)) : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
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
    if (submitting || submissionLock.current) {
      return;
    }
    if (!cycleId) {
      Alert.alert(t('error'), t('storeNoCycleSelected'));
      return;
    }

    if (!label.trim() || !quantityKg.trim() || !totalCostFcfa.trim() || !entryDate.trim()) {
      Alert.alert(t('error'), t('storeManualValidationError'));
      return;
    }

    try {
      submissionLock.current = true;
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
      submissionLock.current = false;
      setSubmitting(false);
    }
  };

  const remainingToOrderValue =
    cycleFeedStatus
      ? formatNumber(cycleFeedStatus.bags_remaining_to_order, t('bags'), 0)
      : '-';

  const actionRows = [
    { label: t('storeManualSubmit'), onPress: openManualModal },
    { label: t('storeViewProducts'), onPress: handleOpenProducts },
    { label: t('storeViewCart'), onPress: handleOpenCart },
    { label: t('storeViewOrders'), onPress: handleOpenOrders },
    { label: t('storeOrderCycleNeed'), onPress: handleOrderCycleNeed },
  ];

  return (
    <View style={styles.root}>
      <AppHeader
        title={t('storeTitle')}
        onBack={() => navigation.goBack()}
        backLabel={t('back')}
        rightAction={
          <IconButton
            icon="refresh-outline"
            variant="ghost"
            tone="inverse"
            accessibilityLabel={t('refresh')}
            onPress={handleRefresh}
            disabled={loading || refreshing}
          />
        }
      />
      {loading && !store ? (
        <LoadingState message={t('loading')} />
      ) : error && !store ? (
        <ErrorState message={error} actionLabel={t('retry')} onAction={handleRefresh} />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {error ? <InlineAlert tone="error" message={error} /> : null}
          {store ? (
            <>
              <Card variant="outlined" style={styles.section}>
                <AppText variant="sectionTitle">{t('storeStatusTitle')}</AppText>
                <View style={styles.metrics}>
                  <DashboardMetricCard value={formatNumber(toNumber(store.summary.estimated_feed_remaining_kg), t('kg'), 2)} label={t('storeFeedRemaining')} />
                  <DashboardMetricCard value={formatNumber(toNumber(store.summary.feed_consumed_kg), t('kg'), 2)} label={t('storeFeedConsumed')} />
                  <DashboardMetricCard value={formatCurrency(toNumber(store.summary.feed_expenses_fcfa))} label={t('storeFeedExpenses')} />
                  <DashboardMetricCard value={remainingToOrderValue} label={t('storeNeedRemaining')} />
                </View>
              </Card>
              {store.summary.stock_tracking_started_at ? (
                <AppText variant="caption" color="muted" style={styles.tracking}>
                  {t('storeTrackingSince')}{' '}
                  {new Date(store.summary.stock_tracking_started_at).toLocaleDateString(i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US')}
                </AppText>
              ) : null}
            </>
          ) : null}
          <Card variant="outlined" style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppText variant="cardTitle">{t('storePendingOrdersTitle')}</AppText>
              <Badge label={store ? formatNumber(store.summary.pending_orders_count, undefined, 0) : '0'} tone="info" />
            </View>
            {store?.pending_orders.length ? store.pending_orders.map((order) => (
              <Card key={order.id} variant="outlined" style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <View style={styles.flex}>
                    <AppText variant="label">{order.order_number}</AppText>
                  </View>
                  <View style={styles.orderAmount}>
                    <AppText variant="label" color="link">{formatCurrency(toNumber(order.total_fcfa))}</AppText>
                    <Badge label={t(getOrderStatusLabelKey(order.status))} tone="info" />
                  </View>
                </View>
              </Card>
            )) : <EmptyState compact title={t('storePendingOrdersEmptyTitle')} message={t('storePendingOrdersEmptyDescription')} />}
          </Card>
          <View style={styles.actionList}>
            {actionRows.map((action) => (
              <InteractiveCard key={action.label} onPress={action.onPress} accessibilityLabel={action.label} primaryBorder>
                <AppText variant="bodyStrong" color="link">{action.label}</AppText>
                <Ionicons name="chevron-forward" size={20} color={colors.brand.primary} />
              </InteractiveCard>
            ))}
          </View>
        </ScrollView>
      )}
      <Modal visible={manualModalVisible} transparent animationType="slide" onRequestClose={() => !submitting && setManualModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
            <Card style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.flex}>
                  <AppText variant="sectionTitle">{t('storeManualFormTitle')}</AppText>
                  <AppText variant="helper" color="muted">{t('storeManualFormDescription')}</AppText>
                </View>
                <IconButton icon="close" variant="surface" accessibilityLabel={t('close')} onPress={() => setManualModalVisible(false)} disabled={submitting} />
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={styles.form}>
                  <TextField label={t('storeManualLabel')} value={label} onChangeText={setLabel} placeholder={t('storeManualLabelPlaceholder')} />
                  <View style={styles.formRow}>
                    <View style={styles.flex}><TextField label={t('storeManualQuantity')} value={quantityKg} onChangeText={setQuantityKg} keyboardType="decimal-pad" placeholder={t('storeManualQuantityPlaceholder')} /></View>
                    <View style={styles.flex}><TextField label={t('storeManualTotalCost')} value={totalCostFcfa} onChangeText={setTotalCostFcfa} keyboardType="decimal-pad" placeholder={t('storeManualTotalCostPlaceholder')} /></View>
                  </View>
                  <TextField label={t('storeManualDate')} value={entryDate} onChangeText={setEntryDate} placeholder={t('storeManualDatePlaceholder')} />
                  <TextField label={t('storeManualNote')} value={note} onChangeText={setNote} placeholder={t('storeManualNotePlaceholder')} multiline textAlignVertical="top" />
                  <Divider />
                  <View style={styles.formActions}>
                    <Button label={t('storeManualSubmit')} onPress={handleSubmitManualStock} loading={submitting} disabled={submitting} />
                    <Button label={t('cancel')} variant="ghost" onPress={() => setManualModalVisible(false)} disabled={submitting} />
                  </View>
                </View>
              </ScrollView>
            </Card>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.page },
  content: { padding: spacing[4], paddingBottom: spacing[6], gap: spacing[4] },
  section: { gap: spacing[3] },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  tracking: { marginTop: -spacing[2] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderCard: { padding: spacing[3] },
  orderHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  orderAmount: { alignItems: 'flex-end', gap: spacing[1] },
  actionList: { gap: spacing[3] },
  flex: { flex: 1 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay.default },
  keyboardView: { maxHeight: '92%' },
  modalCard: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: spacing[5], maxHeight: '100%' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], marginBottom: spacing[4] },
  form: { gap: spacing[3], paddingBottom: spacing[2] },
  formRow: { flexDirection: 'row', gap: spacing[3] },
  formActions: { gap: spacing[2] },
});
