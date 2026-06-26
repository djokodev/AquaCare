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
import { AQUACARE_COLORS } from '@/constants/colors';
import { AQUACARE_TYPOGRAPHY } from '@/constants/typography';

interface SuccessRewardModalProps {
  visible: boolean;
  onClose: () => void;
  averageWeight: number;
  fishCount: number;
  estimatedBiomass: number;
  stockValue: number;
}

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
          <View style={styles.successHeader}>
            <View style={styles.checkmarkCircle}>
              <Ionicons name="checkmark" size={40} color={AQUACARE_COLORS.WHITE} />
            </View>
            <Text style={styles.successTitle}>{t('dailyLogSuccess')}</Text>
          </View>

          <View style={styles.estimationSection}>
            <Text style={styles.estimationLabel}>{t('estimationBasedOnEntry')}</Text>

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

          <View style={styles.valueSection}>
            <View style={styles.valueIcon}>
              <Ionicons name="cash" size={24} color={AQUACARE_COLORS.GREEN_PRIMARY} />
            </View>
            <Text style={styles.valueLabel}>{t('currentValue')}</Text>
            <Text style={styles.valueAmount}>{formatCurrency(stockValue)}</Text>
          </View>

          <Text style={styles.encouragementText}>{t('keepTracking')}</Text>

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
    ...AQUACARE_TYPOGRAPHY.h3,
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
    ...AQUACARE_TYPOGRAPHY.caption,
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
    ...AQUACARE_TYPOGRAPHY.small,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  metricValue: {
    ...AQUACARE_TYPOGRAPHY.smallStrong,
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
    ...AQUACARE_TYPOGRAPHY.caption,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    marginBottom: 4,
  },
  valueAmount: {
    ...AQUACARE_TYPOGRAPHY.h2,
    color: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  encouragementText: {
    ...AQUACARE_TYPOGRAPHY.small,
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
    ...AQUACARE_TYPOGRAPHY.button,
    color: AQUACARE_COLORS.WHITE,
  },
});
