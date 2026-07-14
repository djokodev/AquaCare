import React, { useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { AppText, Badge, SelectableCard } from '@/components/ui';
import { formatCycleDisplayName } from '@/features/aquaculture/utils/cycleDisplay';
import { colors, spacing } from '@/theme';
import { ProductionCycle } from '@/types/aquaculture';
import { formatPercentage } from '@/utils';

interface CyclePickerProps {
  cycles: ProductionCycle[];
  selectedCycleId: string | null;
  onSelectCycle: (cycleId: string) => void;
  rankingCycles?: ProductionCycle[];
}

const getDaysActive = (startDate: string): number => {
  const start = new Date(startDate).getTime();
  const now = new Date().getTime();
  return Math.max(0, Math.floor((now - start) / (1000 * 60 * 60 * 24)));
};

const formatBiomass = (cycle: ProductionCycle): string => {
  const biomass = Number(cycle.current_biomass ?? cycle.initial_biomass ?? 0);
  return Number.isFinite(biomass) ? biomass.toFixed(1) : '0.0';
};

const formatSurvivalRate = (cycle: ProductionCycle): string => {
  const rate = Number(cycle.survival_rate ?? 0);
  return Number.isFinite(rate) ? formatPercentage(rate) : '-';
};

function CyclePicker({ cycles, selectedCycleId, onSelectCycle, rankingCycles }: CyclePickerProps) {
  const { t } = useTranslation();
  const cycleRankingSource = rankingCycles && rankingCycles.length > 0 ? rankingCycles : cycles;

  const renderCycleItem = useCallback(
    ({ item: cycle }: { item: ProductionCycle }) => {
      const isSelected = selectedCycleId === cycle.id;
      const daysActive = getDaysActive(cycle.start_date);
      const speciesLabel = cycle.species === 'clarias' ? t('catfish') : t('tilapia');
      const displayName = formatCycleDisplayName(cycle, cycleRankingSource);

      return (
        <SelectableCard
          accessibilityLabel={displayName}
          testID={`cycle-picker-${cycle.id}`}
          selected={isSelected}
          onPress={() => onSelectCycle(cycle.id)}
          style={styles.cycleCard}
        >
          <View style={styles.headerRow}>
            <View style={styles.titleContainer}>
              <AppText variant="bodyStrong" numberOfLines={2}>
                {displayName}
              </AppText>
              <View style={styles.metadataRow}>
                <Badge label={speciesLabel} tone="brand" />
                <AppText variant="caption" color="muted" numberOfLines={1}>
                  {cycle.pond_identifier}
                </AppText>
              </View>
            </View>
            {isSelected ? (
              <Ionicons
                name="checkmark-circle"
                size={24}
                color={colors.brand.primary}
                accessibilityLabel={t('selected')}
              />
            ) : null}
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Ionicons name="time-outline" size={14} color={colors.text.muted} />
              <AppText variant="caption" color="muted">
                {daysActive} {t('days')}
              </AppText>
            </View>
            <View style={styles.metric}>
              <Ionicons name="scale-outline" size={14} color={colors.text.muted} />
              <AppText variant="caption" color="muted">
                {formatBiomass(cycle)} {t('kg')}
              </AppText>
            </View>
            <View style={styles.metric}>
              <Ionicons name="trending-up-outline" size={14} color={colors.text.muted} />
              <AppText variant="caption" color="muted">
                {formatSurvivalRate(cycle)} {t('survivalRateShort')}
              </AppText>
            </View>
          </View>
        </SelectableCard>
      );
    },
    [cycleRankingSource, onSelectCycle, selectedCycleId, t],
  );

  return (
    <FlatList
      data={cycles}
      keyExtractor={(item) => item.id}
      renderItem={renderCycleItem}
      extraData={selectedCycleId}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews
      initialNumToRender={6}
      maxToRenderPerBatch={8}
      windowSize={5}
    />
  );
}

const styles = StyleSheet.create({
  cycleCard: { marginBottom: spacing[3], gap: spacing[3] },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  titleContainer: { flex: 1 },
  metadataRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[1] },
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  metric: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
});

export default React.memo(CyclePicker);
