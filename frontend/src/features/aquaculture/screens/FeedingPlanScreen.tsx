import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store/store';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { ProductionCycle, FeedingPlan } from '@/types/aquaculture';
import { MAVECAM_COLORS } from '@/constants/colors';
import { formatNumber, formatPercentage } from '@/utils';

export default function FeedingPlanScreen({ navigation }: any) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  const [loading, setLoading] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCycles, setActiveCycles] = useState<ProductionCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<ProductionCycle | null>(null);
  const [feedingPlans, setFeedingPlans] = useState<FeedingPlan[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const cycles = await aquacultureService.getActiveCycles();
      setActiveCycles(cycles);

      if (cycles.length > 0 && !selectedCycle) {
        setSelectedCycle(cycles[0]);
        await loadFeedingPlans(cycles[0].id);
      }
    } catch (error: any) {
      console.error('Erreur chargement donnees:', error);
      setError('Erreur lors du chargement des donnees');
    } finally {
      setLoading(false);
    }
  };

  const loadFeedingPlans = async (cycleId: string) => {
    try {
      setFeedingPlans([]);
      const plans = await aquacultureService.getFeedingPlans(cycleId);
      setFeedingPlans(plans);
    } catch (error: any) {
      console.error('Erreur chargement plans:', error);
      setFeedingPlans([]);
      setError("Erreur lors du chargement des plans d'alimentation");
    }
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  const handleCycleSelection = async (cycle: ProductionCycle) => {
    setSelectedCycle(cycle);
    setLoadingPlans(true);
    await loadFeedingPlans(cycle.id);
    setLoadingPlans(false);
  };

  const generateFeedingPlan = async () => {
    if (!selectedCycle) return;

    Alert.alert(t('generateFeedingPlan'), t('generateFeedingPlanConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('confirm'),
        onPress: async () => {
          try {
            setGeneratingPlan(true);
            await aquacultureService.generateFeedingPlan(selectedCycle.id);
            await loadFeedingPlans(selectedCycle.id);
            Alert.alert(t('success'), t('feedingPlanGenerated'));
          } catch (error: any) {
            console.error('Erreur generation plan:', error);
            Alert.alert(t('error'), t('feedingPlanGenerationError'));
          } finally {
            setGeneratingPlan(false);
          }
        },
      },
    ]);
  };

  const getDaysBetween = (startDate: string, endDate?: string) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getCurrentWeek = (startDate: string) => {
    const days = getDaysBetween(startDate);
    return Math.ceil(days / 7);
  };

  const renderHeader = () => (
    <View className="bg-mavecam-primary flex-row items-center pt-14 pb-4 px-4">
      <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
      </TouchableOpacity>
      <Text className="text-xl font-bold text-white flex-1">{t('feedingPlan')}</Text>
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

  if (activeCycles.length === 0) {
    return (
      <View className="flex-1 bg-cream">
        {renderHeader()}
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <View className="flex-1 items-center justify-center py-20 px-6">
            <Ionicons name="restaurant-outline" size={64} color={MAVECAM_COLORS.GRAY_LIGHT} />
            <Text className="text-xl font-bold text-gray-dark mt-4 mb-2 text-center">{t('noActiveCycles')}</Text>
            <Text className="text-sm text-gray-light text-center mb-6">{t('createCycleToGeneratePlan')}</Text>
            <TouchableOpacity
              className="bg-mavecam-primary px-6 py-3 rounded-lg"
              onPress={() => navigation.navigate('NewCycle')}
            >
              <Text className="text-white text-base font-semibold">{t('newCycle')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream">
      {renderHeader()}

      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View className="bg-white mx-4 mt-4 mb-4 p-4 rounded-xl shadow">
          <Text className="text-lg font-bold text-gray-dark mb-4">{t('selectCycle')}</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
            {activeCycles.map((cycle) => {
              const isSelected = selectedCycle?.id === cycle.id;
              return (
                <TouchableOpacity
                  key={cycle.id}
                  className={`mr-3 p-3 min-w-[200px] rounded-xl border-2 ${
                    isSelected ? 'bg-[#ecfdf3] border-mavecam-primary' : 'bg-cream border-transparent'
                  }`}
                  onPress={() => handleCycleSelection(cycle)}
                >
                  <Text className={`text-base font-bold ${isSelected ? 'text-mavecam-primary' : 'text-gray-dark'}`}>
                    {cycle.cycle_name}
                  </Text>
                  <Text className={`text-sm mt-1 ${isSelected ? 'text-mavecam-primary' : 'text-gray-light'}`}>
                    {cycle.species === 'clarias' ? 'Silure' : 'Tilapia'} - {cycle.pond_identifier}
                  </Text>
                  <Text className={`text-xs mt-1 ${isSelected ? 'text-mavecam-primary' : 'text-gray-light'}`}>
                    J{getDaysBetween(cycle.start_date)} - {formatNumber(cycle.current_biomass, 'kg')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {selectedCycle && (
          <>
            <View className="bg-white mx-4 mb-4 p-4 rounded-xl shadow">
              <Text className="text-lg font-bold text-gray-dark mb-4">{t('cycleInformation')}</Text>

              <View className="bg-cream rounded-lg p-4">
                <View className="flex-row justify-between mb-4">
                  <View className="flex-1 items-center">
                    <Text className="text-xs text-gray-light mb-1">{t('currentWeek')}</Text>
                    <Text className="text-lg font-bold text-gray-dark">{t('week')} {getCurrentWeek(selectedCycle.start_date)}</Text>
                  </View>
                  <View className="flex-1 items-center">
                    <Text className="text-xs text-gray-light mb-1">{t('currentBiomass')}</Text>
                    <Text className="text-lg font-bold text-gray-dark">{formatNumber(selectedCycle.current_biomass, 'kg')}</Text>
                  </View>
                </View>

                <View className="flex-row justify-between">
                  <View className="flex-1 items-center">
                    <Text className="text-xs text-gray-light mb-1">{t('averageWeight')}</Text>
                    <Text className="text-lg font-bold text-gray-dark">{formatNumber(selectedCycle.current_average_weight, 'g')}</Text>
                  </View>
                  <View className="flex-1 items-center">
                    <Text className="text-xs text-gray-light mb-1">{t('survivalRate')}</Text>
                    <Text className="text-lg font-bold text-gray-dark">{formatPercentage(selectedCycle.survival_rate)}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View className="bg-white mx-4 mb-6 p-4 rounded-xl shadow">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-lg font-bold text-gray-dark">{t('feedingPlans')}</Text>
                <TouchableOpacity
                  className={`flex-row items-center px-3 py-2 rounded-lg bg-mavecam-primary ${generatingPlan ? 'opacity-60' : ''}`}
                  onPress={generateFeedingPlan}
                  disabled={generatingPlan}
                >
                  {generatingPlan ? (
                    <ActivityIndicator size="small" color={MAVECAM_COLORS.WHITE} />
                  ) : (
                    <Ionicons name="refresh" size={16} color={MAVECAM_COLORS.WHITE} />
                  )}
                  <Text className="text-white text-sm font-semibold ml-2">
                    {generatingPlan ? t('generating') : t('generatePlan')}
                  </Text>
                </TouchableOpacity>
              </View>

              {loadingPlans ? (
                <View className="items-center py-10">
                  <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
                  <Text className="text-sm text-gray-light mt-3">{t('loading')}...</Text>
                </View>
              ) : feedingPlans.length === 0 ? (
                <View className="items-center py-10">
                  <Ionicons name="restaurant-outline" size={48} color={MAVECAM_COLORS.GRAY_LIGHT} />
                  <Text className="text-base font-bold text-gray-dark mt-3">{t('noFeedingPlans')}</Text>
                  <Text className="text-sm text-gray-light text-center mt-1">{t('generateFirstPlan')}</Text>
                </View>
              ) : (
                feedingPlans.map((plan) => (
                  <View key={plan.id} className="bg-cream rounded-lg p-4 mb-3 border-l-4 border-l-mavecam-primary">
                    <View className="flex-row justify-between items-center mb-3">
                      <Text className="text-base font-bold text-gray-dark">{t('week')} {plan.week_number}</Text>
                      <Text className="text-sm text-gray-light">{new Date(plan.start_date).toLocaleDateString('fr-FR')}</Text>
                    </View>

                    <View className="gap-3">
                      <View className="flex-row justify-between">
                        <View className="flex-1 items-center">
                          <Text className="text-xs text-gray-light mb-1">{t('dailyRation')}</Text>
                          <Text className="text-sm font-semibold text-gray-dark">{formatNumber(plan.daily_feed_amount, 'kg/j')}</Text>
                        </View>
                        <View className="flex-1 items-center">
                          <Text className="text-xs text-gray-light mb-1">{t('feedingPercentage')}</Text>
                          <Text className="text-sm font-semibold text-gray-dark">{formatPercentage(plan.feeding_rate)}</Text>
                        </View>
                      </View>

                      <View className="flex-row justify-between">
                        <View className="flex-1 items-center">
                          <Text className="text-xs text-gray-light mb-1">{t('feedingFrequency')}</Text>
                          <Text className="text-sm font-semibold text-gray-dark">{plan.meals_per_day}x/{t('day')}</Text>
                        </View>
                        <View className="flex-1 items-center">
                          <Text className="text-xs text-gray-light mb-1">{t('feedPerMeal')}</Text>
                          <Text className="text-sm font-semibold text-gray-dark">{formatNumber(plan.feed_per_meal, 'kg')}</Text>
                        </View>
                      </View>

                      {plan.notes && (
                        <View className="bg-white rounded-md p-3">
                          <Text className="text-xs font-bold text-gray-dark mb-1">{t('notes')}:</Text>
                          <Text className="text-sm text-gray-light">{plan.notes}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}




