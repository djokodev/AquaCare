import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, formatNumber } from '@/utils';

const AQUACARE_COLORS = {
  GREEN_PRIMARY: '#059669',
  GREEN_LIGHT: '#10b981',
  GREEN_DARK: '#047857',
  WHITE: '#ffffff',
  CREAM: '#f8fafc',
  SUCCESS: '#059669',
  GRAY_LIGHT: '#64748b',
  GRAY_DARK: '#1e293b',
};

interface SuccessRewardModalProps {
  visible: boolean;
  onClose: () => void;
  averageWeight: number;
  fishCount: number;
  estimatedBiomass: number;
  stockValue: number;
}

/**
 * Modal de recompense affiche apres une saisie quotidienne reussie.
 * Montre la valeur financiere estimee basee sur les donnees saisies.
 *
 * Principe Hormozi: Chaque effort = recompense visible en FCFA
 */
export default function SuccessRewardModal({
  visible,
  onClose,
  averageWeight,
  fishCount,
  estimatedBiomass,
  stockValue,
}: SuccessRewardModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header avec checkmark */}
          <View style={styles.successHeader}>
            <View style={styles.checkmarkCircle}>
              <Ionicons name="checkmark" size={40} color={AQUACARE_COLORS.WHITE} />
            </View>
            <Text style={styles.successTitle}>{t('dailyLogSuccess')}</Text>
          </View>

          {/* Section estimation */}
          <View style={styles.estimationSection}>
            <Text style={styles.estimationLabel}>{t('estimationBasedOnEntry')}</Text>

            {/* Metriques */}
            <View style={styles.metricsContainer}>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>{t('averageWeightPerFish')}</Text>
                <Text style={styles.metricValue}>
                  {formatNumber(Math.round(averageWeight))}g {t('perFish')}
                </Text>
              </View>

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>{t('fishRemaining')}</Text>
                <Text style={styles.metricValue}>{formatNumber(fishCount)}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>{t('estimatedBiomass')}</Text>
                <Text style={styles.metricValue}>
                  {formatNumber(Math.round(estimatedBiomass * 100) / 100)} kg
                </Text>
              </View>
            </View>
          </View>

          {/* Section valeur (highlight) */}
          <View style={styles.valueSection}>
            <View style={styles.valueIcon}>
              <Ionicons name="cash" size={24} color={AQUACARE_COLORS.GREEN_PRIMARY} />
            </View>
            <Text style={styles.valueLabel}>{t('currentValue')}</Text>
            <Text style={styles.valueAmount}>{formatCurrency(stockValue)}</Text>
          </View>

          {/* Message encouragement */}
          <Text style={styles.encouragementText}>{t('keepTracking')}</Text>

          {/* Bouton */}
          <TouchableOpacity style={styles.actionButton} onPress={onClose}>
            <Text style={styles.actionButtonText}>{t('greatJob')}</Text>
          </TouchableOpacity>
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
    borderRadius: 20,
    width: '85%',
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  successHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  checkmarkCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: AQUACARE_COLORS.SUCCESS,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  estimationSection: {
    width: '100%',
    backgroundColor: AQUACARE_COLORS.CREAM,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  estimationLabel: {
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    textAlign: 'center',
    marginBottom: 12,
  },
  metricsContainer: {
    width: '100%',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  metricLabel: {
    fontSize: 14,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  divider: {
    height: 1,
    backgroundColor: AQUACARE_COLORS.GRAY_LIGHT,
    opacity: 0.3,
    marginVertical: 8,
  },
  valueSection: {
    width: '100%',
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY + '10',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: AQUACARE_COLORS.GREEN_PRIMARY + '30',
  },
  valueIcon: {
    marginBottom: 8,
  },
  valueLabel: {
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    marginBottom: 4,
  },
  valueAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  encouragementText: {
    fontSize: 15,
    color: AQUACARE_COLORS.GRAY_DARK,
    textAlign: 'center',
    marginBottom: 20,
  },
  actionButton: {
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  actionButtonText: {
    color: AQUACARE_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
});
