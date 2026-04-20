import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl, Alert } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';

import { RootStackParamList } from '@/navigation/MainNavigator';
import { MAVECAM_COLORS } from '@/constants/colors';
import { ProductionReport, ReportType } from '@/types/aquaculture';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { formatDate, formatDateTime } from '@/utils';
import { RootState } from '@/store/store';

type ReportsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Reports'>;

interface ReportsScreenProps {
  navigation: ReportsScreenNavigationProp;
}

const REPORT_TYPES: ReportType[] = ['daily', 'weekly', 'monthly'];

export default function ReportsScreen({ navigation }: ReportsScreenProps) {
  const { t } = useTranslation();
  const currentCycle = useSelector((state: RootState) => state.aquaculture.currentCycle);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingType, setGeneratingType] = useState<ReportType | null>(null);
  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [selectedType, setSelectedType] = useState<ReportType | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const loadReports = useCallback(async () => {
    try {
      setError(null);
      const data = await aquacultureService.getReports(
        currentCycle?.id ? { cycle_id: currentCycle.id } : undefined
      );
      setReports(data);
      return data;
    } catch {
      setError(t('reportsLoadError'));
      return [];
    } finally {
      setLoading(false);
    }
  }, [currentCycle?.id, t]);

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
    }, 3000);
  }, [loadReports, stopPolling]);

  useEffect(() => {
    loadReports().then(startPollingIfPending);
  }, [loadReports, startPollingIfPending]);

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

  const handleGenerateReport = async (reportType: ReportType) => {
    if (!currentCycle?.id) {
      setError(t('sessionCycleNotSelected'));
      return;
    }
    try {
      setGeneratingType(reportType);
      setInfoMessage(null);
      const logs = await aquacultureService.getCycleLogs(currentCycle.id);
      if (logs.length === 0) {
        setError(t('noLogsForReportGeneration'));
        return;
      }
      await aquacultureService.generateReport({
        report_type: reportType,
        cycle_id: currentCycle.id,
      });
      setInfoMessage(t('reportGenerating'));
      const data = await loadReports();
      startPollingIfPending(data);
    } catch {
      setError(t('reportGenerateError'));
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
            } catch {
              Alert.alert(t('error'), t('reportDeleteError'));
            }
          },
        },
      ]
    );
  }, [t]);

  const getStatusStyle = (reportStatus: string) => {
    if (reportStatus === 'validated') return 'text-mavecam-primary';
    if (reportStatus === 'pending') return 'text-warning';
    return 'text-gray-light';
  };

  const getStatusLabel = (reportStatus: string) => {
    if (reportStatus === 'validated') return t('reportStatusValidated');
    if (reportStatus === 'pending') return t('reportStatusPending');
    return t('reportStatusDraft');
  };

  const getPeriodLabel = (periodStart: string, periodEnd: string) => {
    if (periodStart === periodEnd) return formatDate(periodStart);
    return `${formatDate(periodStart)} - ${formatDate(periodEnd)}`;
  };

  const filteredReports = reports.filter(
    (report) =>
      (selectedType === 'all' || report.report_type === selectedType) &&
      (!currentCycle?.id || report.cycle_scope_id === currentCycle.id)
  );

  const renderHeader = () => (
    <View className="bg-mavecam-primary flex-row items-center pt-14 pb-4 px-4">
      <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
      </TouchableOpacity>
      <Text className="text-xl font-bold text-white">{t('reportsTitle')}</Text>
    </View>
  );

  const renderReportItem = useCallback(
    ({ item: report }: { item: ProductionReport }) => (
      <TouchableOpacity
        className="bg-white rounded-xl p-4 mb-3 mx-4 border border-gray-200 shadow-sm"
        onPress={() => navigation.navigate('ReportDetail', { reportId: report.id })}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-bold text-gray-dark">
            {report.report_type === 'daily'
              ? t('reportTypeDaily')
              : report.report_type === 'weekly'
                ? t('reportTypeWeekly')
                : t('reportTypeMonthly')}
          </Text>
          <View className="flex-row items-center">
            <Text className={`text-xs font-semibold mr-3 ${getStatusStyle(report.status)}`}>
              {getStatusLabel(report.status)}
            </Text>
            <TouchableOpacity
              onPress={() => handleDeleteReport(report)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={16} color={MAVECAM_COLORS.ERROR} />
            </TouchableOpacity>
          </View>
        </View>

        {report.generated_at && (
          <Text className="text-xs text-gray-light mt-1">
            {formatDateTime(report.generated_at)}
          </Text>
        )}

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
    [navigation, t, handleDeleteReport]
  );

  const renderListHeader = useCallback(
    () => (
        <View className="px-4 py-4">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('generateReport')}</Text>

          <View className="flex-row flex-wrap justify-between">
            {REPORT_TYPES.map((reportType) => (
              <TouchableOpacity
                key={reportType}
                className="w-[32%] bg-white border border-gray-200 rounded-xl p-3 items-center mb-3"
                onPress={() => handleGenerateReport(reportType)}
                disabled={Boolean(generatingType)}
              >
                {generatingType === reportType ? (
                  <ActivityIndicator color={MAVECAM_COLORS.GREEN_PRIMARY} />
                ) : (
                  <Ionicons name="document-text-outline" size={22} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                )}
                <Text className="text-xs font-semibold text-gray-dark mt-2 text-center">
                  {reportType === 'daily'
                    ? t('reportTypeDaily')
                    : reportType === 'weekly'
                      ? t('reportTypeWeekly')
                      : t('reportTypeMonthly')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {infoMessage && (
            <View className="bg-green-50 border border-mavecam-primary rounded-lg p-3 mb-3">
              <Text className="text-sm text-mavecam-primary">{infoMessage}</Text>
            </View>
          )}

          {error && (
            <View className="bg-white border border-error rounded-lg p-3 mb-3">
              <Text className="text-sm text-error">{error}</Text>
            </View>
          )}

          <Text className="text-base font-bold text-gray-dark mb-3">{t('reportHistory')}</Text>

          <View className="flex-row mb-3">
            {(['all', ...REPORT_TYPES] as const).map((type) => (
              <TouchableOpacity
                key={type}
                className={`px-3 py-2 rounded-full border mr-2 ${
                  selectedType === type
                    ? 'bg-mavecam-primary border-mavecam-primary'
                    : 'bg-white border-gray-200'
                }`}
                onPress={() => setSelectedType(type)}
              >
                <Text className={`text-xs ${selectedType === type ? 'text-white' : 'text-gray-dark'}`}>
                  {type === 'all'
                    ? t('all')
                    : type === 'daily'
                      ? t('reportTypeDailyShort')
                      : type === 'weekly'
                        ? t('reportTypeWeeklyShort')
                        : t('reportTypeMonthlyShort')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
    ),
    [currentCycle?.id, error, infoMessage, generatingType, selectedType, t]
  );

  const renderEmptyState = useCallback(
    () => (
      <View className="bg-white rounded-xl p-5 items-center mx-4">
        <Ionicons name="documents-outline" size={44} color={MAVECAM_COLORS.GRAY_LIGHT} />
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
          <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
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
