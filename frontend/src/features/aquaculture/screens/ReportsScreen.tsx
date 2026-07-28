import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, RefreshControl, Alert, StyleSheet } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { RootStackParamList } from '@/navigation/MainNavigator';
import { CycleUnitAllocation, ProductionReport, ReportScopeType, ReportType } from '@/types/aquaculture';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { parseApiError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';
import {
  getCycleReportAvailability,
  getLocalDateISO,
} from '@/features/aquaculture/utils/reportPeriods';
import { formatDate, formatDateTime } from '@/utils';
import { RootState } from '@/store/store';
import logger from '@/utils/logger';
import { AppHeader, AppText, Button, Card, EmptyState, ErrorState, IconButton, InlineAlert, LoadingState, SelectableCard, SegmentedControl, Screen } from '@/components/ui';
import { colors, spacing } from '@/theme';

type ReportsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Reports'>;
type ReportsScreenRouteProp = RouteProp<RootStackParamList, 'Reports'>;

interface ReportsScreenProps {
  navigation: ReportsScreenNavigationProp;
  route: ReportsScreenRouteProp;
}

const REPORT_TYPES: ReportType[] = ['daily', 'weekly', 'monthly'];

export default function ReportsScreen({ navigation, route }: ReportsScreenProps) {
  const { t, i18n } = useTranslation();
  const currentCycle = useSelector((state: RootState) => state.aquaculture.currentCycle);
  const activeCycles = useSelector(
    (state: RootState) => state.aquaculture.dashboardData?.active_cycles ?? []
  );
  const routeParams = route.params;

  const resolvedCycleId = routeParams?.cycleId ?? currentCycle?.id ?? undefined;
  const initialScope: ReportScopeType = routeParams?.scope === 'unit' ? 'unit' : 'cycle';
  const [allocations, setAllocations] = useState<CycleUnitAllocation[]>([]);
  const [allocationLoading, setAllocationLoading] = useState(Boolean(resolvedCycleId));
  const [selectedScope, setSelectedScope] = useState<ReportScopeType>(initialScope);
  const [selectedAllocationId, setSelectedAllocationId] = useState(
    routeParams?.cycleUnitAllocationId ?? ''
  );
  const [allocationError, setAllocationError] = useState(false);

  const selectedAllocation = useMemo(
    () => allocations.find((allocation) => allocation.id === selectedAllocationId) ?? null,
    [allocations, selectedAllocationId]
  );
  const resolvedCycle = useMemo(
    () => (
      currentCycle?.id === resolvedCycleId
        ? currentCycle
        : activeCycles.find((cycle) => cycle.id === resolvedCycleId) ?? null
    ),
    [activeCycles, currentCycle, resolvedCycleId]
  );
  const cycleStartDate = resolvedCycle?.start_date
    ?? selectedAllocation?.cycle_start_date
    ?? allocations[0]?.cycle_start_date;
  const reportReferenceDate = getLocalDateISO();
  const reportAvailability = useMemo(
    () => new Map(
      REPORT_TYPES.map((reportType) => [
        reportType,
        getCycleReportAvailability({
          reportType,
          cycleStartDate,
          referenceDate: reportReferenceDate,
        }),
      ])
    ),
    [cycleStartDate, reportReferenceDate]
  );
  const reportScope: ReportScopeType = selectedScope === 'unit' && selectedAllocation ? 'unit' : 'cycle';
  const resolvedCycleUnitAllocationId = selectedAllocation?.id;
  const hasValidUnitContext = Boolean(resolvedCycleId && resolvedCycleUnitAllocationId);
  const hasValidCycleContext = Boolean(resolvedCycleId);
  const canGenerateReports = selectedScope === 'unit'
    ? hasValidUnitContext
    : hasValidCycleContext;

  const scopeTitle = selectedScope === 'unit' ? t('reportUnitTitle') : t('reportCycleTitle');
  const scopeError = selectedScope === 'unit'
    ? t('incompleteUnitContext')
    : t('reportContextIncompleteError');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingType, setGeneratingType] = useState<ReportType | null>(null);
  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [selectedType, setSelectedType] = useState<ReportType | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousCycleIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const previousCycleId = previousCycleIdRef.current;
    if (previousCycleId && previousCycleId !== resolvedCycleId) {
      setSelectedScope('cycle');
      setSelectedAllocationId('');
      setAllocations([]);
      setAllocationError(false);
    }
    previousCycleIdRef.current = resolvedCycleId;
  }, [resolvedCycleId]);

  const loadAllocations = useCallback(async () => {
    if (!resolvedCycleId) {
      setAllocations([]);
      setAllocationLoading(false);
      setSelectedScope('cycle');
      setSelectedAllocationId('');
      return;
    }

    setAllocationLoading(true);
    setAllocationError(false);
    try {
      const data = await aquacultureService.getCycleUnitAllocations(resolvedCycleId);
      setAllocations(data);
      const requestedAllocationId = routeParams?.cycleUnitAllocationId;
      const requestedAllocation = data.find((allocation) => allocation.id === requestedAllocationId);
      if (requestedAllocation) {
        setSelectedAllocationId(requestedAllocation.id);
        setSelectedScope(initialScope);
      } else {
        if (initialScope === 'unit' && requestedAllocationId) {
          setAllocationError(true);
          setSelectedAllocationId('');
          setSelectedScope('cycle');
        } else if (initialScope === 'unit') {
          setSelectedAllocationId('');
          setSelectedScope('unit');
        }
      }
    } catch (error: unknown) {
      logger.error('Erreur chargement allocations de rapport:', error);
      setAllocations([]);
      setSelectedAllocationId('');
      setSelectedScope(initialScope === 'unit' ? 'unit' : 'cycle');
      setAllocationError(initialScope === 'unit');
    } finally {
      setAllocationLoading(false);
    }
  }, [initialScope, resolvedCycleId, routeParams?.cycleUnitAllocationId]);

  useEffect(() => {
    void loadAllocations();
  }, [loadAllocations]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const reportFilters = useMemo(() => {
    if (reportScope === 'unit' && hasValidUnitContext) {
      return {
        scope_type: 'unit' as ReportScopeType,
        cycle_id: resolvedCycleId,
        cycle_unit_allocation_id: resolvedCycleUnitAllocationId,
      };
    }
    if (reportScope === 'cycle' && hasValidCycleContext) {
      return {
        scope_type: 'cycle' as ReportScopeType,
        cycle_id: resolvedCycleId,
      };
    }
    if (currentCycle?.id) {
      return { scope_type: 'cycle' as ReportScopeType, cycle_id: currentCycle.id };
    }
    return undefined;
  }, [
    currentCycle?.id,
    hasValidCycleContext,
    hasValidUnitContext,
    reportScope,
    resolvedCycleId,
    resolvedCycleUnitAllocationId,
  ]);

  const loadReports = useCallback(async () => {
    if (allocationLoading) {
      return [];
    }
    if (selectedScope === 'unit' && !hasValidUnitContext) {
      setError(scopeError);
      setLoading(false);
      return [];
    }
    if (selectedScope === 'cycle' && !hasValidCycleContext && !currentCycle?.id) {
      setError(scopeError);
      setLoading(false);
      return [];
    }

    try {
      setError(null);
      const data = await aquacultureService.getReports(reportFilters);
      setReports(data);
      return data;
    } catch (error: unknown) {
      logger.error('Erreur chargement rapports:', error);
      setError(formatAquacultureErrorWithAction(parseApiError(error), t));
      return [];
    } finally {
      setLoading(false);
    }
  }, [allocationLoading, currentCycle?.id, hasValidCycleContext, hasValidUnitContext, reportFilters, reportScope, scopeError, selectedScope, t]);

  const startPollingIfPending = useCallback((data: ProductionReport[]) => {
    const hasPending = data.some((r) => r.status === 'pending');
    if (!hasPending) {
      stopPolling();
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      const updated = await loadReports();
      if (!updated.some((r) => r.status === 'pending')) {
        stopPolling();
        setInfoMessage(null);
      }
    }, 10000);
  }, [loadReports, stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  useFocusEffect(
    useCallback(() => {
      loadReports().then(startPollingIfPending);
      return () => stopPolling();
    }, [loadReports, startPollingIfPending, stopPolling])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    const data = await loadReports();
    startPollingIfPending(data);
    setRefreshing(false);
  };

  const formatReportPeriod = useCallback((report: ProductionReport) => {
    const locale = i18n?.language?.startsWith('en') ? 'en-US' : 'fr-FR';
    if (report.report_type === 'daily') {
      return formatDate(report.period_start, locale);
    }
    return `${formatDate(report.period_start, locale)} – ${formatDate(report.period_end, locale)}`;
  }, [i18n?.language]);

  const reportLocale = i18n?.language?.startsWith('en') ? 'en-US' : 'fr-FR';

  const handleGenerateReport = async (reportType: ReportType) => {
    if (!canGenerateReports) {
      setError(scopeError);
      return;
    }
    const availability = reportAvailability.get(reportType);
    if (!availability?.available) {
      if (availability && reportType !== 'daily') {
        setInfoMessage(null);
        Alert.alert(
          t('reportUnavailableTitle'),
          t(
            reportType === 'weekly'
              ? 'reportWeeklyUnavailableHint'
              : 'reportMonthlyUnavailableHint',
            { count: availability.daysRemaining }
          )
        );
      }
      return;
    }
    try {
      setError(null);
      setGeneratingType(reportType);
      setInfoMessage(null);
      const payload = reportScope === 'unit'
        ? {
            report_type: reportType,
            scope_type: 'unit' as const,
            cycle_id: resolvedCycleId as string,
            cycle_unit_allocation_id: resolvedCycleUnitAllocationId as string,
            reference_date: reportReferenceDate,
          }
        : {
            report_type: reportType,
            scope_type: 'cycle' as const,
            cycle_id: resolvedCycleId as string,
            reference_date: reportReferenceDate,
          };
      await aquacultureService.generateReport(payload);
      setInfoMessage(t('reportGenerating'));
      const data = await loadReports();
      startPollingIfPending(data);
    } catch (error: unknown) {
      logger.error('Erreur generation rapport:', error);
      setError(formatAquacultureErrorWithAction(parseApiError(error), t));
    } finally {
      setGeneratingType(null);
    }
  };

  const handleDeleteReport = useCallback((report: ProductionReport) => {
    Alert.alert(
      t('reportDeleteConfirm'),
      t('reportDeleteConfirmMsg'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await aquacultureService.deleteReport(report.id);
              setReports(prev => prev.filter(r => r.id !== report.id));
            } catch (error: unknown) {
              logger.error('Erreur suppression rapport:', error);
              Alert.alert(
                t('error'),
                formatAquacultureErrorWithAction(parseApiError(error), t)
              );
            }
          },
        },
      ]
    );
  }, [canGenerateReports, loadReports, reportScope, resolvedCycleId, resolvedCycleUnitAllocationId, scopeError, t]);

  const getStatusLabel = (reportStatus: string) => {
    if (reportStatus === 'validated') return t('reportStatusValidated');
    if (reportStatus === 'pending') return t('reportStatusPending');
    return t('reportStatusDraft');
  };

  const filteredReports = reports.filter(
    (report) => selectedType === 'all' || report.report_type === selectedType
  );
  const reportHistoryFilters = ['all', ...REPORT_TYPES] as const;

  const getUnitTypeLabel = (unitType?: string) => {
    if (unitType === 'pond') return t('productionUnitTypePond');
    if (unitType === 'cage') return t('productionUnitTypeCage');
    return t('productionUnitTypeTank');
  };

  const renderScopeSelector = () => (
    <Card variant="outlined" style={styles.scopeCard}>
      <AppText variant="sectionTitle" style={{ marginBottom: spacing[3] }}>{t('reportScope')}</AppText>
      <SelectableCard
        style={styles.scopeOption}
        layout="row"
        selected={reportScope === 'cycle'}
        primaryBorder={reportScope === 'cycle'}
        accessibilityLabel={t('fullCycle')}
        onPress={() => setSelectedScope('cycle')}
      >
        <AppText variant="label">{t('fullCycle')}</AppText>
      </SelectableCard>

      {allocationLoading && (
        <LoadingState message={t('loading')} compact />
      )}

      {allocations.map((allocation) => {
        const isSelected = reportScope === 'unit' && selectedAllocationId === allocation.id;
        const details = [
          getUnitTypeLabel(allocation.production_unit_type),
          allocation.production_unit_display_dimension,
          allocation.status_display,
        ].filter(Boolean).join(' · ');
        return (
          <SelectableCard
            key={allocation.id}
            style={styles.scopeOption}
            selected={isSelected}
            primaryBorder={isSelected}
            layout="row"
            accessibilityLabel={allocation.production_unit_name ?? t('productionUnitsUnknownUnit')}
            onPress={() => {
              setSelectedAllocationId(allocation.id);
              setSelectedScope('unit');
            }}
          >
            <View style={{ flex: 1 }}>
              <AppText variant="label">{allocation.production_unit_name}</AppText>
              {details && <AppText variant="caption" color="muted">{details}</AppText>}
            </View>
          </SelectableCard>
        );
      })}

      {!allocationLoading && allocations.length === 0 && (
        <AppText variant="caption" color="muted">{t('noProductionUnitsAvailable')}</AppText>
      )}
      {allocationError && (
        <AppText variant="helper" color="error">{t('selectedProductionUnitUnavailable')}</AppText>
      )}
    </Card>
  );

  const renderReportItem = useCallback(
    ({ item: report }: { item: ProductionReport }) => (
      <SelectableCard
        style={styles.reportCard}
        accessibilityLabel={t('openReportDetails')}
        onPress={() => navigation.navigate('ReportDetail', { reportId: report.id })}
      >
        <View style={styles.reportTopRow}>
          <View style={styles.reportIdentity}>
            <AppText variant="label">
            {report.report_type === 'daily'
              ? t('reportTypeDaily')
              : report.report_type === 'weekly'
                ? t('reportTypeWeekly')
                : t('reportTypeMonthly')}
            </AppText>
            <AppText variant="caption" color="muted" style={{ marginTop: spacing[1] }}>
              {(() => {
                const scopeIdentity = report.scope_name?.trim();
                const fallbackLabel = report.scope_type === 'unit'
                  ? t('reportUnitTitle')
                  : t('reportCycleTitle');
                const scopeLabel = report.scope_label?.trim() || fallbackLabel;
                return scopeIdentity ? `${scopeIdentity} · ${scopeLabel}` : scopeLabel;
              })()}
            </AppText>
          </View>
          <View style={styles.reportStatusColumn}>
            <AppText variant="label" color={report.status === 'validated' ? 'link' : report.status === 'pending' ? 'warning' : 'muted'}>{getStatusLabel(report.status)}</AppText>
            <IconButton
              icon="trash-outline"
              variant="danger"
              accessibilityLabel={t('reportDeleteAction')}
              onPress={() => handleDeleteReport(report)}
            />
          </View>
        </View>

        <View style={styles.reportDetailsRow}>
          <View style={{ flex: 1 }}>
            <AppText variant="label" color="link">{t('openReportDetails')}</AppText>
            {report.generated_at && <AppText variant="caption" color="muted" style={{ marginTop: spacing[1] }}>{formatDateTime(report.generated_at, reportLocale)}</AppText>}
          </View>
          <AppText variant="body" color="link">→</AppText>
        </View>

        <AppText variant="caption" color="muted" style={{ marginTop: spacing[1] }}>
          {t('reportPeriodLabel')}: {formatReportPeriod(report)}
        </AppText>

        <View style={styles.deliveryStatusRow}>
          <AppText variant="caption" color="muted">
            {t('email')}: {report.email_status === 'sent' ? t('sent') : report.email_status === 'failed' ? t('failed') : t('notSent')}
          </AppText>
          <AppText variant="caption" color="muted">
            {t('whatsAppLabel')}: {report.whatsapp_status === 'shared' ? t('shared') : t('notShared')}
          </AppText>
        </View>
      </SelectableCard>
    ),
    [formatDateTime, formatReportPeriod, handleDeleteReport, navigation, reportLocale, t]
  );

  const renderListHeader = useCallback(
    () => (
      <View style={{ padding: spacing[4], gap: spacing[3] }}>
        {renderScopeSelector()}
        {canGenerateReports ? (
          <>
            <AppText variant="sectionTitle">{t('generateReport')}</AppText>

            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              {REPORT_TYPES.map((reportType) => {
                const availability = reportAvailability.get(reportType);
                const unavailableHint = availability && !availability.available && reportType !== 'daily'
                  ? t(
                      reportType === 'weekly'
                        ? 'reportWeeklyUnavailableHint'
                        : 'reportMonthlyUnavailableHint',
                      { count: availability.daysRemaining }
                    )
                  : undefined;

                return (
                  <Button
                    key={reportType}
                    variant="outline"
                    size="small"
                    fullWidth={false}
                    onPress={() => handleGenerateReport(reportType)}
                    disabled={Boolean(generatingType)}
                    loading={generatingType === reportType}
                    accessibilityHint={unavailableHint}
                    label={reportType === 'daily'
                      ? t('reportGenerationDaily')
                      : reportType === 'weekly'
                        ? t('reportGenerationWeekly')
                        : t('reportGenerationMonthly')}
                  />
                );
              })}
            </View>

          </>
        ) : (
          <InlineAlert tone="warning" message={scopeError} />
        )}

        {infoMessage && (
          <InlineAlert tone="success" message={infoMessage} />
        )}

        {error && (
          <InlineAlert tone="error" message={error} />
        )}

        <AppText variant="sectionTitle">{t('reportHistory')}</AppText>

        <SegmentedControl
          value={selectedType}
          onChange={setSelectedType}
          options={reportHistoryFilters.map((type) => ({
            value: type,
            label: type === 'all' ? t('all') : type === 'daily' ? t('reportGenerationDailyShort') : type === 'weekly' ? t('reportGenerationWeeklyShort') : t('reportGenerationMonthlyShort'),
          }))}
        />
      </View>
    ),
    [allocationError, allocationLoading, allocations, canGenerateReports, error, generatingType, handleGenerateReport, infoMessage, reportAvailability, reportScope, scopeError, selectedAllocationId, selectedType, t]
  );

  const renderEmptyState = useCallback(
    () => (
      <EmptyState title={t('noReportsYet')} />
    ),
    [t]
  );

  if (loading) {
    return <View style={styles.root}><AppHeader title={scopeTitle} onBack={() => navigation.goBack()} backLabel={t('back')} /><Screen style={styles.stateScreen}><LoadingState message={t('loading')} /></Screen></View>;
  }

  return (
    <View style={styles.root}>
      <AppHeader title={scopeTitle} onBack={() => navigation.goBack()} backLabel={t('back')} />
      <Screen style={styles.listScreen}>
      <FlatList
        data={filteredReports}
        keyExtractor={(item) => item.id}
        renderItem={renderReportItem}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.page },
  stateScreen: { justifyContent: 'center' },
  listScreen: { padding: 0 },
  listContent: { paddingBottom: spacing[4] },
  scopeCard: { gap: spacing[2] },
  scopeOption: { marginBottom: spacing[2] },
  reportCard: { marginHorizontal: spacing[4], marginBottom: spacing[3], gap: spacing[2] },
  reportTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing[3] },
  reportIdentity: { flex: 1 },
  reportStatusColumn: { alignItems: 'flex-end', gap: spacing[2] },
  reportDetailsRow: { marginTop: spacing[2], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border.subtle, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  deliveryStatusRow: { flexDirection: 'row', marginTop: spacing[2], justifyContent: 'space-between', gap: spacing[2] },
});
