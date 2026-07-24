import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';

import {
  AppHeader,
  AppText,
  Badge,
  Button,
  Card,
  DashboardHeroCard,
  DashboardMetricCard,
  DashboardSection,
  DashboardStatus,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  InlineAlert,
  InteractiveCard,
  LoadingState,
  SelectableCard,
  TextField,
  formatDashboardCurrency,
  formatDashboardNumber,
  parseDashboardNumber,
} from '@/components/ui';
import { colors, spacing } from '@/theme';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { RootState } from '@/store/store';
import { CycleStore, FarmFeedReference } from '@/types/aquaculture';
import { Product } from '@/types/commerce';
import { sanitizeUserFacingErrorMessage } from '@/utils/errorParser';
import { formatDecimalForDisplay, parseLocalizedNumber } from '@/utils/localizedNumber';
import commerceApi from '@/features/commerce/services/commerceApi';
import {
  canConfirmOrderReceipt,
  getOrderReceiptActionLabelKey,
  getOrderStatusLabelKey,
  getOrderStatusTone,
} from '@/features/commerce/utils/orderStatus';
import { useDashboardSyncStatus } from '@/hooks/useDashboardSyncStatus';
import { dashboardSyncService } from '@/services/dashboardSyncService';
import { offlineService } from '@/services/offlineService';
import { declareManualStockWithOfflineFallback } from '@/features/aquaculture/services/aquacultureWorkflowService';
import { projectOfflineStore } from '@/features/aquaculture/services/offlineStoreProjection';

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

type StoreLoadResult = 'success' | 'error' | 'stale';

const generateClientUuid = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
};

export default function StoreScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp<RootStackParamList, 'Store'>>();
  const currentCycle = useSelector((state: RootState) => state.aquaculture.currentCycle);
  const cycles = useSelector((state: RootState) => state.aquaculture.cycles) ?? [];

  const cycleId = route.params?.cycleId || currentCycle?.id || null;
  const selectedCycle = cycles.find((cycle) => cycle.id === cycleId) ?? currentCycle;

  const [store, setStore] = useState<CycleStore | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [feedSizeMm, setFeedSizeMm] = useState('');
  const [quantityKg, setQuantityKg] = useState('');
  const [totalCostFcfa, setTotalCostFcfa] = useState('');
  const [entryDate, setEntryDate] = useState(todayIsoDate());
  const [note, setNote] = useState('');
  const [feedMode, setFeedMode] = useState<'catalog' | 'external'>('external');
  const [creatingExternalFeed, setCreatingExternalFeed] = useState(false);
  const [feedReferences, setFeedReferences] = useState<FarmFeedReference[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedFeedReferenceId, setSelectedFeedReferenceId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [classificationEntryId, setClassificationEntryId] = useState<string | null>(null);
  const [pendingStockCount, setPendingStockCount] = useState(0);
  const submissionLock = useRef(false);
  const confirmationLock = useRef(false);
  const loadRequestRef = useRef(0);
  const serverStoreRef = useRef<CycleStore | null>(null);
  const { lastSyncedAt, refreshLastSyncedAt } = useDashboardSyncStatus('store', cycleId);
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const displayDecimal = (value: string | number | null | undefined): string =>
    formatDecimalForDisplay(value, locale);
  const storeNavigationParams = cycleId ? { cycleId, source: 'store' as const } : undefined;

  const applyPendingStockProjection = useCallback(async (serverStore: CycleStore): Promise<CycleStore> => {
    if (!cycleId) return serverStore;
    const projection = await projectOfflineStore(cycleId, serverStore, t('storePendingStockLabel'));
    setPendingStockCount(projection.pendingStockCount);
    return projection.store;
  }, [cycleId, t]);

  const loadStore = useCallback(async (preserveVisibleStore = false): Promise<StoreLoadResult> => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    if (!cycleId) {
      setStore(null);
      setError(t('storeNoCycleSelected'));
      setLoading(false);
      setRefreshing(false);
      return 'error';
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await aquacultureService.getCycleStore(cycleId);

      if (requestId !== loadRequestRef.current) {
        return 'stale';
      }
      if (payload.cycle_id !== cycleId) {
        throw new Error(t('storeContextMismatch'));
      }
      serverStoreRef.current = payload;
      setStore(await applyPendingStockProjection(payload));
      await dashboardSyncService.markSuccessful('store', cycleId);
      await refreshLastSyncedAt();
      return 'success';
    } catch (caughtError) {
      if (!preserveVisibleStore && requestId === loadRequestRef.current) {
        setStore(null);
      }
      setError(extractErrorMessage(caughtError, t('storeLoadError')));
      return 'error';
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [applyPendingStockProjection, cycleId, refreshLastSyncedAt, t]);

  useEffect(() => {
    setStore(null);
    setError(null);
  }, [cycleId]);

  useFocusEffect(
    useCallback(() => {
      void loadStore();
    }, [loadStore, cycleId])
  );

  const handleRefresh = async () => {
    if (loading || refreshing) {
      return;
    }
    setRefreshing(true);
    try {
      await loadStore(true);
    } finally {
      setRefreshing(false);
    }
  };

  const loadFeedChoices = useCallback(async () => {
    if (!selectedCycle?.farm_profile) return;
    const localReferences = (await offlineService.getOfflineFeedReferences())
      .filter((item) => !item.synced && item.payload.farm_profile === selectedCycle.farm_profile)
      .map((item): FarmFeedReference => ({
        id: item.clientUuid,
        client_uuid: item.clientUuid,
        farm_profile: item.payload.farm_profile,
        source: item.payload.source,
        catalog_product_id: item.payload.catalog_product ?? null,
        name: item.payload.name ?? t('storePendingStockLabel'),
        species: item.payload.species ?? selectedCycle.species,
        pellet_size_mm: item.payload.pellet_size_mm ?? '',
        brand: item.payload.brand ?? '',
        protein_percentage: null,
        lipid_percentage: null,
        package_weight_kg: null,
      }));
    try {
      const [references, catalogProducts] = await Promise.all([
        aquacultureService.getFarmFeedReferences(selectedCycle.farm_profile),
        commerceApi.getProducts({ species: selectedCycle.species === 'clarias' ? 'catfish' : 'tilapia' }),
      ]);
      setFeedReferences([...references, ...localReferences]);
      setProducts(catalogProducts);
    } catch (caughtError) {
      setFeedReferences(localReferences);
      Alert.alert(t('error'), extractErrorMessage(caughtError, t('storeFeedChoicesLoadError')));
    }
  }, [selectedCycle?.farm_profile, selectedCycle?.species, t]);

  const openManualModal = () => {
    setLabel('');
    setFeedSizeMm('');
    setQuantityKg('');
    setTotalCostFcfa('');
    setEntryDate(todayIsoDate());
    setNote('');
    setFeedMode('external');
    // Older cached store payloads do not expose the normalized size choices.
    // Keep their legacy form usable while the current API always uses chips.
    setCreatingExternalFeed(store?.available_pellet_sizes === undefined);
    setSelectedFeedReferenceId(null);
    setSelectedProductId(null);
    setClassificationEntryId(null);
    setManualModalVisible(true);
    void loadFeedChoices();
  };

  const openClassificationModal = (entryId: string) => {
    const entry = store?.unclassified_entries.find((item) => item.id === entryId);
    openManualModal();
    setClassificationEntryId(entryId);
    if (entry?.source === 'order') {
      setFeedMode('catalog');
      setCreatingExternalFeed(false);
    }
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

    const parsedFeedSize = parseLocalizedNumber(feedSizeMm);
    const parsedQuantity = parseLocalizedNumber(quantityKg);
    const parsedTotalCost = parseLocalizedNumber(totalCostFcfa);
    const invalidFeedSize = parsedFeedSize.kind !== 'valid'
      || parsedFeedSize.value < 0.1
      || parsedFeedSize.value > 20;
    const invalidQuantity = !classificationEntryId && (parsedQuantity.kind !== 'valid' || parsedQuantity.value <= 0);
    const invalidTotalCost = !classificationEntryId && (parsedTotalCost.kind !== 'valid' || parsedTotalCost.value < 0);
    const needsExternalData = feedMode === 'external' && !selectedFeedReferenceId;
    const invalidReference = feedMode === 'catalog'
      ? !selectedProductId
      : needsExternalData && (!creatingExternalFeed || !label.trim() || invalidFeedSize);
    if (invalidReference || invalidQuantity || invalidTotalCost || (!classificationEntryId && !entryDate.trim())) {
      Alert.alert(t('error'), t('storeManualValidationError'));
      return;
    }

    try {
      submissionLock.current = true;
      setSubmitting(true);
      const feedReferenceClientUuid = generateClientUuid();
      const stockClientUuid = generateClientUuid();
      const selectedReference = feedReferences.find((reference) => reference.id === selectedFeedReferenceId);
      const selectedReferenceIsLocal = Boolean(
        selectedReference?.client_uuid && selectedReference.id === selectedReference.client_uuid,
      );
      const feedReferencePayload = !selectedFeedReferenceId && selectedCycle
        ? feedMode === 'catalog' && selectedProductId
          ? {
          farm_profile: selectedCycle.farm_profile,
          source: 'aquacare_catalog' as const,
          catalog_product: selectedProductId,
          client_uuid: feedReferenceClientUuid,
          created_offline: false,
        }
            : creatingExternalFeed && parsedFeedSize.kind === 'valid'
            ? {
              farm_profile: selectedCycle.farm_profile,
              source: 'external' as const,
              name: label.trim(),
              species: selectedCycle.species,
              pellet_size_mm: String(parsedFeedSize.value),
              client_uuid: feedReferenceClientUuid,
              created_offline: false,
            }
            : undefined
        : undefined;
      let referenceId = selectedFeedReferenceId;
      if (classificationEntryId) {
        if (!referenceId && feedReferencePayload) {
          const reference = await aquacultureService.createFarmFeedReference({
            ...feedReferencePayload,
          });
          referenceId = reference.id;
        }
        if (!referenceId) throw new Error(t('storeManualValidationError'));
        await aquacultureService.classifyCycleStoreEntry(cycleId, classificationEntryId, referenceId);
      } else {
        const result = await declareManualStockWithOfflineFallback(cycleId, {
          ...(referenceId
            ? selectedReferenceIsLocal
              ? { feed_reference_client_uuid: selectedReference?.client_uuid ?? referenceId }
              : { feed_reference_id: referenceId }
            : {}),
          quantity_kg: String(parsedQuantity.kind === 'valid' ? parsedQuantity.value : 0),
          total_cost_fcfa: String(parsedTotalCost.kind === 'valid' ? parsedTotalCost.value : 0),
          entry_date: entryDate.trim(),
          note: note.trim(),
          client_uuid: stockClientUuid,
          created_offline: false,
        }, feedReferencePayload);
        if (result.mode === 'online') {
          serverStoreRef.current = result.data;
          setStore(result.data);
        } else if (serverStoreRef.current ?? store) {
          setStore(await applyPendingStockProjection((serverStoreRef.current ?? store)!));
        }
        setManualModalVisible(false);
        Alert.alert(t('success'), t(result.mode === 'online' ? 'storeManualSubmitSuccess' : 'storeManualSubmitOfflineSuccess'));
        return;
      }
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

  const handleConfirmPendingOrder = useCallback((order: CycleStore['pending_orders'][number]) => {
    const isPickup = order.delivery_method === 'pickup';
    const title = t(isPickup ? 'confirmPickupTitle' : 'confirmReceiptTitle');
    const message = `${t(
      isPickup ? 'confirmPickupMessage' : 'confirmReceiptMessage',
      { orderNumber: order.order_number },
    )}\n\n${t('confirmOrderCycleStockMessage')}`;

    Alert.alert(title, message, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('confirm'),
        onPress: async () => {
          if (confirmationLock.current) return;
          try {
            confirmationLock.current = true;
            setConfirmingOrderId(order.id);
            const updatedOrder = await commerceApi.confirmOrderReceipt(order.id);
            setStore((currentStore) => currentStore ? {
              ...currentStore,
              pending_orders: currentStore.pending_orders.filter(
                (pendingOrder) => pendingOrder.id !== updatedOrder.id,
              ),
              summary: {
                ...currentStore.summary,
                pending_orders_count: Math.max(0, currentStore.summary.pending_orders_count - 1),
              },
            } : currentStore);
            const refreshResult = await loadStore(true);
            if (refreshResult === 'success') {
              Alert.alert(t('success'), t(isPickup ? 'confirmPickupSuccess' : 'confirmReceiptSuccess'));
            } else {
              Alert.alert(
                t('success'),
                `${t(isPickup ? 'confirmPickupSuccess' : 'confirmReceiptSuccess')}\n\n${t('storeRefreshAfterConfirmationError')}`,
              );
            }
          } catch (caughtError) {
            Alert.alert(t('error'), extractErrorMessage(caughtError, t('confirmReceiptError')));
          } finally {
            confirmationLock.current = false;
            setConfirmingOrderId(null);
          }
        },
      },
    ]);
  }, [loadStore, t]);

  const feedToSecureKg = parseDashboardNumber(store?.summary.feed_to_secure_kg ?? null);
  const requiresReplenishment = feedToSecureKg !== null && feedToSecureKg > 0;

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
              <DashboardSection title={t('storeStatusTitle')} lastSyncedAt={lastSyncedAt}>
                {store.calculation_status === 'available' && Number(store.summary.feed_to_secure_kg) <= 0 && Number(store.summary.unclassified_stock_kg) <= 0 ? (
                  <InlineAlert tone="success" message={`${t('storeNeedCoveredTitle')}\n${t('storeNeedCoveredDescription')}`} />
                ) : store.calculation_status === 'unavailable' ? (
                  <InlineAlert tone="warning" message={t('feedEstimateUnavailable')} />
                ) : (
                  <DashboardHeroCard
                    label={t('storeEstimatedNeedToFinish')}
                    value={formatDashboardNumber(store.summary.feed_to_secure_kg, locale, { maximumFractionDigits: 1 })}
                    unit={t('kg')}
                    unavailableLabel={t('dashboardDataUnavailable')}
                  />
                )}
                <View style={styles.metrics}>
                  <DashboardMetricCard
                    label={t('storeCurrentStock')}
                    value={formatDashboardNumber(store.summary.estimated_feed_remaining_kg, locale, { maximumFractionDigits: 1 })}
                    unit={t('kg')}
                    tone="aqua"
                    unavailableLabel={t('dashboardDataUnavailable')}
                  />
                  <DashboardMetricCard
                    label={t('storeFeedAlreadyConsumed')}
                    value={formatDashboardNumber(store.summary.feed_consumed_kg, locale, { maximumFractionDigits: 1 })}
                    unit={t('kg')}
                    tone="info"
                    unavailableLabel={t('dashboardDataUnavailable')}
                  />
                  <DashboardMetricCard
                    label={t('storeRecordedFeedExpenses')}
                    value={formatDashboardCurrency(store.summary.feed_expenses_fcfa, locale)}
                    unit={t('dashboardDirectProductionCostUnit')}
                    tone="attention"
                    layout="fullWidthCompact"
                    unavailableLabel={t('dashboardDataUnavailable')}
                  />
                </View>
                {requiresReplenishment ? (
                  <DashboardStatus title={t('storeReplenishmentRequired')} tone="warning" />
                ) : null}
                {pendingStockCount > 0 ? (
                  <InlineAlert tone="info" message={t('storePendingSyncMessage', { count: pendingStockCount })} />
                ) : null}
                {store.calculation_warnings?.includes('feed_stock_history_inconsistent') ? (
                  <InlineAlert tone="warning" message={t('feedStockHistoryInconsistentWarning')} />
                ) : null}
              </DashboardSection>
              {store.unclassified_entries?.map((entry) => (
                <Card key={entry.id} variant="outlined" style={styles.section}>
                  <InlineAlert
                    tone={entry.classification_reason === 'order_species_mismatch' ? 'error' : 'warning'}
                    message={
                      entry.classification_reason === 'order_species_mismatch'
                        ? t('storeLegacyOrderSpeciesMismatch', {
                          productSpecies: entry.catalog_product_species === 'clarias' ? t('catfish') : t('tilapia'),
                          cycleSpecies: selectedCycle?.species === 'clarias' ? t('catfish') : t('tilapia'),
                        })
                        : t('storeUnclassifiedStockMessage', {
                          quantity: displayDecimal(entry.quantity_available_kg),
                          name: entry.label,
                        })
                    }
                  />
                  <AppText variant="helper">
                    {entry.classification_reason === 'order_species_mismatch'
                      ? t('storeReviewCycleOrOrder')
                      : entry.source === 'order'
                        ? t('storeLegacyOrderMessage')
                        : t('storeLegacyManualStockMessage')}
                  </AppText>
                  <AppText variant="helper" color="muted">
                    {t('storeUnclassifiedStockBreakdown', {
                      added: displayDecimal(entry.quantity_added_kg),
                      consumed: displayDecimal(entry.historical_consumption_kg),
                      available: displayDecimal(entry.quantity_available_kg),
                    })}
                  </AppText>
                  {entry.classification_reason === 'order_species_mismatch' ? (
                    <Button
                      label={t('storeReviewCycleOrOrder')}
                      variant="outline"
                      onPress={handleOpenOrders}
                    />
                  ) : (
                    <Button
                      label={entry.source === 'order' ? t('storeClassificationCatalogAction') : t('storeClassifyStockAction')}
                      variant="outline"
                      onPress={() => openClassificationModal(entry.id)}
                    />
                  )}
                </Card>
              ))}
            </>
          ) : null}
          <Card variant="outlined" style={styles.section}>
            <View style={styles.sectionHeader}>
              <AppText variant="cardTitle">{t('storePendingOrdersTitle')}</AppText>
              <Badge
                label={store
                  ? formatDashboardNumber(store.summary.pending_orders_count, locale, { maximumFractionDigits: 0 })
                  : '0'}
                tone="info"
              />
            </View>
                {store?.pending_orders.length ? store.pending_orders.map((order) => (
              <Card key={order.id} variant="outlined" style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <View style={styles.flex}>
                    <AppText variant="label">{order.order_number}</AppText>
                  </View>
                  <View style={styles.orderAmount}>
                    <AppText variant="label" color="link">
                      {formatDashboardCurrency(order.total_fcfa, locale)} {t('dashboardDirectProductionCostUnit')}
                    </AppText>
                    <Badge
                      label={t(getOrderStatusLabelKey(order.status, order.delivery_method))}
                      tone={getOrderStatusTone(order)}
                    />
                  </View>
                </View>
                {canConfirmOrderReceipt(order) ? (
                  <View style={styles.pendingOrderAction}>
                    <AppText variant="helper" color="warning">
                      {t('orderConfirmationPendingHelp')}
                    </AppText>
                    <Button
                      label={t(getOrderReceiptActionLabelKey(order))}
                      loading={confirmingOrderId === order.id}
                      disabled={Boolean(confirmingOrderId) && confirmingOrderId !== order.id}
                      onPress={() => handleConfirmPendingOrder(order)}
                    />
                  </View>
                ) : null}
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
                  <AppText variant="helper" color="muted">
                    {classificationEntryId ? t('storeClassificationFormDescription') : t('storeManualFormDescription')}
                  </AppText>
                </View>
                <IconButton icon="close" variant="surface" accessibilityLabel={t('close')} onPress={() => setManualModalVisible(false)} disabled={submitting} />
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={styles.form}>
                  <View style={styles.formRow}>
                    <View style={styles.flex}>
                      <Button
                        label={t('storeAquacareFeed')}
                        variant={feedMode === 'catalog' ? 'primary' : 'outline'}
                        onPress={() => { setFeedMode('catalog'); setSelectedFeedReferenceId(null); }}
                      />
                    </View>
                    <View style={styles.flex}>
                      <Button
                        label={t('storeExternalFeed')}
                        variant={feedMode === 'external' ? 'primary' : 'outline'}
                        onPress={() => { setFeedMode('external'); setSelectedProductId(null); }}
                      />
                    </View>
                  </View>
                  {feedMode === 'catalog' ? products.map((product) => (
                    <SelectableCard
                      key={product.id}
                      accessibilityLabel={`${product.brand || product.name} ${product.name}`}
                      selected={selectedProductId === product.id}
                      layout="column"
                      primaryBorder
                      onPress={() => {
                        setSelectedProductId(product.id);
                        setFeedSizeMm(String(product.pellet_size_mm));
                      }}
                    >
                      <View style={styles.productOptionHeader}>
                        <View style={styles.flex}>
                          <AppText variant="bodyStrong" color="link" numberOfLines={1}>
                            {t('storeProductTitle', { brand: product.brand || product.name, name: product.name })}
                          </AppText>
                        </View>
                        <Ionicons
                          name={selectedProductId === product.id ? 'checkmark-circle' : 'ellipse-outline'}
                          size={24}
                          color={colors.brand.primary}
                        />
                      </View>
                      <AppText variant="helper" color="muted">
                        {t('storeProductDetails', {
                          species: product.species === 'catfish' ? t('catfish') : t('tilapia'),
                          size: displayDecimal(product.pellet_size_mm),
                          weight: displayDecimal(product.package_weight_kg),
                        })}
                      </AppText>
                    </SelectableCard>
                  )) : (
                    <>
                      <AppText variant="label">{t('storeExistingExternalFeeds')}</AppText>
                      {feedReferences.filter((reference) => (
                        reference.source === 'external' && reference.species === selectedCycle?.species
                      )).map((reference) => (
                        <SelectableCard
                          key={reference.id}
                          accessibilityLabel={t('storeExternalFeedOption', {
                            name: reference.name,
                            size: displayDecimal(reference.pellet_size_mm),
                          })}
                          selected={selectedFeedReferenceId === reference.id}
                          layout="column"
                          primaryBorder
                          onPress={() => {
                            setSelectedFeedReferenceId(reference.id);
                            setLabel(reference.name);
                            setFeedSizeMm(reference.pellet_size_mm);
                            setCreatingExternalFeed(false);
                          }}
                        >
                          <View style={styles.productOptionHeader}>
                            <View style={styles.flex}>
                              <AppText variant="bodyStrong">{reference.name}</AppText>
                              <AppText variant="helper" color="muted">
                                {t('storePelletSizeChip', { size: displayDecimal(reference.pellet_size_mm) })}
                              </AppText>
                            </View>
                            <Ionicons
                              name={selectedFeedReferenceId === reference.id ? 'checkmark-circle' : 'ellipse-outline'}
                              size={24}
                              color={colors.brand.primary}
                            />
                          </View>
                        </SelectableCard>
                      ))}
                      <Button
                        label={t('storeAddExternalFeed')}
                        variant={creatingExternalFeed ? 'primary' : 'outline'}
                        onPress={() => {
                          setCreatingExternalFeed(true);
                          setSelectedFeedReferenceId(null);
                          setLabel('');
                          setFeedSizeMm('');
                        }}
                      />
                      {creatingExternalFeed ? (
                        <>
                          <Divider />
                          <AppText variant="label">{t('storeCreateExternalFeed')}</AppText>
                          <TextField
                            label={t('storeManualLabel')}
                            value={label}
                            onChangeText={setLabel}
                            placeholder={t('storeManualLabelPlaceholder')}
                          />
                          {store?.available_pellet_sizes === undefined ? (
                            <TextField
                              label={t('storeManualFeedSize')}
                              value={feedSizeMm}
                              onChangeText={setFeedSizeMm}
                              keyboardType="decimal-pad"
                              placeholder={t('storeManualFeedSizePlaceholder')}
                            />
                          ) : (
                            <>
                              <AppText variant="label">{t('storePelletSizeOptions')}</AppText>
                              <View style={styles.sizeChips}>
                                {store.available_pellet_sizes.map((size) => (
                                  <Button
                                    key={size}
                                    label={t('storePelletSizeChip', { size: displayDecimal(size) })}
                                    size="small"
                                    fullWidth={false}
                                    variant={feedSizeMm === size ? 'primary' : 'outline'}
                                    onPress={() => setFeedSizeMm(size)}
                                  />
                                ))}
                              </View>
                            </>
                          )}
                        </>
                      ) : null}
                    </>
                  )}
                  {!classificationEntryId ? (
                    <>
                      <View style={styles.formRow}>
                        <View style={styles.flex}><TextField label={t('storeManualQuantity')} value={quantityKg} onChangeText={setQuantityKg} keyboardType="decimal-pad" placeholder={t('storeManualQuantityPlaceholder')} /></View>
                        <View style={styles.flex}><TextField label={t('storeManualTotalCost')} value={totalCostFcfa} onChangeText={setTotalCostFcfa} keyboardType="decimal-pad" placeholder={t('storeManualTotalCostPlaceholder')} /></View>
                      </View>
                      <TextField label={t('storeManualDate')} value={entryDate} onChangeText={setEntryDate} placeholder={t('storeManualDatePlaceholder')} />
                      <TextField label={t('storeManualNote')} value={note} onChangeText={setNote} placeholder={t('storeManualNotePlaceholder')} multiline textAlignVertical="top" />
                    </>
                  ) : null}
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
  root: { flex: 1, backgroundColor: colors.surface.dashboard },
  content: { padding: spacing[4], paddingBottom: spacing[6], gap: spacing[4] },
  section: { gap: spacing[3] },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  tracking: { marginTop: -spacing[2] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderCard: { padding: spacing[3] },
  orderHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  pendingOrderAction: { marginTop: spacing[3], gap: spacing[2] },
  orderAmount: { alignItems: 'flex-end', gap: spacing[1] },
  productOptionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], width: '100%' },
  stockItem: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] },
  actionList: { gap: spacing[3] },
  flex: { flex: 1 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay.default },
  keyboardView: { maxHeight: '92%' },
  modalCard: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: spacing[5], maxHeight: '100%' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], marginBottom: spacing[4] },
  form: { gap: spacing[3], paddingBottom: spacing[2] },
  formRow: { flexDirection: 'row', gap: spacing[3] },
  formActions: { gap: spacing[2] },
  sizeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
});
