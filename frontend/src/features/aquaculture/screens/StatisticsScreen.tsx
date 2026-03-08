import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { ProductionCycle, CycleStatistics } from '@/types/aquaculture';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { MAVECAM_COLORS } from '@/constants/colors';
import { formatNumber, formatPercentage, formatCurrency } from '@/utils';
import logger from '@/utils/logger';

type StatisticsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Statistics'>;

interface StatisticsScreenProps {
  navigation: StatisticsScreenNavigationProp;
}

export default function StatisticsScreen({ navigation }: StatisticsScreenProps) {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [harvestedCycles, setHarvestedCycles] = useState<ProductionCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const cycles = await aquacultureService.getHarvestedCycles();
      setHarvestedCycles(cycles);
    } catch {
      setError('statisticsLoadError');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedCycle = useMemo(
    () => harvestedCycles.find((cycle) => cycle.id === selectedCycleId) ?? null,
    [harvestedCycles, selectedCycleId]
  );

  const cycleStats = useMemo<CycleStatistics | null>(() => {
    if (!selectedCycle) {
      return null;
    }

    try {
      return {
        cycle_id: selectedCycle.id,
        days_active: Number(selectedCycle.days_active) || 0,
        current_metrics: {
          survival_rate: Number(selectedCycle.survival_rate) || 0,
          biomass: Number(selectedCycle.final_biomass || selectedCycle.current_biomass) || 0,
          average_weight:
            Number(selectedCycle.final_average_weight || selectedCycle.current_average_weight) || 0,
          fcr: Number(selectedCycle.fcr) || 0,
          daily_growth_rate: Number(selectedCycle.daily_growth_rate) || 0,
          specific_growth_rate: Number(selectedCycle.specific_growth_rate) || 0,
        },
        feed_metrics: {
          total_consumed: Number(selectedCycle.total_feed_consumed) || 0,
          average_daily: Number(selectedCycle.average_daily_feed) || 0,
          cost_estimate: Number(selectedCycle.total_feed_cost) || 0,
        },
        mortality_analysis: {
          total: Math.max(
            0,
            (Number(selectedCycle.initial_count) || 0) -
              (Number(selectedCycle.final_count || selectedCycle.current_count) || 0)
          ),
          percentage: Math.max(0, 100 - (Number(selectedCycle.survival_rate) || 0)),
          by_week: {},
          main_causes: [],
        },
        growth_performance: [],
      };
    } catch (statsError: unknown) {
      logger.error('Erreur chargement stats cycle:', statsError);
      return null;
    }
  }, [selectedCycle]);

  const handleCycleSelection = useCallback((cycleId: string) => {
    setSelectedCycleId(cycleId);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const renderCycleSelectorItem = useCallback(
    ({ item: cycle }: { item: ProductionCycle }) => {
      const isSelected = selectedCycle?.id === cycle.id;
      return (
        <TouchableOpacity
          className={`mr-3 p-3 min-w-[160px] rounded-lg border ${
            isSelected ? 'bg-mavecam-primary border-mavecam-primary' : 'bg-cream border-gray-light'
          }`}
          onPress={() => handleCycleSelection(cycle.id)}
        >
          <Text
            className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-gray-dark'}`}
            numberOfLines={1}
          >
            {cycle.cycle_name}
          </Text>
          <Text className={`text-xs mt-1 ${isSelected ? 'text-white' : 'text-gray-light'}`}>
            {t(cycle.species)} - {formatPercentage(cycle.survival_rate || 0)}
          </Text>
        </TouchableOpacity>
      );
    },
    [handleCycleSelection, selectedCycle?.id, t]
  );

  const renderHeader = () => (
    <View className="bg-mavecam-primary flex-row items-center pt-14 pb-4 px-4">
      <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
      </TouchableOpacity>
      <Text className="text-xl font-bold text-white">{t('statistics')}</Text>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 bg-cream">
        {renderHeader()}
        <View className="flex-1 items-center justify-center p-10">
          <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text className="text-base text-gray-light mt-3">{t('loading')}</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-cream">
        {renderHeader()}
        <View className="flex-1 items-center justify-center p-5">
          <Ionicons name="alert-circle" size={48} color={MAVECAM_COLORS.ERROR} />
          <Text className="text-lg text-error text-center mt-3">{error}</Text>
          <TouchableOpacity className="bg-mavecam-primary px-5 py-3 rounded-lg mt-4" onPress={loadData}>
            <Text className="text-white text-base font-semibold">{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (harvestedCycles.length === 0) {
    return (
      <View className="flex-1 bg-cream">
        {renderHeader()}
        <View className="flex-1 items-center justify-center p-6">
          <Ionicons name="bar-chart-outline" size={48} color={MAVECAM_COLORS.GRAY_LIGHT} />
          <Text className="text-lg font-semibold text-gray-dark mt-4 text-center">{t('noStatistics')}</Text>
          <Text className="text-sm text-gray-light mt-2 text-center">{t('harvestCycleToSeeStats')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream">
      {renderHeader()}

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View className="bg-white mx-4 mt-4 mb-4 p-4 rounded-xl">
          <Text className="text-lg font-bold text-gray-dark mb-3">{t('harvestedCycles')}</Text>
          <FlatList
            horizontal
            data={harvestedCycles}
            keyExtractor={(item) => item.id}
            renderItem={renderCycleSelectorItem}
            extraData={selectedCycle?.id}
            showsHorizontalScrollIndicator={false}
            removeClippedSubviews
            initialNumToRender={4}
            maxToRenderPerBatch={6}
            windowSize={5}
          />
        </View>

        {!selectedCycle && harvestedCycles.length > 0 && (
          <View className="bg-white mx-4 mb-4 p-6 rounded-xl border border-dashed border-gray-200 items-center">
            <Ionicons name="analytics-outline" size={48} color={MAVECAM_COLORS.GRAY_LIGHT} />
            <Text className="text-lg font-semibold text-gray-dark mt-3 text-center">{t('selectCycleToAnalyze')}</Text>
            <Text className="text-sm text-gray-light mt-2 text-center">{t('selectCycleHint')}</Text>
          </View>
        )}

        {selectedCycle && cycleStats && (
          <>
            <View className="bg-white mx-4 mb-4 p-4 rounded-xl">
              <Text className="text-lg font-bold text-gray-dark mb-4">{t('statistics')}</Text>
              <View className="flex-row flex-wrap justify-between">
                <View className="w-[48%] bg-cream p-4 rounded-lg items-center mb-3">
                  <Ionicons name="trending-up" size={22} color={MAVECAM_COLORS.SUCCESS} />
                  <Text className="text-xl font-bold text-gray-dark mt-2">{formatNumber(cycleStats.current_metrics.fcr)}</Text>
                  <Text className="text-xs text-gray-light">FCR</Text>
                </View>

                <View className="w-[48%] bg-cream p-4 rounded-lg items-center mb-3">
                  <Ionicons name="heart" size={22} color={MAVECAM_COLORS.ERROR} />
                  <Text className="text-xl font-bold text-gray-dark mt-2">
                    {formatPercentage(cycleStats.current_metrics.survival_rate)}
                  </Text>
                  <Text className="text-xs text-gray-light">{t('survival')}</Text>
                </View>

                <View className="w-[48%] bg-cream p-4 rounded-lg items-center mb-3">
                  <Ionicons name="scale" size={22} color={MAVECAM_COLORS.INFO} />
                  <Text className="text-xl font-bold text-gray-dark mt-2">
                    {formatNumber(cycleStats.current_metrics.daily_growth_rate, 'g/j')}
                  </Text>
                  <Text className="text-xs text-gray-light">{t('growth')}</Text>
                </View>

                <View className="w-[48%] bg-cream p-4 rounded-lg items-center mb-3">
                  <Ionicons name="cash" size={22} color={MAVECAM_COLORS.WARNING} />
                  <Text className="text-xl font-bold text-gray-dark mt-2">
                    {formatCurrency(cycleStats.feed_metrics.cost_estimate)}
                  </Text>
                  <Text className="text-xs text-gray-light">{t('feedCost')}</Text>
                </View>
              </View>
            </View>

            <View className="bg-white mx-4 mb-6 p-4 rounded-xl">
              <Text className="text-lg font-bold text-gray-dark mb-4">{t('details')}</Text>
              <View className="flex-row flex-wrap justify-between">
                <View className="w-[48%] mb-4">
                  <Text className="text-xs text-gray-light mb-1">{t('duration')}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">
                    {cycleStats.days_active} {t('days')}
                  </Text>
                </View>
                <View className="w-[48%] mb-4">
                  <Text className="text-xs text-gray-light mb-1">{t('finalBiomass')}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">
                    {formatNumber(cycleStats.current_metrics.biomass, 'kg')}
                  </Text>
                </View>
                <View className="w-[48%] mb-4">
                  <Text className="text-xs text-gray-light mb-1">{t('finalWeight')}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">
                    {formatNumber(cycleStats.current_metrics.average_weight, 'g')}
                  </Text>
                </View>
                <View className="w-[48%] mb-4">
                  <Text className="text-xs text-gray-light mb-1">{t('feedConsumedStat')}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">
                    {formatNumber(cycleStats.feed_metrics.total_consumed, 'kg')}
                  </Text>
                </View>
                <View className="w-[48%] mb-4">
                  <Text className="text-xs text-gray-light mb-1">{t('dailyRation')}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">
                    {formatNumber(cycleStats.feed_metrics.average_daily, 'kg/j')}
                  </Text>
                </View>
                <View className="w-[48%] mb-4">
                  <Text className="text-xs text-gray-light mb-1">{t('mortality')}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">
                    {cycleStats.mortality_analysis.total} {t('fishLabel')}
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
