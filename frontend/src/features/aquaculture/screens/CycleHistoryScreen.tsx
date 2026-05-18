import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store/store';
import { fetchProductionCycles } from '@/features/aquaculture/store/aquacultureSlice';
import { ProductionCycle } from '@/types/aquaculture';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AQUACARE_COLORS } from '@/constants/colors';
import { formatNumber, formatPercentage, formatDate, formatDaysSince } from '@/utils';

type CycleHistoryScreenNavigationProp = StackNavigationProp<RootStackParamList, 'CycleHistory'>;

interface CycleHistoryScreenProps {
  navigation: CycleHistoryScreenNavigationProp;
}

export default function CycleHistoryScreen({ navigation }: CycleHistoryScreenProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  const [selectedFilter, setSelectedFilter] = useState<'all' | 'clarias' | 'tilapia'>('all');

  const { cycles, loading } = useSelector((state: RootState) => state.aquaculture);

  useEffect(() => {
    dispatch(fetchProductionCycles());
  }, [dispatch]);

  const onRefresh = React.useCallback(() => {
    dispatch(fetchProductionCycles());
  }, [dispatch]);

  const sortedCycles = useMemo(
    () =>
      [...cycles]
        .filter((cycle) => cycle.status === 'harvested')
        .filter((cycle) => (selectedFilter === 'all' ? true : cycle.species === selectedFilter))
        .sort((a, b) => {
          if (!a.end_date || !b.end_date) return 0;
          return new Date(b.end_date).getTime() - new Date(a.end_date).getTime();
        }),
    [cycles, selectedFilter]
  );

  const getDurationInDays = (startDate: string, endDate: string): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getPerformanceColor = (survivalRate: number | null | undefined, fcr: number | null | undefined) => {
    const survival = survivalRate || 0;
    const fcrValue = fcr || 999;

    if (survival >= 85 && fcrValue <= 1.8) return AQUACARE_COLORS.SUCCESS;
    if (survival >= 75 && fcrValue <= 2.2) return AQUACARE_COLORS.WARNING;
    return AQUACARE_COLORS.ERROR;
  };

  const getPerformanceText = (survivalRate: number | null | undefined, fcr: number | null | undefined) => {
    const survival = survivalRate || 0;
    const fcrValue = fcr || 999;

    if (survival >= 85 && fcrValue <= 1.8) return t('performanceExcellent');
    if (survival >= 75 && fcrValue <= 2.2) return t('performanceGood');
    return t('performanceImprove');
  };

  const { totalCycles, avgSurvival, avgFCR, totalBiomass } = useMemo(() => {
    const count = sortedCycles.length;
    return {
      totalCycles: count,
      avgSurvival: count > 0
        ? sortedCycles.reduce((sum, c) => sum + (c.survival_rate || 0), 0) / count
        : 0,
      avgFCR: count > 0
        ? sortedCycles.reduce((sum, c) => sum + (c.fcr || 0), 0) / count
        : 0,
      totalBiomass: sortedCycles.reduce((sum, c) => sum + (c.final_biomass || 0), 0),
    };
  }, [sortedCycles]);

  const renderCycleCard = useCallback(({ item: cycle }: { item: ProductionCycle }) => {
    const duration = cycle.end_date ? getDurationInDays(cycle.start_date, cycle.end_date) : 0;
    const performanceColor = getPerformanceColor(cycle.survival_rate, cycle.fcr);
    const performanceText = getPerformanceText(cycle.survival_rate, cycle.fcr);
    const speciesLabel = cycle.species === 'clarias' ? t('clariasSpeciesFull') : t('tilapia');

    return (
      <View className="bg-white rounded-xl p-4 mb-3">
        <View className="flex-row justify-between items-start mb-3">
          <View className="flex-1 mr-3">
            <Text className="text-base font-bold text-gray-dark" numberOfLines={1}>{cycle.cycle_name}</Text>
            <Text className="text-sm text-gray-light" numberOfLines={1}>
              {speciesLabel} | {cycle.pond_identifier}
            </Text>
            <Text className="text-xs text-gray-light" numberOfLines={1}>
              {formatDate(cycle.start_date)} - {cycle.end_date ? formatDate(cycle.end_date) : formatDaysSince(cycle.start_date)} | {duration} {t('days')}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-xs font-bold" style={{ color: performanceColor }}>
              {performanceText}
            </Text>
          </View>
        </View>

        <View className="flex-row justify-between pt-3 border-t border-cream">
          <View className="items-center flex-1">
            <Text className="text-sm font-bold text-gray-dark">{formatPercentage(cycle.survival_rate)}</Text>
            <Text className="text-xs text-gray-light">{t('survival')}</Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-sm font-bold text-gray-dark">{cycle.fcr ? cycle.fcr.toFixed(2) : '0.00'}</Text>
            <Text className="text-xs text-gray-light">FCR</Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-sm font-bold text-gray-dark">{formatNumber(cycle.final_biomass, 'kg')}</Text>
            <Text className="text-xs text-gray-light">{t('finalBiomass')}</Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-sm font-bold text-gray-dark">
              {cycle.final_average_weight ? `${cycle.final_average_weight}g` : '0g'}
            </Text>
            <Text className="text-xs text-gray-light">{t('finalWeight')}</Text>
          </View>
        </View>
      </View>
    );
  }, [t]);

  const renderListHeader = useCallback(
    () => (
      <>
        <View className="bg-white mx-4 my-4 p-4 rounded-xl">
          <Text className="text-lg font-bold text-gray-dark mb-4">{t('historySummary')}</Text>

          <View className="flex-row flex-wrap justify-between">
            <View className="w-[48%] items-center bg-cream p-3 rounded-lg mb-2">
              <Text className="text-xl font-bold text-aquacare-primary mb-1">{totalCycles}</Text>
              <Text className="text-xs text-gray-light text-center">{t('completedCycles')}</Text>
            </View>

            <View className="w-[48%] items-center bg-cream p-3 rounded-lg mb-2">
              <Text className="text-xl font-bold text-aquacare-primary mb-1">{formatPercentage(avgSurvival)}</Text>
              <Text className="text-xs text-gray-light text-center">{t('avgSurvival')}</Text>
            </View>

            <View className="w-[48%] items-center bg-cream p-3 rounded-lg mb-2">
              <Text className="text-xl font-bold text-aquacare-primary mb-1">{avgFCR > 0 ? avgFCR.toFixed(2) : '0'}</Text>
              <Text className="text-xs text-gray-light text-center">{t('avgFCR')}</Text>
            </View>

            <View className="w-[48%] items-center bg-cream p-3 rounded-lg mb-2">
              <Text className="text-xl font-bold text-aquacare-primary mb-1">{formatNumber(totalBiomass, 'kg')}</Text>
              <Text className="text-xs text-gray-light text-center">{t('totalHarvested')}</Text>
            </View>
          </View>
        </View>

        <View className="bg-white mx-4 mb-4 p-4 rounded-xl">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('filterBySpecies')}</Text>

          <View className="flex-row justify-around">
            {(['all', 'clarias', 'tilapia'] as const).map((filter) => (
              <TouchableOpacity
                key={filter}
                className={`px-4 py-2 rounded-full border ${
                  selectedFilter === filter
                    ? 'bg-aquacare-primary border-aquacare-primary'
                    : 'bg-cream border-gray-light'
                }`}
                onPress={() => setSelectedFilter(filter)}
              >
                <Text className={`text-sm font-medium ${selectedFilter === filter ? 'text-white' : 'text-gray-dark'}`}>
                  {filter === 'all' ? t('allSpecies') : filter === 'clarias' ? t('clarias') : t('tilapia')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View className="px-4">
          <Text className="text-lg font-bold text-gray-dark mb-4">
            {t('harvestedCycles')} ({sortedCycles.length})
          </Text>
        </View>
      </>
    ),
    [avgFCR, avgSurvival, selectedFilter, sortedCycles.length, t, totalBiomass, totalCycles]
  );

  const renderEmptyState = useCallback(
    () => (
      <View className="items-center py-10 px-4">
        {loading.cycles ? (
          <>
            <ActivityIndicator size="large" color={AQUACARE_COLORS.GREEN_PRIMARY} />
            <Text className="text-base text-gray-light mt-3">{t('loading')}</Text>
          </>
        ) : (
          <>
            <Ionicons name="fish-outline" size={64} color={AQUACARE_COLORS.GRAY_LIGHT} />
            <Text className="text-xl font-bold text-gray-dark mt-4 mb-2">{t('noHarvestedCycles')}</Text>
            <Text className="text-sm text-gray-light text-center">{t('completeCycleToSeeHistory')}</Text>
          </>
        )}
      </View>
    ),
    [loading.cycles, t]
  );

  return (
    <View className="flex-1 bg-cream">
      <View className="bg-aquacare-primary flex-row items-center pt-14 pb-4 px-4">
        <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.WHITE} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-white flex-1">{t('cycleHistory')}</Text>
      </View>

      <FlatList
        data={sortedCycles}
        keyExtractor={(item) => item.id}
        renderItem={renderCycleCard}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={{ paddingBottom: 16 }}
        refreshControl={<RefreshControl refreshing={loading.cycles} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
