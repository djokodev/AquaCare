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
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/store/store';
import { harvestCycle } from '@/store/slices/aquacultureSlice';
import { ProductionCycle, HarvestData } from '@/types/aquaculture';

// Couleurs MAVECAM selon spécifications
const MAVECAM_COLORS = {
  GREEN_PRIMARY: '#059669',
  GREEN_LIGHT: '#10b981',
  GREEN_DARK: '#047857',
  WHITE: '#ffffff',
  CREAM: '#f8fafc',
  SUCCESS: '#059669',
  WARNING: '#f59e0b',
  ERROR: '#dc2626',
  GRAY_LIGHT: '#64748b',
  GRAY_DARK: '#1e293b',
};

interface HarvestModalProps {
  visible: boolean;
  onClose: () => void;
  cycle: ProductionCycle | null;
  onSuccess?: () => void;
}

export default function HarvestModal({ visible, onClose, cycle, onSuccess }: HarvestModalProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const [loading, setLoading] = useState(false);

  // État du formulaire
  const [formData, setFormData] = useState<HarvestData>({
    harvest_date: new Date().toISOString().split('T')[0],
    final_count: cycle?.current_count || 0,
    final_average_weight: cycle?.current_average_weight || 0,
    total_harvested_weight: 0,
    harvest_notes: '',
  });

  /**
   * ⚠️ TODO BACKEND - CALCUL TEMPORAIRE
   * Ce calcul de poids total DOIT être fait par le backend.
   * Backend recalcule: final_biomass = final_count × final_average_weight
   *
   * Pour l'instant, calcul UX temporaire pour feedback immédiat.
   * Backend écrasera cette valeur avec son propre calcul.
   */
  React.useEffect(() => {
    const totalWeight = formData.final_count * formData.final_average_weight;
    setFormData(prev => ({
      ...prev,
      total_harvested_weight: Math.round(totalWeight * 100) / 100, // Arrondir à 2 décimales
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
      Alert.alert('Erreur', t('harvestDateRequired'));
      return false;
    }

    if (formData.final_count <= 0) {
      Alert.alert('Erreur', t('finalCountRequired'));
      return false;
    }

    if (formData.final_average_weight <= 0) {
      Alert.alert('Erreur', t('finalWeightRequired'));
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

      Alert.alert(
        t('success'),
        t('harvestSuccess'),
        [
          {
            text: 'OK',
            onPress: () => {
              onSuccess?.();
              onClose();
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert(
        t('error'),
        error || t('harvestError')
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
   * Ces valeurs sont pour AFFICHAGE IMMÉDIAT pendant saisie.
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
              <Ionicons name="close" size={24} color={MAVECAM_COLORS.GRAY_DARK} />
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
                {cycle.species === 'clarias' ? 'Silure africain (Clarias)' : 'Tilapia'}
              </Text>
              <Text style={styles.cycleInfo}>
                <Text style={styles.infoLabel}>{t('duration')}: </Text>
                {Math.floor((new Date().getTime() - new Date(cycle.start_date).getTime()) / (1000 * 60 * 60 * 24))} jours
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
                  placeholder="YYYY-MM-DD"
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
                <ActivityIndicator color={MAVECAM_COLORS.WHITE} />
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
    backgroundColor: MAVECAM_COLORS.WHITE,
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
    borderBottomColor: MAVECAM_COLORS.CREAM,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    maxHeight: 400,
  },
  cycleInfoContainer: {
    padding: 20,
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 12,
  },
  cycleInfo: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_DARK,
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
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: MAVECAM_COLORS.GRAY_LIGHT,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: MAVECAM_COLORS.WHITE,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  calculatedField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: MAVECAM_COLORS.CREAM,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  calculatedLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  calculatedValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  performanceContainer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: MAVECAM_COLORS.CREAM,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  metricCard: {
    alignItems: 'center',
    backgroundColor: MAVECAM_COLORS.CREAM,
    padding: 16,
    borderRadius: 8,
    minWidth: 100,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: MAVECAM_COLORS.CREAM,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: MAVECAM_COLORS.GRAY_LIGHT,
  },
  cancelButtonText: {
    color: MAVECAM_COLORS.GRAY_DARK,
    fontSize: 16,
    fontWeight: '600',
  },
  harvestButton: {
    flex: 2,
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  harvestButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});