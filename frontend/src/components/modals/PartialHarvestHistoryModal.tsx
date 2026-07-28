import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { PartialHarvest, ProductionCycle } from '@/types/aquaculture';
import {
  AppText,
  Badge,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
} from '@/components/ui';
import { colors, radii, spacing } from '@/theme';

interface PartialHarvestHistoryModalProps {
  visible: boolean;
  onClose: () => void;
  cycle: ProductionCycle | null;
}

export default function PartialHarvestHistoryModal({
  visible,
  onClose,
  cycle,
}: PartialHarvestHistoryModalProps) {
  const { t } = useTranslation();
  const [harvests, setHarvests] = useState<PartialHarvest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadHarvests = useCallback(async () => {
    if (!cycle) return;

    setLoading(true);
    setLoadError(false);
    try {
      setHarvests(await aquacultureService.getPartialHarvests(cycle.id));
    } catch {
      setHarvests([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [cycle]);

  useEffect(() => {
    if (visible && cycle) {
      void loadHarvests();
    }
  }, [visible, cycle, loadHarvests]);

  const totals = useMemo(() => ({
    fish: harvests.reduce((sum, harvest) => sum + harvest.count_harvested, 0),
    weight: harvests.reduce((sum, harvest) => sum + Number(harvest.total_weight_kg), 0),
    revenue: harvests.reduce((sum, harvest) => sum + (harvest.estimated_revenue_fcfa || 0), 0),
  }), [harvests]);

  if (!cycle) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <AppText variant="screenTitle">{t('partialHarvestHistory')}</AppText>
              <AppText variant="body" color="muted">{cycle.cycle_name}</AppText>
            </View>
            <IconButton
              icon="close"
              variant="ghost"
              accessibilityLabel={t('close')}
              onPress={onClose}
              testID="partial-harvest-history-close"
            />
          </View>

          {loading ? <LoadingState message={t('loading')} compact /> : null}
          {!loading && loadError ? (
            <ErrorState
              message={t('aquacultureErrorRetry')}
              actionLabel={t('retry')}
              onAction={() => void loadHarvests()}
              compact
            />
          ) : null}
          {!loading && !loadError && harvests.length === 0 ? (
            <EmptyState message={t('noPartialHarvests')} compact />
          ) : null}
          {!loading && !loadError && harvests.length > 0 ? (
            <>
              <Card variant="outlined" style={styles.summary}>
                <SummaryMetric value={String(totals.fish)} label={t('totalFishHarvested')} />
                <View style={styles.summaryDivider} />
                <SummaryMetric value={`${totals.weight.toFixed(1)} kg`} label={t('totalWeight')} />
                {totals.revenue > 0 ? (
                  <>
                    <View style={styles.summaryDivider} />
                    <SummaryMetric
                      value={Math.round(totals.revenue).toLocaleString()}
                      label={`${t('totalRevenue')} (FCFA)`}
                      emphasis
                    />
                  </>
                ) : null}
              </Card>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
                {harvests.map((harvest, index) => (
                  <Card key={harvest.id} variant="outlined" style={styles.harvestCard}>
                    <View style={styles.cardHeader}>
                      <Badge label={`#${harvests.length - index}`} tone="brand" />
                      <AppText variant="label">{harvest.harvest_date}</AppText>
                    </View>
                    <MetricRow label={t('countHarvested')} value={String(harvest.count_harvested)} />
                    <MetricRow
                      label={t('totalHarvestedWeight')}
                      value={`${Number(harvest.total_weight_kg).toFixed(2)} kg`}
                    />
                    {harvest.estimated_revenue_fcfa != null && harvest.estimated_revenue_fcfa > 0 ? (
                      <MetricRow
                        label={t('estimatedValue')}
                        value={`${Math.round(harvest.estimated_revenue_fcfa).toLocaleString()} FCFA`}
                        emphasis
                      />
                    ) : null}
                    {harvest.notes ? (
                      <>
                        <Divider />
                        <AppText variant="helper" color="muted">{harvest.notes}</AppText>
                      </>
                    ) : null}
                  </Card>
                ))}
              </ScrollView>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function SummaryMetric({ value, label, emphasis = false }: { value: string; label: string; emphasis?: boolean }) {
  return (
    <View style={styles.summaryMetric}>
      <AppText variant="cardTitle" color={emphasis ? 'link' : 'primary'} style={styles.summaryValue}>{value}</AppText>
      <AppText variant="caption" color="muted" style={styles.summaryLabel}>{label}</AppText>
    </View>
  );
}

function MetricRow({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <View style={styles.metricRow}>
      <AppText variant="helper" color="muted">{label}</AppText>
      <AppText variant="label" color={emphasis ? 'link' : 'primary'}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay.default, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '85%',
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing[3] },
  headerText: { flex: 1, gap: spacing[1] },
  summary: { flexDirection: 'row', alignItems: 'stretch', padding: spacing[3], marginBottom: spacing[3], gap: spacing[2] },
  summaryMetric: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  summaryDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border.subtle },
  summaryValue: { textAlign: 'center' },
  summaryLabel: { textAlign: 'center', marginTop: spacing[1] },
  list: { gap: spacing[2], paddingBottom: spacing[2] },
  harvestCard: { gap: spacing[2] },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing[3] },
});
