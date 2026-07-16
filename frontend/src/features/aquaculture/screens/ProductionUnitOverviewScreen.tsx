import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';

import {
  DashboardHeroCard,
  DashboardDataNotice,
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
import { dashboardSyncService } from '@/services/dashboardSyncService';

type NavigationProp = StackNavigationProp<
  RootStackParamList,
  'ProductionUnitOverview'
>;
type RouteType = RouteProp<RootStackParamList, 'ProductionUnitOverview'>;

interface Props {
  navigation: NavigationProp;
  route: RouteType;
}

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
  const loadRequestRef = useRef(0);
  const { lastSyncedAt, refreshLastSyncedAt } = useDashboardSyncStatus('unit', resolvedCycleUnitAllocationId);

  const errorMessage = !hasUnitContext
    ? t('productionUnitContextIncompleteError')
    : errorKey
      ? t(errorKey)
      : null;

  const loadDashboard = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      const requestId = loadRequestRef.current + 1;
      loadRequestRef.current = requestId;
      if (!hasUnitContext) {
        if (requestId === loadRequestRef.current) {
          setDashboard(null);
          if (mode === 'refresh') setRefreshing(false);
          else setLoading(false);
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
        if (requestId !== loadRequestRef.current) return;
        setDashboard(result);
        setErrorKey(null);
        await dashboardSyncService.markSuccessful('unit', resolvedCycleUnitAllocationId);
        if (requestId !== loadRequestRef.current) return;
        await refreshLastSyncedAt();
      } catch {
        if (requestId !== loadRequestRef.current) return;
        if (mode === 'initial') {
          setDashboard(null);
        }
        setErrorKey('productionUnitDashboardLoadError');
      } finally {
        if (requestId === loadRequestRef.current) {
          if (mode === 'refresh') setRefreshing(false);
          else setLoading(false);
        }
      }
    },
    [hasUnitContext, refreshLastSyncedAt, resolvedCycleUnitAllocationId],
  );

  useEffect(() => {
    loadRequestRef.current += 1;
    setDashboard(null);
    setErrorKey(null);
    setRefreshing(false);
    if (!hasUnitContext) {
      setLoading(false);
      return;
    }

    setLoading(true);
    void loadDashboard();
  }, [hasUnitContext, loadDashboard, resolvedCycleUnitAllocationId]);

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
  const biomassAvailable = summary?.biomass_data_available === true;
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
          label={t('productionUnitEstimatedMarketValue')}
          value={formatDashboardCurrency(summary.estimated_market_value_fcfa, locale)}
          unit={t('dashboardDirectProductionCostUnit')}
          helper={
            summary.estimated_market_value_fcfa == null
              ? !biomassAvailable
                ? t('dashboardWeighingRequired')
                : t('dashboardMissingSellingPrice')
              : undefined
          }
          unavailableLabel={t('dashboardCalculationUnavailable')}
        />
        <View style={styles.grid}>
          <DashboardMetricCard
            label={t('productionUnitEstimatedBiomass')}
            value={formatDashboardNumber(summary.estimated_current_biomass_kg, locale, { maximumFractionDigits: 1 })}
            unit={t('kg')}
            tone="aqua"
            showUnavailableLabel={false}
            unavailableLabel={t('dashboardDataUnavailable')}
          />
          <DashboardMetricCard
            label={t('currentFish')}
            value={formatDashboardNumber(summary.estimated_current_fish_count, locale, { maximumFractionDigits: 0 })}
            unavailableLabel={t('dashboardDataUnavailable')}
            tone="neutral"
            showUnavailableLabel={false}
          />
          <DashboardMetricCard
            label={t('productionUnitCumulativeMortality')}
            value={formatDashboardNumber(summary.total_mortality_count, locale, { maximumFractionDigits: 0 })}
            tone={summary.total_mortality_count === 0 ? 'slate' : 'attention'}
            unavailableLabel={t('dashboardDataUnavailable')}
            showUnavailableLabel={false}
          />
          <DashboardMetricCard
            label={t('productionUnitConsumedFeed')}
            value={formatDashboardNumber(summary.total_feed_consumed_kg, locale, { maximumFractionDigits: 1 })}
            unit={t('kg')}
            tone="info"
            unavailableLabel={t('dashboardDataUnavailable')}
            showUnavailableLabel={false}
          />
        </View>
        {!biomassAvailable ? (
          <DashboardDataNotice
            title={t('dashboardWeighingRequired')}
            description={t('dashboardWeighingRequiredDescription')}
            actionLabel={t('dashboardAddWeighingAction')}
            onAction={() => navigation.navigate('DailyLog', {
              cycleId,
              cycleUnitAllocationId: resolvedCycleUnitAllocationId,
              productionUnitId,
              productionUnitName: unitName,
            })}
          />
        ) : null}
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
