/**
 * CycleSimulationScreen — Écran de simulation cycle-first
 *
 * Le contenu utilisateur met désormais le cycle à lancer au centre, tout en
 * conservant les champs API legacy nécessaires à la compatibilité.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';

import { AQUACARE_COLORS } from '@/constants/colors';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AppDispatch, RootState } from '@/store/store';
import {
  runCycleSimulation,
} from '@/features/aquaculture/store/farmSetupSlice';
import { addCreatedProductionCycle } from '@/features/aquaculture/store/aquacultureSlice';
import { setFarmProfile } from '@/features/auth/store/authSlice';
import type { CycleSimulationResult } from '@/features/aquaculture/types/farmSetup';
import {
  buildCycleSimulationInput,
  getHarvestCapacityPerCycle,
  getSpeciesHarvestWeightDefault,
  getStockingDensityPreview,
  getTotalCapacityPreview,
} from '@/features/aquaculture/utils/farmSetupForm';
import {
  getProductionUnitsDensityPreview,
  validateProductionUnitFishAllocations,
} from '@/features/aquaculture/utils/productionUnits';
import {
  FirstCycleLaunchError,
  launchFirstCycle,
} from '@/features/aquaculture/services/firstCycleLaunchService';
import { parseApiError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';

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
  const [launching, setLaunching] = useState(false);
  const [currentResult, setCurrentResult] = useState<CycleSimulationResult | null>(
    cycleSimulationResult
  );
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
  const productionUnitAllocationById = useMemo(
    () =>
      new Map(
        (formData.productionUnitAllocations ?? []).map((allocation) => [
          allocation.production_unit_local_id,
          allocation.fish_count,
        ] as const)
      ),
    [formData.productionUnitAllocations]
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
  const harvestCapacityPerCycle = useMemo(() => getHarvestCapacityPerCycle(formData), [formData]);
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
    setLaunching(true);

    try {
      const launchResult = await launchFirstCycle({
        formData,
        simulationResult: currentResult,
        defaultPondIdentifier: t('simulationDefaultPondIdentifier'),
      });
      dispatch(addCreatedProductionCycle(launchResult.productionCycle));
      dispatch(setFarmProfile(launchResult.farmProfile));

      if (launchResult.productionUnits.length > 0) {
        navigation.reset({
          index: 1,
          routes: [
            { name: 'MainTabs' },
            {
              name: 'ProductionUnitsHub',
              params: { cycleId: launchResult.productionCycle.id },
            },
          ],
        });
        return;
      }

      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } catch (err: unknown) {
      if (err instanceof FirstCycleLaunchError) {
        Alert.alert(t('error'), t(err.translationKey));
        return;
      }

      Alert.alert(t('error'), formatAquacultureErrorWithAction(parseApiError(err), t));
    } finally {
      setLaunching(false);
    }
  }

  if (simLoading && !currentResult) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={AQUACARE_COLORS.GREEN_PRIMARY} />
        <Text style={styles.loadingText}>{t('simulationLoading')}</Text>
      </View>
    );
  }

  if (!currentResult) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{t('simulationErrorRetry')}</Text>
        <TouchableOpacity onPress={recalculate}>
          <Text style={styles.retryLink}>{t('retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const technicalPauseDays = currentResult.technical_pause_days;
  const cyclesPerYear = currentResult.cycles_per_year_derived;
  const annualProjectionProduction = currentResult.annual_projection_production_kg;
  const annualProjectionRevenue = currentResult.annual_projection_revenue_fcfa;
  const annualProjectionNetProfit = currentResult.annual_projection_net_profit_fcfa;
  const annualProjectionAquacareFee = currentResult.annual_projection_aquacare_fee_fcfa;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Ionicons name="analytics-outline" size={32} color={AQUACARE_COLORS.GREEN_PRIMARY} />
        <Text style={styles.title}>{t('simulationSubtitle')}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('simulationCycleSummaryTitle')}</Text>
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
        <View style={styles.separator} />
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
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('simulationCycleTechnicalTitle')}</Text>
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
              <Text style={styles.hintText}>{t('simulationDensityByUnitNote')}</Text>
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
          label={t('simulationCycleDuration')}
          value={t('simulationDays', { days: currentResult.cycle_duration_days })}
        />
        <MetricRow
          label={t('simulationFeedBags')}
          value={t('myFeedSacks', { count: currentResult.feed_bags_per_cycle })}
        />
        {harvestCapacityPerCycle !== null && (
          <Text style={styles.hintText}>
            {t('simulationHarvestCapacityHint', {
              kg: formatKgValue(harvestCapacityPerCycle),
            })}
          </Text>
        )}
      </View>

      {formData.productionUnitAllocations?.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('simulationAllocationByUnitTitle')}</Text>
          <Text style={styles.hintText}>{t('simulationAllocationByUnitDescription')}</Text>
          {productionUnitAllocationsPreview?.global_error && (
            <Text style={styles.allocationErrorText}>
              {t(productionUnitAllocationsPreview.global_error)}
            </Text>
          )}
          <View style={styles.allocationSummaryList}>
            {formData.productionUnits.map((unit, index) => {
              const status = productionUnitAllocationsPreview?.unit_statuses[index];
              const rawAllocation = productionUnitAllocationById.get(unit.local_id);
              const parsedAllocation =
                status?.fish_count ?? (rawAllocation && rawAllocation.trim() ? Number(rawAllocation) : null);
              const densityLabel =
                status?.density !== null && status?.density !== undefined && status.density_unit
                  ? `${formatDensity(status.density)} ${t(
                      status.density_unit === 'm2'
                        ? 'productionUnitDensityFingerlingsPerSquareMeter'
                        : 'productionUnitDensityFingerlingsPerCubicMeter'
                    )}`
                  : null;
              const allocationLabel =
                parsedAllocation !== null && Number.isFinite(parsedAllocation)
                  ? `${parsedAllocation} ${t('productionUnitFingerlingsUnit')}`
                  : `— ${t('productionUnitFingerlingsUnit')}`;
              const productionLabel =
                status?.estimated_production_kg !== null && status?.estimated_production_kg !== undefined
                  ? ` · ${formatKgValue(status.estimated_production_kg)} kg`
                  : '';

              return (
                <View key={unit.local_id} style={styles.allocationSummaryRow}>
                  <Text style={styles.allocationSummaryLabel}>{unit.name}</Text>
                  <Text style={styles.allocationSummaryValue}>
                    {allocationLabel}
                    {densityLabel ? ` · ${densityLabel}` : ''}
                    {productionLabel}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('simulationAnnualProjectionTitle')}</Text>
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
      </View>

      <Text style={styles.hintText}>
        {t('simulationOtherCostsInfo')}
      </Text>

      <TouchableOpacity
        style={styles.modifyBtn}
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}
      >
        <Text style={styles.modifyBtnText}>{t('simulationModifyBtn')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.launchBtn, launching && styles.launchBtnDisabled]}
        onPress={handleLaunchFirstCycle}
        disabled={launching}
        activeOpacity={0.8}
      >
        {launching ? (
          <ActivityIndicator color={AQUACARE_COLORS.WHITE} />
        ) : (
          <Text style={styles.launchBtnText}>{t('simulationLaunchBtn')}</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 48 }} />
    </ScrollView>
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
      <Text style={metricStyles.label}>{label}</Text>
      <Text
        style={[
          metricStyles.value,
          highlight && metricStyles.valueHighlight,
          negative && metricStyles.valueNegative,
          large && metricStyles.valueLarge,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const metricStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 12,
  },
  label: {
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    flex: 1,
    flexWrap: 'wrap',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: AQUACARE_COLORS.GRAY_DARK,
    textAlign: 'right',
    maxWidth: '55%',
  },
  valueHighlight: {
    color: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  valueNegative: {
    color: AQUACARE_COLORS.ERROR,
  },
  valueLarge: {
    fontSize: 17,
    fontWeight: '700',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AQUACARE_COLORS.CREAM,
  },
  content: {
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    backgroundColor: AQUACARE_COLORS.CREAM,
  },
  loadingText: {
    color: AQUACARE_COLORS.GRAY_LIGHT,
    fontSize: 15,
  },
  errorText: {
    color: AQUACARE_COLORS.GRAY_LIGHT,
    fontSize: 15,
  },
  retryLink: {
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    fontSize: 15,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: AQUACARE_COLORS.GRAY_DARK,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    textAlign: 'center',
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: AQUACARE_COLORS.GRAY_DARK,
    marginBottom: 12,
  },
  separator: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 8,
  },
  hintText: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: AQUACARE_COLORS.GRAY_LIGHT,
  },
  allocationErrorText: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: AQUACARE_COLORS.ERROR,
    fontWeight: '600',
  },
  allocationSummaryList: {
    gap: 10,
    marginTop: 12,
  },
  allocationSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  allocationSummaryLabel: {
    flex: 1,
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_DARK,
    fontWeight: '600',
  },
  allocationSummaryValue: {
    flex: 1,
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    textAlign: 'right',
  },
  modifyBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  modifyBtnText: {
    color: AQUACARE_COLORS.GRAY_LIGHT,
    fontSize: 15,
    fontWeight: '500',
  },
  launchBtn: {
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  launchBtnDisabled: {
    opacity: 0.6,
  },
  launchBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
