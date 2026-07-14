import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/store/store';
import {
  createPartialHarvest,
  createPartialHarvestForUnit,
} from '@/features/aquaculture/store/aquacultureSlice';
import { CycleUnitAllocation, PartialHarvestData, ProductionCycle } from '@/types/aquaculture';
import { getApiErrorMessage } from '@/utils/errorParser';
import { AppText, Button, IconButton, TextField } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

type HarvestScope = 'cycle' | 'unit';

interface ProductionUnitContext {
  cycleId: string;
  cycleUnitAllocationId: string;
  productionUnitId: string;
  productionUnitName: string;
}

interface PartialHarvestModalProps {
  visible: boolean;
  onClose: () => void;
  cycle: ProductionCycle | null;
  scope?: HarvestScope;
  productionUnitContext?: ProductionUnitContext;
  unitAllocation?: CycleUnitAllocation | null;
  onSuccess?: () => void;
}

const toNumber = (value: number | string | null | undefined): number => {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getAllocationAverageWeight = (allocation: CycleUnitAllocation | null | undefined): number => {
  if (!allocation) return 0;
  if (allocation.current_fish_count > 0 && allocation.current_biomass_kg != null) {
    return (toNumber(allocation.current_biomass_kg) * 1000) / allocation.current_fish_count;
  }
  if (allocation.final_fish_count && allocation.final_average_weight_g != null) {
    return toNumber(allocation.final_average_weight_g);
  }
  if (allocation.initial_fish_count > 0 && allocation.initial_biomass_kg != null) {
    return (toNumber(allocation.initial_biomass_kg) * 1000) / allocation.initial_fish_count;
  }
  return 0;
};

export default function PartialHarvestModal({
  visible,
  onClose,
  cycle,
  scope = 'cycle',
  productionUnitContext,
  unitAllocation,
  onSuccess,
}: PartialHarvestModalProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const [loading, setLoading] = useState(false);
  const isUnitScope = scope === 'unit';
  const unitName = productionUnitContext?.productionUnitName ?? unitAllocation?.production_unit_name ?? t('productionUnit');

  const today = new Date().toISOString().split('T')[0];
  const availableFishCount = isUnitScope
    ? unitAllocation?.current_fish_count ?? 0
    : cycle?.current_count ?? 0;
  const averageWeightDefault = isUnitScope
    ? getAllocationAverageWeight(unitAllocation)
    : cycle?.current_average_weight || 0;

  const [formData, setFormData] = useState<PartialHarvestData>({
    harvest_date: today,
    count_harvested: 0,
    average_weight_g: averageWeightDefault,
    sale_price_fcfa_per_kg: undefined,
    notes: '',
  });

  React.useEffect(() => {
    if (visible && ((isUnitScope && unitAllocation) || (!isUnitScope && cycle))) {
      setFormData({
        harvest_date: today,
        count_harvested: 0,
        average_weight_g: averageWeightDefault,
        sale_price_fcfa_per_kg: undefined,
        notes: '',
      });
    }
  }, [averageWeightDefault, cycle, isUnitScope, today, unitAllocation, visible]);

  if ((isUnitScope && (!productionUnitContext || !unitAllocation)) || (!isUnitScope && !cycle)) return null;

  // Calculs UX temps réel (backend fait le calcul autoritaire)
  const totalWeightKg = (formData.count_harvested * formData.average_weight_g) / 1000;
  const estimatedRevenue = formData.sale_price_fcfa_per_kg
    ? totalWeightKg * formData.sale_price_fcfa_per_kg
    : null;
  const remainingFish = availableFishCount - formData.count_harvested;

  const handleChange = (field: keyof PartialHarvestData, value: string) => {
    const numericFields: (keyof PartialHarvestData)[] = [
      'count_harvested', 'average_weight_g', 'sale_price_fcfa_per_kg',
    ];
    if (numericFields.includes(field)) {
      if (field === 'sale_price_fcfa_per_kg' && value.trim() === '') {
        setFormData(prev => ({
          ...prev,
          sale_price_fcfa_per_kg: undefined,
        }));
        return;
      }

      const parsed = parseFloat(value);
      const normalizedValue = field === 'count_harvested' ? parseInt(value, 10) : parsed;
      setFormData(prev => ({
        ...prev,
        [field]: Number.isNaN(normalizedValue) ? 0 : normalizedValue,
      }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const validate = (): boolean => {
    if (!formData.harvest_date) {
      Alert.alert(t('error'), t('harvestDateRequired'));
      return false;
    }
    if (formData.count_harvested <= 0) {
      Alert.alert(t('error'), t('partialHarvestCountRequired'));
      return false;
    }
    if (isUnitScope && formData.count_harvested >= availableFishCount) {
      Alert.alert(t('error'), t('partialHarvestWouldEmptyUnit'));
      return false;
    }
    if (formData.count_harvested > availableFishCount) {
      Alert.alert(t('error'), t('partialHarvestCountExceedsAvailable'));
      return false;
    }
    if (formData.average_weight_g <= 0) {
      Alert.alert(t('error'), t('finalWeightRequired'));
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      if (isUnitScope && productionUnitContext && unitAllocation) {
        await dispatch(createPartialHarvestForUnit({
          allocationId: productionUnitContext.cycleUnitAllocationId,
          data: formData,
        })).unwrap();
      } else if (cycle) {
        await dispatch(createPartialHarvest({ id: cycle.id, data: formData })).unwrap();
      }
      Alert.alert(
        t('success'),
        t(isUnitScope ? 'productionUnitPartialHarvestSuccess' : 'partialHarvestSuccess', { remaining: remainingFish }),
        [{ text: t('ok'), onPress: () => { onSuccess?.(); onClose(); } }]
      );
    } catch (error: unknown) {
      Alert.alert(t('error'), getApiErrorMessage(error, isUnitScope ? t('productionUnitPartialHarvestError') : t('partialHarvestError')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <AppText variant="cardTitle">
                {isUnitScope ? t('partialHarvestUnitTitleWithName', { unitName }) : t('partialHarvestTitle')}
              </AppText>
              <AppText variant="caption" color="muted">
                {isUnitScope ? t('partialHarvestUnitSubtitle') : cycle?.cycle_name}
              </AppText>
            </View>
            <IconButton icon="close" accessibilityLabel={t('close')} onPress={onClose} variant="surface" />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
            {/* Info disponible */}
            <View style={styles.infoRow}>
              <AppText variant="body">
                {isUnitScope ? t('fishAvailableInThisUnit') : t('remainingFish')} : <AppText variant="bodyStrong">{availableFishCount}</AppText>
              </AppText>
            </View>

            {/* Date */}
            <TextField
              label={t('harvestDate')}
              value={formData.harvest_date}
              onChangeText={(v) => handleChange('harvest_date', v)}
              placeholder={t('dateFormatPlaceholder')}
            />

            {/* Nombre à récolter */}
            <TextField
              label={t('countHarvested')}
              value={formData.count_harvested > 0 ? String(formData.count_harvested) : ''}
              onChangeText={(v) => handleChange('count_harvested', v)}
              keyboardType="numeric"
              placeholder={t('maxValuePlaceholder', { max: availableFishCount })}
            />

            {/* Poids moyen */}
            <TextField
              label={t('averageWeightG')}
              value={formData.average_weight_g > 0 ? String(formData.average_weight_g) : ''}
              onChangeText={(v) => handleChange('average_weight_g', v)}
              keyboardType="numeric"
              placeholder={t('exampleAverageWeightG')}
            />

            {/* Prix de vente (optionnel) */}
            <TextField
              label={`${t('salePriceFcfa')} (${t('optional')})`}
              value={formData.sale_price_fcfa_per_kg ? String(formData.sale_price_fcfa_per_kg) : ''}
              onChangeText={(v) => handleChange('sale_price_fcfa_per_kg', v)}
              keyboardType="numeric"
              placeholder={t('exampleSalePriceFcfa')}
            />

            {/* Notes */}
            <TextField
              label={`${t('harvestNotes')} (${t('optional')})`}
              value={formData.notes}
              onChangeText={(v) => setFormData(prev => ({ ...prev, notes: v }))}
              multiline
              numberOfLines={3}
              placeholder={t('partialHarvestNotesPlaceholder')}
            />

            {/* Récap calculé */}
            {formData.count_harvested > 0 && (
              <View style={styles.recap}>
                <AppText variant="sectionTitle">{t('harvestSummary')}</AppText>
                <View style={styles.recapRow}>
                  <AppText variant="caption" color="muted">{t('totalHarvestedWeight')}</AppText>
                  <AppText variant="label">{totalWeightKg.toFixed(2)} kg</AppText>
                </View>
                {estimatedRevenue !== null && (
                  <View style={styles.recapRow}>
                    <AppText variant="caption" color="muted">{t('estimatedValue')}</AppText>
                    <AppText variant="label" color="link">
                      {Math.round(estimatedRevenue).toLocaleString()} FCFA
                    </AppText>
                  </View>
                )}
                <View style={styles.recapRow}>
                  <AppText variant="caption" color="muted">{isUnitScope ? t('fishAvailableInThisUnit') : t('remainingFish')}</AppText>
                  <AppText variant="label" color={remainingFish < 0 ? 'error' : 'primary'}>
                    {remainingFish < 0 ? '⚠ ' : ''}{Math.max(0, remainingFish)}
                  </AppText>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Bouton */}
          <Button
            label={t('confirmPartialHarvest')}
            onPress={handleSubmit}
            disabled={loading}
            loading={loading}
            iconLeft="cut-outline"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay.default, justifyContent: 'flex-end' },
  container: { backgroundColor: colors.surface.card, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing[4], paddingBottom: spacing[5], maxHeight: '90%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing[3] },
  headerText: { flex: 1, paddingRight: spacing[3], gap: spacing[1] },
  body: { flexGrow: 0 },
  infoRow: { backgroundColor: colors.surface.page, padding: spacing[3], borderRadius: radii.md, marginBottom: spacing[4] },
  recap: { backgroundColor: colors.surface.selected, borderRadius: radii.lg, padding: spacing[3], marginTop: spacing[3], marginBottom: spacing[2], gap: spacing[2] },
  recapRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing[3] },
});
