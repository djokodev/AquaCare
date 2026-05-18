import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { RootStackParamList } from '@/navigation/MainNavigator';
import { AQUACARE_COLORS } from '@/constants/colors';
import { STORAGE_KEYS } from '@/constants/api';
import { ProductionReport } from '@/types/aquaculture';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { formatDate } from '@/utils';
import logger from '@/utils/logger';
import { parseApiError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';

type ReportDetailScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ReportDetail'>;
type ReportDetailScreenRouteProp = RouteProp<RootStackParamList, 'ReportDetail'>;

interface ReportDetailScreenProps {
  navigation: ReportDetailScreenNavigationProp;
  route: ReportDetailScreenRouteProp;
}

interface ReportSummary {
  cycle_count?: number;
  total_log_count?: number;
  total_sanitary_events?: number;
  total_feed?: number;
  total_mortality?: number;
}

interface ReportCycleData {
  cycle?: {
    id?: string;
    cycle_name?: string;
    species_display?: string;
    pond_identifier?: string;
  };
  period_metrics?: {
    log_count?: number;
    total_feed?: number;
    total_mortality?: number;
  };
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

  const renderHeader = () => (
    <View className="bg-aquacare-primary flex-row items-center pt-14 pb-4 px-4">
      <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.WHITE} />
      </TouchableOpacity>
      <Text className="text-xl font-bold text-white">{t('reportDetailTitle')}</Text>
    </View>
  );

  const payload = useMemo(
    () => ((report?.payload || {}) as Record<string, unknown>),
    [report?.payload]
  );
  const summary = useMemo(
    () => ((payload.summary as ReportSummary) || {}) as ReportSummary,
    [payload]
  );
  const cycles = useMemo(
    () => ((payload.cycles as ReportCycleData[]) || []) as ReportCycleData[],
    [payload]
  );

  const renderCycleSection = useCallback(
    ({ item: section, index }: { item: ReportCycleData; index: number }) => (
      <View className="mx-4 mb-3 rounded-xl border border-gray-100 bg-white p-4">
        <Text className="text-sm font-semibold text-gray-dark">
          {section.cycle?.cycle_name || t('cycle')}
        </Text>
        <Text className="text-xs text-gray-light">
          {section.cycle?.species_display || ''} - {t('pond')} {section.cycle?.pond_identifier || '-'}
        </Text>
        <Text className="text-xs text-gray-dark mt-1">
          {t('dailyLogHistory')}: {section.period_metrics?.log_count || 0} | {t('feedConsumedStat')}:{' '}
          {(section.period_metrics?.total_feed || 0).toFixed(2)} kg | {t('mortality')}:{' '}
          {section.period_metrics?.total_mortality || 0}
        </Text>
      </View>
    ),
    [t]
  );

  const renderListHeader = useCallback(
    () => (
      <View className="p-4">
        <View className="bg-white rounded-xl p-4 mb-4">
          <Text className="text-base font-bold text-gray-dark">
            {report?.report_type === 'daily'
              ? t('reportTypeDaily')
              : report?.report_type === 'weekly'
                ? t('reportTypeWeekly')
                : t('reportTypeMonthly')}
          </Text>
          <View className="flex-row justify-between mt-1">
            <Text className="text-xs text-gray-light w-[48%]">
              {report?.period_start === report?.period_end
                ? formatDate(report?.period_start ?? '')
                : `${formatDate(report?.period_start ?? '')} - ${formatDate(report?.period_end ?? '')}`}
            </Text>
            <Text className={`text-xs font-semibold w-[48%] text-right ${report?.status === 'validated' ? 'text-aquacare-primary' : report?.status === 'pending' ? 'text-warning' : 'text-gray-light'}`}>
              {report?.status === 'validated' ? t('reportStatusValidated') : report?.status === 'pending' ? t('reportStatusPending') : t('reportStatusDraft')}
            </Text>
          </View>
          <View className="flex-row justify-between mt-2">
            <Text className="text-xs text-gray-dark w-[48%]">
              {t('email')}: {report?.email_status === 'sent' ? t('sent') : report?.email_status === 'failed' ? t('failed') : t('notSent')}
            </Text>
            <Text className="text-xs text-gray-dark w-[48%] text-right">
              {t('whatsAppLabel')}: {report?.whatsapp_status === 'shared' ? t('shared') : t('notShared')}
            </Text>
          </View>
        </View>

        <View className="bg-white rounded-xl p-4 mb-4">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('reportSummary')}</Text>
          <View className="flex-row flex-wrap justify-between">
            <View className="w-[48%] mb-2">
              <Text className="text-xs text-gray-light">{t('activeCycles')}</Text>
              <Text className="text-sm font-semibold text-gray-dark">{summary.cycle_count || 0}</Text>
            </View>
            <View className="w-[48%] mb-2">
              <Text className="text-xs text-gray-light">{t('dailyLogHistory')}</Text>
              <Text className="text-sm font-semibold text-gray-dark">{summary.total_log_count || 0}</Text>
            </View>
            <View className="w-[48%] mb-2">
              <Text className="text-xs text-gray-light">{t('feedConsumedStat')}</Text>
              <Text className="text-sm font-semibold text-gray-dark">{(summary.total_feed || 0).toFixed(2)} kg</Text>
            </View>
            <View className="w-[48%] mb-2">
              <Text className="text-xs text-gray-light">{t('mortality')}</Text>
              <Text className="text-sm font-semibold text-gray-dark">{summary.total_mortality || 0}</Text>
            </View>
          </View>
        </View>

        <View className="bg-white rounded-xl p-4 mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('actions')}</Text>

          <TouchableOpacity
            className="bg-cream border border-gray-200 rounded-lg p-3 mb-2 flex-row items-center justify-center"
            onPress={() => report && runAction('regenerate', () => aquacultureService.regenerateReport(report.id))}
            disabled={Boolean(actionLoading)}
          >
            {actionLoading === 'regenerate' ? (
              <ActivityIndicator color={AQUACARE_COLORS.GREEN_PRIMARY} />
            ) : (
              <>
                <Ionicons name="refresh-outline" size={18} color={AQUACARE_COLORS.GREEN_PRIMARY} />
                <Text className="text-sm font-semibold text-aquacare-primary ml-2">{t('regenerateReport')}</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className={`rounded-lg p-3 mb-2 flex-row items-center justify-center ${
              report?.status === 'validated'
                ? 'bg-gray-100 border border-gray-200'
                : 'bg-aquacare-primary'
            }`}
            onPress={() => report && runAction('validate', () => aquacultureService.validateReport(report.id))}
            disabled={Boolean(actionLoading) || report?.status === 'validated'}
          >
            {actionLoading === 'validate' ? (
              <ActivityIndicator color={report?.status === 'validated' ? AQUACARE_COLORS.GRAY_LIGHT : AQUACARE_COLORS.WHITE} />
            ) : (
              <>
                <Ionicons
                  name={report?.status === 'validated' ? 'checkmark-circle' : 'checkmark-done-outline'}
                  size={18}
                  color={report?.status === 'validated' ? AQUACARE_COLORS.GREEN_PRIMARY : AQUACARE_COLORS.WHITE}
                />
                <Text className={`text-sm font-semibold ml-2 ${report?.status === 'validated' ? 'text-gray-400' : 'text-white'}`}>
                  {t('validateReport')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className="bg-[#1d4ed8] rounded-lg p-3 mb-2 flex-row items-center justify-center"
            onPress={handleEmailAction}
            disabled={Boolean(actionLoading)}
          >
            {actionLoading === 'email' ? (
              <ActivityIndicator color={AQUACARE_COLORS.WHITE} />
            ) : (
              <>
                <Ionicons name="mail-outline" size={18} color={AQUACARE_COLORS.WHITE} />
                <Text className="text-sm font-semibold text-white ml-2">{t('sendByEmail')}</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className="bg-[#16a34a] rounded-lg p-3 flex-row items-center justify-center"
            onPress={handleShareWhatsApp}
            disabled={Boolean(actionLoading)}
          >
            {actionLoading === 'whatsapp' ? (
              <ActivityIndicator color={AQUACARE_COLORS.WHITE} />
            ) : (
              <>
                <Ionicons name="logo-whatsapp" size={18} color={AQUACARE_COLORS.WHITE} />
                <Text className="text-sm font-semibold text-white ml-2">{t('shareOnWhatsApp')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    ),
    [actionLoading, handleEmailAction, handleShareWhatsApp, report, runAction, summary, t]
  );

  const renderEmptyCycles = useCallback(
    () => (
      <View className="mx-4 rounded-xl bg-white p-5 items-center">
        <Text className="text-sm text-gray-light">{t('noData')}</Text>
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

  if (!report) {
    return (
      <View className="flex-1 bg-cream">
        {renderHeader()}
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons name="alert-circle" size={46} color={AQUACARE_COLORS.ERROR} />
          <Text className="text-base text-error mt-3 text-center">{error || t('reportLoadError')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream">
      {renderHeader()}

      <FlatList
        data={[]}
        keyExtractor={() => ''}
        renderItem={() => null}
        ListHeaderComponent={renderListHeader}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </View>
  );
}
