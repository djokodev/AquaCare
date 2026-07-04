import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import { AQUACARE_COLORS } from '@/constants/colors';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { useLocalFeedingAlarms } from '@/features/notifications/hooks/useLocalFeedingAlarms';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { FeedingPlan } from '@/types/aquaculture';
import { formatDate, formatNumber, formatPercentage } from '@/utils';
import logger from '@/utils/logger';
import { parseApiError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';

type FeedingPlanScreenNavigationProp = StackNavigationProp<RootStackParamList, 'FeedingPlan'>;
type FeedingPlanScreenRouteProp = RouteProp<RootStackParamList, 'FeedingPlan'>;

interface FeedingPlanScreenProps {
  navigation: FeedingPlanScreenNavigationProp;
  route: FeedingPlanScreenRouteProp;
}

interface StatRowProps {
  label: string;
  value: string;
}

function StatRow({ label, value }: StatRowProps) {
  return (
    <View className="flex-1 rounded-xl bg-white px-3 py-3">
      <Text className="text-[11px] uppercase tracking-wide text-gray-light mb-1">{label}</Text>
      <Text className="text-sm font-semibold text-gray-dark">{value}</Text>
    </View>
  );
}

export default function FeedingPlanScreen({ navigation, route }: FeedingPlanScreenProps) {
  const { t, i18n } = useTranslation();
  const {
    reconcileCycleAlarms,
    getFormattedMealTimes,
    setAlarmsEnabled,
  } = useLocalFeedingAlarms();

  const routeParams = route.params;
  const cycleId = routeParams?.cycleId ?? '';
  const cycleUnitAllocationId = routeParams?.cycleUnitAllocationId ?? '';
  const productionUnitId = routeParams?.productionUnitId ?? '';
  const productionUnitName = routeParams?.productionUnitName?.trim() ?? '';
  const hasValidUnitContext = Boolean(cycleId && cycleUnitAllocationId && productionUnitId);
  const unitLabel = productionUnitName || t('feedingPlanUnitDefaultTitle');
  const scopeKey = useMemo(
    () => [cycleId, cycleUnitAllocationId].filter(Boolean).join(':'),
    [cycleId, cycleUnitAllocationId]
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [feedingPlans, setFeedingPlans] = useState<FeedingPlan[]>([]);
  const [alarmsReady, setAlarmsReady] = useState(false);
  const [alarmStatus, setAlarmStatus] = useState<'active' | 'pending' | 'permission_denied' | 'error'>('pending');
  const [alarmInfo, setAlarmInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isSchedulingRef = useRef(false);

  const alarmMessages = useMemo(
    () => ({
      title: t('feedingAlarmTitle'),
      body: t('feedingAlarmBody'),
      actionFeedNow: t('alarmActionFeedNow'),
      actionSnooze10m: t('alarmActionSnooze10m'),
    }),
    [t]
  );

  const syncAlarmsForCurrentUnit = useCallback(
    async (plans: FeedingPlan[]) => {
      if (!hasValidUnitContext || !alarmsReady || isSchedulingRef.current) {
        return;
      }

      isSchedulingRef.current = true;
      try {
        const activePlans = plans.filter((plan) => plan.is_active);
        const result = await reconcileCycleAlarms({
          cycleId,
          scopeId: scopeKey,
          cycleName: unitLabel,
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
          setAlarmInfo(t('alarmsScheduled', { times: getFormattedMealTimes(activePlans[0].meals_per_day).join(', ') }));
        } else {
          setAlarmStatus('pending');
          setAlarmInfo(t('alarmsStatusPending'));
        }
      } finally {
        isSchedulingRef.current = false;
      }
    },
    [
      alarmMessages,
      alarmsReady,
      cycleId,
      getFormattedMealTimes,
      hasValidUnitContext,
      reconcileCycleAlarms,
      scopeKey,
      t,
      unitLabel,
    ]
  );

  const loadData = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!hasValidUnitContext) {
        setFeedingPlans([]);
        setError(t('feedingPlanUnitContextIncompleteError'));
        setAlarmInfo(null);
        setAlarmStatus('pending');
        if (mode === 'refresh') {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
        return;
      }

      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const plans = await aquacultureService.getFeedingPlansForAllocation(cycleUnitAllocationId);
        setFeedingPlans(plans);
        setError(null);
      } catch (err: unknown) {
        logger.error("Erreur chargement plans d'alimentation de l'unite:", err);
        setError(t('feedingPlanUnableToLoad'));
      } finally {
        if (mode === 'refresh') {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [cycleUnitAllocationId, hasValidUnitContext, t]
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: productionUnitName
        ? t('feedingPlanUnitTitle', { unitName: productionUnitName })
        : t('feedingPlanUnitTitleFallback'),
    });
  }, [navigation, productionUnitName, t]);

  useEffect(() => {
    let mounted = true;
    setAlarmsEnabled(true)
      .catch((storageError) => {
        logger.warn("Impossible de forcer les alarmes d'alimentation actives", storageError);
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

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    await loadData('refresh');
  }, [loadData]);

  useEffect(() => {
    if (!hasValidUnitContext || !alarmsReady) {
      return;
    }

    void syncAlarmsForCurrentUnit(feedingPlans);
  }, [alarmsReady, feedingPlans, hasValidUnitContext, syncAlarmsForCurrentUnit]);

  const generateFeedingPlan = useCallback(() => {
    if (!hasValidUnitContext) {
      return;
    }

    Alert.alert(t('generateUnitFeedingPlan'), t('generateUnitFeedingPlanConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('confirm'),
        onPress: async () => {
          try {
            setGeneratingPlan(true);
            await aquacultureService.generateFeedingPlanForAllocation({
              cycleUnitAllocationId,
              weeksAhead: 4,
              cycleId,
            });
            const updatedPlans = await aquacultureService.getFeedingPlansForAllocation(cycleUnitAllocationId);
            setFeedingPlans(updatedPlans);
            Alert.alert(t('success'), t('feedingPlanGenerated'));
          } catch (err: unknown) {
            logger.error('Erreur generation plan unitaire:', err);
            Alert.alert(t('error'), formatAquacultureErrorWithAction(parseApiError(err), t));
          } finally {
            setGeneratingPlan(false);
          }
        },
      },
    ]);
  }, [cycleId, cycleUnitAllocationId, hasValidUnitContext, t]);

  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';

  const renderHeader = () => (
    <View className="bg-aquacare-primary flex-row items-center pt-14 pb-4 px-4">
      <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.WHITE} />
      </TouchableOpacity>
      <Text className="text-xl font-bold text-white flex-1" numberOfLines={1}>
        {productionUnitName ? t('feedingPlanUnitTitle', { unitName: productionUnitName }) : t('feedingPlanUnitTitleFallback')}
      </Text>
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

  if (!hasValidUnitContext) {
    return (
      <View className="flex-1 bg-cream">
        {renderHeader()}
        <View className="flex-1 items-center justify-center px-6 py-20">
          <Ionicons name="alert-circle-outline" size={64} color={AQUACARE_COLORS.ERROR} />
          <Text className="text-xl font-bold text-gray-dark mt-4 text-center">
            {t('feedingPlanUnitContextIncompleteError')}
          </Text>
        </View>
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
            {t('feedingPlanUnitScreenDescription', { unitName: unitLabel })}
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
                className={`flex-row items-center justify-center px-4 py-2 rounded-lg bg-aquacare-primary min-w-[160px] ${
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
                  {generatingPlan ? t('generating') : t('generateUnitFeedingPlan')}
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

          {error ? (
            <View className="rounded-xl bg-[#fef2f2] border border-[#fecaca] p-4 mb-4">
              <Text className="text-sm text-[#b91c1c]">{error}</Text>
              <TouchableOpacity
                className="mt-3 self-start rounded-lg bg-aquacare-primary px-4 py-2"
                onPress={() => {
                  void loadData('refresh');
                }}
              >
                <Text className="text-white font-semibold">{t('retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {feedingPlans.length === 0 ? (
            <View className="items-center py-10">
              <Ionicons name="restaurant-outline" size={48} color={AQUACARE_COLORS.GRAY_LIGHT} />
              <Text className="text-base font-bold text-gray-dark mt-3">{t('noUnitFeedingPlans')}</Text>
              <Text className="text-sm text-gray-light text-center mt-1">{t('createUnitFeedingPlan')}</Text>
            </View>
          ) : (
            feedingPlans.map((plan) => {
              const recommendedFeed = plan.recommended_feed_type || plan.recommended_feed || '-';
              const temperatureLabel = plan.used_default_temperature
                ? t('defaultTemperatureUsed', {
                    temp: plan.temperature_used_c ?? 26,
                  })
                : t('unitTemperatureUsed', {
                    temp: plan.temperature_used_c ?? 26,
                  });

              return (
                <View key={plan.id} className="bg-cream rounded-lg p-4 mb-3 border-l-4 border-l-aquacare-primary">
                  <View className="flex-row justify-between items-start mb-3">
                    <View className="flex-1 pr-3">
                      <Text className="text-base font-bold text-gray-dark">
                        {t('week')} {plan.week_number}
                      </Text>
                      <Text className="text-xs text-gray-light mt-1">
                        {plan.scope_label || t('feedingPlanUnitTitle', { unitName: unitLabel })}
                      </Text>
                    </View>
                    <Text className="text-xs text-gray-light text-right">
                      {formatDate(plan.start_date, locale)} - {formatDate(plan.end_date, locale)}
                    </Text>
                  </View>

                  <View className="flex-row flex-wrap gap-3 mb-3">
                    <StatRow label={t('estimatedFishCount')} value={formatNumber(plan.estimated_fish_count, undefined, 0)} />
                    <StatRow label={t('averageWeight')} value={`${formatNumber(plan.average_weight, undefined, 1)} g`} />
                    <StatRow label={t('estimatedBiomass')} value={`${formatNumber(plan.biomass, undefined, 2)} kg`} />
                    <StatRow label={t('dailyRation')} value={`${formatNumber(plan.daily_feed_amount, undefined, 2)} kg/j`} />
                    <StatRow label={t('feedingPercentage')} value={formatPercentage(plan.feeding_rate)} />
                    <StatRow label={t('feedingFrequency')} value={`${plan.meals_per_day}x/${t('day')}`} />
                    <StatRow label={t('feedPerMeal')} value={`${formatNumber(plan.feed_per_meal, undefined, 2)} kg`} />
                    <StatRow label={t('feedSizeMm')} value={`${formatNumber(plan.feed_size_mm ?? 0, undefined, 1)} mm`} />
                    <StatRow label={t('protein')} value={`${formatNumber(plan.protein_percentage, undefined, 0)} %`} />
                  </View>

                  <View className="rounded-lg bg-white p-3 gap-2">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-xs text-gray-light">{t('feedingPlanRecommendedFeed')}</Text>
                      <Text className="text-xs font-semibold text-gray-dark flex-1 text-right pl-2">
                        {recommendedFeed}
                      </Text>
                    </View>
                    <View className="flex-row justify-between items-center">
                      <Text className="text-xs text-gray-light">{t('feedingPlanTemperatureLabel')}</Text>
                      <Text className="text-xs font-semibold text-gray-dark flex-1 text-right pl-2">
                        {temperatureLabel}
                      </Text>
                    </View>
                    <View className="flex-row justify-between items-center">
                      <Text className="text-xs text-gray-light">{t('dataSource')}</Text>
                      <Text className="text-xs font-semibold text-gray-dark flex-1 text-right pl-2">
                        {plan.data_source || '-'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
