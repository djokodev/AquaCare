import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { CycleLog } from '@/types/aquaculture';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AQUACARE_COLORS } from '@/constants/colors';
import { formatDate } from '@/utils';
import { estimateAverageWeight } from '@/domain/aquaculture/estimators';
import logger from '@/utils/logger';

type DailyLogHistoryScreenNavigationProp = StackNavigationProp<RootStackParamList, 'DailyLogHistory'>;
type DailyLogHistoryScreenRouteProp = RouteProp<RootStackParamList, 'DailyLogHistory'>;

interface DailyLogHistoryScreenProps {
  navigation: DailyLogHistoryScreenNavigationProp;
  route?: DailyLogHistoryScreenRouteProp;
}

export default function DailyLogHistoryScreen({ navigation, route }: DailyLogHistoryScreenProps) {
  const { t } = useTranslation();
  const { dashboardData, currentCycle } = useSelector((state: RootState) => state.aquaculture);
  const activeCycles = dashboardData?.active_cycles || [];
  const routeParams = route?.params;
  const effectiveCycleId = routeParams?.cycleId || currentCycle?.id;
  const cycleUnitAllocationId = routeParams?.cycleUnitAllocationId;
  const productionUnitName = routeParams?.productionUnitName || t('productionUnitsUnknownUnit');
  const selectedCycle = effectiveCycleId
    ? activeCycles.find((cycle) => cycle.id === effectiveCycleId) || currentCycle || null
    : currentCycle || null;

  const [logs, setLogs] = useState<CycleLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLogs();
  }, [effectiveCycleId, cycleUnitAllocationId]);

  const loadLogs = async () => {
    if (!effectiveCycleId) {
      setLogs([]);
      setLoading(false);
      return;
    }

      try {
        setLoading(true);
        setError(null);
      const logsData = cycleUnitAllocationId
        ? await aquacultureService.getCycleLogs(effectiveCycleId, { cycleUnitAllocationId })
        : await aquacultureService.getCycleLogs(effectiveCycleId);
        setLogs(logsData);
      } catch (error) {
        logger.error('Erreur lors du chargement des logs:', error);
        setError(t('dailyLogLoadError'));
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    if (!effectiveCycleId) {
      return;
    }
    setRefreshing(true);
    await loadLogs();
    setRefreshing(false);
  };

  const getCycleName = (cycleId: string) => {
    if (currentCycle?.id === cycleId) {
      return currentCycle.pond_identifier;
    }
    const cycle = activeCycles.find((currentCycle) => currentCycle.id === cycleId);
    return cycle ? cycle.pond_identifier : `Cycle ${cycleId.slice(-4)}`;
  };

  const renderLogCard = useCallback(({ item: log }: { item: CycleLog }) => (
    <View className="bg-white rounded-xl p-4 mb-3">
      <View className="flex-row justify-between items-center mb-3 pb-2 border-b border-slate-100">
        <Text className="text-base font-semibold text-gray-dark">{formatDate(log.log_date)}</Text>
        <Text className="text-sm font-medium text-aquacare-primary">{getCycleName(log.cycle)}</Text>
      </View>

      <View className="mb-2">
        {log.sample_count && log.sample_total_weight && (
          <View className="flex-row items-center mb-2">
            <Text className="text-sm text-gray-light flex-1">{t('averageWeight')} :</Text>
            <Text className="text-sm font-semibold text-gray-dark">
              {estimateAverageWeight(log.sample_total_weight, log.sample_count).toFixed(1)} g
            </Text>
          </View>
        )}

        {log.mortality_count && log.mortality_count > 0 && (
          <View className="flex-row items-center mb-2">
            <Text className="text-sm text-gray-light flex-1">{t('mortality')} :</Text>
            <Text className="text-sm font-semibold text-gray-dark">{log.mortality_count}</Text>
          </View>
        )}

        {log.water_temperature && (
          <View className="flex-row items-center mb-2">
            <Text className="text-sm text-gray-light flex-1">{t('waterTemperature')} :</Text>
            <Text className="text-sm font-semibold text-gray-dark">{log.water_temperature}°C</Text>
          </View>
        )}

        {log.ph_level && (
          <View className="flex-row items-center mb-2">
            <Text className="text-sm text-gray-light flex-1">{t('phLevel')} :</Text>
            <Text className="text-sm font-semibold text-gray-dark">{log.ph_level}</Text>
          </View>
        )}
      </View>

      {log.observations && (
        <View className="mt-2 pt-2 border-t border-slate-100">
          <Text className="text-sm font-medium text-gray-dark mb-1">{t('observations')} :</Text>
          <Text className="text-sm text-gray-light italic">{log.observations}</Text>
        </View>
      )}
    </View>
  ), [currentCycle?.id, activeCycles, t]);

  const renderListHeader = useCallback(
    () => (
      <View className="bg-white p-4 border-b border-slate-200">
        <Text className="text-sm font-medium text-gray-dark mb-1">
          {t('sessionActiveCycleLabel', { defaultValue: 'Cycle actif de la session' })}
        </Text>
        <Text className="text-base font-bold text-aquacare-primary">
          {selectedCycle?.cycle_name || t('sessionCycleNotSelected')}
        </Text>
        {selectedCycle ? (
          <Text className="text-xs text-gray-light mt-1">
            {t('pond')} {selectedCycle.pond_identifier}
          </Text>
        ) : null}
        {cycleUnitAllocationId ? (
          <View className="mt-3 rounded-xl border border-green-100 bg-green-50 p-3">
            <Text className="text-sm font-semibold text-green-800">{t('productionUnitLogHistoryContextTitle')}</Text>
            <Text className="text-sm text-green-700 mt-1">{productionUnitName}</Text>
          </View>
        ) : null}
      </View>
    ),
    [activeCycles, cycleUnitAllocationId, productionUnitName, selectedCycle, t]
  );

  const renderEmptyState = useCallback(
    () => {
      if (!effectiveCycleId) {
        return (
          <View className="flex-1 items-center justify-center py-24 px-6">
            <Ionicons name="alert-circle-outline" size={64} color={AQUACARE_COLORS.WARNING} />
            <Text className="text-xl font-bold text-gray-dark mt-4 mb-2">{t('sessionCycleNotSelected')}</Text>
          </View>
        );
      }

      return (
        <View className="flex-1 items-center justify-center py-24 px-6">
          <Ionicons name="document-outline" size={64} color={AQUACARE_COLORS.GRAY_LIGHT} />
          <Text className="text-xl font-bold text-gray-dark mt-4 mb-2">{t('noLogsYet')}</Text>
          <Text className="text-sm text-gray-light text-center">{t('startLoggingData')}</Text>
        </View>
      );
    },
    [effectiveCycleId, t]
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator size="large" color={AQUACARE_COLORS.GREEN_PRIMARY} />
        <Text className="mt-3 text-gray-dark text-base">{t('loading')}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream">
      <View className="bg-aquacare-primary flex-row items-center pt-14 pb-4 px-4">
        <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.WHITE} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-white">{t('dailyLogHistory')}</Text>
      </View>

      {error && (
        <View className="mx-4 mt-4 bg-white border border-error rounded-lg p-3">
          <Text className="text-sm text-error">{error}</Text>
        </View>
      )}

      <FlatList
        data={effectiveCycleId ? logs : []}
        keyExtractor={(item) => item.id}
        renderItem={renderLogCard}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </View>
  );
}
