import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { PartialHarvest, ProductionCycle } from '@/types/aquaculture';
import { AQUACARE_COLORS as COLORS } from '@/constants/colors';

interface PartialHarvestHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  cycle: ProductionCycle | null;
}

export default function PartialHarvestHistoryModal({ visible, onClose, cycle }: PartialHarvestHistoryModalProps) {
  const { t } = useTranslation();
  const [harvests, setHarvests] = useState<PartialHarvest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible && cycle) {
      setLoading(true);
      aquacultureService.getPartialHarvests(cycle.id)
        .then(setHarvests)
        .catch(() => setHarvests([]))
        .finally(() => setLoading(false));
    }
  }, [visible, cycle]);

  if (!cycle) return null;

  const totalFishHarvested = harvests.reduce((sum, h) => sum + h.count_harvested, 0);
  const totalWeightKg = harvests.reduce((sum, h) => sum + Number(h.total_weight_kg), 0);
  const totalRevenue = harvests.reduce((sum, h) => sum + (h.estimated_revenue_fcfa || 0), 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{t('partialHarvestHistory')}</Text>
              <Text style={styles.subtitle}>{cycle.cycle_name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.GRAY_DARK} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color={COLORS.GREEN_PRIMARY} style={styles.loader} />
          ) : harvests.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color={COLORS.GRAY_LIGHT} />
              <Text style={styles.emptyText}>{t('noPartialHarvests')}</Text>
            </View>
          ) : (
            <>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{totalFishHarvested}</Text>
                  <Text style={styles.summaryLabel}>{t('totalFishHarvested')}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{totalWeightKg.toFixed(1)} kg</Text>
                  <Text style={styles.summaryLabel}>{t('totalWeight')}</Text>
                </View>
                {totalRevenue > 0 && (
                  <>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryItem}>
                      <Text style={[styles.summaryValue, { color: COLORS.GREEN_PRIMARY }]}>
                        {Math.round(totalRevenue).toLocaleString()}
                      </Text>
                      <Text style={styles.summaryLabel}>{t('totalRevenue')} (FCFA)</Text>
                    </View>
                  </>
                )}
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
                {harvests.map((harvest, index) => (
                  <View key={harvest.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={styles.cardBadge}>
                        <Text style={styles.cardBadgeText}>#{harvests.length - index}</Text>
                      </View>
                      <Text style={styles.cardDate}>{harvest.harvest_date}</Text>
                    </View>
                    <View style={styles.cardRow}>
                      <Text style={styles.cardLabel}>{t('countHarvested')}</Text>
                      <Text style={styles.cardValue}>{harvest.count_harvested}</Text>
                    </View>
                    <View style={styles.cardRow}>
                      <Text style={styles.cardLabel}>{t('totalHarvestedWeight')}</Text>
                      <Text style={styles.cardValue}>{Number(harvest.total_weight_kg).toFixed(2)} kg</Text>
                    </View>
                    {harvest.estimated_revenue_fcfa != null && harvest.estimated_revenue_fcfa > 0 && (
                      <View style={styles.cardRow}>
                        <Text style={styles.cardLabel}>{t('estimatedValue')}</Text>
                        <Text style={[styles.cardValue, { color: COLORS.GREEN_PRIMARY }]}>
                          {Math.round(harvest.estimated_revenue_fcfa).toLocaleString()} FCFA
                        </Text>
                      </View>
                    )}
                    {harvest.notes ? (
                      <Text style={styles.cardNotes}>{harvest.notes}</Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            </>
          )}
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
    maxHeight: '85%',
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
  loader: {
    marginVertical: 40,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.GRAY_DARK,
  },
  summaryLabel: {
    fontSize: 11,
    color: COLORS.GRAY_LIGHT,
    marginTop: 2,
    textAlign: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#d1fae5',
  },
  list: {
    flexGrow: 0,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: COLORS.CREAM,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  cardBadge: {
    backgroundColor: COLORS.GREEN_PRIMARY,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  cardBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.WHITE,
  },
  cardDate: {
    fontSize: 13,
    color: COLORS.GRAY_DARK,
    fontWeight: '500',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardLabel: {
    fontSize: 13,
    color: COLORS.GRAY_LIGHT,
  },
  cardValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.GRAY_DARK,
  },
  cardNotes: {
    fontSize: 12,
    color: COLORS.GRAY_LIGHT,
    fontStyle: 'italic',
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 6,
  },
});
