import { Ionicons } from '@expo/vector-icons';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';

import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
  Screen,
} from '@/components/ui';
import HarvestModal from '@/components/modals/HarvestModal';
import PartialHarvestModal from '@/components/modals/PartialHarvestModal';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import {
  fetchDashboardData,
  fetchProductionCycles,
} from '@/features/aquaculture/store/aquacultureSlice';
import QuickActionsPreview from '@/features/main/components/QuickActionsPreview';
import QuickActionsSheet from '@/features/main/components/QuickActionsSheet';
import MetricCard from '@/features/main/components/MetricCard';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AppDispatch } from '@/store/store';
import { colors, spacing } from '@/theme';
import type { ProductionUnitDashboard } from '@/types/aquaculture';

type NavigationProp = StackNavigationProp<
  RootStackParamList,
  'ProductionUnitOverview'
>;
type RouteType = RouteProp<RootStackParamList, 'ProductionUnitOverview'>;

interface Props {
  navigation: NavigationProp;
  route: RouteType;
}

const formatCount = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);

const formatKg = (value: number, locale: string): string =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} kg`;

const coerceNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const coerced = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(coerced) ? coerced : null;
};

const hasValidProductionUnitContext = (
  cycleId: string,
  cycleUnitAllocationId: string,
  productionUnitId: string,
): boolean => Boolean(cycleId && cycleUnitAllocationId && productionUnitId);

export default function ProductionUnitOverviewScreen({ navigation, route }: Props) {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const {
    cycleId,
    allocationId,
    cycleUnitAllocationId,
    productionUnitId,
    productionUnitName,
  } = route.params;
  const resolvedCycleUnitAllocationId = cycleUnitAllocationId || allocationId || '';
  const hasUnitContext = hasValidProductionUnitContext(
    cycleId,
    resolvedCycleUnitAllocationId,
    productionUnitId,
  );
  const locale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const [actionsSheetVisible, setActionsSheetVisible] = useState(false);
  const [partialHarvestModalVisible, setPartialHarvestModalVisible] = useState(false);
  const [harvestModalVisible, setHarvestModalVisible] = useState(false);
  const [dashboard, setDashboard] = useState<ProductionUnitDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const errorMessage = !hasUnitContext
    ? t('productionUnitContextIncompleteError')
    : errorKey
      ? t(errorKey)
      : null;

  const loadDashboard = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!hasUnitContext) {
        setDashboard(null);
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
        const result = await aquacultureService.getProductionUnitDashboard(
          resolvedCycleUnitAllocationId,
        );
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
    [hasUnitContext, resolvedCycleUnitAllocationId],
  );

  useEffect(() => {
    if (!hasUnitContext) {
      setDashboard(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    void loadDashboard();
  }, [hasUnitContext, loadDashboard]);

  useEffect(() => {
    if (!hasUnitContext || typeof navigation.addListener !== 'function') {
      return undefined;
    }

    const unsubscribe = navigation.addListener('focus', () => {
      void loadDashboard('refresh');
    });

    return unsubscribe;
  }, [hasUnitContext, loadDashboard, navigation]);

  const allocation = dashboard?.allocation ?? null;
  const summary = dashboard?.summary ?? null;
  const unitName = productionUnitName || allocation?.production_unit_name || t('productionUnitsUnknownUnit');
  const unitContext = hasUnitContext
    ? {
        cycleId,
        cycleUnitAllocationId: resolvedCycleUnitAllocationId,
        productionUnitId,
        productionUnitName: unitName,
        currentFishCount: allocation?.current_fish_count,
        currentBiomassKg: allocation?.current_biomass_kg ?? undefined,
      }
    : undefined;

  const refreshAfterHarvest = useCallback(() => {
    void loadDashboard('refresh');
    void dispatch(fetchProductionCycles());
    void dispatch(fetchDashboardData({ cycleId }));
  }, [cycleId, dispatch, loadDashboard]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: unitName });
  }, [navigation, unitName]);

  const metricCards = useMemo(
    () => [
      {
        label: t('currentFish'),
        value: summary ? formatCount(summary.estimated_current_fish_count, locale) : '-',
        subtitle: undefined,
      },
      {
        label: t('productionUnitCumulativeMortality'),
        value: summary ? formatCount(summary.total_mortality_count, locale) : '-',
        subtitle: undefined,
      },
      {
        label: t('productionUnitConsumedFeed'),
        value:
          summary && coerceNumber(summary.total_feed_consumed_kg) !== null
            ? formatKg(coerceNumber(summary.total_feed_consumed_kg) ?? 0, locale)
            : '-',
        subtitle:
          summary?.latest_average_weight_g !== null &&
          summary?.latest_average_weight_g !== undefined
            ? `${t('averageWeight')}: ${new Intl.NumberFormat(locale, {
                maximumFractionDigits: 1,
              }).format(coerceNumber(summary.latest_average_weight_g) ?? 0)} g`
            : undefined,
      },
      {
        label: t('productionUnitEstimatedBiomass'),
        value:
          summary && coerceNumber(summary.estimated_current_biomass_kg) !== null
            ? formatKg(coerceNumber(summary.estimated_current_biomass_kg) ?? 0, locale)
            : '-',
        subtitle: undefined,
      },
    ],
    [locale, summary, t],
  );

  if (loading && !dashboard) {
    return (
      <Screen style={styles.centered}>
        <LoadingState message={t('productionUnitDashboardLoading')} />
      </Screen>
    );
  }

  if (errorMessage && !dashboard) {
    return (
      <Screen style={styles.centered}>
        <ErrorState
          message={errorMessage}
          actionLabel={hasUnitContext ? t('retry') : undefined}
          onAction={hasUnitContext ? () => void loadDashboard('refresh') : undefined}
        />
      </Screen>
    );
  }

  if (!dashboard || !allocation || !summary) {
    return (
      <Screen style={styles.centered}>
        <EmptyState title={t('noData')} />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      style={styles.content}
      scrollProps={{
        refreshControl: (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadDashboard('refresh')}
            colors={[colors.brand.primary]}
            tintColor={colors.brand.primary}
          />
        ),
      }}
    >
      <Card variant="outlined" style={styles.metricsCard}>
        <AppText variant="cardTitle">{t('productionUnitDashboardTitle')}</AppText>
        <View style={styles.grid}>
          {metricCards.map((card) => (
            <MetricCard
              key={card.label}
              value={card.value}
              label={card.label}
              subtitle={card.subtitle}
            />
          ))}
        </View>
      </Card>

      <QuickActionsPreview
        onOpenSheet={() => setActionsSheetVisible(true)}
        hasActiveCycles
        unreadCount={0}
        navigation={navigation}
        scope="unit"
        productionUnitContext={unitContext}
      />

      {errorMessage ? <InlineAlert tone="error" message={errorMessage} /> : null}

      <QuickActionsSheet
        visible={actionsSheetVisible}
        onClose={() => setActionsSheetVisible(false)}
        unreadCount={0}
        navigation={navigation}
        scope="unit"
        productionUnitContext={unitContext}
        onPartialHarvestUnit={() => setPartialHarvestModalVisible(true)}
        onHarvestUnit={() => setHarvestModalVisible(true)}
      />

      <PartialHarvestModal
        visible={partialHarvestModalVisible}
        onClose={() => setPartialHarvestModalVisible(false)}
        cycle={null}
        scope="unit"
        productionUnitContext={unitContext}
        unitAllocation={allocation}
        onSuccess={refreshAfterHarvest}
      />

      <HarvestModal
        visible={harvestModalVisible}
        onClose={() => setHarvestModalVisible(false)}
        cycle={null}
        scope="unit"
        productionUnitContext={unitContext}
        unitAllocation={allocation}
        onSuccess={refreshAfterHarvest}
        onUnitHarvestSuccess={() => navigation.navigate('MainTabs', { screen: 'Dashboard' })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center' },
  content: { padding: spacing[5], gap: spacing[4] },
  metricsCard: { gap: spacing[3] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
});
