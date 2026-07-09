import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store/store';
import {
  harvestCycle,
  harvestCycleUnitAllocation,
} from '@/features/aquaculture/store/aquacultureSlice';
import { CycleUnitAllocation, HarvestData, ProductionCycle } from '@/types/aquaculture';
import { AQUACARE_COLORS } from '@/constants/colors';
import { getApiErrorMessage } from '@/utils/errorParser';
import { sharedTextInputStyles } from '@/components/common/inputStyles';

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
  const dispatch = useDispatch<AppDispatch>();
  const farmProfile = useSelector((s: RootState) => s.auth.farmProfile);
  const cycles = useSelector((s: RootState) => s.aquaculture.cycles);
  const isUnitScope = scope === 'unit';
  const unitName = productionUnitContext?.productionUnitName ?? unitAllocation?.production_unit_name ?? t('productionUnit');
  const availableFishCount = isUnitScope
    ? unitAllocation?.current_fish_count ?? 0
    : cycle?.current_count ?? 0;
  const initialFishCount = isUnitScope
    ? unitAllocation?.initial_fish_count ?? 0
    : cycle?.initial_count ?? 0;
  const initialAverageWeight = isUnitScope
    ? getAllocationAverageWeight(unitAllocation)
    : cycle?.initial_average_weight ?? 0;
  const availableAverageWeight = isUnitScope
    ? getAllocationAverageWeight(unitAllocation)
    : cycle?.current_average_weight ?? 0;

  const currentYear = new Date().getFullYear();
  const harvestedThisYear = cycles.filter(
    (c) => c.status === 'harvested' && c.end_date && new Date(c.end_date).getFullYear() === currentYear
  ).length;
  const numCyclesPerYear = farmProfile?.num_cycles_per_year ?? 1;
  // +1 because the current cycle being harvested is not yet counted
  const hasMoreCycles = scope === 'cycle' && onNextCycle != null && (harvestedThisYear + 1) < numCyclesPerYear;
  const [loading, setLoading] = useState(false);

  // Etat du formulaire
  const [formData, setFormData] = useState<HarvestData>({
    harvest_date: new Date().toISOString().split('T')[0],
    final_count: availableFishCount,
    final_average_weight: availableAverageWeight,
    total_harvested_weight: 0,
    harvest_notes: '',
  });

  // Optimistic UI: preview total weight locally; backend overwrites with authoritative value.
  React.useEffect(() => {
    const totalWeight = (formData.final_count * formData.final_average_weight) / 1000;
    setFormData(prev => ({
      ...prev,
      total_harvested_weight: Math.round(totalWeight * 100) / 100,
    }));
  }, [formData.final_count, formData.final_average_weight]);

  const handleInputChange = (field: keyof HarvestData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.harvest_date) {
      Alert.alert(t('error'), t('harvestDateRequired'));
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
    if ((isUnitScope && (!productionUnitContext || !unitAllocation)) || (!isUnitScope && !cycle) || !validateForm()) {
      return;
    }

    setLoading(true);
    try {
      if (isUnitScope && productionUnitContext && unitAllocation) {
        await dispatch(harvestCycleUnitAllocation({
          allocationId: productionUnitContext.cycleUnitAllocationId,
          harvestData: formData,
        })).unwrap();

        Alert.alert(
          t('success'),
          t('productionUnitHarvestSuccess'),
          [{
            text: t('ok'),
            onPress: () => {
              onSuccess?.();
              onClose();
              onUnitHarvestSuccess?.();
            },
          }]
        );
      } else if (cycle) {
        await dispatch(harvestCycle({
          id: cycle.id,
          harvestData: formData,
        })).unwrap();

        const harvestedId = cycle.id;
        Alert.alert(
          t('success'),
          t('harvestSuccess'),
          [
            ...(hasMoreCycles ? [{
              text: t('consolidationStartNextCycle', { num: harvestedThisYear + 2 }),
              onPress: () => {
                onSuccess?.();
                onClose();
                onNextCycle!(harvestedId);
              },
            }] : []),
            ...(onContactBuyer ? [{
              text: t('buyerNetworkCTA'),
              onPress: () => {
                onSuccess?.();
                onClose();
                onContactBuyer();
              },
            }] : []),
            {
              text: t('ok'),
              onPress: () => {
                onSuccess?.();
                onClose();
              },
            },
          ]
        );
      }
    } catch (error: unknown) {
      Alert.alert(
        t('error'),
        getApiErrorMessage(error, isUnitScope ? t('productionUnitHarvestError') : t('harvestError'))
      );
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    const initialCount = isUnitScope ? availableFishCount : cycle?.current_count || 0;
    const initialWeight = isUnitScope ? availableAverageWeight : cycle?.current_average_weight || 0;
    setFormData({
      harvest_date: new Date().toISOString().split('T')[0],
      final_count: initialCount,
      final_average_weight: initialWeight,
      total_harvested_weight: 0,
      harvest_notes: '',
    });
  };

  React.useEffect(() => {
    if (visible && ((isUnitScope && unitAllocation) || (!isUnitScope && cycle))) {
      resetForm();
    }
  }, [availableAverageWeight, availableFishCount, cycle, isUnitScope, unitAllocation, visible]);

  if ((isUnitScope && (!productionUnitContext || !unitAllocation)) || (!isUnitScope && !cycle)) return null;

  /**
   * ⚠️ CALCULS TEMPORAIRES UX UNIQUEMENT
   * Ces valeurs sont pour AFFICHAGE IMMÃ‰DIAT pendant saisie.
   * Backend recalcule survival_rate et weight_gain officiels après récolte.
   *
   * Note: weightGain est OK (simple différence pour UX).
   * survivalRate devrait idéalement venir du backend après calcul.
   */
  const survivalRate = initialFishCount > 0
    ? ((formData.final_count / initialFishCount) * 100).toFixed(1)
    : '0';

  const weightGain = initialAverageWeight > 0
    ? (formData.final_average_weight - initialAverageWeight).toFixed(0)
    : '0';

  if (isUnitScope) {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={onClose}
      >
        <View style={styles.unitOverlay}>
          <View style={styles.unitContainer}>
            {/* Header */}
          <View style={styles.unitHeader}>
            <View>
              <Text style={styles.unitTitle}>
                  {t('harvestThisUnitAction')}
              </Text>
                <Text style={styles.unitSubtitle}>{t('productionUnitSummary')}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.unitCloseButton}>
              <Ionicons name="close" size={24} color={AQUACARE_COLORS.GRAY_DARK} />
            </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.unitBody}>
              {/* Info disponible */}
              <View style={styles.infoRow}>
                <Text style={styles.infoText}>
                  {t('fishAvailableInThisUnit')} : <Text style={styles.infoBold}>{availableFishCount}</Text>
                </Text>
              </View>

              {/* Résumé de l'unité */}
            <View style={styles.unitSectionCard}>
              <Text style={styles.unitSectionTitle}>{t('productionUnitSummary')}</Text>
                <Text style={styles.unitSectionText}>
                  <Text style={styles.unitSectionLabel}>{t('thisActionWillCloseThisProductionUnit')}</Text>
                </Text>
              </View>

              {/* Formulaire de récolte */}
              <View style={styles.unitSectionCard}>
                <Text style={styles.unitSectionTitle}>{t('harvestData')}</Text>

                <Text style={styles.label}>{t('harvestDate')} *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.harvest_date}
                  onChangeText={(value) => handleInputChange('harvest_date', value)}
                  placeholder={t('dateFormatPlaceholder')}
                  placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
                />

                <Text style={styles.label}>{t('finalCount')} *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.final_count.toString()}
                  onChangeText={(value) => handleInputChange('final_count', parseInt(value) || 0)}
                  keyboardType="numeric"
                  placeholder={t('enterFinalCount')}
                  placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
                />

                <Text style={styles.label}>{t('finalAverageWeight')} (g) *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.final_average_weight.toString()}
                  onChangeText={(value) => handleInputChange('final_average_weight', parseFloat(value) || 0)}
                  keyboardType="numeric"
                  placeholder={t('enterFinalWeight')}
                  placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
                />

                <Text style={styles.label}>{t('harvestNotes')} ({t('optional')})</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  value={formData.harvest_notes}
                  onChangeText={(value) => handleInputChange('harvest_notes', value)}
                  placeholder={t('enterHarvestNotes')}
                  placeholderTextColor={AQUACARE_COLORS.GRAY_LIGHT}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Récapitulatif */}
              <View style={styles.unitRecap}>
                <Text style={styles.unitRecapTitle}>{t('performanceMetrics')}</Text>

                <View style={styles.unitRecapRow}>
                  <Text style={styles.unitRecapLabel}>{t('unitSurvivalRate')}</Text>
                  <Text style={styles.unitRecapValue}>{survivalRate}%</Text>
                </View>

                <View style={styles.unitRecapRow}>
                  <Text style={styles.unitRecapLabel}>{t('unitWeightGain')}</Text>
                  <Text style={styles.unitRecapValue}>+{weightGain}g</Text>
                </View>

                <View style={styles.unitRecapRow}>
                  <Text style={styles.unitRecapLabel}>{t('totalHarvestedWeight')} (kg)</Text>
                  <Text style={styles.unitRecapValue}>
                    {formData.total_harvested_weight.toLocaleString('fr-FR')} kg
                  </Text>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.unitSubmitBtn, loading && styles.unitSubmitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={AQUACARE_COLORS.WHITE} />
              ) : (
                <>
                  <Ionicons name="cut-outline" size={20} color={AQUACARE_COLORS.WHITE} />
                  <Text style={styles.unitSubmitBtnText}>{t('confirmUnitHarvest')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {isUnitScope && productionUnitContext
                ? t('harvestThisUnitTitle', { unitName })
                : t('harvestCycle')}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={AQUACARE_COLORS.GRAY_DARK} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Informations du cycle */}
            <View style={styles.cycleInfoContainer}>
              <Text style={styles.sectionTitle}>
                {isUnitScope ? t('productionUnitSummary') : t('cycleInformation')}
              </Text>
              {isUnitScope ? (
                <>
                  <Text style={styles.cycleInfo}>
                    <Text style={styles.infoLabel}>{t('productionUnit')}: </Text>
                    {unitName}
                  </Text>
                  <Text style={styles.cycleInfo}>
                    <Text style={styles.infoLabel}>{t('fishAvailableInThisUnit')}: </Text>
                    {availableFishCount}
                  </Text>
                  <Text style={styles.cycleInfo}>
                    <Text style={styles.infoLabel}>{t('thisActionWillCloseThisProductionUnit')}</Text>
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.cycleInfo}>
                    <Text style={styles.infoLabel}>{t('cycleName')}: </Text>
                    {cycle?.cycle_name}
                  </Text>
                  <Text style={styles.cycleInfo}>
                    <Text style={styles.infoLabel}>{t('species')}: </Text>
                    {cycle?.species === 'clarias' ? t('clariasSpeciesFull') : t('tilapia')}
                  </Text>
                  <Text style={styles.cycleInfo}>
                    <Text style={styles.infoLabel}>{t('duration')}: </Text>
                    {cycle ? Math.floor((new Date().getTime() - new Date(cycle.start_date).getTime()) / (1000 * 60 * 60 * 24)) : 0} {t('days')}
                  </Text>
                  <Text style={styles.cycleInfo}>
                    <Text style={styles.infoLabel}>{t('thisActionWillCloseEntireCycle')}</Text>
                  </Text>
                </>
              )}
            </View>

            {/* Formulaire de récolte */}
            <View style={styles.formContainer}>
              <Text style={styles.sectionTitle}>{t('harvestData')}</Text>

              {/* Date de récolte */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('harvestDate')} *</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.harvest_date}
                  onChangeText={(value) => handleInputChange('harvest_date', value)}
                  placeholder={t('dateFormatPlaceholder')}
                />
              </View>

              {/* Nombre final */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('finalCount')} *</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.final_count.toString()}
                  onChangeText={(value) => handleInputChange('final_count', parseInt(value) || 0)}
                  keyboardType="numeric"
                  placeholder={t('enterFinalCount')}
                />
              </View>

              {/* Poids moyen final */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('finalAverageWeight')} (g) *</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.final_average_weight.toString()}
                  onChangeText={(value) => handleInputChange('final_average_weight', parseFloat(value) || 0)}
                  keyboardType="numeric"
                  placeholder={t('enterFinalWeight')}
                />
              </View>

              {/* Poids total calculé */}
              <View style={styles.calculatedField}>
                <Text style={styles.calculatedLabel}>{t('totalHarvestedWeight')} (kg)</Text>
                <Text style={styles.calculatedValue}>
                  {formData.total_harvested_weight.toLocaleString('fr-FR')} kg
                </Text>
              </View>

              {/* Notes de récolte */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>{t('harvestNotes')}</Text>
                <TextInput
                  style={[styles.textInput, styles.notesInput]}
                  value={formData.harvest_notes}
                  onChangeText={(value) => handleInputChange('harvest_notes', value)}
                  placeholder={t('enterHarvestNotes')}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>

            {/* Métriques de performance */}
            <View style={styles.performanceContainer}>
              <Text style={styles.sectionTitle}>{t('performanceMetrics')}</Text>

              <View style={styles.metricsGrid}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{survivalRate}%</Text>
                  <Text style={styles.metricLabel}>
                    {isUnitScope ? t('unitSurvivalRate') : t('harvestSurvivalRate')}
                  </Text>
                </View>

                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>+{weightGain}g</Text>
                  <Text style={styles.metricLabel}>
                    {isUnitScope ? t('unitWeightGain') : t('harvestWeightGain')}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>{t('cancel')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.harvestButton, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={AQUACARE_COLORS.WHITE} />
              ) : (
                <Text style={styles.harvestButtonText}>
                  {isUnitScope ? t('confirmUnitHarvest') : t('confirmHarvest')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderRadius: 16,
    width: '90%',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: AQUACARE_COLORS.CREAM,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    maxHeight: 400,
  },
  cycleInfoContainer: {
    padding: 20,
    backgroundColor: AQUACARE_COLORS.CREAM,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: AQUACARE_COLORS.GRAY_DARK,
    marginBottom: 12,
  },
  cycleInfo: {
    fontSize: 14,
    color: AQUACARE_COLORS.GRAY_DARK,
    marginBottom: 4,
  },
  infoLabel: {
    fontWeight: '600',
  },
  formContainer: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: AQUACARE_COLORS.GRAY_DARK,
    marginBottom: 8,
  },
  textInput: {
    ...sharedTextInputStyles.base,
    borderWidth: 1,
    borderColor: AQUACARE_COLORS.GRAY_LIGHT,
    borderRadius: 8,
    backgroundColor: AQUACARE_COLORS.WHITE,
  },
  notesInput: {
    ...sharedTextInputStyles.multilineCompact,
    height: 80,
  },
  calculatedField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: AQUACARE_COLORS.CREAM,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  calculatedLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  calculatedValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  performanceContainer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: AQUACARE_COLORS.CREAM,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  metricCard: {
    alignItems: 'center',
    backgroundColor: AQUACARE_COLORS.CREAM,
    padding: 16,
    borderRadius: 8,
    minWidth: 100,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: AQUACARE_COLORS.CREAM,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: AQUACARE_COLORS.GRAY_LIGHT,
  },
  cancelButtonText: {
    color: AQUACARE_COLORS.GRAY_DARK,
    fontSize: 16,
    fontWeight: '600',
  },
  harvestButton: {
    flex: 2,
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  harvestButtonText: {
    color: AQUACARE_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  unitOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  unitContainer: {
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  unitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  unitTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  unitSubtitle: {
    fontSize: 14,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    marginTop: 2,
  },
  unitCloseButton: {
    padding: 4,
  },
  unitBody: {
    flexGrow: 0,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: AQUACARE_COLORS.CREAM,
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  infoBold: {
    fontWeight: 'bold',
    color: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  unitSectionCard: {
    backgroundColor: AQUACARE_COLORS.CREAM,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
  },
  unitSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    marginBottom: 10,
  },
  unitSectionText: {
    fontSize: 14,
    color: AQUACARE_COLORS.GRAY_DARK,
    marginBottom: 4,
  },
  unitSectionLabel: {
    fontWeight: '600',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: AQUACARE_COLORS.GRAY_DARK,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    ...sharedTextInputStyles.base,
    borderWidth: 1,
    borderColor: AQUACARE_COLORS.GRAY_LIGHT,
    borderRadius: 8,
    color: AQUACARE_COLORS.GRAY_DARK,
    backgroundColor: AQUACARE_COLORS.CREAM,
  },
  inputMultiline: {
    ...sharedTextInputStyles.multilineCompact,
    height: 80,
  },
  unitRecap: {
    backgroundColor: AQUACARE_COLORS.CREAM,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    marginBottom: 8,
  },
  unitRecapTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    marginBottom: 10,
  },
  unitRecapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  unitRecapLabel: {
    fontSize: 14,
    color: AQUACARE_COLORS.GRAY_LIGHT,
  },
  unitRecapValue: {
    fontSize: 14,
    fontWeight: '600',
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  unitSubmitBtn: {
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  unitSubmitBtnDisabled: {
    opacity: 0.6,
  },
  unitSubmitBtnText: {
    color: AQUACARE_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
});
