import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppDispatch, RootState } from '@/store/store';
import { harvestCycle, harvestCycleUnitAllocation } from '@/features/aquaculture/store/aquacultureSlice';
import { CycleUnitAllocation, HarvestData, ProductionCycle } from '@/types/aquaculture';
import { getApiErrorMessage } from '@/utils/errorParser';
import { AppText, Button, Card, FormField, IconButton, InlineAlert, TextField } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { offlineService } from '@/services/offlineService';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';

type HarvestScope = 'cycle' | 'unit';

interface ProductionUnitContext {
  cycleId: string;
  cycleUnitAllocationId: string;
  productionUnitId: string;
  productionUnitName: string;
}

interface HarvestModalProps {
  visible: boolean;
  onClose: () => void;
  cycle: ProductionCycle | null;
  scope?: HarvestScope;
  productionUnitContext?: ProductionUnitContext;
  unitAllocation?: CycleUnitAllocation | null;
  onSuccess?: () => void;
  onContactBuyer?: () => void;
  onNextCycle?: (harvestedCycleId: string) => void;
  onUnitHarvestSuccess?: () => void;
}

const toNumber = (value: number | string | null | undefined): number => {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const localHarvestDate = (value: Date): string => {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
};

const localHarvestTime = (value: Date): string =>
  `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;

const parseLocalHarvestDateTime = (localDate: string, localTime: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) {
    return null;
  }
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = localTime.split(':').map(Number);
  const value = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    Number.isNaN(value.getTime()) ||
    value.getFullYear() !== year ||
    value.getMonth() !== month - 1 ||
    value.getDate() !== day ||
    value.getHours() !== hour ||
    value.getMinutes() !== minute
  ) {
    return null;
  }
  return value;
};

const toHarvestIso = (localDate: string, localTime: string): string | null =>
  parseLocalHarvestDateTime(localDate, localTime)?.toISOString() ?? null;

const createClientUuid = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
};

const getAllocationInitialAverageWeight = (allocation: CycleUnitAllocation | null | undefined): number => {
  if (!allocation) return 0;
  if (allocation.initial_fish_count > 0 && allocation.initial_biomass_kg != null) {
    return (toNumber(allocation.initial_biomass_kg) * 1000) / allocation.initial_fish_count;
  }
  return 0;
};

const getAllocationCurrentAverageWeight = (allocation: CycleUnitAllocation | null | undefined): number => {
  if (!allocation) return 0;
  if (allocation.current_fish_count > 0 && allocation.current_biomass_kg != null) {
    return (toNumber(allocation.current_biomass_kg) * 1000) / allocation.current_fish_count;
  }
  if (allocation.final_fish_count && allocation.final_average_weight_g != null) return toNumber(allocation.final_average_weight_g);
  return getAllocationInitialAverageWeight(allocation);
};

export default function HarvestModal({
  visible,
  onClose,
  cycle,
  scope = 'cycle',
  productionUnitContext,
  unitAllocation,
  onSuccess,
  onContactBuyer,
  onNextCycle,
  onUnitHarvestSuccess,
}: HarvestModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch<AppDispatch>();
  const farmProfile = useSelector((state: RootState) => state.auth.farmProfile);
  const cycles = useSelector((state: RootState) => state.aquaculture.cycles);
  const isUnitScope = scope === 'unit';
  const unitName = productionUnitContext?.productionUnitName ?? unitAllocation?.production_unit_name ?? t('productionUnit');
  const availableFishCount = isUnitScope ? unitAllocation?.current_fish_count ?? 0 : cycle?.current_count ?? 0;
  const initialFishCount = isUnitScope ? unitAllocation?.initial_fish_count ?? 0 : cycle?.initial_count ?? 0;
  const initialAverageWeight = isUnitScope ? getAllocationInitialAverageWeight(unitAllocation) : cycle?.initial_average_weight ?? 0;
  const availableAverageWeight = isUnitScope ? getAllocationCurrentAverageWeight(unitAllocation) : cycle?.current_average_weight ?? 0;
  const [loading, setLoading] = useState(false);
  const [cycleAllocations, setCycleAllocations] = useState<CycleUnitAllocation[]>([]);
  const [harvestTime, setHarvestTime] = useState(localHarvestTime(new Date()));
  const [formData, setFormData] = useState<HarvestData>({
    client_uuid: createClientUuid(),
    harvest_date: localHarvestDate(new Date()),
    final_harvested_at: new Date().toISOString(),
    final_count: availableFishCount,
    final_average_weight: availableAverageWeight,
    total_harvested_weight: 0,
    harvest_notes: '',
    created_offline: false,
  });

  const harvestedThisYear = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return cycles.filter((item) => item.status === 'harvested' && item.end_date && new Date(item.end_date).getFullYear() === currentYear).length;
  }, [cycles]);
  const hasMoreCycles = !isUnitScope && onNextCycle != null && (harvestedThisYear + 1) < (farmProfile?.num_cycles_per_year ?? 1);

  useEffect(() => {
    setFormData((previous) => ({
      ...previous,
      total_harvested_weight: Math.round(((previous.final_count * previous.final_average_weight) / 1000) * 100) / 100,
    }));
  }, [formData.final_count, formData.final_average_weight]);

  useEffect(() => {
    if (!visible || (isUnitScope ? !unitAllocation : !cycle)) return;
    setFormData({
      client_uuid: createClientUuid(),
      harvest_date: localHarvestDate(new Date()),
      final_harvested_at: new Date().toISOString(),
      final_count: availableFishCount,
      final_average_weight: availableAverageWeight,
      total_harvested_weight: 0,
      harvest_notes: '',
      created_offline: false,
    });
    setHarvestTime(localHarvestTime(new Date()));
  }, [availableAverageWeight, availableFishCount, cycle, isUnitScope, unitAllocation, visible]);

  useEffect(() => {
    let active = true;
    if (!visible || isUnitScope || !cycle) {
      setCycleAllocations([]);
      return () => { active = false; };
    }
    void aquacultureService.getCycleUnitAllocations(cycle.id)
      .then((allocations) => {
        if (active) setCycleAllocations(allocations);
      })
      .catch(() => {
        if (active) setCycleAllocations([]);
      });
    return () => { active = false; };
  }, [cycle, isUnitScope, visible]);

  const handleInputChange = (field: keyof HarvestData, value: string | number) => {
    setFormData((previous) => ({ ...previous, [field]: value }));
  };

  const validateForm = () => {
    if (!formData.harvest_date) {
      Alert.alert(t('error'), t('harvestDateRequired'));
      return false;
    }
    const harvestedAt = parseLocalHarvestDateTime(formData.harvest_date, harvestTime);
    if (!harvestedAt) {
      Alert.alert(t('error'), t('harvestDateInvalid'));
      return false;
    }
    if (harvestedAt.getTime() > Date.now()) {
      Alert.alert(t('error'), t('harvestDatetimeFuture'));
      return false;
    }
    const activeSessionStarts = isUnitScope
      ? [unitAllocation?.session_started_at]
      : cycleAllocations
        .filter((allocation) => allocation.status == null || allocation.status === 'active')
        .map((allocation) => allocation.session_started_at);
    const exactSessionStart = activeSessionStarts
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()))
      .sort((left, right) => right.getTime() - left.getTime())[0];
    const legacySessionStart = cycle?.start_date
      ? new Date(`${cycle.start_date}T00:00:00`)
      : null;
    const sessionStart = exactSessionStart ?? legacySessionStart;
    if (sessionStart && harvestedAt < sessionStart) {
      Alert.alert(t('error'), t('harvestDatetimeBeforeSession'));
      return false;
    }
    if (formData.final_count <= 0) {
      Alert.alert(t('error'), t('finalCountRequired'));
      return false;
    }
    if (formData.final_average_weight <= 0) {
      Alert.alert(t('error'), t('finalWeightRequired'));
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (loading || (isUnitScope && (!productionUnitContext || !unitAllocation)) || (!isUnitScope && !cycle) || !validateForm()) return;
    setLoading(true);
    const finalHarvestedAt = toHarvestIso(formData.harvest_date, harvestTime);
    if (!finalHarvestedAt) {
      setLoading(false);
      Alert.alert(t('error'), t('harvestDateInvalid'));
      return;
    }
    const payload: HarvestData = {
      ...formData,
      allocation_id: productionUnitContext?.cycleUnitAllocationId,
      cycle_id: cycle?.id ?? productionUnitContext?.cycleId,
      final_harvested_at: finalHarvestedAt,
    };
    const saveLocally = async () => {
      await offlineService.saveFinalHarvestOffline(
        productionUnitContext?.cycleUnitAllocationId ?? '',
        cycle?.id ?? productionUnitContext?.cycleId ?? '',
        payload,
      );
      Alert.alert(t('success'), t('finalHarvestSavedOffline'), [
        { text: t('ok'), onPress: onClose },
      ]);
    };
    try {
      const online = await offlineService.isOnline();
      if (!online) {
        await saveLocally();
        return;
      }
      const calibrationSync = await offlineService.syncRelevantCalibrationOperationsForHarvest({
        cycleId: cycle?.id ?? productionUnitContext?.cycleId ?? '',
        allocationId: productionUnitContext?.cycleUnitAllocationId,
        productionUnitId: productionUnitContext?.productionUnitId,
        harvestedAt: finalHarvestedAt,
      });
      if (calibrationSync.failed > 0) {
        throw new Error(t('finalHarvestPendingMessage'));
      }
      if (isUnitScope && productionUnitContext && unitAllocation) {
        const response = await dispatch(harvestCycleUnitAllocation({ allocationId: productionUnitContext.cycleUnitAllocationId, harvestData: payload })).unwrap();
        if (response.final_harvest.reconciliation_status === 'pending') {
          Alert.alert(t('finalHarvestPendingTitle'), t('finalHarvestPendingMessage'), [{ text: t('ok'), onPress: () => { onSuccess?.(); onClose(); onUnitHarvestSuccess?.(); } }]);
        } else {
          Alert.alert(t('success'), t('productionUnitHarvestSuccess'), [{ text: t('ok'), onPress: () => { onSuccess?.(); onClose(); onUnitHarvestSuccess?.(); } }]);
        }
      } else if (cycle) {
        const response = await dispatch(harvestCycle({ id: cycle.id, harvestData: payload })).unwrap();
        const harvestedId = cycle.id;
        if (response.reconciliation_status === 'pending') {
          Alert.alert(t('finalHarvestPendingTitle'), t('finalHarvestPendingMessage'), [
            { text: t('ok'), onPress: () => { onSuccess?.(); onClose(); } },
          ]);
        } else {
          Alert.alert(t('success'), t('harvestSuccess'), [
            ...(hasMoreCycles ? [{ text: t('consolidationStartNextCycle', { num: harvestedThisYear + 2 }), onPress: () => { onSuccess?.(); onClose(); onNextCycle?.(harvestedId); } }] : []),
            ...(onContactBuyer ? [{ text: t('buyerNetworkCTA'), onPress: () => { onSuccess?.(); onClose(); onContactBuyer(); } }] : []),
            { text: t('ok'), onPress: () => { onSuccess?.(); onClose(); } },
          ]);
        }
      }
    } catch (error: unknown) {
      Alert.alert(
        t('finalHarvestSyncUnavailableTitle'),
        getApiErrorMessage(error, isUnitScope ? t('productionUnitHarvestError') : t('harvestError')),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('saveOffline'), onPress: () => { void saveLocally(); } },
        ],
      );
    } finally {
      setLoading(false);
    }
  };

  if ((isUnitScope && (!productionUnitContext || !unitAllocation)) || (!isUnitScope && !cycle)) return null;

  const survivalRate = initialFishCount > 0 ? ((formData.final_count / initialFishCount) * 100).toFixed(1) : '0';
  const weightGain = initialAverageWeight > 0 ? (formData.final_average_weight - initialAverageWeight).toFixed(0) : '0';
  const title = isUnitScope ? t('harvestThisUnitTitleWithName', { unitName }) : t('harvestCycle');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <AppText variant="screenTitle">{title}</AppText>
              {isUnitScope ? <AppText variant="body" color="muted">{t('harvestThisUnitSubtitle')}</AppText> : null}
            </View>
            <IconButton icon="close" variant="ghost" accessibilityLabel={t('close')} onPress={onClose} disabled={loading} testID="harvest-close" />
          </View>

          <ScrollView
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <InlineAlert
              tone="info"
              message={isUnitScope
                ? `${t('fishAvailableInThisUnit')}: ${availableFishCount}`
                : `${t('cycleName')}: ${cycle?.cycle_name}`}
            />
            <Card variant="outlined" style={styles.section}>
              <AppText variant="cardTitle">{t('harvestData')}</AppText>
              <FormField label={t('harvestDate')} required>
                <TextField value={formData.harvest_date} onChangeText={(value) => handleInputChange('harvest_date', value)} placeholder={t('dateFormatPlaceholder')} accessibilityLabel={t('harvestDate')} />
              </FormField>
              <FormField label={t('harvestTime')} required hint={t('harvestTimeHint')}>
                <TextField value={harvestTime} onChangeText={setHarvestTime} placeholder={t('harvestTimePlaceholder')} accessibilityLabel={t('harvestTime')} />
              </FormField>
              <FormField label={t('finalCount')} required>
                <TextField value={String(formData.final_count)} onChangeText={(value) => handleInputChange('final_count', parseInt(value, 10) || 0)} keyboardType="numeric" placeholder={t('enterFinalCount')} accessibilityLabel={t('finalCount')} />
              </FormField>
              <FormField label={`${t('finalAverageWeight')} (g)`} required>
                <TextField value={String(formData.final_average_weight)} onChangeText={(value) => handleInputChange('final_average_weight', parseFloat(value) || 0)} keyboardType="numeric" placeholder={t('enterFinalWeight')} accessibilityLabel={t('finalAverageWeight')} />
              </FormField>
              <FormField label={t('harvestNotes')} hint={t('optional')}>
                <TextField value={formData.harvest_notes} onChangeText={(value) => handleInputChange('harvest_notes', value)} placeholder={t('enterHarvestNotes')} multiline accessibilityLabel={t('harvestNotes')} />
              </FormField>
            </Card>
            <Card variant="outlined" style={styles.section}>
              <AppText variant="cardTitle">{t('performanceMetrics')}</AppText>
              <MetricRow label={isUnitScope ? t('unitSurvivalRate') : t('harvestSurvivalRate')} value={`${survivalRate}%`} />
              <MetricRow label={isUnitScope ? t('unitWeightGain') : t('harvestWeightGain')} value={`+${weightGain}g`} />
              <MetricRow label={`${t('totalHarvestedWeight')} (kg)`} value={`${formData.total_harvested_weight.toLocaleString('fr-FR')} kg`} accent />
            </Card>
          </ScrollView>

          <View
            testID="harvest-actions"
            style={[styles.actions, { paddingBottom: Math.max(insets.bottom, spacing[10]) }]}
          >
            <Button
              label={t('cancel')}
              variant="outline"
              onPress={onClose}
              disabled={loading}
              fullWidth={false}
              containerStyle={styles.cancel}
            />
            <Button
              label={isUnitScope ? t('confirmUnitHarvest') : t('confirmHarvest')}
              iconLeft="cut-outline"
              onPress={() => void handleSubmit()}
              loading={loading}
              fullWidth={false}
              containerStyle={styles.submit}
              testID="harvest-submit"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function MetricRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <View style={styles.metricRow}><AppText variant="body" color="muted">{label}</AppText><AppText variant="label" color={accent ? 'link' : 'primary'}>{value}</AppText></View>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay.default },
  sheet: { maxHeight: '90%', flexShrink: 1, backgroundColor: colors.surface.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingTop: spacing[4] },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: spacing[4], marginBottom: spacing[3] },
  headerText: { flex: 1, gap: spacing[1] },
  scroll: { flexShrink: 1 },
  content: { gap: spacing[3], paddingHorizontal: spacing[4], paddingBottom: spacing[4] },
  section: { gap: spacing[3] },
  metricRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  actions: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[4], paddingTop: spacing[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.subtle, backgroundColor: colors.surface.card },
  cancel: { flex: 1 },
  submit: { flex: 2 },
});
