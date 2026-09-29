import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
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
import { useSelector } from 'react-redux';
import { savePlanSnapshotEntry } from '@/features/notifications/reminders/feedingReminders';
import type { RootState } from '@/store/store';
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
  const userId = useSelector((state: RootState) => state.auth.user?.id ?? null);

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
  const [error, setError] = useState<string | null>(null);
  const todayIsoDate = useMemo(getLocalDateIso, []);
  const displayedFeedingPlans = useMemo(
    () =>
      feedingPlans
        .filter((plan) => plan.start_date <= todayIsoDate && todayIsoDate <= plan.end_date)
        .sort((left, right) => left.week_number - right.week_number)
        .slice(0, 1),
    [feedingPlans, todayIsoDate]
  );

  const loadData = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!hasValidUnitContext) {
        setFeedingPlans([]);
        setError(t('feedingPlanUnitContextIncompleteError'));
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
    void loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    await loadData('refresh');
  }, [loadData]);

  // Mémorise la ration par repas de l'unité pour l'afficher dans les rappels
  // de nourrissage (alarmes locales), même hors connexion.
  useEffect(() => {
    if (!userId || !hasValidUnitContext || loading || error) {
      return;
    }
    const currentPlan = displayedFeedingPlans[0];
    void savePlanSnapshotEntry(
      userId,
      cycleUnitAllocationId,
      currentPlan
        ? {
          unitName: currentPlan.production_unit_name || unitLabel,
          feedPerMealKg: Number(currentPlan.feed_per_meal),
          endDate: currentPlan.end_date,
        }
        : null,
    ).catch((snapshotError) => logger.warn('Feeding reminder snapshot not saved', snapshotError));
  }, [cycleUnitAllocationId, displayedFeedingPlans, error, hasValidUnitContext, loading, unitLabel, userId]);

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
          <Button label={generatingPlan ? t('generating') : t('generateFeedingPlanShort')} onPress={generateFeedingPlan} disabled={generatingPlan} loading={generatingPlan} iconLeft="refresh" />

          <Button
            label={t('feedingRemindersTitle')}
            variant="outline"
            iconLeft="alarm-outline"
            onPress={() => navigation.navigate('FeedingReminders')}
          />

          {error ? (
            <ErrorState message={error} actionLabel={t('retry')} onAction={() => void loadData('refresh')} compact />
          ) : null}

          {displayedFeedingPlans.length === 0 ? (
            <EmptyState title={t('noUnitFeedingPlans')} compact />
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
