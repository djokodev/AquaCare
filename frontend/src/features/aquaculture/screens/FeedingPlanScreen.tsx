import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { ProductionCycle, FeedingPlan } from '@/types/aquaculture';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AQUACARE_COLORS } from '@/constants/colors';
import { formatNumber, formatPercentage } from '@/utils';
import logger from '@/utils/logger';
import { useLocalFeedingAlarms } from '@/features/notifications/hooks/useLocalFeedingAlarms';
import { AppDispatch, RootState } from '@/store/store';
import { setCurrentCycle } from '@/features/aquaculture/store/aquacultureSlice';
import { parseApiError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';

type FeedingPlanScreenNavigationProp = StackNavigationProp<RootStackParamList, 'FeedingPlan'>;

interface FeedingPlanScreenProps {
  navigation: FeedingPlanScreenNavigationProp;
}

export default function FeedingPlanScreen({ navigation }: FeedingPlanScreenProps) {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const {
    reconcileCycleAlarms,
    getFormattedMealTimes,
    setAlarmsEnabled,
  } = useLocalFeedingAlarms();
  const currentCycle = useSelector((state: RootState) => state.aquaculture.currentCycle);

  const [loading, setLoading] = useState(true);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<ProductionCycle | null>(null);
  const [feedingPlans, setFeedingPlans] = useState<FeedingPlan[]>([]);
  const [alarmsReady, setAlarmsReady] = useState(false);
  const [alarmStatus, setAlarmStatus] = useState<'active' | 'pending' | 'permission_denied' | 'error'>('pending');
  const isSchedulingRef = useRef(false);
  const [alarmInfo, setAlarmInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alarmMessages = useMemo(
    () => ({
      title: t('feedingAlarmTitle'),
      body: t('feedingAlarmBody'),
      actionFeedNow: t('alarmActionFeedNow'),
      actionSnooze10m: t('alarmActionSnooze10m'),
    }),
    [t]
  );

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    let mounted = true;

    setAlarmsEnabled(true)
      .catch((storageError) => {
        logger.warn('Impossible de forcer les alarmes actives', storageError);
      })
      .finally(() => {
        if (mounted) {
          setAlarmsReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [setAlarmsEnabled]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const cycles = await aquacultureService.getActiveCycles();
      const cycleToUse = currentCycle?.id
        ? cycles.find((c) => c.id === currentCycle.id) ?? cycles[0] ?? null
        : cycles[0] ?? null;

      if (cycleToUse) {
        setSelectedCycle(cycleToUse);
        dispatch(setCurrentCycle(cycleToUse));
        const plans = await aquacultureService.getFeedingPlans(cycleToUse.id);
        setFeedingPlans(plans);
      } else {
        setSelectedCycle(null);
        setFeedingPlans([]);
      }
    } catch (error: unknown) {
      logger.error("Erreur chargement plans d'alimentation:", error);
      setError(formatAquacultureErrorWithAction(parseApiError(error), t));
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  const syncAlarmsForCurrentCycle = useCallback(
    async (plans: FeedingPlan[]) => {
      if (!selectedCycle || !alarmsReady) {
        return;
      }
      if (isSchedulingRef.current) return;

      isSchedulingRef.current = true;
      try {
        const activePlans = plans.filter((plan) => plan.is_active);
        const result = await reconcileCycleAlarms({
          cycleId: selectedCycle.id,
          cycleName: selectedCycle.cycle_name,
          activePlans,
          enabled: true,
          messages: alarmMessages,
        });

        if (result.status === 'permission_denied') {
          setAlarmStatus('permission_denied');
          setAlarmInfo(t('alarmPermissionDenied'));
          return;
        }
        if (result.status === 'error') {
          setAlarmStatus('error');
          setAlarmInfo(t('alarmScheduleError'));
          return;
        }
        if (activePlans.length > 0) {
          setAlarmStatus('active');
          const times = getFormattedMealTimes(activePlans[0].meals_per_day).join(', ');
          setAlarmInfo(t('alarmsScheduled', { times }));
        } else {
          setAlarmStatus('pending');
          setAlarmInfo(t('alarmsStatusPending'));
        }
      } finally {
        isSchedulingRef.current = false;
      }
    },
    [
      selectedCycle,
      alarmsReady,
      reconcileCycleAlarms,
      alarmMessages,
      t,
      getFormattedMealTimes,
    ]
  );

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
            const updatedPlans = await aquacultureService.getFeedingPlans(selectedCycle.id);
            setFeedingPlans(updatedPlans);
            await syncAlarmsForCurrentCycle(updatedPlans);

            Alert.alert(t('success'), t('feedingPlanGenerated'));
          } catch (error: unknown) {
            logger.error('Erreur generation plan:', error);
            Alert.alert(
              t('error'),
              formatAquacultureErrorWithAction(parseApiError(error), t)
            );
          } finally {
            setGeneratingPlan(false);
          }
        },
      },
    ]);
  };

  useEffect(() => {
    if (!selectedCycle || !alarmsReady) {
      return;
    }
    syncAlarmsForCurrentCycle(feedingPlans);
  }, [selectedCycle, feedingPlans, alarmsReady, syncAlarmsForCurrentCycle]);

  const renderHeader = () => (
    <View className="bg-aquacare-primary flex-row items-center pt-14 pb-4 px-4">
      <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.WHITE} />
      </TouchableOpacity>
      <Text className="text-xl font-bold text-white flex-1">{t('feedingPlan')}</Text>
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

  if (!selectedCycle) {
    return (
      <View className="flex-1 bg-cream">
        {renderHeader()}
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <View className="flex-1 items-center justify-center py-20 px-6">
            <Ionicons name="restaurant-outline" size={64} color={AQUACARE_COLORS.GRAY_LIGHT} />
            <Text className="text-xl font-bold text-gray-dark mt-4 mb-2 text-center">{t('noActiveCycles')}</Text>
            <Text className="text-sm text-gray-light text-center mb-6">{t('createCycleToGeneratePlan')}</Text>
            <TouchableOpacity
              className="bg-aquacare-primary px-6 py-3 rounded-lg"
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
        <View className="mx-4 mt-4 mb-3 flex-row items-start bg-[#ecfdf5] rounded-xl p-4 gap-3">
          <Ionicons name="information-circle-outline" size={20} color={AQUACARE_COLORS.GREEN_PRIMARY} style={{ marginTop: 1 }} />
          <Text className="flex-1 text-sm text-[#065f46] leading-5">
            {t('feedingPlanScreenDescription')}
          </Text>
        </View>

        <View className="bg-white mx-4 mb-6 p-4 rounded-xl">
          <View className="mb-4">
            <Text className="text-lg font-bold text-gray-dark mb-3">{t('feedingPlans')}</Text>
            <View className="flex-row items-center">
              <View
                className={`flex-row items-center flex-1 mr-2 px-3 py-2 rounded-lg ${
                  alarmStatus === 'active'
                    ? 'bg-[#ecfdf3]'
                    : alarmStatus === 'permission_denied'
                      ? 'bg-[#fef2f2]'
                      : alarmStatus === 'error'
                        ? 'bg-[#fff7ed]'
                        : 'bg-cream'
                }`}
              >
                <Ionicons
                  name={alarmStatus === 'active' ? 'notifications' : 'notifications-off'}
                  size={16}
                  color={
                    alarmStatus === 'active'
                      ? AQUACARE_COLORS.GREEN_PRIMARY
                      : alarmStatus === 'permission_denied'
                        ? '#dc2626'
                        : AQUACARE_COLORS.GRAY_LIGHT
                  }
                />
                <Text
                  className={`text-xs font-semibold ml-2 ${
                    alarmStatus === 'active'
                      ? 'text-aquacare-primary'
                      : alarmStatus === 'permission_denied'
                        ? 'text-[#b91c1c]'
                        : 'text-gray-light'
                  }`}
                  numberOfLines={1}
                >
                  {alarmStatus === 'active' ? t('alarmsStatusActive') : t('alarmsStatusPending')}
                </Text>
              </View>

              <TouchableOpacity
                className={`flex-row items-center justify-center px-4 py-2 rounded-lg bg-aquacare-primary min-w-[124px] ${
                  generatingPlan ? 'opacity-60' : ''
                }`}
                onPress={generateFeedingPlan}
                disabled={generatingPlan}
              >
                {generatingPlan ? (
                  <ActivityIndicator size="small" color={AQUACARE_COLORS.WHITE} />
                ) : (
                  <Ionicons name="refresh" size={16} color={AQUACARE_COLORS.WHITE} />
                )}
                <Text className="text-white text-sm font-semibold ml-2">
                  {generatingPlan ? t('generating') : t('generatePlan')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {alarmInfo && (
            <View
              className={`rounded-lg p-3 mb-4 border ${
                alarmStatus === 'active'
                  ? 'bg-[#ecfdf3] border-[#86efac]'
                  : alarmStatus === 'permission_denied'
                    ? 'bg-[#fef2f2] border-[#fca5a5]'
                    : alarmStatus === 'error'
                      ? 'bg-[#fff7ed] border-[#fdba74]'
                      : 'bg-cream border-[#e2e8f0]'
              }`}
            >
              <Text
                className={`text-xs ${
                  alarmStatus === 'active'
                    ? 'text-aquacare-primary'
                    : alarmStatus === 'permission_denied'
                      ? 'text-[#b91c1c]'
                      : alarmStatus === 'error'
                        ? 'text-[#c2410c]'
                        : 'text-gray-light'
                }`}
              >
                {alarmInfo}
              </Text>
            </View>
          )}

          {feedingPlans.length === 0 ? (
            <View className="items-center py-10">
              <Ionicons name="restaurant-outline" size={48} color={AQUACARE_COLORS.GRAY_LIGHT} />
              <Text className="text-base font-bold text-gray-dark mt-3">{t('noFeedingPlans')}</Text>
              <Text className="text-sm text-gray-light text-center mt-1">{t('generateFirstPlan')}</Text>
            </View>
          ) : (
            feedingPlans.map((plan) => (
              <View key={plan.id} className="bg-cream rounded-lg p-4 mb-3 border-l-4 border-l-aquacare-primary">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-base font-bold text-gray-dark">
                    {t('week')} {plan.week_number}
                  </Text>
                  <Text className="text-sm text-gray-light">
                    {new Date(plan.start_date).toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-US')}
                  </Text>
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
                      <Text className="text-sm font-semibold text-gray-dark">
                        {plan.meals_per_day}x/{t('day')}
                      </Text>
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

                  {plan.used_default_temperature ? (
                    <View className="bg-[#fff7ed] rounded-md p-3 flex-row items-start">
                      <Ionicons name="thermometer-outline" size={14} color="#f59e0b" style={{ marginTop: 1 }} />
                      <Text className="text-xs text-[#92400e] ml-2 flex-1">
                        {t('feedingPlanDefaultTemp')}
                      </Text>
                    </View>
                  ) : plan.temperature_used_c != null ? (
                    <View className="bg-[#ecfdf5] rounded-md p-3 flex-row items-start">
                      <Ionicons name="thermometer-outline" size={14} color="#059669" style={{ marginTop: 1 }} />
                      <Text className="text-xs text-[#065f46] ml-2 flex-1">
                        {t('feedingPlanActualTemp', {
                          temp: plan.temperature_used_c,
                        })}
                      </Text>
                    </View>
                  ) : null}

                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {error && (
        <View className="px-4 pb-4">
          <Text className="text-sm text-error text-center">{error}</Text>
        </View>
      )}
    </View>
  );
}
