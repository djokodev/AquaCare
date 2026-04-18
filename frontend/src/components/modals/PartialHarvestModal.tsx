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
import { createPartialHarvest } from '@/features/aquaculture/store/aquacultureSlice';
import { ProductionCycle, PartialHarvestData } from '@/types/aquaculture';
import { MAVECAM_COLORS as COLORS } from '@/constants/colors';

interface PartialHarvestModalProps {
  visible: boolean;
  onClose: () => void;
  cycle: ProductionCycle | null;
  onSuccess?: () => void;
}

export default function PartialHarvestModal({ visible, onClose, cycle, onSuccess }: PartialHarvestModalProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const [loading, setLoading] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState<PartialHarvestData>({
    harvest_date: today,
    count_harvested: 0,
    average_weight_g: cycle?.current_average_weight || 0,
    sale_price_fcfa_per_kg: undefined,
    notes: '',
  });

  React.useEffect(() => {
    if (visible && cycle) {
      setFormData({
        harvest_date: today,
        count_harvested: 0,
        average_weight_g: cycle.current_average_weight || 0,
        sale_price_fcfa_per_kg: undefined,
        notes: '',
      });
    }
  }, [visible, cycle]);

  if (!cycle) return null;

  // Calculs UX temps réel (backend fait le calcul autoritaire)
  const totalWeightKg = (formData.count_harvested * formData.average_weight_g) / 1000;
  const estimatedRevenue = formData.sale_price_fcfa_per_kg
    ? totalWeightKg * formData.sale_price_fcfa_per_kg
    : null;
  const remainingFish = cycle.current_count - formData.count_harvested;

  const handleChange = (field: keyof PartialHarvestData, value: string) => {
    const numericFields: (keyof PartialHarvestData)[] = [
      'count_harvested', 'average_weight_g', 'sale_price_fcfa_per_kg',
    ];
    if (numericFields.includes(field)) {
      const parsed = parseFloat(value);
      setFormData(prev => ({
        ...prev,
        [field]: isNaN(parsed) ? 0 : parsed,
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
    if (formData.count_harvested > cycle.current_count) {
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
      await dispatch(createPartialHarvest({ id: cycle.id, data: formData })).unwrap();
      Alert.alert(
        t('success'),
        t('partialHarvestSuccess', { remaining: remainingFish }),
        [{ text: 'OK', onPress: () => { onSuccess?.(); onClose(); } }]
      );
    } catch (error: unknown) {
      const msg = typeof error === 'string' ? error : t('partialHarvestError');
      Alert.alert(t('error'), msg);
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
            <View>
              <Text style={styles.title}>{t('partialHarvestTitle')}</Text>
              <Text style={styles.subtitle}>{cycle.cycle_name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.GRAY_DARK} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.body}>
            {/* Info disponible */}
            <View style={styles.infoRow}>
              <Ionicons name="fish-outline" size={16} color={COLORS.GREEN_PRIMARY} />
              <Text style={styles.infoText}>
                {t('remainingFish')} : <Text style={styles.infoBold}>{cycle.current_count}</Text>
              </Text>
            </View>

            {/* Date */}
            <Text style={styles.label}>{t('harvestDate')}</Text>
            <TextInput
              style={styles.input}
              value={formData.harvest_date}
              onChangeText={(v) => handleChange('harvest_date', v)}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.GRAY_LIGHT}
            />

            {/* Nombre à récolter */}
            <Text style={styles.label}>{t('countHarvested')}</Text>
            <TextInput
              style={styles.input}
              value={formData.count_harvested > 0 ? String(formData.count_harvested) : ''}
              onChangeText={(v) => handleChange('count_harvested', v)}
              keyboardType="numeric"
              placeholder={`Max ${cycle.current_count}`}
              placeholderTextColor={COLORS.GRAY_LIGHT}
            />

            {/* Poids moyen */}
            <Text style={styles.label}>{t('averageWeightG')}</Text>
            <TextInput
              style={styles.input}
              value={formData.average_weight_g > 0 ? String(formData.average_weight_g) : ''}
              onChangeText={(v) => handleChange('average_weight_g', v)}
              keyboardType="numeric"
              placeholder="Ex: 350"
              placeholderTextColor={COLORS.GRAY_LIGHT}
            />

            {/* Prix de vente (optionnel) */}
            <Text style={styles.label}>{t('salePriceFcfa')} ({t('optional')})</Text>
            <TextInput
              style={styles.input}
              value={formData.sale_price_fcfa_per_kg ? String(formData.sale_price_fcfa_per_kg) : ''}
              onChangeText={(v) => handleChange('sale_price_fcfa_per_kg', v)}
              keyboardType="numeric"
              placeholder="Ex: 1800"
              placeholderTextColor={COLORS.GRAY_LIGHT}
            />

            {/* Notes */}
            <Text style={styles.label}>{t('harvestNotes')} ({t('optional')})</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={formData.notes}
              onChangeText={(v) => setFormData(prev => ({ ...prev, notes: v }))}
              multiline
              numberOfLines={3}
              placeholder={t('partialHarvestNotesPlaceholder')}
              placeholderTextColor={COLORS.GRAY_LIGHT}
            />

            {/* Récap calculé */}
            {formData.count_harvested > 0 && (
              <View style={styles.recap}>
                <Text style={styles.recapTitle}>{t('harvestSummary')}</Text>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>{t('totalHarvestedWeight')}</Text>
                  <Text style={styles.recapValue}>{totalWeightKg.toFixed(2)} kg</Text>
                </View>
                {estimatedRevenue !== null && (
                  <View style={styles.recapRow}>
                    <Text style={styles.recapLabel}>{t('estimatedValue')}</Text>
                    <Text style={[styles.recapValue, { color: COLORS.GREEN_PRIMARY }]}>
                      {Math.round(estimatedRevenue).toLocaleString()} FCFA
                    </Text>
                  </View>
                )}
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>{t('remainingFish')}</Text>
                  <Text style={[
                    styles.recapValue,
                    { color: remainingFish < 0 ? COLORS.ERROR : COLORS.GRAY_DARK }
                  ]}>
                    {remainingFish < 0 ? '⚠ ' : ''}{Math.max(0, remainingFish)}
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Bouton */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.WHITE} />
            ) : (
              <>
                <Ionicons name="cut-outline" size={20} color={COLORS.WHITE} />
                <Text style={styles.submitBtnText}>{t('confirmPartialHarvest')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.GRAY_DARK,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.GRAY_LIGHT,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    flexGrow: 0,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0fdf4',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.GRAY_DARK,
  },
  infoBold: {
    fontWeight: 'bold',
    color: COLORS.GREEN_PRIMARY,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.GRAY_DARK,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: COLORS.GRAY_DARK,
    backgroundColor: COLORS.CREAM,
  },
  inputMultiline: {
    height: 80,
    textAlignVertical: 'top',
  },
  recap: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    marginBottom: 8,
  },
  recapTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.GREEN_PRIMARY,
    marginBottom: 10,
  },
  recapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  recapLabel: {
    fontSize: 14,
    color: COLORS.GRAY_LIGHT,
  },
  recapValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.GRAY_DARK,
  },
  submitBtn: {
    backgroundColor: COLORS.GREEN_PRIMARY,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    shadowColor: COLORS.GREEN_PRIMARY,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.WHITE,
  },
});
