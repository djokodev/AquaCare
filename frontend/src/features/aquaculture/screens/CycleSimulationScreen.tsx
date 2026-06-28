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
  completeFarmSetup,
} from '@/features/aquaculture/store/farmSetupSlice';
import { createProductionCycle } from '@/features/aquaculture/store/aquacultureSlice';
import { setFarmProfile } from '@/features/auth/store/authSlice';
import type { CycleSimulationResult } from '@/features/aquaculture/types/farmSetup';
import {
  buildCycleSimulationInput,
  buildFarmSetupPayload,
  getHarvestCapacityPerCycle,
  getSimulationSpecies,
  getSpeciesHarvestWeightDefault,
  getStockingDensityPreview,
  getTotalCapacityPreview,
} from '@/features/aquaculture/utils/farmSetupForm';
import {
  getProductionUnitsCompatibilitySummary,
  normalizeProductionUnitType,
} from '@/features/aquaculture/utils/productionUnits';
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
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const formData = route.params.formData;

  const { result: cycleSimulationResult, loading: simLoading } = useSelector(
    (s: RootState) => s.farmSetup.cycleSimulation
  );
  const [launching, setLaunching] = useState(false);
  const [currentResult, setCurrentResult] = useState<CycleSimulationResult | null>(
    cycleSimulationResult
  );
  const productionUnitSummary = useMemo(
    () => getProductionUnitsCompatibilitySummary(formData.productionUnits ?? []),
    [formData.productionUnits]
  );

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

  const stockingDensityCheck = useMemo(() => getStockingDensityPreview(formData), [formData]);
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
      const farmProfile = await dispatch(
        completeFarmSetup(buildFarmSetupPayload(formData))
      ).unwrap();
      dispatch(setFarmProfile(farmProfile));

      const firstCycle = currentResult.cycles_breakdown[0];
      if (!firstCycle) {
        throw new Error('AUTH_UNKNOWN_ERROR');
      }

      // Compatibility bridge: the setup UI is now production-unit based,
      // while the current simulation and cycle creation flow still expect
      // legacy homogeneous fields. PR #59 will make the simulation unit-aware.
      const legacyUnit = productionUnitSummary?.primary_unit;
      const legacyUnitType = legacyUnit ? normalizeProductionUnitType(legacyUnit.unit_type) : null;
      const speciesForCycle = getSimulationSpecies(formData.species);
      const fingerlingsCost = currentResult.cycle_fingerlings_cost_fcfa ?? firstCycle.fingerlings_cost_fcfa;
      const otherCosts = currentResult.cycle_other_costs_fcfa ?? 0;

      await dispatch(
        createProductionCycle({
          species: speciesForCycle,
          cycle_name: undefined,
          pond_identifier: legacyUnit?.name?.trim() || t('simulationDefaultPondIdentifier'),
          pond_surface_m2:
            legacyUnitType === 'pond'
              ? legacyUnit?.surface_m2
                ? parseFloat(legacyUnit.surface_m2)
                : undefined
              : formData.unitSurface
                ? parseFloat(formData.unitSurface)
                : undefined,
          pond_volume_m3:
            legacyUnitType && legacyUnitType !== 'pond'
              ? legacyUnit?.volume_m3
                ? parseFloat(legacyUnit.volume_m3)
                : undefined
              : formData.unitVolume
                ? parseFloat(formData.unitVolume)
                : undefined,
          initial_count: firstCycle.initial_fish_count,
          initial_average_weight: undefined,
          start_date: firstCycle.start_date_estimate,
          target_harvest_weight_g: formData.harvestWeight
            ? parseFloat(formData.harvestWeight)
            : harvestWeightDefault,
          planned_cycle_duration_days: firstCycle.duration_days,
          expected_survival_rate_pct: formData.survivalRate
            ? parseFloat(formData.survivalRate)
            : undefined,
          planned_selling_price_per_kg_fcfa: formData.sellingPrice
            ? parseFloat(formData.sellingPrice)
            : undefined,
          fingerlings_cost_fcfa: fingerlingsCost,
          other_operational_costs_fcfa: otherCosts,
          planned_feed_bags: firstCycle.feed_bags_total || currentResult.feed_bags_per_cycle || undefined,
        })
      ).unwrap();

      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
    } catch (err: unknown) {
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
        <MetricRow
          label={t('simulationCurrentDensity')}
          value={
            stockingDensityCheck
              ? `${stockingDensityCheck.density.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/${stockingDensityCheck.unit}`
              : '—'
          }
        />
        <MetricRow
          label={t('simulationMaxDensity')}
          value={
            stockingDensityCheck
              ? `${stockingDensityCheck.max}/${stockingDensityCheck.unit}`
              : '—'
          }
        />
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
