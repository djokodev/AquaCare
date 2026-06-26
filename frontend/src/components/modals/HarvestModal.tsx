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
import { harvestCycle } from '@/features/aquaculture/store/aquacultureSlice';
import { ProductionCycle, HarvestData } from '@/types/aquaculture';
import { AQUACARE_COLORS } from '@/constants/colors';
import { getApiErrorMessage } from '@/utils/errorParser';

interface HarvestModalProps {
  visible: boolean;
  onClose: () => void;
  cycle: ProductionCycle | null;
  onSuccess?: () => void;
  onContactBuyer?: () => void;
  onNextCycle?: (harvestedCycleId: string) => void;
}

export default function HarvestModal({ visible, onClose, cycle, onSuccess, onContactBuyer, onNextCycle }: HarvestModalProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const farmProfile = useSelector((s: RootState) => s.auth.farmProfile);
  const cycles = useSelector((s: RootState) => s.aquaculture.cycles);

  const currentYear = new Date().getFullYear();
  const harvestedThisYear = cycles.filter(
    (c) => c.status === 'harvested' && c.end_date && new Date(c.end_date).getFullYear() === currentYear
  ).length;
  const numCyclesPerYear = farmProfile?.num_cycles_per_year ?? 1;
  // +1 because the current cycle being harvested is not yet counted
  const hasMoreCycles = onNextCycle != null && (harvestedThisYear + 1) < numCyclesPerYear;
  const [loading, setLoading] = useState(false);

  // Etat du formulaire
  const [formData, setFormData] = useState<HarvestData>({
    harvest_date: new Date().toISOString().split('T')[0],
    final_count: cycle?.current_count || 0,
    final_average_weight: cycle?.current_average_weight || 0,
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

    if (formData.final_average_weight <= 0) {
      Alert.alert(t('error'), t('finalWeightRequired'));
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!cycle || !validateForm()) return;

    setLoading(true);
    try {
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
    } catch (error: unknown) {
      Alert.alert(
        t('error'),
        getApiErrorMessage(error, t('harvestError'))
      );
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      harvest_date: new Date().toISOString().split('T')[0],
      final_count: cycle?.current_count || 0,
      final_average_weight: cycle?.current_average_weight || 0,
      total_harvested_weight: 0,
      harvest_notes: '',
    });
  };

  React.useEffect(() => {
    if (visible && cycle) {
      resetForm();
    }
  }, [visible, cycle]);

  if (!cycle) return null;

  /**
   * ⚠️ CALCULS TEMPORAIRES UX UNIQUEMENT
   * Ces valeurs sont pour AFFICHAGE IMMÃ‰DIAT pendant saisie.
   * Backend recalcule survival_rate et weight_gain officiels après récolte.
   *
   * Note: weightGain est OK (simple différence pour UX).
   * survivalRate devrait idéalement venir du backend après calcul.
   */
  const survivalRate = cycle.initial_count > 0
    ? ((formData.final_count / cycle.initial_count) * 100).toFixed(1)
    : '0';

  const weightGain = cycle.initial_average_weight > 0
    ? (formData.final_average_weight - cycle.initial_average_weight).toFixed(0)
    : '0';

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
            <Text style={styles.modalTitle}>{t('harvestCycle')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={AQUACARE_COLORS.GRAY_DARK} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Informations du cycle */}
            <View style={styles.cycleInfoContainer}>
              <Text style={styles.sectionTitle}>{t('cycleInformation')}</Text>
              <Text style={styles.cycleInfo}>
                <Text style={styles.infoLabel}>{t('cycleName')}: </Text>
                {cycle.cycle_name}
              </Text>
              <Text style={styles.cycleInfo}>
                <Text style={styles.infoLabel}>{t('species')}: </Text>
                {cycle.species === 'clarias' ? t('clariasSpeciesFull') : t('tilapia')}
              </Text>
              <Text style={styles.cycleInfo}>
                <Text style={styles.infoLabel}>{t('duration')}: </Text>
                {Math.floor((new Date().getTime() - new Date(cycle.start_date).getTime()) / (1000 * 60 * 60 * 24))} {t('days')}
              </Text>
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
                  <Text style={styles.metricLabel}>{t('harvestSurvivalRate')}</Text>
                </View>

                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>+{weightGain}g</Text>
                  <Text style={styles.metricLabel}>{t('harvestWeightGain')}</Text>
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
                <Text style={styles.harvestButtonText}>{t('confirmHarvest')}</Text>
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
    borderWidth: 1,
    borderColor: AQUACARE_COLORS.GRAY_LIGHT,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: AQUACARE_COLORS.WHITE,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
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
});
