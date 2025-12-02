import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import { aquacultureService } from '@/services/aquacultureService';
import { CycleLog } from '@/types/aquaculture';
import { MAVECAM_COLORS } from '@/constants/colors';
import { formatDate } from '@/utils';
import { estimateAverageWeight } from '@/domain';

export default function DailyLogHistoryScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { dashboardData } = useSelector((state: RootState) => state.aquaculture);
  const activeCycles = dashboardData?.active_cycles || [];

  const [logs, setLogs] = useState<CycleLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<string>('all');

  useEffect(() => {
    loadLogs();
  }, [selectedCycle]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const cycleId = selectedCycle === 'all' ? undefined : selectedCycle;
      const logsData = await aquacultureService.getCycleLogs(cycleId);
      setLogs(logsData);
    } catch (error) {
      console.error('Erreur lors du chargement des logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLogs();
    setRefreshing(false);
  };

  const getCycleName = (cycleId: string) => {
    const cycle = activeCycles.find((c) => c.id === cycleId);
    return cycle ? cycle.pond_identifier : `Cycle ${cycleId.slice(-4)}`;
  };

  const renderLogCard = (log: CycleLog) => (
    <View key={log.id} className="bg-white rounded-xl p-4 mb-3 shadow">
      <View className="flex-row justify-between items-center mb-3 pb-2 border-b border-slate-100">
        <Text className="text-base font-semibold text-gray-dark">{formatDate(log.log_date)}</Text>
        <Text className="text-sm font-medium text-mavecam-primary">{getCycleName(log.cycle)}</Text>
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
            <Text className="text-sm font-semibold text-gray-dark">{log.water_temperature}\u00B0C</Text>
          </View>
        )}

        {log.ph_level && (
          <View className="flex-row items-center mb-2">
            <Text className="text-sm text-gray-light flex-1">pH :</Text>
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
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
        <Text className="mt-3 text-gray-dark text-base">{t('loading')}...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream">
      <View className="bg-mavecam-primary flex-row items-center pt-14 pb-4 px-4">
        <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-white">{t('dailyLogHistory')}</Text>
      </View>

      <View className="bg-white p-4 border-b border-slate-200">
        <Text className="text-sm font-medium text-gray-dark mb-2">{t('filterByCycle')} :</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row' }}
        >
          <TouchableOpacity
            className={`px-4 py-2 mr-2 rounded-full border ${
              selectedCycle === 'all'
                ? 'bg-mavecam-primary border-mavecam-primary'
                : 'bg-cream border-gray-light'
            }`}
            onPress={() => setSelectedCycle('all')}
          >
            <Text
              className={`text-sm ${
                selectedCycle === 'all' ? 'text-white' : 'text-gray-dark'
              }`}
            >
              {t('allCycles')}
            </Text>
          </TouchableOpacity>

          {activeCycles.map((cycle) => (
            <TouchableOpacity
              key={cycle.id}
              className={`px-4 py-2 mr-2 rounded-full border ${
                selectedCycle === cycle.id
                  ? 'bg-mavecam-primary border-mavecam-primary'
                  : 'bg-cream border-gray-light'
              }`}
              onPress={() => setSelectedCycle(cycle.id)}
            >
              <Text
                className={`text-sm ${
                  selectedCycle === cycle.id ? 'text-white' : 'text-gray-dark'
                }`}
              >
                {t('pond')} {cycle.pond_identifier}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        className="flex-1 px-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {logs.length === 0 ? (
          <View className="flex-1 items-center justify-center py-24 px-6">
            <Ionicons name="document-outline" size={64} color={MAVECAM_COLORS.GRAY_LIGHT} />
            <Text className="text-xl font-bold text-gray-dark mt-4 mb-2">{t('noLogsYet')}</Text>
            <Text className="text-sm text-gray-light text-center">{t('startLoggingData')}</Text>
          </View>
        ) : (
          logs.map((log) => renderLogCard(log))
        )}
      </ScrollView>
    </View>
  );
}
