import { Ionicons } from '@expo/vector-icons';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';

import {
  DashboardHeroCard,
  DashboardMetricCard,
  DashboardSection,
  EmptyState,
  ErrorState,
  formatDashboardCurrency,
  formatDashboardNumber,
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
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AppDispatch } from '@/store/store';
import { colors, spacing } from '@/theme';
import type { ProductionUnitDashboard } from '@/types/aquaculture';
import { useDashboardSyncStatus } from '@/hooks/useDashboardSyncStatus';

type NavigationProp = StackNavigationProp<
  RootStackParamList,
  'ProductionUnitOverview'
>;
type RouteType = RouteProp<RootStackParamList, 'ProductionUnitOverview'>;

interface Props {
  navigation: NavigationProp;
  route: RouteType;
}

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
  const { lastSyncedAt, refreshLastSyncedAt } = useDashboardSyncStatus('unit');

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
        await refreshLastSyncedAt();
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
    [hasUnitContext, refreshLastSyncedAt, resolvedCycleUnitAllocationId],
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
      <DashboardSection
        title={t('productionUnitDashboardTitle')}
        lastSyncedAt={lastSyncedAt}
      >
        <DashboardHeroCard
          icon="cash-outline"
          label={t('productionUnitEstimatedMarketValue')}
          value={formatDashboardCurrency(summary.estimated_market_value_fcfa, locale)}
          unit={t('dashboardDirectProductionCostUnit')}
          helper={
            summary.estimated_market_value_fcfa == null
              ? coerceNumber(summary.estimated_current_biomass_kg) === null
                ? t('dashboardAddWeighing')
                : t('dashboardMissingSellingPrice')
              : t('productionUnitMarketValueHelper')
          }
          unavailableLabel={t('dashboardCalculationUnavailable')}
        />
        <View style={styles.grid}>
          <DashboardMetricCard
            icon="scale-outline"
            label={t('productionUnitEstimatedBiomass')}
            value={formatDashboardNumber(summary.estimated_current_biomass_kg, locale, { maximumFractionDigits: 1 })}
            unit={t('kg')}
            tone="success"
            helper={coerceNumber(summary.estimated_current_biomass_kg) === null ? t('dashboardAddWeighing') : undefined}
            unavailableLabel={t('dashboardDataUnavailable')}
          />
          <DashboardMetricCard
            icon="fish-outline"
            label={t('currentFish')}
            value={formatDashboardNumber(summary.estimated_current_fish_count, locale, { maximumFractionDigits: 0 })}
            unavailableLabel={t('dashboardDataUnavailable')}
          />
          <DashboardMetricCard
            icon="remove-circle-outline"
            label={t('productionUnitCumulativeMortality')}
            value={formatDashboardNumber(summary.total_mortality_count, locale, { maximumFractionDigits: 0 })}
            tone={summary.total_mortality_count === 0 ? 'success' : 'warning'}
            helper={summary.total_mortality_count === 0
              ? t('productionUnitNoMortality')
              : t('productionUnitMortalityRecorded', { count: summary.total_mortality_count })}
            unavailableLabel={t('dashboardDataUnavailable')}
          />
          <DashboardMetricCard
            icon="nutrition-outline"
            label={t('productionUnitConsumedFeed')}
            value={formatDashboardNumber(summary.total_feed_consumed_kg, locale, { maximumFractionDigits: 1 })}
            unit={t('kg')}
            tone="info"
            unavailableLabel={t('dashboardDataUnavailable')}
          />
        </View>
      </DashboardSection>

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
  content: { padding: spacing[5], gap: spacing[4], backgroundColor: colors.surface.dashboard },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
});
