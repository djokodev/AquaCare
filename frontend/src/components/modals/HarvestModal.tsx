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
  const [formData, setFormData] = useState<HarvestData>({
    harvest_date: localHarvestDate(new Date()),
    final_harvested_at: new Date().toISOString(),
    final_count: availableFishCount,
    final_average_weight: availableAverageWeight,
    total_harvested_weight: 0,
    harvest_notes: '',
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
      harvest_date: localHarvestDate(new Date()),
      final_harvested_at: new Date().toISOString(),
      final_count: availableFishCount,
      final_average_weight: availableAverageWeight,
      total_harvested_weight: 0,
      harvest_notes: '',
    });
  }, [availableAverageWeight, availableFishCount, cycle, isUnitScope, unitAllocation, visible]);

  const handleInputChange = (field: keyof HarvestData, value: string | number) => {
    setFormData((previous) => ({ ...previous, [field]: value }));
  };

  const validateForm = () => {
    if (!formData.harvest_date) {
      Alert.alert(t('error'), t('harvestDateRequired'));
      return false;
    }
    if (!formData.final_harvested_at || Number.isNaN(Date.parse(formData.final_harvested_at))) {
      Alert.alert(t('error'), t('harvestDatetimeRequired'));
      return false;
    }
    if (formData.final_count <= 0) {
      Alert.alert(t('error'), t('finalCountRequired'));
      return false;
    }
    if (formData.final_count > availableFishCount) {
      Alert.alert(t('error'), t('harvestCountExceedsAvailable'));
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
    try {
      if (isUnitScope && productionUnitContext && unitAllocation) {
        await dispatch(harvestCycleUnitAllocation({ allocationId: productionUnitContext.cycleUnitAllocationId, harvestData: formData })).unwrap();
        Alert.alert(t('success'), t('productionUnitHarvestSuccess'), [{ text: t('ok'), onPress: () => { onSuccess?.(); onClose(); onUnitHarvestSuccess?.(); } }]);
      } else if (cycle) {
        await dispatch(harvestCycle({ id: cycle.id, harvestData: formData })).unwrap();
        const harvestedId = cycle.id;
        Alert.alert(t('success'), t('harvestSuccess'), [
          ...(hasMoreCycles ? [{ text: t('consolidationStartNextCycle', { num: harvestedThisYear + 2 }), onPress: () => { onSuccess?.(); onClose(); onNextCycle?.(harvestedId); } }] : []),
          ...(onContactBuyer ? [{ text: t('buyerNetworkCTA'), onPress: () => { onSuccess?.(); onClose(); onContactBuyer(); } }] : []),
          { text: t('ok'), onPress: () => { onSuccess?.(); onClose(); } },
        ]);
      }
    } catch (error: unknown) {
      Alert.alert(t('error'), getApiErrorMessage(error, isUnitScope ? t('productionUnitHarvestError') : t('harvestError')));
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
              <FormField label={t('harvestDatetime')} required hint={t('harvestDatetimeHint')}>
                <TextField value={formData.final_harvested_at} onChangeText={(value) => handleInputChange('final_harvested_at', value)} placeholder={t('harvestDatetimePlaceholder')} accessibilityLabel={t('harvestDatetime')} />
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
