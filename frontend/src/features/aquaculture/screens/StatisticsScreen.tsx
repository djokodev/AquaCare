import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { ProductionCycle, CycleStatistics } from '@/types/aquaculture';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AppHeader, AppText, Button, Card, EmptyState, ErrorState, LoadingState, Screen, SelectableCard } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { formatNumber, formatPercentage, formatCurrency } from '@/utils';
import logger from '@/utils/logger';
import { parseApiError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';

type NavigationProp = StackNavigationProp<RootStackParamList, 'Statistics'>;
interface Props { navigation: NavigationProp; }

export default function StatisticsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [harvestedCycles, setHarvestedCycles] = useState<ProductionCycle[]>([]); const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null); const [cycleStats, setCycleStats] = useState<CycleStatistics | null>(null); const [statsLoading, setStatsLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const loadData = useCallback(async () => { try { setLoading(true); setError(null); setHarvestedCycles(await aquacultureService.getHarvestedCycles()); } catch (loadError: unknown) { logger.error('Erreur chargement statistiques:', loadError); setError(formatAquacultureErrorWithAction(parseApiError(loadError), t)); } finally { setLoading(false); } }, []);
  useEffect(() => { void loadData(); }, [loadData]);
  const selectedCycle = useMemo(() => harvestedCycles.find((cycle) => cycle.id === selectedCycleId) ?? null, [harvestedCycles, selectedCycleId]);
  useEffect(() => { if (!selectedCycleId) { setCycleStats(null); return; } let mounted = true; const loadStats = async () => { try { setStatsLoading(true); const stats = await aquacultureService.getCycleStatistics(selectedCycleId); if (mounted) setCycleStats(stats); } catch (statsError: unknown) { logger.error('Erreur chargement stats cycle:', statsError); if (mounted) { setCycleStats(null); setError(formatAquacultureErrorWithAction(parseApiError(statsError), t)); } } finally { if (mounted) setStatsLoading(false); } }; void loadStats(); return () => { mounted = false; }; }, [selectedCycleId]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, [loadData]);
  const header = <AppHeader title={t('statistics')} onBack={() => navigation.goBack()} backLabel={t('back')} />;
  if (loading) return <View style={styles.root}>{header}<Screen style={styles.center}><LoadingState message={t('loading')} /></Screen></View>;
  if (error) return <View style={styles.root}>{header}<Screen style={styles.center}><ErrorState message={error} actionLabel={t('retry')} onAction={() => void loadData()} /></Screen></View>;
  if (harvestedCycles.length === 0) return <View style={styles.root}>{header}<Screen style={styles.center}><EmptyState title={t('noStatistics')} message={t('harvestCycleToSeeStats')} /></Screen></View>;
  return <View style={styles.root}>{header}<ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} contentContainerStyle={styles.content}>
    <Card variant="outlined" style={styles.selector}><AppText variant="sectionTitle">{t('harvestedCycles')}</AppText><FlatList horizontal data={harvestedCycles} keyExtractor={(item) => item.id} renderItem={({ item: cycle }) => <SelectableCard testID={`statistics-cycle-${cycle.id}`} accessibilityLabel={cycle.cycle_name} selected={selectedCycle?.id === cycle.id} onPress={() => setSelectedCycleId(cycle.id)} style={styles.cycleChoice}><AppText variant="label" numberOfLines={1}>{cycle.cycle_name}</AppText><AppText variant="caption" color={selectedCycle?.id === cycle.id ? 'inverse' : 'muted'}>{t(cycle.species)}, {formatPercentage(cycle.survival_rate || 0)}</AppText></SelectableCard>} extraData={selectedCycle?.id} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceList} /></Card>
    {!selectedCycle ? <Card variant="outlined"><EmptyState title={t('selectCycleToAnalyze')} message={t('selectCycleHint')} compact /></Card> : null}
    {selectedCycle && statsLoading ? <Card variant="outlined"><LoadingState message={t('loading')} compact /></Card> : null}
    {selectedCycle && cycleStats && !statsLoading ? <>
      <Card variant="outlined" style={styles.section}><AppText variant="sectionTitle">{t('statistics')}</AppText><View style={styles.metricGrid}><StatMetric icon="trending-up" value={formatNumber(cycleStats.current_metrics.fcr)} label="FCR" tone="success" /><StatMetric icon="heart" value={formatPercentage(cycleStats.current_metrics.survival_rate)} label={t('survival')} tone="error" /><StatMetric icon="scale" value={formatNumber(cycleStats.current_metrics.daily_growth_rate, 'g/j')} label={t('growth')} tone="info" /><StatMetric icon="cash" value={formatCurrency(cycleStats.feed_metrics.cost_estimate)} label={t('feedCost')} tone="warning" /></View></Card>
      <Card variant="outlined" style={styles.section}><AppText variant="sectionTitle">{t('details')}</AppText><View style={styles.detailGrid}><Detail label={t('duration')} value={`${cycleStats.days_active} ${t('days')}`} /><Detail label={t('finalBiomass')} value={formatNumber(cycleStats.current_metrics.biomass, 'kg')} /><Detail label={t('finalWeight')} value={formatNumber(cycleStats.current_metrics.average_weight, 'g')} /><Detail label={t('feedConsumedStat')} value={formatNumber(cycleStats.feed_metrics.total_consumed, 'kg')} /><Detail label={t('dailyRation')} value={formatNumber(cycleStats.feed_metrics.average_daily, 'kg/j')} /><Detail label={t('mortality')} value={`${cycleStats.mortality_analysis.total} ${t('fishLabel')}`} /></View></Card>
    </> : null}
  </ScrollView></View>;
}

function StatMetric({ icon, value, label, tone }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; tone: 'success' | 'error' | 'info' | 'warning' }) { return <View style={styles.statMetric}><Ionicons name={icon} size={22} color={colors.status[tone]} /><AppText variant="cardTitle">{value}</AppText><AppText variant="caption" color="muted">{label}</AppText></View>; }
function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detail}><AppText variant="caption" color="muted">{label}</AppText><AppText variant="label">{value}</AppText></View>; }
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.surface.page }, center: { justifyContent: 'center' }, content: { padding: spacing[4], gap: spacing[3] }, selector: { gap: spacing[3] }, choiceList: { gap: spacing[2] }, cycleChoice: { width: 180, gap: spacing[2] }, section: { gap: spacing[3] }, metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }, statMetric: { width: '48%', alignItems: 'center', gap: spacing[1], backgroundColor: colors.surface.page, borderRadius: spacing[2], padding: spacing[3] }, detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4] }, detail: { width: '45%', gap: spacing[1] } });
