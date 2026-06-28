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
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { RootStackParamList } from '@/navigation/MainNavigator';
import type { ProductionUnitDashboard, CycleLog, SanitaryLog } from '@/types/aquaculture';
import { formatDate } from '@/utils';

type NavigationProp = StackNavigationProp<RootStackParamList, 'ProductionUnitOverview'>;
type RouteType = RouteProp<RootStackParamList, 'ProductionUnitOverview'>;

interface Props {
  navigation: NavigationProp;
  route: RouteType;
}

type MetricTone = 'default' | 'success' | 'warning' | 'danger';
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

function MetricCard({
  label,
  value,
  subtitle,
  tone = 'default',
}: {
  label: string;
  value: string;
  subtitle?: string;
  tone?: MetricTone;
}) {
  const toneStyle =
    tone === 'success'
      ? styles.metricCardSuccess
      : tone === 'warning'
        ? styles.metricCardWarning
        : tone === 'danger'
          ? styles.metricCardDanger
          : styles.metricCardDefault;

  return (
    <View style={[styles.metricCard, toneStyle]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {subtitle ? <Text style={styles.metricSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function ActivityCard({
  item,
}: {
  item: ActivityItem;
}) {
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
        color={active ? AQUACARE_COLORS.GREEN_PRIMARY : AQUACARE_COLORS.GRAY_LIGHT}
      />
      <Text style={[styles.statusPillText, active ? styles.statusPillTextActive : styles.statusPillTextNeutral]}>
        {label}
      </Text>
    </View>
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
        <View style={styles.heroIcon}>
          <Ionicons name="analytics-outline" size={24} color={AQUACARE_COLORS.GREEN_PRIMARY} />
        </View>
        <Text style={styles.eyebrow}>{t('productionUnitDashboardTitle')}</Text>
        <Text style={styles.title}>{unitName}</Text>
        <Text style={styles.subtitle}>
          {dimension ? `${unitTypeLabel} · ${dimension}` : unitTypeLabel}
        </Text>
        <Text style={styles.cycleLine}>{cycleName}</Text>
        <Text style={styles.description}>{t('productionUnitDashboardDescription')}</Text>
      </View>

      <View style={styles.statusRow}>
        <StatusPill
          label={summary.has_today_daily_log ? t('productionUnitTodayLogDone') : t('productionUnitTodayLogMissing')}
          active={summary.has_today_daily_log}
          icon={summary.has_today_daily_log ? 'checkmark-circle-outline' : 'time-outline'}
        />
        <StatusPill
          label={
            summary.has_unresolved_sanitary_issue
              ? t('productionUnitActiveHealthIssue')
              : t('productionUnitNoHealthIssue')
          }
          active={!summary.has_unresolved_sanitary_issue}
          icon={summary.has_unresolved_sanitary_issue ? 'warning-outline' : 'shield-checkmark-outline'}
        />
      </View>

      <View style={styles.grid}>
        <MetricCard
          label={t('productionUnitEstimatedFish')}
          value={formatCount(summary.estimated_current_fish_count, locale)}
          tone="success"
        />
        <MetricCard
          label={t('productionUnitCumulativeMortality')}
          value={formatCount(summary.total_mortality_count, locale)}
          subtitle={formatPercentage(coerceNumber(summary.mortality_rate_pct) ?? 0, locale)}
          tone="warning"
        />
        <MetricCard
          label={t('productionUnitConsumedFeed')}
          value={formatKg(coerceNumber(summary.total_feed_consumed_kg) ?? 0, locale)}
          tone="default"
        />
        <MetricCard
          label={t('productionUnitEstimatedBiomass')}
          value={formatKg(coerceNumber(summary.estimated_current_biomass_kg) ?? 0, locale)}
          tone="default"
        />
        <MetricCard
          label={t('productionUnitLastTracking')}
          value={summary.last_daily_log_date ? formatDate(summary.last_daily_log_date) : t('productionUnitNoRecentActivity')}
          subtitle={
            summary.days_since_last_log !== null && summary.days_since_last_log !== undefined
              ? t('daysCount', { count: summary.days_since_last_log })
              : undefined
          }
          tone="default"
        />
        <MetricCard
          label={t('productionUnitHealthStatus')}
          value={
            summary.has_unresolved_sanitary_issue
              ? t('productionUnitActiveHealthIssue')
              : t('productionUnitNoHealthIssue')
          }
          tone={summary.has_unresolved_sanitary_issue ? 'danger' : 'success'}
        />
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('productionUnitTrackingSectionTitle')}</Text>
        <Text style={styles.sectionDescription}>{t('productionUnitTrackingSectionDescription')}</Text>

        <TouchableOpacity style={styles.actionButton} onPress={navigateToDailyLog}>
          <Ionicons name="document-text-outline" size={18} color={AQUACARE_COLORS.WHITE} />
          <Text style={styles.actionButtonText}>{t('productionUnitDailyLogAction')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButtonSecondary} onPress={navigateToSanitaryLog}>
          <Ionicons name="medical-outline" size={18} color={AQUACARE_COLORS.GREEN_PRIMARY} />
          <Text style={styles.actionButtonSecondaryText}>{t('productionUnitSanitaryLogAction')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButtonGhost} onPress={navigateToHistory}>
          <Ionicons name="time-outline" size={18} color={AQUACARE_COLORS.GREEN_PRIMARY} />
          <Text style={styles.actionButtonGhostText}>{t('productionUnitLogHistoryAction')}</Text>
        </TouchableOpacity>
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
  hero: {
    marginBottom: 18,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AQUACARE_COLORS.GREEN_LIGHT,
    marginBottom: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: AQUACARE_COLORS.GREEN_DARK,
    lineHeight: 34,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  cycleLine: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  description: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusPillActive: {
    backgroundColor: '#F1F8F1',
    borderWidth: 1,
    borderColor: '#D4E7D5',
  },
  statusPillNeutral: {
    backgroundColor: '#F5F6F5',
    borderWidth: 1,
    borderColor: '#E2E8E3',
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusPillTextActive: {
    color: AQUACARE_COLORS.GREEN_DARK,
  },
  statusPillTextNeutral: {
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  metricCard: {
    width: '48%',
    minHeight: 112,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
  },
  metricCardDefault: {
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderColor: '#E5E7EB',
  },
  metricCardSuccess: {
    backgroundColor: '#F3FBF4',
    borderColor: '#D8EEDB',
  },
  metricCardWarning: {
    backgroundColor: '#FFF9F0',
    borderColor: '#F2D7A7',
  },
  metricCardDanger: {
    backgroundColor: '#FFF5F5',
    borderColor: '#F3C2C2',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: AQUACARE_COLORS.GRAY_LIGHT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricValue: {
    marginTop: 10,
    fontSize: 24,
    fontWeight: '800',
    color: AQUACARE_COLORS.GREEN_DARK,
    lineHeight: 30,
  },
  metricSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  section: {
    marginTop: 18,
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: AQUACARE_COLORS.GREEN_DARK,
  },
  sectionDescription: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: 14,
    lineHeight: 20,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  activityList: {
    gap: 10,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#FAFBFA',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContent: {
    flex: 1,
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
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  actionButtonText: {
    color: AQUACARE_COLORS.WHITE,
    fontSize: 14,
    fontWeight: '700',
  },
  actionButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#F2F8F2',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#CFE8D0',
  },
  actionButtonSecondaryText: {
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    fontSize: 14,
    fontWeight: '700',
  },
  actionButtonGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#D9E8DA',
  },
  actionButtonGhostText: {
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    fontSize: 14,
    fontWeight: '700',
  },
  inlineError: {
    marginTop: 12,
    fontSize: 13,
    color: AQUACARE_COLORS.ERROR,
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
});
