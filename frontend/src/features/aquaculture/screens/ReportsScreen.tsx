import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl, Alert } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';

import { RootStackParamList } from '@/navigation/MainNavigator';
import { AQUACARE_COLORS } from '@/constants/colors';
import { CycleUnitAllocation, ProductionReport, ReportScopeType, ReportType } from '@/types/aquaculture';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { parseApiError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';
import { formatDate, formatDateTime } from '@/utils';
import { RootState } from '@/store/store';
import logger from '@/utils/logger';

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
    if (report.report_type === 'monthly') {
      const monthDate = new Date(`${report.period_start}T12:00:00`);
      return monthDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    }
    return `${formatDate(report.period_start, locale)} – ${formatDate(report.period_end, locale)}`;
  }, [i18n?.language]);

  const reportLocale = i18n?.language?.startsWith('en') ? 'en-US' : 'fr-FR';

  const handleGenerateReport = async (reportType: ReportType) => {
    if (!canGenerateReports) {
      setError(scopeError);
      return;
    }
    try {
      setGeneratingType(reportType);
      setInfoMessage(null);
      const payload = reportScope === 'unit'
        ? {
            report_type: reportType,
            scope_type: 'unit' as const,
            cycle_unit_allocation_id: resolvedCycleUnitAllocationId as string,
          }
        : {
            report_type: reportType,
            scope_type: 'cycle' as const,
            cycle_id: resolvedCycleId as string,
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

  const getStatusStyle = (reportStatus: string) => {
    if (reportStatus === 'validated') return 'text-aquacare-primary';
    if (reportStatus === 'pending') return 'text-warning';
    return 'text-gray-light';
  };

  const getStatusLabel = (reportStatus: string) => {
    if (reportStatus === 'validated') return t('reportStatusValidated');
    if (reportStatus === 'pending') return t('reportStatusPending');
    return t('reportStatusDraft');
  };

  const filteredReports = reports.filter(
    (report) => selectedType === 'all' || report.report_type === selectedType
  );
  const reportHistoryFilters = ['all', ...REPORT_TYPES] as const;

  const renderHeader = () => (
    <View className="bg-aquacare-primary flex-row items-center pt-14 pb-4 px-4">
      <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.WHITE} />
      </TouchableOpacity>
      <Text className="text-xl font-bold text-white">{scopeTitle}</Text>
    </View>
  );

  const getUnitTypeLabel = (unitType?: string) => {
    if (unitType === 'pond') return t('productionUnitTypePond');
    if (unitType === 'cage') return t('productionUnitTypeCage');
    return t('productionUnitTypeTank');
  };

  const renderScopeSelector = () => (
    <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
      <Text className="text-base font-bold text-gray-dark mb-3">{t('reportScope')}</Text>
      <TouchableOpacity
        className={`border rounded-lg p-3 mb-2 ${reportScope === 'cycle' ? 'border-aquacare-primary bg-green-50' : 'border-gray-200'}`}
        onPress={() => setSelectedScope('cycle')}
        accessibilityRole="radio"
        accessibilityState={{ selected: reportScope === 'cycle' }}
      >
        <Text className="text-sm font-semibold text-gray-dark">{t('fullCycle')}</Text>
      </TouchableOpacity>

      {allocationLoading && (
        <View className="flex-row items-center py-2">
          <ActivityIndicator size="small" color={AQUACARE_COLORS.GREEN_PRIMARY} />
          <Text className="text-sm text-gray-light ml-2">{t('loading')}</Text>
        </View>
      )}

      {allocations.map((allocation) => {
        const isSelected = reportScope === 'unit' && selectedAllocationId === allocation.id;
        const details = [
          getUnitTypeLabel(allocation.production_unit_type),
          allocation.production_unit_display_dimension,
          allocation.status_display,
        ].filter(Boolean).join(' · ');
        return (
          <TouchableOpacity
            key={allocation.id}
            className={`border rounded-lg p-3 mb-2 ${isSelected ? 'border-aquacare-primary bg-green-50' : 'border-gray-200'}`}
            onPress={() => {
              setSelectedAllocationId(allocation.id);
              setSelectedScope('unit');
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
          >
            <Text className="text-sm font-semibold text-gray-dark">{allocation.production_unit_name}</Text>
            {details && <Text className="text-xs text-gray-light mt-1">{details}</Text>}
          </TouchableOpacity>
        );
      })}

      {!allocationLoading && allocations.length === 0 && (
        <Text className="text-sm text-gray-light">{t('noProductionUnitsAvailable')}</Text>
      )}
      {allocationError && (
        <Text className="text-sm text-error mt-1">{t('selectedProductionUnitUnavailable')}</Text>
      )}
    </View>
  );

  const renderReportItem = useCallback(
    ({ item: report }: { item: ProductionReport }) => (
      <TouchableOpacity
        className="bg-white rounded-xl p-4 mb-3 mx-4 border border-gray-200 shadow-sm"
        accessibilityRole="button"
        accessibilityLabel={t('openReportDetails')}
        onPress={() => navigation.navigate('ReportDetail', { reportId: report.id })}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-sm font-bold text-gray-dark">
            {report.report_type === 'daily'
              ? t('reportTypeDaily')
              : report.report_type === 'weekly'
                ? t('reportTypeWeekly')
                : t('reportTypeMonthly')}
            </Text>
            <Text className="text-xs text-gray-light mt-1">
              {report.scope_label || (report.scope_type === 'unit' ? t('reportUnitTitle') : t('reportCycleTitle'))}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Text className={`text-xs font-semibold mr-3 ${getStatusStyle(report.status)}`}>
              {getStatusLabel(report.status)}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={AQUACARE_COLORS.GRAY_LIGHT} />
            <TouchableOpacity
              onPress={() => handleDeleteReport(report)}
              className="ml-3"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={16} color={AQUACARE_COLORS.ERROR} />
            </TouchableOpacity>
          </View>
        </View>

        <View className="mt-3 pt-3 border-t border-gray-100 flex-row items-center justify-between">
          <Text className="text-xs text-gray-light">{t('openReportDetails')}</Text>
          <Ionicons name="arrow-forward" size={14} color={AQUACARE_COLORS.GREEN_PRIMARY} />
        </View>

        {report.generated_at && (
          <Text className="text-xs text-gray-light mt-1">
            {formatDateTime(report.generated_at, reportLocale)}
          </Text>
        )}
        <Text className="text-xs text-gray-light mt-1">
          {t('reportPeriodLabel')}: {formatReportPeriod(report)}
        </Text>

        <View className="flex-row mt-2">
          <Text className="text-xs text-gray-light mr-4">
            {t('email')}: {report.email_status === 'sent' ? t('sent') : report.email_status === 'failed' ? t('failed') : t('notSent')}
          </Text>
          <Text className="text-xs text-gray-light">
            {t('whatsAppLabel')}: {report.whatsapp_status === 'shared' ? t('shared') : t('notShared')}
          </Text>
        </View>
      </TouchableOpacity>
    ),
    [formatDateTime, formatReportPeriod, handleDeleteReport, navigation, reportLocale, t]
  );

  const renderListHeader = useCallback(
    () => (
      <View className="px-4 py-4">
        {renderScopeSelector()}
        {canGenerateReports ? (
          <>
            <Text className="text-base font-bold text-gray-dark mb-3">{t('generateReport')}</Text>

            <View className="flex-row flex-wrap justify-between">
              {REPORT_TYPES.map((reportType) => (
                <TouchableOpacity
                  key={reportType}
                  className="w-[32%] bg-white border border-gray-200 rounded-xl p-3 items-center mb-3"
                  onPress={() => handleGenerateReport(reportType)}
                  disabled={Boolean(generatingType)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: Boolean(generatingType) }}
                  accessibilityLabel={reportType === 'daily'
                    ? t('reportGenerationDaily')
                    : reportType === 'weekly'
                      ? t('reportGenerationWeekly')
                      : t('reportGenerationMonthly')}
                >
                  {generatingType === reportType ? (
                    <ActivityIndicator color={AQUACARE_COLORS.GREEN_PRIMARY} />
                  ) : (
                    <Text className="text-lg font-bold text-aquacare-primary">
                      {reportType === 'daily'
                        ? t('reportGenerationDailyShort')
                        : reportType === 'weekly'
                          ? t('reportGenerationWeeklyShort')
                          : t('reportGenerationMonthlyShort')}
                    </Text>
                  )}
                  <Text className="text-xs font-semibold text-gray-dark mt-2 text-center">
                    {reportType === 'daily'
                      ? t('reportGenerationDaily')
                      : reportType === 'weekly'
                        ? t('reportGenerationWeekly')
                        : t('reportGenerationMonthly')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <View className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
            <Text className="text-sm text-gray-dark">{scopeError}</Text>
          </View>
        )}

        {infoMessage && (
          <View className="bg-green-50 border border-aquacare-primary rounded-lg p-3 mb-3">
            <Text className="text-sm text-aquacare-primary">{infoMessage}</Text>
          </View>
        )}

        {error && (
          <View className="bg-white border border-error rounded-lg p-3 mb-3">
            <Text className="text-sm text-error">{error}</Text>
          </View>
        )}

        <Text className="text-base font-bold text-gray-dark mb-3">{t('reportHistory')}</Text>

        <View className="flex-row mb-3">
          {reportHistoryFilters.map((type) => (
            <TouchableOpacity
              key={type}
              className={`px-3 py-2 rounded-full border mr-2 ${
                selectedType === type
                  ? 'bg-aquacare-primary border-aquacare-primary'
                  : 'bg-white border-gray-200'
              }`}
              onPress={() => setSelectedType(type)}
            >
              <Text className={`text-xs ${selectedType === type ? 'text-white' : 'text-gray-dark'}`}>
                {type === 'all'
                  ? t('all')
                  : type === 'daily'
                    ? t('reportGenerationDailyShort')
                    : type === 'weekly'
                      ? t('reportGenerationWeeklyShort')
                      : t('reportGenerationMonthlyShort')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    ),
    [allocationError, allocationLoading, allocations, canGenerateReports, error, generatingType, handleGenerateReport, infoMessage, reportScope, scopeError, selectedAllocationId, selectedType, t]
  );

  const renderEmptyState = useCallback(
    () => (
      <View className="bg-white rounded-xl p-5 items-center mx-4">
        <Ionicons name="documents-outline" size={44} color={AQUACARE_COLORS.GRAY_LIGHT} />
        <Text className="text-base font-semibold text-gray-dark mt-3">{t('noReportsYet')}</Text>
        <Text className="text-sm text-gray-light text-center mt-1">{t('generateFirstReportHint')}</Text>
      </View>
    ),
    [t]
  );

  if (loading) {
    return (
      <View className="flex-1 bg-cream">
        {renderHeader()}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={AQUACARE_COLORS.GREEN_PRIMARY} />
          <Text className="mt-3 text-gray-dark">{t('loading')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream">
      {renderHeader()}

      <FlatList
        data={filteredReports}
        keyExtractor={(item) => item.id}
        renderItem={renderReportItem}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={{ paddingBottom: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </View>
  );
}
