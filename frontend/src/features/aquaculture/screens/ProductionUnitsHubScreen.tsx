import { Ionicons } from '@expo/vector-icons';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { AQUACARE_COLORS } from '@/constants/colors';
import DashboardMetricCard from '@/features/main/components/MetricCard';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { RootStackParamList } from '@/navigation/MainNavigator';
import type { CycleDashboard, CycleUnitAllocation } from '@/types/aquaculture';

type NavigationProp = StackNavigationProp<RootStackParamList, 'ProductionUnitsHub'>;
type RouteType = RouteProp<RootStackParamList, 'ProductionUnitsHub'>;

interface Props {
  navigation: NavigationProp;
  route: RouteType;
}

const getProductionUnitTypeLabelKey = (unitType?: string | null): string => {
  if (unitType === 'pond') {
    return 'productionUnitTypePond';
  }
  if (unitType === 'cage') {
    return 'productionUnitTypeCage';
  }
  if (unitType === 'tank') {
    return 'productionUnitTypeTank';
  }
  return 'productionUnitsUnknownType';
};

const formatCount = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);

const formatKg = (value: number, locale: string): string =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} kg`;

const formatPercentage = (value: number, locale: string): string =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} %`;

const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function StatRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function UnitCard({
  allocation,
  locale,
  onOpen,
  t,
}: {
  allocation: CycleUnitAllocation;
  locale: string;
  onOpen: () => void;
  t: (key: string) => string;
}) {
  const unitTypeLabel = t(getProductionUnitTypeLabelKey(allocation.production_unit_type));
  const dimension = allocation.production_unit_display_dimension?.trim();
  const title = allocation.production_unit_name?.trim() || t('productionUnitsUnknownUnit');
  const typeLine = dimension ? `${unitTypeLabel} · ${dimension}` : unitTypeLabel;
  const survivalRate = allocation.survival_rate_pct ?? allocation.expected_survival_rate_pct;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{typeLine}</Text>
        </View>
        <View style={styles.cardIcon}>
          <Ionicons name="layers-outline" size={18} color={AQUACARE_COLORS.GREEN_PRIMARY} />
        </View>
      </View>

      <View style={styles.statList}>
        <StatRow
          label={t('productionUnitsInitialFishCount')}
          value={formatCount(allocation.initial_fish_count, locale)}
        />
        <StatRow
          label={t('productionUnitsCurrentFishCount')}
          value={formatCount(allocation.current_fish_count, locale)}
        />
        {allocation.production_unit_recommended_capacity !== null &&
        allocation.production_unit_recommended_capacity !== undefined ? (
          <StatRow
            label={t('productionUnitsRecommendedCapacity')}
            value={formatCount(allocation.production_unit_recommended_capacity, locale)}
          />
        ) : null}
        {survivalRate !== null && survivalRate !== undefined ? (
          <StatRow
            label={t('productionUnitsExpectedSurvivalRate')}
            value={formatPercentage(survivalRate, locale)}
          />
        ) : null}
      </View>

      <TouchableOpacity style={styles.openButton} onPress={onOpen}>
        <Text style={styles.openButtonText}>{t('productionUnitsOpenUnit')}</Text>
        <Ionicons name="chevron-forward" size={16} color={AQUACARE_COLORS.WHITE} />
      </TouchableOpacity>
    </View>
  );
}

export default function ProductionUnitsHubScreen({ navigation, route }: Props) {
  const { t, i18n } = useTranslation();
  const { cycleId } = route.params;
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const [dashboard, setDashboard] = useState<CycleDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const errorMessage = errorKey ? t(errorKey) : null;

  const allocations = dashboard?.allocations ?? [];
  const summary = dashboard?.summary ?? null;
  const cycleName = dashboard?.cycle.cycle_name || t('productionUnitsUnknownUnit');
  const sanitaryIssueUnitNames = useMemo(
    () =>
      allocations
        .filter((allocation) => allocation.summary.has_unresolved_sanitary_issue)
        .map((allocation) => allocation.allocation.production_unit_name?.trim() || t('productionUnitsUnknownUnit')),
    [allocations, t]
  );
  const missingTodayLogUnitNames = useMemo(
    () =>
      allocations
        .filter((allocation) => !allocation.summary.has_today_daily_log)
        .map((allocation) => allocation.allocation.production_unit_name?.trim() || t('productionUnitsUnknownUnit')),
    [allocations, t]
  );

  const loadDashboard = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await aquacultureService.getCycleDashboard(cycleId);
        setDashboard(result);
        setErrorKey(null);
      } catch {
        if (mode === 'initial') {
          setDashboard(null);
        }
        setErrorKey('cycleDashboardLoadError');
      } finally {
        if (mode === 'refresh') {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [cycleId]
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleRefresh = useCallback(() => {
    void loadDashboard('refresh');
  }, [loadDashboard]);

  const handleOpenUnit = useCallback(
    (allocation: CycleUnitAllocation) => {
      navigation.navigate('ProductionUnitOverview', {
        cycleId,
        allocationId: allocation.id,
        productionUnitId: allocation.production_unit,
      });
    },
    [cycleId, navigation]
  );

  if (loading && !dashboard) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={AQUACARE_COLORS.GREEN_PRIMARY} />
        <Text style={styles.loadingText}>{t('cycleDashboardLoading')}</Text>
      </View>
    );
  }

  if (errorMessage && !dashboard) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={AQUACARE_COLORS.ERROR} />
        <Text style={styles.errorText}>{errorMessage}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
          <Text style={styles.retryButtonText}>{t('retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={[AQUACARE_COLORS.GREEN_PRIMARY]}
          tintColor={AQUACARE_COLORS.GREEN_PRIMARY}
        />
      }
    >
      <View style={styles.hero}>
        <View style={styles.heroBadge}>
          <Ionicons name="grid-outline" size={16} color={AQUACARE_COLORS.GREEN_PRIMARY} />
          <Text style={styles.heroBadgeText}>{t('cycleDashboardActiveCycleLabel')}</Text>
        </View>
        <Text style={styles.title}>{t('cycleDashboardTitle')}</Text>
        <Text style={styles.subtitle}>{t('cycleDashboardSubtitle')}</Text>
        {cycleName ? <Text style={styles.cycleName}>{cycleName}</Text> : null}
      </View>

      {errorMessage ? (
        <View style={styles.inlineError}>
          <Ionicons name="warning-outline" size={18} color={AQUACARE_COLORS.ERROR} />
          <Text style={styles.inlineErrorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {summary ? (
        <>
          <View style={styles.metricGrid}>
            <DashboardMetricCard
              icon="fish-outline"
              color={AQUACARE_COLORS.GREEN_PRIMARY}
              value={formatCount(summary.total_estimated_current_fish_count, locale)}
              label={t('cycleDashboardEstimatedFishCount')}
              index={0}
              animationType="pulse"
            />
            <DashboardMetricCard
              icon="remove-circle-outline"
              color={AQUACARE_COLORS.ERROR}
              value={formatCount(summary.total_mortality_count, locale)}
              label={t('cycleDashboardTotalMortalityCount')}
              index={1}
              animationType="wave"
            />
            <DashboardMetricCard
              icon="restaurant-outline"
              color={AQUACARE_COLORS.GREEN_LIGHT}
              value={formatKg(toNumber(summary.total_feed_consumed_kg), locale)}
              label={t('cycleDashboardFeedConsumed')}
              index={2}
              animationType="bounce"
            />
            <DashboardMetricCard
              icon="water-outline"
              color={AQUACARE_COLORS.GREEN_DARK}
              value={formatKg(toNumber(summary.estimated_current_biomass_kg), locale)}
              label={t('cycleDashboardEstimatedBiomass')}
              index={3}
              animationType="rotate"
            />
          </View>

          <View style={styles.summaryStrip}>
            <View style={styles.summaryChip}>
              <Ionicons name="layers-outline" size={14} color={AQUACARE_COLORS.GREEN_PRIMARY} />
              <Text style={styles.summaryChipText}>
                {t('cycleDashboardUnitsCount', { count: summary.total_allocations })}
              </Text>
            </View>
            <View style={styles.summaryChip}>
              <Ionicons name="medkit-outline" size={14} color={AQUACARE_COLORS.ERROR} />
              <Text style={styles.summaryChipText}>
                {t('cycleDashboardSanitaryIssueUnits', { count: summary.units_with_sanitary_issue_count })}
              </Text>
            </View>
            <View style={styles.summaryChip}>
              <Ionicons name="alert-circle-outline" size={14} color={AQUACARE_COLORS.WARNING} />
              <Text style={styles.summaryChipText}>
                {t('cycleDashboardMissingTodayLogs', { count: summary.units_missing_today_log_count })}
              </Text>
            </View>
          </View>

          {summary.has_allocations ? null : (
            <View style={styles.legacyNotice}>
              <Ionicons name="information-circle-outline" size={18} color={AQUACARE_COLORS.GREEN_PRIMARY} />
              <Text style={styles.legacyNoticeText}>{t('cycleDashboardLegacyNotice')}</Text>
            </View>
          )}

          {(sanitaryIssueUnitNames.length > 0 || missingTodayLogUnitNames.length > 0) ? (
            <View style={styles.alertPanel}>
              <Text style={styles.alertPanelTitle}>{t('cycleDashboardAttentionTitle')}</Text>
              {sanitaryIssueUnitNames.length > 0 ? (
                <Text style={styles.alertPanelText}>
                  {t('cycleDashboardSanitaryIssueUnits', { count: sanitaryIssueUnitNames.length })}
                  {': '}
                  {sanitaryIssueUnitNames.join(', ')}
                </Text>
              ) : null}
              {missingTodayLogUnitNames.length > 0 ? (
                <Text style={styles.alertPanelText}>
                  {t('cycleDashboardMissingTodayLogs', { count: missingTodayLogUnitNames.length })}
                  {': '}
                  {missingTodayLogUnitNames.join(', ')}
                </Text>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}

      <View style={styles.cards}>
        {allocations.length > 0 ? (
          allocations.map((allocation) => (
            <UnitCard
              key={allocation.allocation.id}
              allocation={allocation.allocation}
              locale={locale}
              t={t}
              onOpen={() => handleOpenUnit(allocation.allocation)}
            />
          ))
        ) : (
          <View style={styles.emptyStateCard}>
            <Ionicons name="layers-outline" size={48} color={AQUACARE_COLORS.GREEN_PRIMARY} />
            <Text style={styles.emptyTitle}>{t('cycleDashboardNoUnitsTitle')}</Text>
            <Text style={styles.emptyDescription}>{t('cycleDashboardNoUnitsDescription')}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AQUACARE_COLORS.CREAM,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: AQUACARE_COLORS.CREAM,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: AQUACARE_COLORS.GRAY_DARK,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 14,
    fontSize: 16,
    fontWeight: '600',
    color: AQUACARE_COLORS.ERROR,
    textAlign: 'center',
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 18,
    fontWeight: '700',
    color: AQUACARE_COLORS.GRAY_DARK,
    textAlign: 'center',
  },
  emptyDescription: {
    marginTop: 8,
    fontSize: 14,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  retryButtonText: {
    color: AQUACARE_COLORS.WHITE,
    fontWeight: '700',
  },
  hero: {
    marginBottom: 16,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: AQUACARE_COLORS.GREEN_LIGHT,
    marginBottom: 12,
  },
  heroBadgeText: {
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: AQUACARE_COLORS.GREEN_DARK,
    lineHeight: 34,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: AQUACARE_COLORS.GRAY_DARK,
    lineHeight: 22,
  },
  cycleName: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#FFF1F1',
    marginBottom: 16,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: 13,
    color: AQUACARE_COLORS.ERROR,
    lineHeight: 18,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  alertPanel: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FDBA74',
    marginBottom: 14,
  },
  alertPanelTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#9A3412',
    marginBottom: 8,
  },
  alertPanelText: {
    fontSize: 13,
    color: '#9A3412',
    lineHeight: 19,
    marginTop: 4,
  },
  legacyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 14,
  },
  legacyNoticeText: {
    flex: 1,
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_DARK,
    lineHeight: 18,
  },
  cards: {
    gap: 14,
  },
  emptyStateCard: {
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  cardHeaderText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: AQUACARE_COLORS.GREEN_DARK,
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_LIGHT,
  },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AQUACARE_COLORS.GREEN_LIGHT,
  },
  statList: {
    gap: 10,
    marginBottom: 14,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statLabel: {
    flex: 1,
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_LIGHT,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    color: AQUACARE_COLORS.GREEN_DARK,
    textAlign: 'right',
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  openButtonText: {
    color: AQUACARE_COLORS.WHITE,
    fontWeight: '800',
    fontSize: 14,
  },
});
