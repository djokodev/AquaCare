import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSelector } from 'react-redux';

import { AppHeader, AppText, Card, EmptyState, Screen } from '@/components/ui';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { RootState } from '@/store/store';
import { CycleLog } from '@/types/aquaculture';
import { colors, spacing } from '@/theme';
import { formatDate, formatDateTime } from '@/utils';

type NavigationProp = StackNavigationProp<RootStackParamList, 'DailyLogDetail'>;
type Route = RouteProp<RootStackParamList, 'DailyLogDetail'>;
interface Props { navigation: NavigationProp; route?: Route; }

const formatOptionalNumber = (value: number | string | null | undefined, suffix = '') => value === null || value === undefined || value === '' ? '-' : `${value}${suffix}`;

export default function DailyLogDetailScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { dashboardData, currentCycle } = useSelector((state: RootState) => state.aquaculture);
  const activeCycles = dashboardData?.active_cycles || [];
  const routeParams = route?.params;
  const log: CycleLog | null = routeParams?.log ?? null;
  const selectedCycle = useMemo(() => {
    if (!routeParams?.cycleId) return currentCycle || null;
    return activeCycles.find((cycle) => cycle.id === routeParams.cycleId) || currentCycle || null;
  }, [activeCycles, currentCycle, routeParams?.cycleId]);
  const unitName = routeParams?.productionUnitName || log?.production_unit_name || t('productionUnitsUnknownUnit');
  const cycleName = selectedCycle?.cycle_name || log?.cycle || t('sessionCycleNotSelected');

  const renderField = (label: string, value: React.ReactNode) => (
    <View style={styles.field}>
      <AppText color="muted" style={styles.fieldLabel}>{label}</AppText>
      <AppText variant="label" style={styles.fieldValue}>{value}</AppText>
    </View>
  );
  const renderSection = (title: string, children: React.ReactNode) => <Card variant="outlined" style={styles.section}><AppText variant="sectionTitle">{title}</AppText>{children}</Card>;

  const header = <AppHeader title={t('dailyLogDetailTitle')} onBack={() => navigation.goBack()} backLabel={t('back')} />;
  if (!log) return <View style={styles.root}>{header}<Screen style={styles.empty}><EmptyState title={t('dailyLogDetailUnavailable')} /></Screen></View>;

  const detailDate = formatDate(log.log_date);
  const detailTime = log.log_time ? log.log_time.slice(0, 5) : '-';
  const createdAt = log.created_at ? formatDateTime(log.created_at) : '-';

  return (
    <View style={styles.root}>
      {header}
      <Screen scroll scrollProps={{ contentContainerStyle: styles.content }}>
        <Card variant="outlined" style={styles.summary}>
          <AppText variant="cardTitle" color="link">{detailDate}</AppText>
          <AppText color="muted">{unitName}</AppText>
          <AppText color="muted">{cycleName}</AppText>
        </Card>
        {renderSection(t('dailyLogDetailInfoTitle'), <>
          {renderField(t('dailyLogDetailDateLabel'), detailDate)}
          {renderField(t('dailyLogDetailTimeLabel'), detailTime)}
          {renderField(t('dailyLogDetailCycleLabel'), cycleName)}
          {renderField(t('dailyLogDetailUnitLabel'), unitName)}
          {renderField(t('dailyLogDetailCreatedAtLabel'), createdAt)}
          {renderField(t('dailyLogDetailCreatedOfflineLabel'), log.created_offline ? t('yes') : t('no'))}
          {log.synced_at ? renderField(t('dailyLogDetailSyncedAtLabel'), formatDateTime(log.synced_at)) : null}
          {log.client_uuid ? renderField(t('dailyLogDetailClientUuidLabel'), log.client_uuid) : null}
        </>)}
        {renderSection(t('dailyLogDetailSamplingTitle'), <>
          {renderField(t('sampleCount'), formatOptionalNumber(log.sample_count))}
          {renderField(t('totalWeight'), formatOptionalNumber(log.sample_total_weight, ' g'))}
          {renderField(t('averageWeight'), formatOptionalNumber(log.average_weight, ' g'))}
        </>)}
        {renderSection(t('dailyLogDetailFeedingTitle'), <>
          {renderField(t('feedQuantity'), formatOptionalNumber(log.feed_quantity, ' kg'))}
          {renderField(t('feedType'), log.feed_type || t('noData'))}
          {renderField(t('feedSizeMm'), formatOptionalNumber(log.feed_size_mm, ' mm'))}
          {renderField(t('feedingTimes'), log.feeding_times && log.feeding_times.length > 0 ? log.feeding_times.join(', ') : t('noData'))}
        </>)}
        {renderSection(t('dailyLogDetailEnvironmentTitle'), <>
          {renderField(t('waterTemperature'), formatOptionalNumber(log.water_temperature, '°C'))}
          {renderField(t('dissolvedOxygen'), formatOptionalNumber(log.dissolved_oxygen, ' mg/L'))}
          {renderField(t('phLevel'), formatOptionalNumber(log.ph_level))}
          {renderField(t('ammoniaLevel'), formatOptionalNumber(log.ammonia_level, ' ppm'))}
        </>)}
        {renderSection(t('dailyLogDetailMortalityTitle'), <>
          {renderField(t('mortality'), formatOptionalNumber(log.mortality_count))}
          {renderField(t('mortalityReason'), log.mortality_reason || t('noData'))}
        </>)}
        {renderSection(t('dailyLogDetailObservationsTitle'), <AppText>{log.observations || t('noData')}</AppText>)}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.page },
  empty: { justifyContent: 'center' },
  content: { padding: spacing[4], gap: spacing[3] },
  summary: { gap: spacing[1] },
  section: { gap: spacing[3] },
  field: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing[3], paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  fieldLabel: { flex: 1 },
  fieldValue: { flex: 1, textAlign: 'right' },
});
