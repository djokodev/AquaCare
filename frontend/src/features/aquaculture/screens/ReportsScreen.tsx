import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';

import { RootStackParamList } from '@/navigation/MainNavigator';
import { MAVECAM_COLORS } from '@/constants/colors';
import { ProductionReport, ReportType } from '@/types/aquaculture';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { formatDate } from '@/utils';
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

  const loadReports = useCallback(async () => {
    try {
      setError(null);
      const data = await aquacultureService.getReports(
        currentCycle?.id ? { cycle_id: currentCycle.id } : undefined
      );
      setReports(data);
    } catch {
      setError(t('reportsLoadError'));
    } finally {
      setLoading(false);
    }
  }, [currentCycle?.id, t]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useFocusEffect(
    useCallback(() => {
      loadReports();
    }, [loadReports])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  };

  const handleGenerateReport = async (reportType: ReportType) => {
    if (!currentCycle?.id) {
      setError(t('sessionCycleNotSelected'));
      return;
    }
    try {
      setGeneratingType(reportType);
      const logs = await aquacultureService.getCycleLogs(currentCycle.id);
      if (logs.length === 0) {
        setError(t('noLogsForReportGeneration'));
        return;
      }
      await aquacultureService.generateReport({
        report_type: reportType,
        cycle_id: currentCycle.id,
      });
      await loadReports();
    } catch {
      setError(t('reportGenerateError'));
    } finally {
      setGeneratingType(null);
    }
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
        className="bg-white rounded-xl p-4 mb-3 border border-gray-100"
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
          <Text
            className={`text-xs font-semibold ${
              report.status === 'validated' ? 'text-mavecam-primary' : 'text-warning'
            }`}
          >
            {report.status === 'validated' ? t('reportStatusValidated') : t('reportStatusDraft')}
          </Text>
        </View>

        <Text className="text-xs text-gray-light mt-1">
          {formatDate(report.period_start)} - {formatDate(report.period_end)}
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
    [navigation, t]
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

          {error && (
            <View className="bg-white border border-error rounded-lg p-3 mb-3">
              <Text className="text-sm text-error">{error}</Text>
            </View>
          )}
        </View>
    ),
    [currentCycle?.id, error, filteredReports.length, generatingType, onRefresh, selectedType, t]
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
