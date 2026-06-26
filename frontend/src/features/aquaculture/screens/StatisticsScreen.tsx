import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { ProductionCycle, CycleStatistics } from '@/types/aquaculture';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AQUACARE_COLORS } from '@/constants/colors';
import { formatNumber, formatPercentage, formatCurrency } from '@/utils';
import logger from '@/utils/logger';
import { parseApiError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';

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
  const [cycleStats, setCycleStats] = useState<CycleStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const cycles = await aquacultureService.getHarvestedCycles();
      setHarvestedCycles(cycles);
    } catch (error: unknown) {
      logger.error('Erreur chargement statistiques:', error);
      setError(formatAquacultureErrorWithAction(parseApiError(error), t));
    } finally {
      setLoading(false);
    }
  // `t` is intentionally omitted to avoid refetch loops in some RN test/runtime contexts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedCycle = useMemo(
    () => harvestedCycles.find((cycle) => cycle.id === selectedCycleId) ?? null,
    [harvestedCycles, selectedCycleId]
  );

  useEffect(() => {
    if (!selectedCycleId) {
      setCycleStats(null);
      return;
    }

    let mounted = true;
    const loadCycleStats = async () => {
      try {
        setStatsLoading(true);
        const stats = await aquacultureService.getCycleStatistics(selectedCycleId);
        if (mounted) {
          setCycleStats(stats);
        }
      } catch (statsError: unknown) {
        logger.error('Erreur chargement stats cycle:', statsError);
        if (mounted) {
          setCycleStats(null);
          setError(formatAquacultureErrorWithAction(parseApiError(statsError), t));
        }
      } finally {
        if (mounted) {
          setStatsLoading(false);
        }
      }
    };

    loadCycleStats();
    return () => {
      mounted = false;
    };
  // `t` is intentionally omitted to avoid repeated network calls when translator ref changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCycleId]);

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
            isSelected ? 'bg-aquacare-primary border-aquacare-primary' : 'bg-cream border-gray-light'
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
            {t(cycle.species)}, {formatPercentage(cycle.survival_rate || 0)}
          </Text>
        </TouchableOpacity>
      );
    },
    [handleCycleSelection, selectedCycle?.id, t]
  );

  const renderHeader = () => (
    <View className="bg-aquacare-primary flex-row items-center pt-14 pb-4 px-4">
      <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.WHITE} />
      </TouchableOpacity>
      <Text className="text-xl font-bold text-white">{t('statistics')}</Text>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 bg-cream">
        {renderHeader()}
        <View className="flex-1 items-center justify-center p-10">
          <ActivityIndicator size="large" color={AQUACARE_COLORS.GREEN_PRIMARY} />
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
          <Ionicons name="alert-circle" size={48} color={AQUACARE_COLORS.ERROR} />
          <Text className="text-lg text-error text-center mt-3">{error}</Text>
          <TouchableOpacity className="bg-aquacare-primary px-5 py-3 rounded-lg mt-4" onPress={loadData}>
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
          <Ionicons name="bar-chart-outline" size={48} color={AQUACARE_COLORS.GRAY_LIGHT} />
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
            <Ionicons name="analytics-outline" size={48} color={AQUACARE_COLORS.GRAY_LIGHT} />
            <Text className="text-lg font-semibold text-gray-dark mt-3 text-center">{t('selectCycleToAnalyze')}</Text>
            <Text className="text-sm text-gray-light mt-2 text-center">{t('selectCycleHint')}</Text>
          </View>
        )}

        {selectedCycle && statsLoading && (
          <View className="bg-white mx-4 mb-4 p-6 rounded-xl items-center">
            <ActivityIndicator size="small" color={AQUACARE_COLORS.GREEN_PRIMARY} />
            <Text className="text-sm text-gray-light mt-2">{t('loading')}</Text>
          </View>
        )}

        {selectedCycle && cycleStats && !statsLoading && (
          <>
            <View className="bg-white mx-4 mb-4 p-4 rounded-xl">
              <Text className="text-lg font-bold text-gray-dark mb-4">{t('statistics')}</Text>
              <View className="flex-row flex-wrap justify-between">
                <View className="w-[48%] bg-cream p-4 rounded-lg items-center mb-3">
                  <Ionicons name="trending-up" size={22} color={AQUACARE_COLORS.SUCCESS} />
                  <Text className="text-xl font-bold text-gray-dark mt-2">{formatNumber(cycleStats.current_metrics.fcr)}</Text>
                  <Text className="text-xs text-gray-light">FCR</Text>
                </View>

                <View className="w-[48%] bg-cream p-4 rounded-lg items-center mb-3">
                  <Ionicons name="heart" size={22} color={AQUACARE_COLORS.ERROR} />
                  <Text className="text-xl font-bold text-gray-dark mt-2">
                    {formatPercentage(cycleStats.current_metrics.survival_rate)}
                  </Text>
                  <Text className="text-xs text-gray-light">{t('survival')}</Text>
                </View>

                <View className="w-[48%] bg-cream p-4 rounded-lg items-center mb-3">
                  <Ionicons name="scale" size={22} color={AQUACARE_COLORS.INFO} />
                  <Text className="text-xl font-bold text-gray-dark mt-2">
                    {formatNumber(cycleStats.current_metrics.daily_growth_rate, 'g/j')}
                  </Text>
                  <Text className="text-xs text-gray-light">{t('growth')}</Text>
                </View>

                <View className="w-[48%] bg-cream p-4 rounded-lg items-center mb-3">
                  <Ionicons name="cash" size={22} color={AQUACARE_COLORS.WARNING} />
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
