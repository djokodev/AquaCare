import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';

import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { useLocalFeedingAlarms } from '@/features/notifications/hooks/useLocalFeedingAlarms';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { FeedingPlan } from '@/types/aquaculture';
import { formatDate, formatNumber, formatPercentage } from '@/utils';
import logger from '@/utils/logger';
import { parseApiError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';
import { AppHeader, AppText, Button, Card, EmptyState, ErrorState, InlineAlert, LoadingState, Screen } from '@/components/ui';
import { colors, spacing } from '@/theme';

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

interface StatSectionProps {
  title: string;
  items: StatRowProps[];
}

function StatRow({ label, value }: StatRowProps) {
  return (
    <Card variant="outlined" style={{ padding: spacing[3] }}>
      <AppText variant="caption" color="muted">{label}</AppText>
      <AppText variant="body" style={{ marginTop: spacing[1] }} numberOfLines={2}>
        {value}
      </AppText>
    </Card>
  );
}

function StatSection({ title, items }: StatSectionProps) {
  return (
    <View>
      <AppText variant="sectionTitle" style={{ marginBottom: spacing[3] }}>{title}</AppText>
      <View style={{ gap: spacing[3] }}>
        {items.map((item) => (
          <StatRow key={item.label} label={item.label} value={item.value} />
        ))}
      </View>
    </View>
  );
}

const formatMetricValue = (value: number | string | null | undefined, unit?: string, decimals = 1) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return formatNumber(value, unit, decimals);
};

const formatMetricPercentage = (value: number | string | null | undefined, decimals = 1) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return formatPercentage(value, decimals);
};

const formatMetricText = (value: string | null | undefined) => value?.trim() || '-';

const getLocalDateIso = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
  const todayIsoDate = useMemo(getLocalDateIso, []);
  const displayedFeedingPlans = useMemo(
    () =>
      feedingPlans
        .filter((plan) => plan.start_date <= todayIsoDate && todayIsoDate <= plan.end_date)
        .sort((left, right) => left.week_number - right.week_number)
        .slice(0, 1),
    [feedingPlans, todayIsoDate]
  );

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
        const plans = await aquacultureService.getFeedingPlansForAllocation(cycleUnitAllocationId, {
          currentWeekOnly: true,
        });
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

    void syncAlarmsForCurrentUnit(displayedFeedingPlans);
  }, [alarmsReady, displayedFeedingPlans, hasValidUnitContext, syncAlarmsForCurrentUnit]);

  const generateFeedingPlan = useCallback(() => {
    if (!hasValidUnitContext) {
      return;
    }

    const hasExistingPlan = displayedFeedingPlans.length > 0;
    const confirmMessage = hasExistingPlan
      ? t('feedingPlanGenerateConfirmExisting', { unitName: unitLabel })
      : t('feedingPlanGenerateConfirmEmpty', { unitName: unitLabel });

    Alert.alert(t('feedingPlanGenerateConfirmTitle'), confirmMessage, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('generatePlan'),
        onPress: async () => {
          try {
            setGeneratingPlan(true);
            await aquacultureService.generateFeedingPlanForAllocation({
              cycleUnitAllocationId,
              weeksAhead: 1,
              cycleId,
            });
            const updatedPlans = await aquacultureService.getFeedingPlansForAllocation(cycleUnitAllocationId, {
              currentWeekOnly: true,
            });
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
  }, [cycleId, cycleUnitAllocationId, displayedFeedingPlans.length, hasValidUnitContext, t, unitLabel]);

  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';

  const headerTitle = productionUnitName
    ? t('feedingPlanUnitTitle', { unitName: productionUnitName })
    : t('feedingPlanUnitTitleFallback');

  if (loading) {
    return <View style={styles.root}><AppHeader title={headerTitle} onBack={() => navigation.goBack()} backLabel={t('back')} /><Screen style={styles.stateScreen}><LoadingState message={t('loading')} /></Screen></View>;
  }

  if (!hasValidUnitContext) {
    return <View style={styles.root}><AppHeader title={headerTitle} onBack={() => navigation.goBack()} backLabel={t('back')} /><Screen style={styles.stateScreen}><ErrorState message={t('feedingPlanUnitContextIncompleteError')} /></Screen></View>;
  }

  return (
    <View style={styles.root}>
      <AppHeader title={headerTitle} onBack={() => navigation.goBack()} backLabel={t('back')} />
      <Screen style={styles.screenContent}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} contentContainerStyle={styles.scrollContent}>
        <Card style={styles.planCard}>
          <View style={{ gap: spacing[4] }}>
          <AppText variant="sectionTitle" style={{ marginBottom: spacing[3] }}>{t('feedingPlans')}</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <View style={{ flex: 1 }}><InlineAlert tone={alarmStatus === 'active' ? 'success' : alarmStatus === 'permission_denied' ? 'error' : alarmStatus === 'error' ? 'warning' : 'info'} message={alarmStatus === 'active' ? t('alarmsStatusActive') : t('alarmsStatusPending')} /></View>
            <Button label={generatingPlan ? t('generating') : t('generateFeedingPlanShort')} onPress={generateFeedingPlan} disabled={generatingPlan} loading={generatingPlan} iconLeft="refresh" size="small" fullWidth={false} />
          </View>

          {alarmInfo && (
            <InlineAlert tone={alarmStatus === 'active' ? 'success' : alarmStatus === 'permission_denied' ? 'error' : alarmStatus === 'error' ? 'warning' : 'info'} message={alarmInfo} />
          )}

          {error ? (
            <ErrorState message={error} actionLabel={t('retry')} onAction={() => void loadData('refresh')} compact />
          ) : null}

          {displayedFeedingPlans.length === 0 ? (
            <EmptyState title={t('noUnitFeedingPlans')} message={t('createUnitFeedingPlan')} compact />
          ) : (
            displayedFeedingPlans.map((plan) => {
              const recommendedFeed = formatMetricText(plan.recommended_feed_type || plan.recommended_feed);
              const dailyFeedAmount = Number(plan.daily_feed_amount ?? 0);
              const hasInsufficientRationData = Number.isFinite(dailyFeedAmount) && dailyFeedAmount <= 0;
              const temperatureValue = plan.temperature_used_c === null || plan.temperature_used_c === undefined
                ? '-'
                : `${formatNumber(plan.temperature_used_c, undefined, 1)}°C${
                  plan.used_default_temperature ? ` ${t('feedingDefaultTemperatureSuffix')}` : ''
                }`;
              const proteinValue = plan.protein_percentage === null || plan.protein_percentage === undefined
                ? '-'
                : `${formatNumber(plan.protein_percentage, undefined, 0)} %`;
              const referenceValue = (() => {
                const source = (plan.data_source || '').trim().toUpperCase();
                if (source === 'DIBAQ') {
                  return t('feedingPlanReferenceDibaq');
                }

                return t('feedingPlanReferenceAquacareEstimate');
              })();

              return (
                <Card key={plan.id} testID="feeding-plan-card" variant="outlined" style={{ backgroundColor: colors.surface.page }}>
                  <View style={{ marginBottom: spacing[4] }}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing[3] }}>
                      <View style={{ flex: 1 }}>
                        <AppText variant="bodyStrong">
                          {t('feedingPlanCurrentWeekLabel')} · {t('week')} {plan.week_number}
                        </AppText>
                        <AppText variant="caption" color="muted" style={{ marginTop: spacing[1] }}>
                          {formatDate(plan.start_date, locale)} - {formatDate(plan.end_date, locale)}
                        </AppText>
                      </View>
                    </View>
                    <AppText variant="label" color="link" style={{ marginTop: spacing[2] }}>
                      {plan.scope_label || t('feedingPlanUnitTitle', { unitName: unitLabel })}
                    </AppText>
                  </View>

                  {hasInsufficientRationData ? (
                    <InlineAlert tone="warning" message={t('feedingPlanInsufficientDataWarning')} />
                  ) : null}

                  <View style={{ gap: spacing[4] }}>
                    <StatSection
                      title={t('feedingPlanRecommendationSection')}
                      items={[
                        { label: t('dailyRation'), value: formatMetricValue(plan.daily_feed_amount, 'kg/j', 2) },
                        {
                          label: t('feedingFrequency'),
                          value: plan.meals_per_day === null || plan.meals_per_day === undefined
                            ? '-'
                            : `${plan.meals_per_day}x/${t('day')}`,
                        },
                        { label: t('feedPerMeal'), value: formatMetricValue(plan.feed_per_meal, 'kg', 2) },
                        { label: t('feedingRecommendedRate'), value: formatMetricPercentage(plan.feeding_rate) },
                      ]}
                    />

                    <StatSection
                      title={t('feedingPlanFeedSection')}
                      items={[
                        { label: t('feedingFeedLabel'), value: recommendedFeed },
                        { label: t('feedingProteinRate'), value: proteinValue },
                      ]}
                    />

                    <StatSection
                      title={t('feedingPlanDataSection')}
                      items={[
                        { label: t('feedingWaterTemperature'), value: temperatureValue },
                        { label: t('feedingPlanReferenceUsed'), value: referenceValue },
                      ]}
                    />
                  </View>
                </Card>
              );
            })
          )}
          </View>
        </Card>
      </ScrollView>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.page },
  stateScreen: { justifyContent: 'center' },
  screenContent: { padding: 0 },
  scrollContent: { padding: spacing[4], paddingBottom: spacing[6] },
  planCard: { gap: spacing[4] },
});
