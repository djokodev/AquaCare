import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSelector } from 'react-redux';

import { AppHeader, AppText, Card, EmptyState, ErrorState, InlineAlert, LoadingState, Screen, SelectableCard } from '@/components/ui';
import { RootState } from '@/store/store';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { CycleLog } from '@/types/aquaculture';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { colors, spacing } from '@/theme';
import { formatDate } from '@/utils';
import { estimateAverageWeight } from '@/domain/aquaculture/estimators';
import logger from '@/utils/logger';

type NavigationProp = StackNavigationProp<RootStackParamList, 'DailyLogHistory'>;
type Route = RouteProp<RootStackParamList, 'DailyLogHistory'>;

interface Props { navigation: NavigationProp; route?: Route; }

export default function DailyLogHistoryScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { dashboardData, currentCycle } = useSelector((state: RootState) => state.aquaculture);
  const activeCycles = dashboardData?.active_cycles || [];
  const effectiveCycleId = route?.params?.cycleId || currentCycle?.id;
  const cycleUnitAllocationId = route?.params?.cycleUnitAllocationId;
  const productionUnitName = route?.params?.productionUnitName || t('productionUnitsUnknownUnit');
  const selectedCycle = effectiveCycleId ? activeCycles.find((cycle) => cycle.id === effectiveCycleId) || currentCycle || null : currentCycle || null;
  const [logs, setLogs] = useState<CycleLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    if (!effectiveCycleId) { setLogs([]); setLoading(false); return; }
    try {
      setLoading(true); setError(null);
      const data = cycleUnitAllocationId ? await aquacultureService.getCycleLogs(effectiveCycleId, { cycleUnitAllocationId }) : await aquacultureService.getCycleLogs(effectiveCycleId);
      setLogs(data);
    } catch (loadError) {
      logger.error('Erreur lors du chargement des logs:', loadError);
      setError(t('dailyLogLoadError'));
    } finally { setLoading(false); }
  // Translation function is stable for the active locale; keeping it out of
  // this data-loading dependency list prevents refresh loops in test/native
  // i18n adapters that recreate the function on each render.
  }, [cycleUnitAllocationId, effectiveCycleId]);

  useEffect(() => { void loadLogs(); }, [loadLogs]);

  const onRefresh = useCallback(async () => {
    if (!effectiveCycleId) return;
    setRefreshing(true); await loadLogs(); setRefreshing(false);
  }, [effectiveCycleId, loadLogs]);

  const renderLogCard = useCallback(({ item: log }: { item: CycleLog }) => (
    <SelectableCard
      testID={`daily-log-card-${log.id}`}
      accessibilityLabel={`${formatDate(log.log_date)} ${productionUnitName}`}
      selected={false}
      onPress={() => navigation.navigate('DailyLogDetail', { log, cycleId: effectiveCycleId || undefined, cycleUnitAllocationId: cycleUnitAllocationId || undefined, productionUnitName })}
      style={styles.logCard}
    >
      <View style={styles.cardHeader}>
        <AppText variant="label">{formatDate(log.log_date)}</AppText>
        <AppText color="link">›</AppText>
      </View>
      <View style={styles.details}>
        {log.sample_count && log.sample_total_weight ? <View style={styles.field}><AppText color="muted">{t('averageWeight')} :</AppText><AppText variant="label">{estimateAverageWeight(log.sample_total_weight, log.sample_count).toFixed(1)} g</AppText></View> : null}
        {log.mortality_count && log.mortality_count > 0 ? <View style={styles.field}><AppText color="muted">{t('mortality')} :</AppText><AppText variant="label">{log.mortality_count}</AppText></View> : null}
        {log.water_temperature ? <View style={styles.field}><AppText color="muted">{t('waterTemperature')} :</AppText><AppText variant="label">{log.water_temperature}°C</AppText></View> : null}
        {log.ph_level ? <View style={styles.field}><AppText color="muted">{t('phLevel')} :</AppText><AppText variant="label">{log.ph_level}</AppText></View> : null}
      </View>
      {log.observations ? <View style={styles.observations}><AppText variant="label">{t('observations')} :</AppText><AppText color="muted">{log.observations}</AppText></View> : null}
    </SelectableCard>
  ), [cycleUnitAllocationId, effectiveCycleId, navigation, productionUnitName, t]);

  if (loading) return <View style={styles.root}><AppHeader title={t('dailyLogHistory')} onBack={() => navigation.goBack()} backLabel={t('back')} /><Screen style={styles.center}><LoadingState message={t('loading')} /></Screen></View>;

  return (
    <View style={styles.root}>
      <AppHeader title={t('dailyLogHistory')} onBack={() => navigation.goBack()} backLabel={t('back')} />
      {error ? <InlineAlert tone="error" message={error} /> : null}
      <FlatList
        data={effectiveCycleId ? logs : []}
        keyExtractor={(item) => item.id}
        renderItem={renderLogCard}
        ListHeaderComponent={<Card variant="outlined" style={styles.cycleCard}><AppText variant="label" color="link">{selectedCycle?.cycle_name || t('sessionCycleNotSelected')}</AppText></Card>}
        ListEmptyComponent={effectiveCycleId ? <EmptyState title={t('noLogsYet')} message={t('startLoggingData')} compact /> : <ErrorState title={t('sessionCycleNotSelected')} compact />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.page },
  center: { justifyContent: 'center' },
  list: { padding: spacing[4], gap: spacing[3] },
  cycleCard: { marginBottom: spacing[1] },
  logCard: { gap: spacing[3] },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  details: { gap: spacing[2] },
  field: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing[2] },
  observations: { gap: spacing[1], paddingTop: spacing[2], borderTopWidth: 1, borderTopColor: colors.border.subtle },
});
