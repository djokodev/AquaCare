import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  Alert,
  StyleSheet,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { RootStackParamList } from '@/navigation/MainNavigator';
import { STORAGE_KEYS } from '@/constants/api';
import { ProductionReport } from '@/types/aquaculture';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { formatDate } from '@/utils';
import logger from '@/utils/logger';
import { parseApiError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';
import { AppHeader, AppText, Badge, Button, Card, Divider, EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { colors, spacing } from '@/theme';

type ReportDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ReportDetail'>;
type ReportDetailScreenRouteProp = RouteProp<RootStackParamList, 'ReportDetail'>;

interface ReportDetailScreenProps {
  navigation: ReportDetailScreenNavigationProp;
  route: ReportDetailScreenRouteProp;
}

interface ReportSummary {
  cycle_name?: string;
  scope_name?: string;
  scope_type?: 'cycle' | 'unit';
  species?: string;
  status?: string;
  total_units?: number;
  cycle_count?: number;
  total_log_count?: number;
  total_sanitary_events?: number;
  total_feed?: number;
  total_mortality?: number;
  initial_fish_count?: number;
  estimated_current_fish_count?: number;
  total_mortality_count?: number;
  mortality_rate_pct?: number;
  total_feed_consumed_kg?: number;
  estimated_current_biomass_kg?: number;
  units_with_today_log_count?: number;
  units_missing_today_log_count?: number;
  active_sanitary_events_count?: number;
}

interface ReportCycleData {
  cycle?: {
    id?: string;
    cycle_name?: string;
    species_display?: string;
    pond_identifier?: string;
    days_active?: number;
  };
  unit?: {
    id?: string;
    cycle_unit_allocation_id?: string;
    production_unit_id?: string;
    production_unit_name?: string;
    production_unit_type?: string;
    production_unit_type_display?: string;
    production_unit_dimension?: string;
    initial_fish_count?: number;
    current_fish_count?: number;
    initial_biomass_kg?: number;
    current_biomass_kg?: number;
    expected_survival_rate_pct?: number;
  };
  period_metrics?: {
    log_count?: number;
    total_feed?: number;
    total_mortality?: number;
    sanitary_event_count?: number;
  };
  dashboard_metrics?: {
    estimated_market_value_fcfa?: number;
    feed_cost_consumed_fcfa?: number;
    time_remaining_days?: number | null;
    direct_production_cost_fcfa?: number;
  };
  current_metrics?: {
    current_count?: number;
    current_average_weight?: number | null;
    current_biomass?: number | null;
    total_feed_consumed?: number | null;
    survival_rate?: number | null;
    fcr?: number | null;
    fcr_scope?: 'full_cycle' | 'since_tracking_start' | null;
    fcr_label?: string | null;
    daily_growth_rate?: number | null;
    specific_growth_rate?: number | null;
    average_daily_feed?: number | null;
    performance_score?: number | null;
  };
  logs?: Array<{
    id?: string;
    log_date?: string;
    mortality_count?: number;
    average_weight?: number | null;
    feed_quantity?: number | null;
  }>;
  sanitary_logs?: Array<{
    id?: string;
    event_date?: string;
    event_type_display?: string;
    symptoms?: string;
    affected_count?: number | null;
    treatment_applied?: string | null;
    medication_used?: string | null;
    dosage?: string | null;
    treatment_duration_days?: number | null;
    observations?: string | null;
    resolved?: boolean;
  }>;
}

export default function ReportDetailScreen({ navigation, route }: ReportDetailScreenProps) {
  const { t } = useTranslation();
  const { reportId } = route.params;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [report, setReport] = useState<ProductionReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    try {
      setError(null);
      const data = await aquacultureService.getReport(reportId);
      setReport(data);
    } catch (error: unknown) {
      logger.error('Erreur chargement detail rapport:', error);
      setError(formatAquacultureErrorWithAction(parseApiError(error), t));
    } finally {
      setLoading(false);
    }
  }, [reportId, t]);

  useFocusEffect(
    useCallback(() => {
      loadReport();
    }, [loadReport])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadReport();
    setRefreshing(false);
  }, [loadReport]);

  const runAction = async (actionKey: string, fn: () => Promise<ProductionReport>) => {
    try {
      setActionLoading(actionKey);
      const updated = await fn();
      setReport(updated);
    } catch (error: unknown) {
      logger.error(`Erreur action rapport ${actionKey}:`, error);
      Alert.alert(t('error'), formatAquacultureErrorWithAction(parseApiError(error), t));
    } finally {
      setActionLoading(null);
    }
  };

  const handleEmailAction = async () => {
    if (!report) return;
    if (report.status !== 'validated') {
      Alert.alert(t('validateFirst'), t('validateFirstHint'));
      return;
    }
    try {
      setActionLoading('email');
      const updated = await aquacultureService.sendReportEmail(report.id);
      setReport(updated);
      Alert.alert(t('emailQueued'), t('emailQueuedMessage'));
    } catch (error: unknown) {
      logger.error('Erreur envoi email rapport:', error);
      Alert.alert(t('error'), formatAquacultureErrorWithAction(parseApiError(error), t));
    } finally {
      setActionLoading(null);
    }
  };

  const handleShareWhatsApp = async () => {
    if (!report) return;
    if (report.status !== 'validated') {
      Alert.alert(t('validateFirst'), t('validateFirstHint'));
      return;
    }

    try {
      setActionLoading('whatsapp');
      let current = report;

      // Phase 1 : Vérifier que le PDF existe — ne jamais régénérer silencieusement
      // (la régénération doit être un acte explicite via le bouton dédié)
      if (!current.pdf_url) {
        Alert.alert(t('error'), t('reportPdfNotReady'));
        return;
      }

      // Phase 2 : Télécharger le PDF
      const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!baseDir) {
        Alert.alert(t('error'), t('reportStorageError'));
        return;
      }

      const token = await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
      const typeSlug = current.report_type === 'daily' ? 'journalier'
        : current.report_type === 'weekly' ? 'hebdomadaire' : 'mensuel';
      const fileUri = `${baseDir}rapport_${typeSlug}_${current.period_start}.pdf`;
      const downloadHeaders = token ? { headers: { Authorization: `Bearer ${token}` } } : {};

      let downloadResult = await FileSystem.downloadAsync(
        aquacultureService.getReportDownloadUrl(current.id),
        fileUri,
        downloadHeaders
      );

      // 409 = fichier manquant sur disque, backend a lancé la régénération
      if (downloadResult.status === 409) {
        // Force pdf_url à null pour que la boucle de poll tourne effectivement
        current = { ...current, pdf_url: null };
        setReport(current);

        const MAX_REGEN = 20;
        for (let i = 0; i < MAX_REGEN && !current.pdf_url; i++) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          current = await aquacultureService.getReport(current.id);
          setReport(current);
        }

        if (!current.pdf_url) {
          Alert.alert(t('error'), t('reportPdfNotReady'));
          return;
        }

        downloadResult = await FileSystem.downloadAsync(
          aquacultureService.getReportDownloadUrl(current.id),
          fileUri,
          downloadHeaders
        );
      }

      if (downloadResult.status !== 200) {
        Alert.alert(t('error'), t('reportWhatsAppShareError'));
        return;
      }

      // Phase 3 : Ouvrir la share sheet native
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(t('error'), t('reportSharingUnavailable'));
        return;
      }

      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: 'application/pdf',
        dialogTitle: t('reportShareTitle'),
        UTI: 'com.adobe.pdf',
      });

      // Phase 4 : Marquer le rapport comme partagé
      const updated = await aquacultureService.markReportWhatsAppShared(current.id, {
        metadata: { source: 'native_share' },
      });
      setReport(updated);
      Alert.alert(t('success'), t('reportWhatsAppMarked'));
    } catch (error: unknown) {
      logger.error('Erreur partage WhatsApp rapport:', error);
      Alert.alert(t('error'), formatAquacultureErrorWithAction(parseApiError(error), t));
    } finally {
      setActionLoading(null);
    }
  };

  const renderHeader = () => <AppHeader title={t('reportDetailTitle')} onBack={() => navigation.goBack()} backLabel={t('back')} />;

  const payload = useMemo(
    () => ((report?.payload || {}) as Record<string, unknown>),
    [report?.payload]
  );
  const reportMeta = useMemo(
    () => ((payload.report_meta as Record<string, unknown>) || {}) as Record<string, unknown>,
    [payload]
  );
  const scopeType = (reportMeta.scope_type as 'cycle' | 'unit' | undefined) || 'cycle';
  const scopeLabel = (reportMeta.scope_label as string | undefined) || (scopeType === 'unit' ? t('reportUnitTitle') : t('reportCycleTitle'));
  const reportMetaScopeName =
    typeof reportMeta.scope_name === 'string' ? reportMeta.scope_name : undefined;
  const summary = useMemo(
    () => ((payload.summary as ReportSummary) || {}) as ReportSummary,
    [payload]
  );
  const cycles = useMemo(
    () => ((payload.cycles as ReportCycleData[]) || []) as ReportCycleData[],
    [payload]
  );
  const latestSanitaryLogs = cycles[0]?.sanitary_logs?.slice(0, 3) ?? [];

  const renderListHeader = useCallback(
    () => {
      const reportType = report?.report_type === 'daily' ? t('reportTypeDaily') : report?.report_type === 'weekly' ? t('reportTypeWeekly') : t('reportTypeMonthly');
      const statusLabel = report?.status === 'validated' ? t('reportStatusValidated') : report?.status === 'pending' ? t('reportStatusPending') : t('reportStatusDraft');
      const statusTone = report?.status === 'validated' ? 'success' : report?.status === 'pending' ? 'warning' : 'neutral';
      const metrics = [
        [scopeType === 'unit' ? t('reportUnitTitle') : t('reportCycleTitle'), summary.scope_name || summary.cycle_name || reportMetaScopeName || t('notProvided')],
        [t('reportInitialFishCount'), String(summary.initial_fish_count || 0)],
        [t('reportEstimatedFishCount'), String(summary.estimated_current_fish_count || 0)],
        [t('reportCumulativeMortality'), String(summary.total_mortality_count || 0)],
        [t('reportMortalityRate'), summary.mortality_rate_pct != null ? `${summary.mortality_rate_pct}%` : t('notProvided')],
        [t('reportFeedConsumed'), `${(summary.total_feed_consumed_kg ?? summary.total_feed ?? 0).toFixed(2)} kg`],
        [t('reportEstimatedBiomass'), `${(summary.estimated_current_biomass_kg || 0).toFixed(2)} kg`],
        [scopeType === 'unit' ? t('reportLastAverageWeight') : t('reportUnitsTrackedToday'), scopeType === 'unit' && cycles[0]?.current_metrics?.current_average_weight != null ? `${cycles[0].current_metrics.current_average_weight} g` : String(summary.units_with_today_log_count || 0)],
        [scopeType === 'unit' ? t('reportActiveSanitaryEvents') : t('reportUnitsMissingToday'), String(scopeType === 'unit' ? summary.active_sanitary_events_count || 0 : summary.units_missing_today_log_count || 0)],
      ];
      return <View style={styles.headerContent}>
        <Card variant="outlined" style={styles.sectionCard}>
          <View style={styles.titleRow}><AppText variant="cardTitle">{reportType}</AppText><Badge label={statusLabel} tone={statusTone} /></View>
          <AppText variant="body" color="link">{scopeLabel}</AppText>
          <AppText variant="helper" color="muted">{report?.period_start === report?.period_end ? formatDate(report?.period_start ?? '') : `${formatDate(report?.period_start ?? '')} - ${formatDate(report?.period_end ?? '')}`}</AppText>
          <Divider />
          <View style={styles.statusRow}><AppText variant="helper">{t('email')}: {report?.email_status === 'sent' ? t('sent') : report?.email_status === 'failed' ? t('failed') : t('notSent')}</AppText><AppText variant="helper">{t('whatsAppLabel')}: {report?.whatsapp_status === 'shared' ? t('shared') : t('notShared')}</AppText></View>
        </Card>
        <Card variant="outlined" style={styles.sectionCard}>
          <AppText variant="cardTitle">{scopeType === 'unit' ? t('reportSummaryUnit') : t('reportSummaryCycle')}</AppText>
          <View style={styles.metricGrid}>{metrics.map(([label, value]) => <ReportMetric key={label} label={label} value={value} />)}</View>
        </Card>
        {scopeType === 'cycle' ? <Card variant="outlined" style={styles.sectionCard}>
          <AppText variant="cardTitle">{t('reportComparisonByUnit')}</AppText>
          {cycles.length ? cycles.map((section, index) => <Card key={section.unit?.id || section.cycle?.id || index} variant="outlined" style={styles.comparisonCard}>
            <AppText variant="label">{section.unit?.production_unit_name || section.cycle?.cycle_name || t('cycle')}</AppText>
            <AppText variant="helper" color="muted">{section.unit?.production_unit_type_display || section.cycle?.species_display || ''}{section.unit?.production_unit_dimension ? ` · ${section.unit.production_unit_dimension}` : ''}</AppText>
            <AppText variant="helper">{t('reportEstimatedFishCount')}: {section.current_metrics?.current_count || 0} · {t('reportFeedConsumed')}: {(section.period_metrics?.total_feed || 0).toFixed(2)} kg · {t('reportCumulativeMortality')}: {section.period_metrics?.total_mortality || 0}</AppText>
            <AppText variant="helper">
              {section.current_metrics?.fcr_label
                || (section.current_metrics?.fcr_scope === 'since_tracking_start'
                  ? t('fcrSinceAquaCare')
                  : t('fcrFullStat'))}
              : {section.current_metrics?.fcr != null
                ? section.current_metrics.fcr.toFixed(2)
                : t('notProvided')}
            </AppText>
          </Card>) : <EmptyState message={t('noReportDataAvailable')} compact />}
        </Card> : null}
        {scopeType === 'unit' ? <Card variant="outlined" style={styles.sectionCard}>
          <AppText variant="cardTitle">{t('reportLatestSanitaryEvents')}</AppText>
          {latestSanitaryLogs.length ? latestSanitaryLogs.map((event) => <Card key={event.id} variant="outlined" style={styles.eventCard}>
            <View style={styles.titleRow}><AppText variant="label">{event.event_date}</AppText><Badge label={event.resolved ? t('reportSanitaryEventResolved') : t('reportSanitaryEventActive')} tone={event.resolved ? 'success' : 'warning'} /></View>
            <AppText variant="helper" color="muted">{t('reportSanitaryEventType')}: {event.event_type_display || t('sanitaryLog')}</AppText>
            <AppText variant="helper" color="muted">{t('reportSanitaryAffectedCount')}: {event.affected_count ?? 0}</AppText>
            <AppText variant="helper" color="muted">{t('reportSanitarySymptoms')}: {event.symptoms || t('notProvided')}</AppText>
            <AppText variant="helper" color="muted">{t('reportSanitaryTreatmentApplied')}: {event.treatment_applied || t('notProvided')}</AppText>
            <AppText variant="helper" color="muted">{t('reportSanitaryMedicationUsed')}: {event.medication_used || t('notProvided')}</AppText>
            <AppText variant="helper" color="muted">{t('reportSanitaryDosage')}: {event.dosage || t('notProvided')}</AppText>
            <AppText variant="helper" color="muted">{t('reportSanitaryTreatmentDuration')}: {event.treatment_duration_days ? t('daysCount', { count: event.treatment_duration_days }) : t('notProvided')}</AppText>
            <AppText variant="helper" color="muted">{t('reportSanitaryEventStatus')}: {event.resolved ? t('reportSanitaryEventResolved') : t('reportSanitaryEventActive')}</AppText>
            <AppText variant="helper" color="muted">{t('reportSanitaryObservations')}: {event.observations || t('notProvided')}</AppText>
          </Card>) : <EmptyState message={t('noUnitSanitaryLogs')} compact />}
        </Card> : null}
        <Card style={styles.sectionCard}>
          <View style={styles.actionButtons}>
            <Button
              variant="outline"
              label={t('regenerateReport')}
              onPress={() => report && runAction('regenerate', () => aquacultureService.regenerateReport(report.id))}
              disabled={Boolean(actionLoading)}
              loading={actionLoading === 'regenerate'}
              iconLeft="refresh-outline"
            />
            <Button
              label={t('validateReport')}
              onPress={() => report && runAction('validate', () => aquacultureService.validateReport(report.id))}
              disabled={Boolean(actionLoading) || report?.status === 'validated'}
              loading={actionLoading === 'validate'}
              iconLeft="checkmark-done-outline"
            />
            <Button
              label={t('sendByEmail')}
              onPress={handleEmailAction}
              disabled={Boolean(actionLoading)}
              loading={actionLoading === 'email'}
              iconLeft="mail-outline"
            />
            <Button
              label={t('shareOnWhatsApp')}
              onPress={handleShareWhatsApp}
              disabled={Boolean(actionLoading)}
              loading={actionLoading === 'whatsapp'}
              iconLeft="logo-whatsapp"
            />
          </View>
        </Card>
      </View>;
    },
    [
      actionLoading,
      cycles,
      handleEmailAction,
      handleShareWhatsApp,
      latestSanitaryLogs,
      report,
      reportMetaScopeName,
      runAction,
      scopeLabel,
      scopeType,
      summary,
      t,
    ]
  );

  if (loading) {
    return <View style={styles.root}><AppHeader title={t('reportDetailTitle')} onBack={() => navigation.goBack()} backLabel={t('back')} /><Screen style={styles.stateScreen}><LoadingState message={t('loading')} /></Screen></View>;
  }

  if (!report) {
    return <View style={styles.root}><AppHeader title={t('reportDetailTitle')} onBack={() => navigation.goBack()} backLabel={t('back')} /><Screen style={styles.stateScreen}><ErrorState message={error || t('reportLoadError')} /></Screen></View>;
  }

  return (
    <View style={styles.root}>
      {renderHeader()}
      <Screen style={styles.listScreen}>
      <FlatList
        data={[]}
        keyExtractor={() => ''}
        renderItem={() => null}
        ListHeaderComponent={renderListHeader}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
      </Screen>
    </View>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <AppText variant="caption" color="muted">{label}</AppText>
      <AppText variant="label">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.page },
  stateScreen: { justifyContent: 'center' },
  listScreen: { padding: 0 },
  listContent: { paddingBottom: spacing[6] },
  headerContent: { padding: spacing[4], gap: spacing[3] },
  sectionCard: { gap: spacing[3] },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing[2] },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  metric: { width: '46%', gap: spacing[1] },
  comparisonCard: { gap: spacing[1] },
  eventCard: { gap: spacing[1], backgroundColor: colors.surface.page },
  actionButtons: { gap: spacing[2] },
});
