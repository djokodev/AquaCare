import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';

import { AppHeader, AppText, Card, EmptyState, LoadingState, Screen, SegmentedControl } from '@/components/ui';
import { AppDispatch, RootState } from '@/store/store';
import { fetchProductionCycles } from '@/features/aquaculture/store/aquacultureSlice';
import { ProductionCycle } from '@/types/aquaculture';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { colors, spacing } from '@/theme';
import { formatNumber, formatPercentage, formatDate, formatDaysSince } from '@/utils';

type NavigationProp = StackNavigationProp<RootStackParamList, 'CycleHistory'>;
interface Props { navigation: NavigationProp; }
type Filter = 'all' | 'clarias' | 'tilapia';

export default function CycleHistoryScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const [selectedFilter, setSelectedFilter] = useState<Filter>('all');
  const { cycles, loading } = useSelector((state: RootState) => state.aquaculture);
  useEffect(() => { void dispatch(fetchProductionCycles()); }, [dispatch]);
  const onRefresh = useCallback(() => { void dispatch(fetchProductionCycles()); }, [dispatch]);
  const sortedCycles = useMemo(() => [...cycles].filter((cycle) => cycle.status === 'harvested').filter((cycle) => selectedFilter === 'all' || cycle.species === selectedFilter).sort((a, b) => !a.end_date || !b.end_date ? 0 : new Date(b.end_date).getTime() - new Date(a.end_date).getTime()), [cycles, selectedFilter]);
  const { totalCycles, avgSurvival, avgFCR, totalBiomass } = useMemo(() => {
    const count = sortedCycles.length;
    return { totalCycles: count, avgSurvival: count ? sortedCycles.reduce((sum, cycle) => sum + (cycle.survival_rate || 0), 0) / count : 0, avgFCR: count ? sortedCycles.reduce((sum, cycle) => sum + (cycle.fcr || 0), 0) / count : 0, totalBiomass: sortedCycles.reduce((sum, cycle) => sum + (cycle.final_biomass || 0), 0) };
  }, [sortedCycles]);
  const performanceLabel = (cycle: ProductionCycle) => {
    const survival = cycle.survival_rate || 0;
    const fcr = cycle.fcr || 999;
    return survival >= 85 && fcr <= 1.8 ? t('performanceExcellent') : survival >= 75 && fcr <= 2.2 ? t('performanceGood') : t('performanceImprove');
  };
  const renderCycle = useCallback(({ item: cycle }: { item: ProductionCycle }) => {
    const duration = cycle.end_date ? Math.floor((new Date(cycle.end_date).getTime() - new Date(cycle.start_date).getTime()) / 86400000) : 0;
    const speciesLabel = cycle.species === 'clarias' ? t('clariasSpeciesFull') : t('tilapia');
    return <Card variant="outlined" style={styles.cycleCard}>
      <View style={styles.cycleHeading}><View style={styles.cycleCopy}><AppText variant="label" numberOfLines={1}>{cycle.cycle_name}</AppText><AppText color="muted" numberOfLines={1}>{speciesLabel} · {cycle.pond_identifier}</AppText><AppText variant="caption" color="muted" numberOfLines={1}>{formatDate(cycle.start_date)} · {cycle.end_date ? formatDate(cycle.end_date) : formatDaysSince(cycle.start_date)} · {duration} {t('days')}</AppText></View><AppText variant="caption" color={cycle.survival_rate && cycle.survival_rate >= 85 ? 'success' : cycle.survival_rate && cycle.survival_rate >= 75 ? 'warning' : 'error'}>{performanceLabel(cycle)}</AppText></View>
      <View style={styles.metrics}><View style={styles.metric}><AppText variant="label">{formatPercentage(cycle.survival_rate)}</AppText><AppText variant="caption" color="muted">{t('survival')}</AppText></View><View style={styles.metric}><AppText variant="label">{cycle.fcr ? cycle.fcr.toFixed(2) : '0.00'}</AppText><AppText variant="caption" color="muted">FCR</AppText></View><View style={styles.metric}><AppText variant="label">{formatNumber(cycle.final_biomass, 'kg')}</AppText><AppText variant="caption" color="muted">{t('finalBiomass')}</AppText></View><View style={styles.metric}><AppText variant="label">{cycle.final_average_weight ? `${cycle.final_average_weight}g` : '0g'}</AppText><AppText variant="caption" color="muted">{t('finalWeight')}</AppText></View></View>
    </Card>;
  }, [t]);
  const header = <AppHeader title={t('cycleHistory')} onBack={() => navigation.goBack()} backLabel={t('back')} />;
  if (loading.cycles && cycles.length === 0) return <View style={styles.root}>{header}<Screen style={styles.center}><LoadingState message={t('loading')} /></Screen></View>;
  return <View style={styles.root}>{header}<FlatList data={sortedCycles} keyExtractor={(item) => item.id} renderItem={renderCycle} ListHeaderComponent={<View style={styles.listHeader}><Card variant="outlined" style={styles.summary}><AppText variant="sectionTitle">{t('historySummary')}</AppText><View style={styles.summaryGrid}><Metric label={t('completedCycles')} value={String(totalCycles)} /><Metric label={t('avgSurvival')} value={formatPercentage(avgSurvival)} /><Metric label={t('avgFCR')} value={avgFCR > 0 ? avgFCR.toFixed(2) : '0'} /><Metric label={t('totalHarvested')} value={formatNumber(totalBiomass, 'kg')} /></View></Card><Card variant="outlined" style={styles.filter}><AppText variant="label">{t('filterBySpecies')}</AppText><SegmentedControl<Filter> value={selectedFilter} options={[{ value: 'all', label: t('allSpecies') }, { value: 'clarias', label: t('clarias') }, { value: 'tilapia', label: t('tilapia') }]} onChange={setSelectedFilter} /></Card><AppText variant="sectionTitle" style={styles.resultTitle}>{t('harvestedCycles')} ({sortedCycles.length})</AppText></View>} ListEmptyComponent={<EmptyState title={t('noHarvestedCycles')} message={t('completeCycleToSeeHistory')} compact />} contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={loading.cycles} onRefresh={onRefresh} />} showsVerticalScrollIndicator={false} /></View>;
}

function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.summaryMetric}><AppText variant="cardTitle">{value}</AppText><AppText variant="caption" color="muted" style={styles.centerText}>{label}</AppText></View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.page }, center: { justifyContent: 'center' }, list: { padding: spacing[4], gap: spacing[3] }, listHeader: { gap: spacing[3], marginBottom: spacing[1] }, summary: { gap: spacing[3] }, summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }, summaryMetric: { width: '48%', alignItems: 'center', backgroundColor: colors.surface.page, borderRadius: spacing[2], padding: spacing[3] }, centerText: { textAlign: 'center' }, filter: { gap: spacing[3] }, resultTitle: { marginTop: spacing[1] }, cycleCard: { gap: spacing[3] }, cycleHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing[2] }, cycleCopy: { flex: 1, gap: spacing[1] }, metrics: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border.subtle, paddingTop: spacing[3] }, metric: { flex: 1, alignItems: 'center', gap: spacing[1] },
});
