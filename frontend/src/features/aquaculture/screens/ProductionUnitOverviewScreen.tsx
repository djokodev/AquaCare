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
import type { CycleLog, ProductionUnitDashboard, SanitaryLog } from '@/types/aquaculture';
import { formatDate } from '@/utils';

type NavigationProp = StackNavigationProp<RootStackParamList, 'ProductionUnitOverview'>;
type RouteType = RouteProp<RootStackParamList, 'ProductionUnitOverview'>;

interface Props {
  navigation: NavigationProp;
  route: RouteType;
}

type ActivityKind = 'daily' | 'sanitary';

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  dateSort: string;
}

interface UnitActionItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  backgroundColor: string;
  onPress: () => void;
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

const coerceNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const coerced = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(coerced) ? coerced : null;
};

function ActivityCard({ item }: { item: ActivityItem }) {
  return (
    <View style={styles.activityCard}>
      <View style={[styles.activityIcon, { backgroundColor: `${item.iconColor}15` }]}>
        <Ionicons name={item.icon} size={18} color={item.iconColor} />
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityTitle}>{item.title}</Text>
        <Text style={styles.activitySubtitle}>{item.subtitle}</Text>
      </View>
    </View>
  );
}

function StatusPill({
  label,
  active,
  icon,
}: {
  label: string;
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={[styles.statusPill, active ? styles.statusPillActive : styles.statusPillNeutral]}>
      <Ionicons
        name={icon}
        size={14}
        color={active ? AQUACARE_COLORS.WHITE : 'rgba(255,255,255,0.82)'}
      />
      <Text style={[styles.statusPillText, active ? styles.statusPillTextActive : styles.statusPillTextNeutral]}>
        {label}
      </Text>
    </View>
  );
}

function ActionRow({ item }: { item: UnitActionItem }) {
  return (
    <TouchableOpacity style={styles.actionRow} onPress={item.onPress} activeOpacity={0.75}>
      <View style={[styles.actionIcon, { backgroundColor: item.backgroundColor }]}>
        <Ionicons name={item.icon} size={20} color={item.iconColor} />
      </View>
      <Text style={styles.actionLabel}>{item.label}</Text>
      <Ionicons name="chevron-forward" size={20} color={AQUACARE_COLORS.GRAY_LIGHT} />
    </TouchableOpacity>
  );
}

export default function ProductionUnitOverviewScreen({ navigation, route }: Props) {
  const { t, i18n } = useTranslation();
  const { cycleId, allocationId, productionUnitId } = route.params;
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';

  const [dashboard, setDashboard] = useState<ProductionUnitDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const errorMessage = errorKey ? t(errorKey) : null;

  const loadDashboard = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await aquacultureService.getProductionUnitDashboard(allocationId);
        setDashboard(result);
        setErrorKey(null);
      } catch {
        if (mode === 'initial') {
          setDashboard(null);
        }
        setErrorKey('productionUnitDashboardLoadError');
      } finally {
        if (mode === 'refresh') {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [allocationId]
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const allocation = dashboard?.allocation ?? null;
  const summary = dashboard?.summary ?? null;
  const unitName = allocation?.production_unit_name || t('productionUnitsUnknownUnit');
  const unitTypeLabel = t(getProductionUnitTypeLabelKey(allocation?.production_unit_type));
  const dimension = allocation?.production_unit_display_dimension?.trim();
  const cycleName = allocation?.cycle_name || t('productionUnitsUnknownUnit');

  const recentActivity = useMemo<ActivityItem[]>(() => {
    if (!dashboard) {
      return [];
    }

    const dailyItems = dashboard.recent_daily_logs.map((log: CycleLog) => {
      const metrics: string[] = [];
      if (log.mortality_count !== null && log.mortality_count !== undefined) {
        metrics.push(`${t('mortality')}: ${formatCount(log.mortality_count, locale)}`);
      }
      if (log.feed_quantity !== null && log.feed_quantity !== undefined) {
        const feedQuantity = coerceNumber(log.feed_quantity);
        if (feedQuantity !== null) {
          metrics.push(`${t('feedQuantity')}: ${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(feedQuantity)}`);
        }
      }
      if (log.average_weight !== null && log.average_weight !== undefined) {
        const averageWeight = coerceNumber(log.average_weight);
        if (averageWeight !== null) {
          metrics.push(`${t('averageWeight')}: ${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(averageWeight)} g`);
        }
      }

      return {
        id: log.id,
        kind: 'daily' as const,
        title: formatDate(log.log_date),
        subtitle: metrics.join(' · ') || t('productionUnitTodayLogDone'),
        icon: 'document-text-outline' as const,
        iconColor: AQUACARE_COLORS.GREEN_PRIMARY,
        dateSort: log.log_date,
      };
    });

    const sanitaryItems = dashboard.recent_sanitary_logs.map((log: SanitaryLog) => ({
      id: log.id,
      kind: 'sanitary' as const,
      title: formatDate(log.event_date),
      subtitle: [log.event_type_display || log.event_type, log.symptoms].filter(Boolean).join(' · '),
      icon: 'medkit-outline' as const,
      iconColor: AQUACARE_COLORS.ERROR,
      dateSort: log.event_date,
    }));

    return [...dailyItems, ...sanitaryItems].sort((left, right) => right.dateSort.localeCompare(left.dateSort));
  }, [dashboard, locale, t]);

  const navigateToDailyLog = useCallback(() => {
    navigation.navigate('DailyLog', {
      cycleId,
      cycleUnitAllocationId: allocationId,
      productionUnitId,
      productionUnitName: unitName,
    });
  }, [allocationId, cycleId, navigation, productionUnitId, unitName]);

  const navigateToSanitaryLog = useCallback(() => {
    navigation.navigate('SanitaryLog', {
      cycleId,
      cycleUnitAllocationId: allocationId,
      productionUnitId,
      productionUnitName: unitName,
    });
  }, [allocationId, cycleId, navigation, productionUnitId, unitName]);

  const navigateToHistory = useCallback(() => {
    navigation.navigate('DailyLogHistory', {
      cycleId,
      cycleUnitAllocationId: allocationId,
      productionUnitId,
      productionUnitName: unitName,
    });
  }, [allocationId, cycleId, navigation, productionUnitId, unitName]);

  const unitActions = useMemo<UnitActionItem[]>(
    () => [
      {
        id: 'daily-log',
        label: t('productionUnitDailyLogAction'),
        icon: 'document-text-outline',
        iconColor: AQUACARE_COLORS.GREEN_PRIMARY,
        backgroundColor: `${AQUACARE_COLORS.GREEN_PRIMARY}15`,
        onPress: navigateToDailyLog,
      },
      {
        id: 'sanitary-log',
        label: t('productionUnitSanitaryLogAction'),
        icon: 'medical-outline',
        iconColor: AQUACARE_COLORS.ERROR,
        backgroundColor: `${AQUACARE_COLORS.ERROR}15`,
        onPress: navigateToSanitaryLog,
      },
      {
        id: 'history',
        label: t('productionUnitLogHistoryAction'),
        icon: 'time-outline',
        iconColor: AQUACARE_COLORS.GREEN_DARK,
        backgroundColor: `${AQUACARE_COLORS.GREEN_DARK}15`,
        onPress: navigateToHistory,
      },
    ],
    [navigateToDailyLog, navigateToHistory, navigateToSanitaryLog, t]
  );

  const hasTodayLog = Boolean(summary?.has_today_daily_log);
  const hasHealthIssue = Boolean(summary?.has_unresolved_sanitary_issue);
  const latestAverageWeight = coerceNumber(summary?.latest_average_weight_g);
  const totalFeedConsumed = coerceNumber(summary?.total_feed_consumed_kg);
  const estimatedBiomass = coerceNumber(summary?.estimated_current_biomass_kg);
  const mortalityRate = coerceNumber(summary?.mortality_rate_pct);
  const daysSinceLastLog = summary?.days_since_last_log;

  const metricCards = useMemo(
    () => [
      {
        label: t('productionUnitEstimatedFish'),
        value: summary ? formatCount(summary.estimated_current_fish_count, locale) : '-',
        subtitle:
          daysSinceLastLog !== null && daysSinceLastLog !== undefined
            ? t('daysCount', { count: daysSinceLastLog })
            : undefined,
        icon: 'fish-outline' as const,
        color: AQUACARE_COLORS.GREEN_PRIMARY,
        animationType: 'pulse' as const,
      },
      {
        label: t('productionUnitCumulativeMortality'),
        value: summary ? formatCount(summary.total_mortality_count, locale) : '-',
        subtitle: mortalityRate !== null ? formatPercentage(mortalityRate, locale) : undefined,
        icon: 'remove-circle-outline' as const,
        color: AQUACARE_COLORS.WARNING,
        animationType: 'wave' as const,
      },
      {
        label: t('productionUnitConsumedFeed'),
        value: totalFeedConsumed !== null ? formatKg(totalFeedConsumed, locale) : '-',
        subtitle:
          latestAverageWeight !== null
            ? `${t('averageWeight')}: ${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(latestAverageWeight)} g`
            : undefined,
        icon: 'restaurant-outline' as const,
        color: AQUACARE_COLORS.GREEN_LIGHT,
        animationType: 'bounce' as const,
      },
      {
        label: t('productionUnitEstimatedBiomass'),
        value: estimatedBiomass !== null ? formatKg(estimatedBiomass, locale) : '-',
        subtitle:
          summary?.last_daily_log_date !== null && summary?.last_daily_log_date !== undefined
            ? `${t('productionUnitLastTracking')}: ${formatDate(summary.last_daily_log_date)}`
            : undefined,
        icon: 'water-outline' as const,
        color: AQUACARE_COLORS.GREEN_DARK,
        animationType: 'rotate' as const,
      },
    ],
    [daysSinceLastLog, estimatedBiomass, latestAverageWeight, locale, mortalityRate, summary, t, totalFeedConsumed]
  );

  if (loading && !dashboard) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={AQUACARE_COLORS.GREEN_PRIMARY} />
        <Text style={styles.loadingText}>{t('productionUnitDashboardLoading')}</Text>
      </View>
    );
  }

  if (errorMessage && !dashboard) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={AQUACARE_COLORS.ERROR} />
        <Text style={styles.errorText}>{errorMessage}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            void loadDashboard('refresh');
          }}
        >
          <Text style={styles.retryButtonText}>{t('retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!dashboard || !allocation || !summary) {
    return null;
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void loadDashboard('refresh');
          }}
          colors={[AQUACARE_COLORS.GREEN_PRIMARY]}
          tintColor={AQUACARE_COLORS.GREEN_PRIMARY}
        />
      }
    >
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('back')}
          >
            <Ionicons name="arrow-back" size={22} color={AQUACARE_COLORS.WHITE} />
          </TouchableOpacity>

          <View style={styles.heroIcon}>
            <Ionicons name="layers-outline" size={22} color={AQUACARE_COLORS.WHITE} />
          </View>
        </View>

        <Text style={styles.eyebrow}>{t('productionUnitDashboardTitle')}</Text>
        <Text style={styles.title}>{unitName}</Text>
        <Text style={styles.subtitle}>{dimension ? `${unitTypeLabel} · ${dimension}` : unitTypeLabel}</Text>
        <Text style={styles.cycleLine}>{cycleName}</Text>
        <Text style={styles.description}>{t('productionUnitDashboardDescription')}</Text>

        <View style={styles.statusRow}>
          <StatusPill
            label={hasTodayLog ? t('productionUnitTodayLogDone') : t('productionUnitTodayLogMissing')}
            active={hasTodayLog}
            icon={hasTodayLog ? 'checkmark-circle-outline' : 'time-outline'}
          />
          <StatusPill
            label={hasHealthIssue ? t('productionUnitActiveHealthIssue') : t('productionUnitNoHealthIssue')}
            active={!hasHealthIssue}
            icon={hasHealthIssue ? 'warning-outline' : 'shield-checkmark-outline'}
          />
        </View>
      </View>

      <View style={styles.metricsSection}>
        <View style={styles.grid}>
          {metricCards.map((card, index) => (
            <DashboardMetricCard
              key={card.label}
              icon={card.icon}
              color={card.color}
              value={card.value}
              label={card.label}
              index={index}
              animationType={card.animationType}
              subtitle={card.subtitle}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('productionUnitTrackingSectionTitle')}</Text>
        <Text style={styles.sectionDescription}>{t('productionUnitTrackingSectionDescription')}</Text>

        <View style={styles.actionsCard}>
          {unitActions.map((item, index) => (
            <View
              key={item.id}
              style={index < unitActions.length - 1 ? styles.actionRowWrapper : undefined}
            >
              <ActionRow item={item} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('productionUnitRecentActivity')}</Text>
        {recentActivity.length > 0 ? (
          <View style={styles.activityList}>
            {recentActivity.map((item) => (
              <ActivityCard key={item.id} item={item} />
            ))}
          </View>
        ) : (
          <Text style={styles.emptyActivityText}>{t('productionUnitNoRecentActivity')}</Text>
        )}
      </View>

      {errorMessage ? <Text style={styles.inlineError}>{errorMessage}</Text> : null}
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
    fontWeight: '700',
    color: AQUACARE_COLORS.ERROR,
    textAlign: 'center',
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
    marginBottom: 18,
    padding: 20,
    borderRadius: 24,
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: AQUACARE_COLORS.WHITE,
    lineHeight: 34,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
  },
  cycleLine: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: AQUACARE_COLORS.WHITE,
  },
  description: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.9)',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexShrink: 1,
  },
  statusPillActive: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  statusPillNeutral: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusPillTextActive: {
    color: AQUACARE_COLORS.WHITE,
  },
  statusPillTextNeutral: {
    color: 'rgba(255,255,255,0.82)',
  },
  metricsSection: {
    marginBottom: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: AQUACARE_COLORS.GREEN_DARK,
    marginBottom: 6,
  },
  sectionDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: AQUACARE_COLORS.GRAY_DARK,
    marginBottom: 12,
  },
  actionsCard: {
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actionRowWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontWeight: '600',
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  activityList: {
    gap: 10,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContent: {
    flex: 1,
    marginLeft: 12,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: AQUACARE_COLORS.GREEN_DARK,
  },
  activitySubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  emptyActivityText: {
    fontSize: 14,
    lineHeight: 20,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  inlineError: {
    marginTop: 12,
    fontSize: 13,
    color: AQUACARE_COLORS.ERROR,
  },
});
