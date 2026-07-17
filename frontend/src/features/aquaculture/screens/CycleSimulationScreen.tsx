/**
 * CycleSimulationScreen — Écran de simulation cycle-first
 *
 * Le contenu utilisateur met désormais le cycle à lancer au centre, tout en
 * conservant les champs API legacy nécessaires à la compatibilité.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';

import {
  AppText,
  Button,
  Card,
  Divider,
  ErrorState,
  InlineAlert,
  LoadingState,
  Screen,
} from '@/components/ui';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AppDispatch, RootState } from '@/store/store';
import {
  runCycleSimulation,
} from '@/features/aquaculture/store/farmSetupSlice';
import {
  addCreatedProductionCycle,
  fetchDashboardData,
  setCurrentCycle,
} from '@/features/aquaculture/store/aquacultureSlice';
import { setFarmProfile } from '@/features/auth/store/authSlice';
import type { CycleSimulationResult } from '@/features/aquaculture/types/farmSetup';
import {
  buildCycleSimulationInput,
  getSpeciesHarvestWeightDefault,
  getStockingDensityPreview,
  getTotalCapacityPreview,
} from '@/features/aquaculture/utils/farmSetupForm';
import {
  getProductionUnitsDensityPreview,
  validateProductionUnitFishAllocations,
} from '@/features/aquaculture/utils/productionUnits';
import { groupProductionUnitAllocationSummaries } from '@/features/aquaculture/utils/allocationSummary';
import {
  FirstCycleLaunchError,
  launchFirstCycle,
} from '@/features/aquaculture/services/firstCycleLaunchService';
import { parseApiError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';
import { spacing } from '@/theme';

type NavigationProp = StackNavigationProp<RootStackParamList, 'CycleSimulation'>;
type RouteType = RouteProp<RootStackParamList, 'CycleSimulation'>;

interface Props {
  navigation: NavigationProp;
  route: RouteType;
}

function formatFCFA(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(amount))} FCFA`;
}

function formatKg(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(amount)} kg`;
}

function formatKgValue(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(amount);
}

function formatPercent(amount: number): string {
  return `${amount > 0 ? '+' : ''}${amount.toFixed(1)} %`;
}

function formatLocalDate(value: string, locale: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

export default function CycleSimulationScreen({ navigation, route }: Props) {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const formData = route.params.formData;
  const densityLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const formatDensity = (value: number): string =>
    new Intl.NumberFormat(densityLocale, { maximumFractionDigits: 2 }).format(value);

  const { result: cycleSimulationResult, loading: simLoading } = useSelector(
    (s: RootState) => s.farmSetup.cycleSimulation
  );
  const aquacultureState = useSelector((s: RootState) => s.aquaculture);
  const farmSetupCompleted = useSelector(
    (s: RootState) => s.auth?.farmProfile?.farm_setup_completed === true
  );
  const { currentCycle, dashboardData } = aquacultureState ?? {};
  const [launching, setLaunching] = useState(false);
  const [currentResult, setCurrentResult] = useState<CycleSimulationResult | null>(
    cycleSimulationResult
  );
  const hasExistingCycle = Boolean(currentCycle || (dashboardData?.active_cycles?.length ?? 0) > 0);
  const requiresAdditionalCycleFlow = farmSetupCompleted || hasExistingCycle;
  const launchButtonLabel = requiresAdditionalCycleFlow
    ? t('simulationLaunchAdditionalBtn')
    : t('simulationLaunchBtn');
  const productionUnitsDensityPreview = useMemo(
    () =>
      getProductionUnitsDensityPreview({
        productionUnits: formData.productionUnits ?? [],
        fingerlingsCount: formData.fingerlingsCount,
      }),
    [formData.fingerlingsCount, formData.productionUnits]
  );
  const productionUnitAllocationsPreview = useMemo(
    () =>
      validateProductionUnitFishAllocations({
        productionUnits: formData.productionUnits ?? [],
        allocations: formData.productionUnitAllocations ?? [],
        totalFishCount: formData.fingerlingsCount,
        survivalRatePct: formData.survivalRate,
        targetWeightG: formData.harvestWeight,
      }),
    [
      formData.fingerlingsCount,
      formData.harvestWeight,
      formData.productionUnitAllocations,
      formData.productionUnits,
      formData.survivalRate,
    ]
  );
  const productionUnitAllocationGroups = useMemo(
    () =>
      groupProductionUnitAllocationSummaries(
        formData.productionUnits ?? [],
        productionUnitAllocationsPreview?.unit_statuses ?? []
      ),
    [formData.productionUnits, productionUnitAllocationsPreview?.unit_statuses]
  );
  const hasProductionUnitAllocations = (formData.productionUnitAllocations ?? []).length > 0;

  useEffect(() => {
    recalculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function recalculate() {
    const res = await dispatch(runCycleSimulation(buildCycleSimulationInput(formData)));
    if (runCycleSimulation.fulfilled.match(res)) {
      setCurrentResult(res.payload);
    }
  }

  const legacyStockingDensityCheck = useMemo(() => getStockingDensityPreview(formData), [formData]);
  const totalCapacity = useMemo(() => getTotalCapacityPreview(formData), [formData]);
  const harvestWeightDefault = getSpeciesHarvestWeightDefault(formData.species);
  const speciesLabel = t(
    formData.species === 'clarias' ? 'speciesClarias' : 'speciesTilapia'
  );
  const survivalRateLabel = formData.survivalRate || '95';
  const fingerlingsCountLabel = formData.fingerlingsCount || '0';

  const cycleProductionKg =
    currentResult?.cycle_production_kg ?? currentResult?.production_per_cycle_kg ?? 0;
  const cycleRevenue = currentResult?.cycle_revenue_fcfa ?? 0;
  const cycleFeedCost = currentResult?.cycle_feed_cost_fcfa ?? 0;
  const cycleFingerlingsCost = currentResult?.cycle_fingerlings_cost_fcfa ?? 0;
  const cycleOtherCosts = currentResult?.cycle_other_costs_fcfa ?? 0;
  const cycleAquacareFee = currentResult?.cycle_aquacare_fee_fcfa ?? currentResult?.aquacare_fee_fcfa ?? 0;
  const cycleTotalCost = currentResult?.cycle_total_cost_fcfa ?? 0;
  const cycleNetProfit = currentResult?.cycle_net_profit_fcfa ?? currentResult?.annual_net_profit_fcfa ?? 0;
  const cycleRoi = currentResult?.cycle_roi_pct ?? currentResult?.annual_roi_pct ?? 0;
  const totalCapacityLabel = formData.productionUnits?.length
    ? totalCapacity
      ? `${totalCapacity} ${t('productionUnitFingerlingsUnit')}`
      : '—'
    : totalCapacity ?? '—';

  async function handleLaunchFirstCycle() {
    if (!currentResult) return;

    const continueToAdditionalCycle = () => navigation.replace('NewCycle');
    const showAdditionalCycleRedirect = () => {
      Alert.alert(
        t('additionalCycleRequiredTitle'),
        t('additionalCycleRequiredMessage'),
        [
          { text: t('cancel'), style: 'cancel' },
          { text: t('additionalCycleContinue'), onPress: continueToAdditionalCycle },
        ]
      );
    };

    if (requiresAdditionalCycleFlow) {
      showAdditionalCycleRedirect();
      return;
    }

    setLaunching(true);

    try {
      const launchResult = await launchFirstCycle({
        formData,
        simulationResult: currentResult,
        defaultPondIdentifier: t('simulationDefaultPondIdentifier'),
      });
      dispatch(addCreatedProductionCycle(launchResult.productionCycle));
      dispatch(setFarmProfile(launchResult.farmProfile));
      await dispatch(fetchDashboardData({ forceAllCycles: true })).unwrap();
      dispatch(setCurrentCycle(launchResult.productionCycle));

      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'MainTabs',
            params: { screen: 'Dashboard' },
          },
        ],
      });
    } catch (err: unknown) {
      if (err instanceof FirstCycleLaunchError) {
        Alert.alert(t('error'), t(err.translationKey));
        return;
      }

      const parsedError = parseApiError(err);
      if (parsedError.code === 'cycle_launch_mode_conflict') {
        showAdditionalCycleRedirect();
        return;
      }

      Alert.alert(t('error'), formatAquacultureErrorWithAction(parsedError, t));
    } finally {
      setLaunching(false);
    }
  }

  if (simLoading && !currentResult) {
    return (
      <Screen style={styles.centered}>
        <LoadingState message={t('simulationLoading')} />
      </Screen>
    );
  }

  if (!currentResult) {
    return (
      <Screen style={styles.centered}>
        <ErrorState
          message={t('simulationErrorRetry')}
          actionLabel={t('retry')}
          onAction={() => void recalculate()}
        />
      </Screen>
    );
  }

  const technicalPauseDays = currentResult.technical_pause_days;
  const cyclesPerYear = currentResult.cycles_per_year_derived;
  const annualProjectionProduction = currentResult.annual_projection_production_kg;
  const annualProjectionRevenue = currentResult.annual_projection_revenue_fcfa;
  const annualProjectionNetProfit = currentResult.annual_projection_net_profit_fcfa;
  const annualProjectionAquacareFee = currentResult.annual_projection_aquacare_fee_fcfa;

  return (
    <Screen scroll style={styles.content}>
      <View style={styles.header}>
        <AppText variant="cardTitle" style={styles.title}>{t('simulationSubtitle')}</AppText>
      </View>

      <Card variant="elevated" style={styles.card}>
        <AppText variant="bodyStrong">{t('simulationCycleSummaryTitle')}</AppText>
        <MetricRow label={t('simulationCycleProduction')} value={formatKg(cycleProductionKg)} highlight />
        <MetricRow label={t('simulationCycleRevenue')} value={formatFCFA(cycleRevenue)} />
        <MetricRow
          label={t('simulationCycleFeedCost')}
          value={`- ${formatFCFA(cycleFeedCost)}`}
          negative
        />
        <MetricRow
          label={t('simulationCycleFingerlingsCost')}
          value={`- ${formatFCFA(cycleFingerlingsCost)}`}
          negative
        />
        <MetricRow
          label={t('simulationCycleOtherCosts')}
          value={`- ${formatFCFA(cycleOtherCosts)}`}
          negative
        />
        <MetricRow
          label={t('simulationCycleAquacareFee')}
          value={`- ${formatFCFA(cycleAquacareFee)}`}
          negative
        />
        <Divider />
        <MetricRow
          label={t('simulationCycleTotalCost')}
          value={formatFCFA(cycleTotalCost)}
        />
        <MetricRow
          label={t('simulationCycleNetProfit')}
          value={formatFCFA(cycleNetProfit)}
          highlight
          large
        />
        <MetricRow
          label={t('simulationCycleROI')}
          value={formatPercent(cycleRoi)}
          highlight
        />
      </Card>

      <Card variant="elevated" style={styles.card}>
        <AppText variant="bodyStrong">{t('simulationCycleTechnicalTitle')}</AppText>
        <MetricRow label={t('simulationSpecies')} value={speciesLabel} />
        <MetricRow label={t('simulationFingerlingsCount')} value={fingerlingsCountLabel} />
        <MetricRow
          label={t('simulationTotalCapacity')}
          value={totalCapacityLabel}
        />
        {productionUnitsDensityPreview?.kind === 'single' ? (
          productionUnitsDensityPreview.isAtMax ? (
            <MetricRow
              label={t('simulationDensity')}
              value={`${formatDensity(productionUnitsDensityPreview.maxDensity)} ${t(
                productionUnitsDensityPreview.unit === 'm2'
                  ? 'productionUnitDensityFingerlingsPerSquareMeter'
                  : 'productionUnitDensityFingerlingsPerCubicMeter'
              )}`}
            />
          ) : (
            <>
              <MetricRow
                label={t('simulationCurrentDensity')}
                value={`${formatDensity(productionUnitsDensityPreview.currentDensity)} ${t(
                  productionUnitsDensityPreview.unit === 'm2'
                    ? 'productionUnitDensityFingerlingsPerSquareMeter'
                    : 'productionUnitDensityFingerlingsPerCubicMeter'
                )}`}
              />
              <MetricRow
                label={t('simulationMaxDensity')}
                value={`${formatDensity(productionUnitsDensityPreview.maxDensity)} ${t(
                  productionUnitsDensityPreview.unit === 'm2'
                    ? 'productionUnitDensityFingerlingsPerSquareMeter'
                    : 'productionUnitDensityFingerlingsPerCubicMeter'
                )}`}
              />
            </>
          )
        ) : productionUnitsDensityPreview?.kind === 'mixed' ? (
          <>
            <MetricRow
              label={t('simulationDensity')}
              value={
                hasProductionUnitAllocations
                  ? t('simulationDensitySeeUnitDetails')
                  : t('simulationDensityToBeAllocated')
              }
            />
            {!hasProductionUnitAllocations ? (
              <AppText variant="helper" color="muted">{t('simulationDensityByUnitNote')}</AppText>
            ) : null}
          </>
        ) : legacyStockingDensityCheck ? (
          <>
            <MetricRow
              label={t('simulationCurrentDensity')}
              value={
                `${legacyStockingDensityCheck.density.toLocaleString(densityLocale, { maximumFractionDigits: 1 })}/${legacyStockingDensityCheck.unit}`
              }
            />
            <MetricRow
              label={t('simulationMaxDensity')}
              value={
                `${legacyStockingDensityCheck.max}/${legacyStockingDensityCheck.unit}`
              }
            />
          </>
        ) : null}
        <MetricRow
          label={t('simulationSurvivalRate')}
          value={`${survivalRateLabel} %`}
        />
        <MetricRow
          label={t('simulationTargetWeight')}
          value={`${formData.harvestWeight || harvestWeightDefault} g`}
        />
        <MetricRow
          label={t('simulationPlannedDuration')}
          value={t('simulationDays', { days: currentResult.cycle_duration_days })}
        />
        <MetricRow
          label={t('simulationEstimatedHarvestDate')}
          value={currentResult.cycles_breakdown[0]?.end_date_estimate
            ? formatLocalDate(currentResult.cycles_breakdown[0].end_date_estimate, densityLocale)
            : '—'}
        />
        <MetricRow
          label={t('simulationFeedBags')}
          value={t('myFeedSacks', { count: currentResult.feed_bags_per_cycle })}
        />
      </Card>

      {formData.productionUnitAllocations?.length ? (
        <Card variant="elevated" style={styles.card}>
          <AppText variant="bodyStrong">{t('simulationAllocationByUnitTitle')}</AppText>
          {productionUnitAllocationsPreview?.global_error && (
            <InlineAlert
              tone="error"
              message={t(productionUnitAllocationsPreview.global_error)}
            />
          )}
          <View style={styles.allocationSummaryList}>
            {productionUnitAllocationGroups.map((group, index) => {
              const densityLabel =
                group.density !== null && group.densityUnit
                  ? `${formatDensity(group.density)} ${t(
                      group.densityUnit === 'm2'
                        ? 'productionUnitDensityFingerlingsPerSquareMeter'
                        : 'productionUnitDensityFingerlingsPerCubicMeter'
                    )}`
                  : '—';
              const allocationLabel = group.fishCount !== null
                ? `${new Intl.NumberFormat(densityLocale).format(group.fishCount)} ${t('productionUnitFingerlingsUnit')}`
                : `— ${t('productionUnitFingerlingsUnit')}`;
              const productionLabel = group.estimatedProductionKg !== null
                ? `${formatKgValue(group.estimatedProductionKg)} kg`
                : '—';

              return (
                <View key={group.unitNames.join('|')} style={styles.allocationGroup}>
                  {index > 0 ? <Divider /> : null}
                  <AppText variant="label">{group.unitNames.join(' → ')}</AppText>
                  <MetricRow label={t('simulationFingerlingsCount')} value={allocationLabel} />
                  <MetricRow label={t('simulationDensity')} value={densityLabel} />
                  <MetricRow label={t('simulationCycleProduction')} value={productionLabel} />
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}

      <Card variant="elevated" style={styles.card}>
        <AppText variant="bodyStrong">{t('simulationAnnualProjectionTitle')}</AppText>
        <MetricRow
          label={t('simulationCyclesPerYear')}
          value={cyclesPerYear.toString()}
        />
        <MetricRow
          label={t('simulationTechnicalPause')}
          value={t('simulationDays', { days: technicalPauseDays })}
        />
        <MetricRow
          label={t('simulationAnnualProjectionProduction')}
          value={formatKg(annualProjectionProduction)}
        />
        <MetricRow
          label={t('simulationAnnualProjectionRevenue')}
          value={formatFCFA(annualProjectionRevenue)}
        />
        <MetricRow
          label={t('simulationAnnualProjectionNetProfit')}
          value={formatFCFA(annualProjectionNetProfit)}
          highlight
        />
        <MetricRow
          label={t('simulationAnnualProjectionAquacareFee')}
          value={formatFCFA(annualProjectionAquacareFee)}
        />
      </Card>

      <InlineAlert tone="info" message={t('simulationOtherCostsInfo')} compact />

      <Button
        label={t('simulationModifyBtn')}
        onPress={() => navigation.goBack()}
        variant="ghost"
      />

      <Button
        label={launchButtonLabel}
        onPress={handleLaunchFirstCycle}
        loading={launching}
      />
    </Screen>
  );
}

function MetricRow({
  label,
  value,
  highlight,
  negative,
  large,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  negative?: boolean;
  large?: boolean;
}) {
  return (
    <View style={metricStyles.row}>
      <AppText variant="helper" color="muted" style={metricStyles.label}>{label}</AppText>
      <AppText
        variant={large ? 'bodyStrong' : 'label'}
        color={negative ? 'error' : highlight ? 'link' : 'primary'}
        style={metricStyles.value}
      >
        {value}
      </AppText>
    </View>
  );
}

const metricStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing[1], gap: spacing[3] },
  label: { flex: 1, flexWrap: 'wrap' },
  value: { textAlign: 'right', maxWidth: '55%' },
});

const styles = StyleSheet.create({
  centered: { justifyContent: 'center' },
  content: { padding: spacing[4], gap: spacing[3] },
  header: { alignItems: 'center', paddingVertical: spacing[3] },
  title: { textAlign: 'center' },
  card: { gap: spacing[2] },
  allocationSummaryList: { gap: spacing[2], marginTop: spacing[2] },
  allocationGroup: { gap: spacing[1] },
});
