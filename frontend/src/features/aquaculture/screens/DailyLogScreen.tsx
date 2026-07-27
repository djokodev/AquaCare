import React, { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { fetchDashboardData } from '@/features/aquaculture/store/aquacultureSlice';
import { CycleLog, CycleStore, DailyLogForm } from '@/types/aquaculture';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { estimateAverageWeight } from '@/domain/aquaculture/estimators';
import { calculateEstimatedBiomass, calculateStockValue } from '@/constants/aquaculture';
import SuccessRewardModal from '@/components/modals/SuccessRewardModal';
import {
  AppHeader,
  AppText,
  Button,
  Card,
  EmptyState,
  InlineAlert,
  LoadingState,
  Screen,
  TextField,
} from '@/components/ui';
import { colors, spacing } from '@/theme';
import { getApiErrorMessage, parseApiError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';
import {
  createCycleLogWithOfflineFallback,
  runSilentOfflineSync,
} from '@/features/aquaculture/services/aquacultureWorkflowService';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import FeedingTimesField from '@/features/aquaculture/components/FeedingTimesField';
import { formatDecimalForDisplay, formatEditableNumber, parseLocalizedNumber } from '@/utils/localizedNumber';
import { projectOfflineStore } from '@/features/aquaculture/services/offlineStoreProjection';
import { OfflineCycleLog, offlineService } from '@/services/offlineService';

interface DailyLogData {
  mortality_count: string;
  mortality_reason: string;
  feed_quantity: string;
  feed_type: string;
  feed_size_mm: string;
  feed_reference: string;
  dissolved_oxygen: string;
  water_temperature: string;
  ph_level: string;
  ammonia_level: string;
  sample_count: string;
  sample_total_weight: string;
  observations: string;
}

type DailyLogField = keyof DailyLogData | 'feeding_status' | 'feeding_times' | 'feed_stock_item' | 'scope';
type FormErrors = Partial<Record<DailyLogField, string>>;
type FeedingStatus = 'fed' | 'not_fed' | null;

const FEED_STOCK_ERROR_CODES = new Set([
  'feed_stock_not_started',
  'feed_log_before_stock_tracking',
  'insufficient_feed_stock',
  'feed_stock_history_inconsistent',
  'feed_stock_item_unavailable',
]);

type DailyLogScreenNavigationProp = StackNavigationProp<RootStackParamList, 'DailyLog'>;
type DailyLogScreenRouteProp = RouteProp<RootStackParamList, 'DailyLog'>;

interface DailyLogScreenProps {
  navigation: DailyLogScreenNavigationProp;
  route?: DailyLogScreenRouteProp;
}

const EMPTY_FORM: DailyLogData = {
  mortality_count: '',
  mortality_reason: '',
  feed_quantity: '',
  feed_type: '',
  feed_size_mm: '',
  feed_reference: '',
  dissolved_oxygen: '',
  water_temperature: '',
  ph_level: '',
  ammonia_level: '',
  sample_count: '',
  sample_total_weight: '',
  observations: '',
};

const getLocalIsoDate = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

const parseOptionalDecimal = (value: string): number | null => {
  const result = parseLocalizedNumber(value);
  return result.kind === 'valid' ? result.value : null;
};

const parseOptionalInteger = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number(trimmed);
};

const numericFeedSize = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = parseLocalizedNumber(value);
  return parsed.kind === 'valid' ? parsed.value : null;
};

const offlineLogAsCycleLog = (offlineLog: OfflineCycleLog): CycleLog => ({
  id: offlineLog.id,
  cycle: offlineLog.cycleId,
  cycle_unit_allocation: offlineLog.logData.cycle_unit_allocation ?? null,
  log_date: offlineLog.logData.log_date ?? getLocalIsoDate(),
  client_uuid: offlineLog.logData.client_uuid,
  mortality_count: offlineLog.logData.mortality_count,
  mortality_reason: offlineLog.logData.mortality_reason,
  sample_count: offlineLog.logData.sample_count,
  sample_total_weight: offlineLog.logData.sample_total_weight,
  feed_quantity: offlineLog.logData.feed_quantity,
  feed_type: offlineLog.logData.feed_type,
  feed_size_mm: offlineLog.logData.feed_size_mm,
  feed_reference: offlineLog.logData.feed_reference,
  feed_reference_client_uuid: offlineLog.logData.feed_reference_client_uuid,
  feeding_times: offlineLog.logData.feeding_times,
  water_temperature: offlineLog.logData.water_temperature,
  dissolved_oxygen: offlineLog.logData.dissolved_oxygen,
  ph_level: offlineLog.logData.ph_level,
  ammonia_level: offlineLog.logData.ammonia_level,
  observations: offlineLog.logData.observations,
  created_offline: true,
  pending_sync: true,
  created_at: new Date(offlineLog.timestamp).toISOString(),
  server_log_id: offlineLog.server_log_id ?? null,
});

export default function DailyLogScreen({ navigation, route }: DailyLogScreenProps) {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { dashboardData } = useSelector((state: RootState) => state.aquaculture);
  const routeParams = route?.params;
  const cycleId = routeParams?.cycleId || '';
  const unitAllocationId = routeParams?.cycleUnitAllocationId || '';
  const unitName = routeParams?.productionUnitName || t('productionUnitsUnknownUnit');
  const selectedCycle = dashboardData?.active_cycles?.find((cycle) => cycle.id === cycleId) || null;
  const useComma = i18n.language?.startsWith('fr') ?? false;
  const numberLocale = useComma ? 'fr-FR' : 'en-US';

  const [formData, setFormData] = useState<DailyLogData>(EMPTY_FORM);
  const [feedingStatus, setFeedingStatus] = useState<FeedingStatus>(null);
  const [feedingTimes, setFeedingTimes] = useState<string[]>([]);
  const [store, setStore] = useState<CycleStore | null>(null);
  const [existingLog, setExistingLog] = useState<CycleLog | null>(null);
  const [localLogConflict, setLocalLogConflict] = useState(false);
  const [loadingContext, setLoadingContext] = useState(Boolean(cycleId && unitAllocationId));
  const [contextError, setContextError] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<DailyLogField, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rewardModalVisible, setRewardModalVisible] = useState(false);
  const [rewardData, setRewardData] = useState({
    averageWeight: 0,
    fishCount: 0,
    estimatedBiomass: 0,
    stockValue: 0,
  });

  useEffect(() => {
    const bootstrap = async () => {
      await runSilentOfflineSync();
      dispatch(fetchDashboardData({ lightweight: true }));
    };
    void bootstrap();
  }, [dispatch]);

  useEffect(() => {
    if (!cycleId || !unitAllocationId) {
      setLoadingContext(false);
      return;
    }

    let active = true;
    const loadContext = async () => {
      setLoadingContext(true);
      setContextError(false);
      setLocalLogConflict(false);
      const today = getLocalIsoDate();
      const [logsResult, storeResult, localLogResult] = await Promise.allSettled([
        aquacultureService.getCycleLogs(cycleId, { cycleUnitAllocationId: unitAllocationId }),
        aquacultureService.getCycleStore(cycleId),
        offlineService.findPendingCycleLogForScope({
          cycleId,
          logDate: today,
          cycleUnitAllocationId: unitAllocationId || null,
        }),
      ]);
      if (!active) {
        return;
      }

      const serverStore = storeResult.status === 'fulfilled' ? storeResult.value : null;
      setStore(serverStore);
      try {
        const projection = await projectOfflineStore(
          cycleId,
          serverStore,
          t('storePendingStockLabel'),
        );
        if (active) setStore(projection.store);
      } catch {
        if (storeResult.status === 'rejected') setContextError(true);
      }

      const serverLog = logsResult.status === 'fulfilled'
        ? logsResult.value.find((log) => log.log_date === today) ?? null
        : null;
      const offlineLog = localLogResult.status === 'fulfilled'
        ? localLogResult.value
        : null;
      const localEditableLog = offlineLog ? offlineLogAsCycleLog(offlineLog) : null;
      let todayLog = serverLog;
      if (localEditableLog) {
        const sameServerLog = Boolean(
          serverLog && localEditableLog.server_log_id && localEditableLog.server_log_id === serverLog.id,
        );
        if (serverLog && !sameServerLog && serverLog.client_uuid !== localEditableLog.client_uuid) {
          setLocalLogConflict(true);
        } else {
          todayLog = localEditableLog.server_log_id && !sameServerLog
            ? { ...localEditableLog, server_log_id: null }
            : localEditableLog;
        }
      }
      setExistingLog(todayLog);
      if (todayLog) {
          setFormData({
            mortality_count: String(todayLog.mortality_count ?? 0),
            mortality_reason: todayLog.mortality_reason ?? '',
            feed_quantity: formatEditableNumber(todayLog.feed_quantity, useComma),
            feed_type: todayLog.feed_type ?? '',
            feed_size_mm: formatEditableNumber(todayLog.feed_size_mm, useComma),
            feed_reference: todayLog.feed_reference
              ?? todayLog.feed_reference_client_uuid
              ?? '',
            dissolved_oxygen: formatEditableNumber(todayLog.dissolved_oxygen, useComma),
            water_temperature: formatEditableNumber(todayLog.water_temperature, useComma),
            ph_level: formatEditableNumber(todayLog.ph_level, useComma),
            ammonia_level: formatEditableNumber(todayLog.ammonia_level, useComma),
            sample_count: todayLog.sample_count === undefined ? '' : String(todayLog.sample_count),
            sample_total_weight: formatEditableNumber(todayLog.sample_total_weight, useComma),
            observations: todayLog.observations ?? '',
          });
          const wasFed = Number(todayLog.feed_quantity ?? 0) > 0 || (todayLog.feeding_times?.length ?? 0) > 0;
          setFeedingStatus(wasFed ? 'fed' : 'not_fed');
          setFeedingTimes(todayLog.feeding_times ?? []);
      }
      if (logsResult.status === 'rejected' && !localEditableLog) {
        setContextError(true);
      }
      setLoadingContext(false);
    };

    void loadContext();
    return () => {
      active = false;
    };
  }, [cycleId, unitAllocationId, useComma]);

  const stockBySize = useMemo(() => {
    if (!store) return [];
    if (store.stock_by_size?.length) return store.stock_by_size;
    const groups = new Map<string, NonNullable<CycleStore['stock_by_size']>[number]>();
    store.stock_items.forEach((item) => {
      // Un stock legacy sans référence alimentaire reste visible dans le
      // Magasin, mais ne peut pas être utilisé pour une ration journalière.
      if ((!item.feed_reference_id && !item.feed_reference_client_uuid) || !item.feed_size_mm) return;
      const key = String(Number(item.feed_size_mm));
      const current = groups.get(key) ?? {
        feed_size_mm: item.feed_size_mm,
        quantity_added_kg: '0.00',
        quantity_consumed_kg: '0.00',
        quantity_available_kg: '0.00',
      };
      current.quantity_added_kg = (Number(current.quantity_added_kg) + Number(item.quantity_added_kg)).toFixed(2);
      current.quantity_consumed_kg = (Number(current.quantity_consumed_kg) + Number(item.quantity_consumed_kg)).toFixed(2);
      current.quantity_available_kg = (Number(current.quantity_available_kg) + Number(item.quantity_available_kg)).toFixed(2);
      groups.set(key, current);
    });
    return Array.from(groups.values()).sort((left, right) => Number(left.feed_size_mm) - Number(right.feed_size_mm));
  }, [store]);

  const selectedStockItem = useMemo(() => store?.stock_items?.find((item) => (
    Number(item.feed_size_mm) === numericFeedSize(formData.feed_size_mm)
      && Boolean(item.feed_reference_id || item.feed_reference_client_uuid)
      && Number(item.quantity_available_kg) > 0
  )) ?? null, [formData.feed_size_mm, store?.stock_items]);
  const selectedStockBySize = stockBySize.find(
    (item) => Number(item.feed_size_mm) === numericFeedSize(formData.feed_size_mm),
  ) ?? null;

  const availableFeedKg = useMemo(() => {
    if (!selectedStockBySize) {
      return null;
    }
    const remaining = Number(selectedStockBySize.quantity_available_kg ?? 0);
    const previous = numericFeedSize(existingLog?.feed_size_mm) === numericFeedSize(formData.feed_size_mm)
      ? Number(existingLog?.feed_quantity ?? 0)
      : 0;
    return remaining + previous;
  }, [existingLog, formData.feed_size_mm, selectedStockBySize]);
  const totalAvailableFeedKg = store
    ? stockBySize.reduce((total, item) => total + Number(item.quantity_available_kg ?? 0), 0)
    : null;
  const unclassifiedStockKg = store
    ? Number(store.summary.unclassified_stock_kg ?? 0)
    : 0;

  const validationErrors = useMemo<FormErrors>(() => {
    const errors: FormErrors = {};
    if (localLogConflict) {
      errors.scope = t('dailyLogServerLocalConflict');
    }
    const mortality = parseOptionalInteger(formData.mortality_count);
    if (!formData.mortality_count.trim()) {
      errors.mortality_count = t('fieldRequired');
    } else if (mortality === null) {
      errors.mortality_count = t('wholeNumberRequired');
    }
    if ((mortality ?? 0) > 0 && !formData.mortality_reason.trim()) {
      errors.mortality_reason = t('mortalityReasonRequired');
    }

    if (!feedingStatus) {
      errors.feeding_status = t('feedingStatusRequired');
    }

    if (feedingStatus === 'fed') {
      const quantity = parseLocalizedNumber(formData.feed_quantity);
      if (quantity.kind === 'empty') {
        errors.feed_quantity = t('fieldRequired');
      } else if (quantity.kind === 'invalid' || quantity.value < 0.01) {
        errors.feed_quantity = t('feedQuantityMinimum');
      } else if (!store) {
        errors.feed_quantity = t('feedStockUnavailable');
      } else if (store.status === 'not_started') {
        errors.feed_quantity = t('feedStockRequired');
      } else if (unclassifiedStockKg > 0 && stockBySize.length === 0) {
        errors.feed_stock_item = t('feedStockRequiresClassification', {
          available: formatDecimalForDisplay(unclassifiedStockKg, numberLocale),
        });
      } else if (!selectedStockBySize) {
        errors.feed_stock_item = t('feedStockItemRequired');
      } else if (availableFeedKg !== null && quantity.value > availableFeedKg) {
        errors.feed_quantity = t('feedStockInsufficient', {
          available: formatDecimalForDisplay(availableFeedKg, numberLocale),
        });
      }
      if (feedingTimes.length === 0) {
        errors.feeding_times = t('feedingTimeRequired');
      }
    }

    const decimalRanges: Array<[keyof DailyLogData, number, number]> = [
      ['water_temperature', 0, 50],
      ['dissolved_oxygen', 0, 20],
      ['ph_level', 0, 14],
      ['ammonia_level', 0, Number.POSITIVE_INFINITY],
    ];
    decimalRanges.forEach(([field, minimum, maximum]) => {
      const value = formData[field];
      if (!value.trim()) {
        return;
      }
      const parsed = parseLocalizedNumber(value);
      if (parsed.kind !== 'valid' || parsed.value < minimum || parsed.value > maximum) {
        errors[field] = t('invalidMeasurement');
      }
    });

    const hasSampleCount = Boolean(formData.sample_count.trim());
    const hasSampleWeight = Boolean(formData.sample_total_weight.trim());
    if (hasSampleCount !== hasSampleWeight) {
      errors.sample_count = t('samplingPairRequired');
      errors.sample_total_weight = t('samplingPairRequired');
    } else if (hasSampleCount && hasSampleWeight) {
      const count = parseOptionalInteger(formData.sample_count);
      const weight = parseLocalizedNumber(formData.sample_total_weight);
      if (count === null || count < 5) {
        errors.sample_count = t('sampleCountTooLow', { min: 5 });
      }
      if (weight.kind !== 'valid' || weight.value < 0.1) {
        errors.sample_total_weight = t('sampleWeightInvalid');
      }
    }

    return errors;
  }, [availableFeedKg, feedingStatus, feedingTimes.length, formData, localLogConflict, numberLocale, selectedStockBySize, stockBySize.length, store, t, unclassifiedStockKg]);

  const visibleError = (field: DailyLogField): string | undefined =>
    submitted || touched[field] ? serverErrors[field] ?? validationErrors[field] : undefined;

  const updateField = (field: keyof DailyLogData, value: string) => {
    setTouched((previous) => ({ ...previous, [field]: true }));
    setServerErrors((previous) => ({ ...previous, [field]: undefined }));
    setFormData((previous) => ({ ...previous, [field]: value }));
  };

  const selectFeedingStatus = (status: Exclude<FeedingStatus, null>) => {
    setTouched((previous) => ({ ...previous, feeding_status: true }));
    setServerErrors((previous) => ({
      ...previous,
      feeding_status: undefined,
      feed_quantity: undefined,
      feed_type: undefined,
      feed_size_mm: undefined,
      feed_reference: undefined,
      feed_stock_item: undefined,
      feeding_times: undefined,
    }));
    setFeedingStatus(status);
    if (status === 'not_fed') {
      setFormData((previous) => ({
        ...previous,
        feed_quantity: '',
        feed_type: '',
        feed_size_mm: '',
        feed_reference: '',
      }));
      setFeedingTimes([]);
    }
  };

  const handleSave = async () => {
    setSubmitted(true);
    if (!cycleId || !unitAllocationId || Object.keys(validationErrors).length > 0) {
      return;
    }

    const mortalityCount = parseOptionalInteger(formData.mortality_count) ?? 0;
    const sampleCount = parseOptionalInteger(formData.sample_count);
    const sampleWeight = parseOptionalDecimal(formData.sample_total_weight);
    const feedQuantity = feedingStatus === 'fed' ? parseOptionalDecimal(formData.feed_quantity) : null;

    const logData: DailyLogForm = {
      log_date: getLocalIsoDate(),
      cycle_unit_allocation: unitAllocationId,
      mortality_count: mortalityCount,
      mortality_reason: formData.mortality_reason.trim(),
      sample_count: sampleCount,
      sample_total_weight: sampleWeight,
      feed_quantity: feedQuantity,
      feed_type: feedingStatus === 'fed' ? selectedStockItem?.label ?? '' : '',
      feed_size_mm: feedingStatus === 'fed' ? parseOptionalDecimal(formData.feed_size_mm) : null,
      // The mobile flow selects only the compatible pellet size. The backend
      // owns origin resolution and FIFO allocation across all matching feeds.
      feed_reference: null,
      feed_reference_client_uuid: null,
      feeding_times: feedingStatus === 'fed' ? feedingTimes : [],
      water_temperature: parseOptionalDecimal(formData.water_temperature),
      dissolved_oxygen: parseOptionalDecimal(formData.dissolved_oxygen),
      ph_level: parseOptionalDecimal(formData.ph_level),
      ammonia_level: parseOptionalDecimal(formData.ammonia_level),
      observations: formData.observations.trim(),
      client_uuid: existingLog?.client_uuid,
    };

    setSaving(true);
    try {
      const serverLogId = existingLog?.server_log_id
        ?? (existingLog && !existingLog.pending_sync ? existingLog.id : null);
      const creationResult = serverLogId
        ? await createCycleLogWithOfflineFallback(cycleId, logData, { serverLogId })
        : await createCycleLogWithOfflineFallback(cycleId, logData);
      dispatch(fetchDashboardData({ lightweight: true }));

      if (sampleCount && sampleWeight && selectedCycle) {
        const averageWeight = sampleWeight / sampleCount;
        const remainingFish = (selectedCycle.current_count || 0) - mortalityCount;
        const biomass = calculateEstimatedBiomass(remainingFish, averageWeight);
        setRewardData({
          averageWeight,
          fishCount: remainingFish,
          estimatedBiomass: biomass,
          stockValue: calculateStockValue(biomass),
        });
        setRewardModalVisible(true);
      } else {
        const successKey = creationResult.mode === 'online' ? 'recordSaved' : 'recordSavedOffline';
        Alert.alert(t('success'), t(successKey), [{ text: t('ok'), onPress: () => navigation.goBack() }]);
      }
    } catch (error: unknown) {
      const parsedError = parseApiError(error);
      const rawError = parsedError.rawError && typeof parsedError.rawError === 'object'
        ? parsedError.rawError as Record<string, unknown>
        : {};
      if (parsedError.code && FEED_STOCK_ERROR_CODES.has(parsedError.code)) {
        const message = parsedError.code === 'insufficient_feed_stock'
          ? t('feedStockInsufficient', { available: String(rawError.available_feed_kg ?? '0') })
          : parsedError.code === 'feed_stock_history_inconsistent'
            ? t('feedStockHistoryInconsistent', {
              minimum: String(rawError.minimum_balance_kg ?? '0'),
            })
          : parsedError.code === 'feed_stock_item_unavailable'
            ? unclassifiedStockKg > 0
              ? t('feedStockRequiresClassification', {
                available: formatDecimalForDisplay(unclassifiedStockKg, numberLocale),
              })
              : t('feedStockItemRequired')
          : parsedError.code === 'feed_log_before_stock_tracking'
            ? t('feedLogBeforeStockTracking')
            : t('feedStockRequired');
        const field = parsedError.code === 'feed_stock_item_unavailable'
          ? 'feed_stock_item'
          : 'feed_quantity';
        setServerErrors({ [field]: message });
        setTouched((previous) => ({ ...previous, [field]: true }));
        return;
      }
      const backendFieldErrors = parsedError.details.reduce<FormErrors>((result, detail) => {
        const field = detail.field.split('.').at(-1) as DailyLogField;
        if (field in EMPTY_FORM || field === 'feeding_times') {
          result[field] = detail.messages[0];
        }
        return result;
      }, {});
      if (Object.keys(backendFieldErrors).length > 0) {
        setServerErrors(backendFieldErrors);
        setTouched((previous) => ({ ...previous, ...Object.fromEntries(Object.keys(backendFieldErrors).map((key) => [key, true])) }));
        return;
      }
      const fallbackMessage = getApiErrorMessage(error, t('recordSaveError'));
      const actionableMessage = parsedError.status > 0
        ? formatAquacultureErrorWithAction(parsedError, t)
        : fallbackMessage;
      Alert.alert(t('error'), actionableMessage);
    } finally {
      setSaving(false);
    }
  };

  if (!cycleId || !unitAllocationId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface.page }}>
        <AppHeader title={t('dailyLogTitle')} onBack={() => navigation.goBack()} backLabel={t('back')} />
        <Screen style={{ justifyContent: 'center' }}>
          <EmptyState
            title={t('dailyLogUnitRequiredTitle')}
            message={t('dailyLogUnitRequiredMessage')}
            actionLabel={cycleId ? t('chooseProductionUnit') : undefined}
            onAction={cycleId ? () => navigation.navigate('ProductionUnitsHub', { cycleId }) : undefined}
          />
        </Screen>
      </View>
    );
  }

  if (loadingContext) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface.page }}>
        <AppHeader title={t('dailyLogTitle')} onBack={() => navigation.goBack()} backLabel={t('back')} />
        <Screen><LoadingState message={t('loading')} /></Screen>
      </View>
    );
  }

  const stockTone = unclassifiedStockKg > 0 && (totalAvailableFeedKg ?? 0) <= 0
    ? 'warning'
    : store?.status === 'ok' ? 'success' : store?.status === 'low' ? 'warning' : 'error';

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface.page }}>
      <AppHeader title={t('dailyLogTitle')} onBack={() => navigation.goBack()} backLabel={t('back')} />
      <Screen scroll>
        <View style={{ gap: spacing[5] }}>
          <Card variant="outlined">
            <AppText variant="label" color="link" style={{ marginBottom: spacing[1] }}>
              {selectedCycle?.cycle_name || t('sessionCycleNotSelected')}
            </AppText>
            <AppText variant="body" color="muted">{t('dailyLogUnitContextLabel', { unitName })}</AppText>
            {existingLog ? (
              <AppText variant="helper" color="link" style={{ marginTop: spacing[2] }}>
                {existingLog.pending_sync
                  ? t('dailyLogPendingLocalUpdate')
                  : t('dailyLogUpdatingToday')}
              </AppText>
            ) : null}
          </Card>

          {contextError ? <InlineAlert tone="warning" message={t('dailyLogContextLoadError')} /> : null}
          {localLogConflict ? (
            <InlineAlert tone="warning" message={t('dailyLogServerLocalConflict')} />
          ) : null}

          <Card>
            <AppText variant="sectionTitle" style={{ marginBottom: spacing[4] }}>{t('dailyRecommendedSection')}</AppText>

            <View style={{ flexDirection: 'row', gap: spacing[3] }}>
              <View style={{ flex: 1 }}>
                <TextField
                  required
                  label={t('mortality')}
                  value={formData.mortality_count}
                  onChangeText={(value) => updateField('mortality_count', value)}
                  placeholder={t('mortalityPlaceholder')}
                  keyboardType="number-pad"
                  error={visibleError('mortality_count')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  required={(parseOptionalInteger(formData.mortality_count) ?? 0) > 0}
                  label={t('mortalityReason')}
                  value={formData.mortality_reason}
                  onChangeText={(value) => updateField('mortality_reason', value)}
                  placeholder={t('mortalityReasonPlaceholder')}
                  error={visibleError('mortality_reason')}
                />
              </View>
            </View>

            <AppText variant="label" style={{ marginBottom: spacing[2] }}>
              {t('feedingStatus')} <AppText variant="label" color="error">*</AppText>
            </AppText>
            <View style={{ flexDirection: 'row', gap: spacing[3], marginBottom: spacing[2] }}>
              <Button
                label={t('feedingDone')}
                onPress={() => selectFeedingStatus('fed')}
                variant={feedingStatus === 'fed' ? 'primary' : 'outline'}
                fullWidth={false}
                containerStyle={{ flex: 1 }}
              />
              <Button
                label={t('feedingNotDone')}
                onPress={() => selectFeedingStatus('not_fed')}
                variant={feedingStatus === 'not_fed' ? 'primary' : 'outline'}
                fullWidth={false}
                containerStyle={{ flex: 1 }}
              />
            </View>
            {visibleError('feeding_status') ? (
              <AppText variant="helper" color="error" style={{ marginBottom: spacing[4] }}>
                {visibleError('feeding_status')}
              </AppText>
            ) : null}

            {feedingStatus === 'fed' ? (
              <>
                <InlineAlert
                  tone={stockTone}
                  message={store
                    ? (unclassifiedStockKg > 0 && (totalAvailableFeedKg ?? 0) <= 0
                      ? t('feedStockRequiresClassification', {
                        available: formatDecimalForDisplay(unclassifiedStockKg, numberLocale),
                      })
                      : t('feedStockAvailable', {
                        available: formatDecimalForDisplay(availableFeedKg ?? totalAvailableFeedKg ?? 0, numberLocale),
                      }))
                    : t('feedStockUnavailable')}
                />
                {store?.status === 'not_started' || (totalAvailableFeedKg ?? 0) <= 0 || unclassifiedStockKg > 0 ? (
                  <Button
                    label={unclassifiedStockKg > 0 ? t('identifyFeedStock') : t('declareFeedStock')}
                    onPress={() => navigation.navigate('Store', { cycleId })}
                    variant="outline"
                    size="small"
                    containerStyle={{ marginTop: spacing[2], marginBottom: spacing[4] }}
                  />
                ) : <View style={{ height: spacing[4] }} />}

                <AppText variant="label" style={{ marginBottom: spacing[2] }}>
                  {t('feedGranulometry')} <AppText variant="label" color="error">*</AppText>
                </AppText>
                <View style={{ gap: spacing[2], marginBottom: spacing[2] }}>
                  {(store?.available_pellet_sizes ?? stockBySize.map((item) => item.feed_size_mm)).map((size) => {
                    const group = stockBySize.find((item) => Number(item.feed_size_mm) === Number(size));
                    const sizeItem = store?.stock_items.find(
                      (item) => Number(item.feed_size_mm) === Number(size) && Number(item.quantity_available_kg) > 0,
                    );
                    const displaySize = formatDecimalForDisplay(size, numberLocale);
                    const selected = numericFeedSize(formData.feed_size_mm) === Number(size);
                    const recommended = numericFeedSize(store?.recommended_pellet_size_mm) === Number(size);
                    const optionLabel = t('feedStockItemOption', {
                      label: '',
                      size: displaySize,
                      available: formatDecimalForDisplay(group?.quantity_available_kg ?? '0', numberLocale),
                    });
                    const displayLabel = recommended
                      ? `${optionLabel} · ${t('recommendedPelletSizeChip')}`
                      : optionLabel;
                    return (
                      <Button
                        key={size}
                        label={displayLabel}
                        variant={selected ? 'primary' : 'outline'}
                        disabled={!group || Number(group.quantity_available_kg) <= 0}
                        onPress={() => {
                          setTouched((previous) => ({ ...previous, feed_stock_item: true }));
                          setServerErrors((previous) => ({ ...previous, feed_stock_item: undefined }));
                          setFormData((previous) => ({
                            ...previous,
                            feed_type: sizeItem?.label ?? '',
                            feed_size_mm: String(size),
                            feed_reference: sizeItem?.feed_reference_id ?? sizeItem?.feed_reference_client_uuid ?? '',
                          }));
                        }}
                      />
                    );
                  })}
                </View>
                {Number(store?.recommended_pellet_size_mm) > 0 ? (
                  <AppText variant="helper" color="link" style={{ marginBottom: spacing[2] }}>
                    {t('recommendedPelletSize', {
                      size: formatDecimalForDisplay(store?.recommended_pellet_size_mm, numberLocale),
                    })}
                  </AppText>
                ) : null}
                {visibleError('feed_stock_item') ? (
                  <AppText variant="helper" color="error" style={{ marginBottom: spacing[3] }}>
                    {visibleError('feed_stock_item')}
                  </AppText>
                ) : null}

                <TextField
                  required
                  label={t('feedQuantity')}
                  value={formData.feed_quantity}
                  onChangeText={(value) => updateField('feed_quantity', value)}
                  placeholder={t('feedQuantityPlaceholder')}
                  keyboardType="decimal-pad"
                  error={visibleError('feed_quantity')}
                />

                <FeedingTimesField
                  required
                  value={feedingTimes}
                  onChange={(value) => {
                    setTouched((previous) => ({ ...previous, feeding_times: true }));
                    setServerErrors((previous) => ({ ...previous, feeding_times: undefined }));
                    setFeedingTimes(value);
                  }}
                  error={visibleError('feeding_times')}
                />
              </>
            ) : null}

            <View style={{ flexDirection: 'row', gap: spacing[3] }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t('waterTemperatureUnit')}
                  value={formData.water_temperature}
                  onChangeText={(value) => updateField('water_temperature', value)}
                  placeholder={t('waterTemperaturePlaceholder')}
                  keyboardType="decimal-pad"
                  error={visibleError('water_temperature')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t('dissolvedOxygenShort')}
                  value={formData.dissolved_oxygen}
                  onChangeText={(value) => updateField('dissolved_oxygen', value)}
                  placeholder={t('dissolvedOxygenPlaceholder')}
                  keyboardType="decimal-pad"
                  error={visibleError('dissolved_oxygen')}
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing[3] }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t('phLevel')}
                  value={formData.ph_level}
                  onChangeText={(value) => updateField('ph_level', value)}
                  placeholder={t('phLevelPlaceholder')}
                  keyboardType="decimal-pad"
                  error={visibleError('ph_level')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t('ammoniaLevel')}
                  value={formData.ammonia_level}
                  onChangeText={(value) => updateField('ammonia_level', value)}
                  placeholder={t('ammoniaLevelPlaceholder')}
                  keyboardType="decimal-pad"
                  error={visibleError('ammonia_level')}
                />
              </View>
            </View>

            <TextField
              label={t('observations')}
              value={formData.observations}
              onChangeText={(value) => updateField('observations', value)}
              placeholder={t('observationsPlaceholder')}
              multiline
              numberOfLines={4}
            />

            <AppText variant="sectionTitle" style={{ marginTop: spacing[1], marginBottom: spacing[4] }}>
              {t('weeklyRecommendedSection')}
            </AppText>
            <View style={{ flexDirection: 'row', gap: spacing[3] }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t('sampleCount')}
                  value={formData.sample_count}
                  onChangeText={(value) => updateField('sample_count', value)}
                  placeholder={t('exampleAffectedCount')}
                  keyboardType="number-pad"
                  error={visibleError('sample_count')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t('sampleWeight')}
                  value={formData.sample_total_weight}
                  onChangeText={(value) => updateField('sample_total_weight', value)}
                  placeholder={t('sampleWeightPlaceholder')}
                  keyboardType="decimal-pad"
                  error={visibleError('sample_total_weight')}
                />
              </View>
            </View>
          </Card>

          {formData.sample_count && formData.sample_total_weight && !validationErrors.sample_count && !validationErrors.sample_total_weight ? (
            <View>
              <AppText variant="sectionTitle" style={{ marginBottom: spacing[4] }}>{t('autoCalculations')}</AppText>
              <Card variant="outlined">
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="caption" color="muted">{t('averageWeight')} :</AppText>
                  <AppText variant="caption" color="link">
                    {estimateAverageWeight(
                      parseOptionalDecimal(formData.sample_total_weight) ?? 0,
                      parseOptionalInteger(formData.sample_count) ?? 0,
                    ).toFixed(1)} g
                  </AppText>
                </View>
              </Card>
            </View>
          ) : null}

          <Button
            label={existingLog ? t('updateTodayEntry') : t('save')}
            onPress={handleSave}
            disabled={saving}
            loading={saving}
            iconLeft="checkmark"
          />
        </View>

        <SuccessRewardModal
          visible={rewardModalVisible}
          onClose={() => {
            setRewardModalVisible(false);
            navigation.goBack();
          }}
          averageWeight={rewardData.averageWeight}
          fishCount={rewardData.fishCount}
          estimatedBiomass={rewardData.estimatedBiomass}
          stockValue={rewardData.stockValue}
        />
      </Screen>
    </View>
  );
}
