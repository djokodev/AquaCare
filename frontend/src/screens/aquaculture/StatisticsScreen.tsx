import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { aquacultureService } from '@/services/aquacultureService';
import { ProductionCycle, CycleStatistics } from '@/types/aquaculture';
import { MAVECAM_COLORS } from '@/constants/colors';
import { formatNumber, formatPercentage, formatCurrency } from '@/utils';

export default function StatisticsScreen({ navigation }: any) {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [harvestedCycles, setHarvestedCycles] = useState<ProductionCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<ProductionCycle | null>(null);
  const [cycleStats, setCycleStats] = useState<CycleStatistics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const cycles = await aquacultureService.getHarvestedCycles();
      setHarvestedCycles(cycles);
    } catch (loadError: any) {
      console.error('Erreur chargement donnees:', loadError);
      setError('Erreur lors du chargement des statistiques');
    } finally {
      setLoading(false);
    }
  };

  const loadCycleStatistics = async (cycleId: string) => {
    try {
      const cycle = harvestedCycles.find((c) => c.id === cycleId);
      if (cycle) {
        const stats: CycleStatistics = {
          cycle_id: cycleId,
          days_active: Number(cycle.days_active) || 0,
          current_metrics: {
            survival_rate: Number(cycle.survival_rate) || 0,
            biomass: Number(cycle.final_biomass || cycle.current_biomass) || 0,
            average_weight: Number(cycle.final_average_weight || cycle.current_average_weight) || 0,
            fcr: Number(cycle.fcr) || 0,
            daily_growth_rate: Number(cycle.daily_growth_rate) || 0,
            specific_growth_rate: Number(cycle.specific_growth_rate) || 0,
          },
          feed_metrics: {
            total_consumed: Number(cycle.total_feed_consumed) || 0,
            average_daily: Number(cycle.average_daily_feed) || 0,
            cost_estimate: Number(cycle.total_feed_cost) || 0,
          },
          mortality_analysis: {
            total: Math.max(
              0,
              (Number(cycle.initial_count) || 0) - (Number(cycle.final_count || cycle.current_count) || 0)
            ),
            percentage: Math.max(0, 100 - (Number(cycle.survival_rate) || 0)),
            by_week: {},
            main_causes: [],
          },
          growth_performance: [],
        };
        setCycleStats(stats);
      }
    } catch (statsError: any) {
      console.error('Erreur chargement stats cycle:', statsError);
    }
  };

  const handleCycleSelection = async (cycle: ProductionCycle) => {
    setSelectedCycle(cycle);
    await loadCycleStatistics(cycle.id);
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

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
          <Text className="text-base text-gray-light mt-3">{t('loading')}...</Text>
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
          <Text className="text-lg font-semibold text-gray-dark mt-4 text-center">{t('noData') || 'Aucune statistique disponible'}</Text>
          <Text className="text-sm text-gray-light mt-2 text-center">{t('completeCycleToSeeHistory')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream">
      {renderHeader()}

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View className="bg-white mx-4 mt-4 mb-4 p-4 rounded-xl shadow">
          <Text className="text-lg font-bold text-gray-dark mb-3">{t('harvestedCycles')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
            {harvestedCycles.map((cycle) => {
              const isSelected = selectedCycle?.id === cycle.id;
              return (
                <TouchableOpacity
                  key={cycle.id}
                  className={`mr-3 p-3 min-w-[160px] rounded-lg border ${
                    isSelected ? 'bg-mavecam-primary border-mavecam-primary' : 'bg-cream border-gray-light'
                  }`}
                  onPress={() => handleCycleSelection(cycle)}
                >
                  <Text className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-gray-dark'}`} numberOfLines={1}>
                    {cycle.cycle_name}
                  </Text>
                  <Text className={`text-xs mt-1 ${isSelected ? 'text-white' : 'text-gray-light'}`}>
                    {cycle.species} - {formatPercentage(cycle.survival_rate || 0)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {!selectedCycle && harvestedCycles.length > 0 && (
          <View className="bg-white mx-4 mb-4 p-6 rounded-xl border border-dashed border-gray-200 items-center">
            <Ionicons name="analytics-outline" size={48} color={MAVECAM_COLORS.GRAY_LIGHT} />
            <Text className="text-lg font-semibold text-gray-dark mt-3 text-center">{t('selectCycleToAnalyze') || 'Selectionnez un cycle a analyser'}</Text>
            <Text className="text-sm text-gray-light mt-2 text-center">
              {t('selectCycleHint') || 'Cliquez sur un cycle ci-dessus pour voir ses statistiques detaillees'}
            </Text>
          </View>
        )}

        {selectedCycle && cycleStats && (
          <>
            <View className="bg-white mx-4 mb-4 p-4 rounded-xl shadow">
              <Text className="text-lg font-bold text-gray-dark mb-4">{t('statistics')}</Text>
              <View className="flex-row flex-wrap justify-between">
                <View className="w-[48%] bg-cream p-4 rounded-lg items-center mb-3">
                  <Ionicons name="trending-up" size={22} color={MAVECAM_COLORS.SUCCESS} />
                  <Text className="text-xl font-bold text-gray-dark mt-2">{formatNumber(cycleStats.current_metrics.fcr)}</Text>
                  <Text className="text-xs text-gray-light">FCR</Text>
                </View>

                <View className="w-[48%] bg-cream p-4 rounded-lg items-center mb-3">
                  <Ionicons name="heart" size={22} color={MAVECAM_COLORS.ERROR} />
                  <Text className="text-xl font-bold text-gray-dark mt-2">{formatPercentage(cycleStats.current_metrics.survival_rate)}</Text>
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
                  <Text className="text-xl font-bold text-gray-dark mt-2">{formatCurrency(cycleStats.feed_metrics.cost_estimate)}</Text>
                  <Text className="text-xs text-gray-light">{t('feedCost') || 'Cout Aliment'}</Text>
                </View>
              </View>
            </View>

            <View className="bg-white mx-4 mb-6 p-4 rounded-xl shadow">
              <Text className="text-lg font-bold text-gray-dark mb-4">{t('details')}</Text>
              <View className="flex-row flex-wrap justify-between">
                <View className="w-[48%] mb-4">
                  <Text className="text-xs text-gray-light mb-1">{t('duration') || 'Duree'}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">{cycleStats.days_active} jours</Text>
                </View>
                <View className="w-[48%] mb-4">
                  <Text className="text-xs text-gray-light mb-1">{t('finalBiomass')}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">{formatNumber(cycleStats.current_metrics.biomass, 'kg')}</Text>
                </View>
                <View className="w-[48%] mb-4">
                  <Text className="text-xs text-gray-light mb-1">{t('finalWeight')}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">{formatNumber(cycleStats.current_metrics.average_weight, 'g')}</Text>
                </View>
                <View className="w-[48%] mb-4">
                  <Text className="text-xs text-gray-light mb-1">{t('totalFeedConsumed') || 'Aliment consomme'}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">{formatNumber(cycleStats.feed_metrics.total_consumed, 'kg')}</Text>
                </View>
                <View className="w-[48%] mb-4">
                  <Text className="text-xs text-gray-light mb-1">{t('dailyRation')}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">{formatNumber(cycleStats.feed_metrics.average_daily, 'kg/j')}</Text>
                </View>
                <View className="w-[48%] mb-4">
                  <Text className="text-xs text-gray-light mb-1">{t('mortality')}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">{cycleStats.mortality_analysis.total} {t('fish') || 'poissons'}</Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
