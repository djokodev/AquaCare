import { Ionicons } from '@expo/vector-icons';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
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
import QuickActionsPreview from '@/features/main/components/QuickActionsPreview';
import QuickActionsSheet from '@/features/main/components/QuickActionsSheet';
import DashboardMetricCard from '@/features/main/components/MetricCard';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { RootStackParamList } from '@/navigation/MainNavigator';
import type { ProductionUnitDashboard } from '@/types/aquaculture';
import { formatDate } from '@/utils';

type NavigationProp = StackNavigationProp<RootStackParamList, 'ProductionUnitOverview'>;
type RouteType = RouteProp<RootStackParamList, 'ProductionUnitOverview'>;

interface Props {
  navigation: NavigationProp;
  route: RouteType;
}

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

export default function ProductionUnitOverviewScreen({ navigation, route }: Props) {
  const { t, i18n } = useTranslation();
  const { cycleId, allocationId, productionUnitId, productionUnitName } = route.params;
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const [actionsSheetVisible, setActionsSheetVisible] = useState(false);
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
  const unitName = productionUnitName || allocation?.production_unit_name || t('productionUnitsUnknownUnit');
  const unitContext = {
    cycleId,
    cycleUnitAllocationId: allocationId,
    productionUnitId,
    productionUnitName: unitName,
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: unitName,
    });
  }, [navigation, unitName]);

  const metricCards = useMemo(
    () => [
      {
        label: t('currentFish'),
        value: summary ? formatCount(summary.estimated_current_fish_count, locale) : '-',
        subtitle:
          summary?.days_since_last_log !== null && summary?.days_since_last_log !== undefined
            ? t('daysCount', { count: summary.days_since_last_log })
            : undefined,
      },
      {
        label: t('productionUnitCumulativeMortality'),
        value: summary ? formatCount(summary.total_mortality_count, locale) : '-',
        subtitle:
          summary?.mortality_rate_pct !== null && summary?.mortality_rate_pct !== undefined
            ? t('productionUnitMortalityRateLabel', {
                rate: formatPercentage(coerceNumber(summary.mortality_rate_pct) ?? 0, locale),
              })
            : undefined,
      },
      {
        label: t('productionUnitConsumedFeed'),
        value:
          summary && coerceNumber(summary.total_feed_consumed_kg) !== null
            ? formatKg(coerceNumber(summary.total_feed_consumed_kg) ?? 0, locale)
            : '-',
        subtitle:
          summary?.latest_average_weight_g !== null && summary?.latest_average_weight_g !== undefined
            ? `${t('averageWeight')}: ${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
                coerceNumber(summary.latest_average_weight_g) ?? 0
              )} g`
            : undefined,
      },
      {
        label: t('productionUnitEstimatedBiomass'),
        value:
          summary && coerceNumber(summary.estimated_current_biomass_kg) !== null
            ? formatKg(coerceNumber(summary.estimated_current_biomass_kg) ?? 0, locale)
            : '-',
        subtitle:
          summary?.last_daily_log_date !== null && summary?.last_daily_log_date !== undefined
            ? `${t('productionUnitLastTracking')}: ${formatDate(summary.last_daily_log_date)}`
            : undefined,
      },
    ],
    [locale, summary, t]
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
      <View style={styles.metricsSection}>
        <View style={styles.grid}>
          {metricCards.map((card) => (
            <DashboardMetricCard
              key={card.label}
              value={card.value}
              label={card.label}
              subtitle={card.subtitle}
            />
          ))}
        </View>
      </View>

      <QuickActionsPreview
        onOpenSheet={() => setActionsSheetVisible(true)}
        hasActiveCycles={true}
        unreadCount={0}
        navigation={navigation}
        scope="unit"
        productionUnitContext={unitContext}
      />

      <QuickActionsSheet
        visible={actionsSheetVisible}
        onClose={() => setActionsSheetVisible(false)}
        unreadCount={0}
        navigation={navigation}
        scope="unit"
        productionUnitContext={unitContext}
      />

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
  metricsSection: {
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  inlineError: {
    marginTop: 16,
    fontSize: 13,
    color: AQUACARE_COLORS.ERROR,
    textAlign: 'center',
  },
});
