/**
 * AnnualSimulationScreen — Écran de simulation annuelle de production
 *
 * Affiche la rentabilité prévisionnelle calculée par le backend à partir
 * des données du formulaire CreateFarmScreen. L'utilisateur choisit le nombre
 * de cycles (2 ou 3), puis lance son premier cycle de production.
 */
import React, { useState, useEffect } from 'react';
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
  runAnnualSimulation,
  completeFarmSetup,
} from '@/features/aquaculture/store/farmSetupSlice';
import { createProductionCycle } from '@/features/aquaculture/store/aquacultureSlice';
import { setFarmProfile } from '@/features/auth/store/authSlice';
import type { AnnualSimulationResult } from '@/features/aquaculture/types/farmSetup';
import {
  buildAnnualSimulationInput,
  buildFarmSetupPayload,
  getHarvestCapacityPerCycle,
  getSimulationSpecies,
  getSpeciesHarvestWeightDefault,
} from '@/features/aquaculture/utils/farmSetupForm';
import { parseApiError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';

type NavigationProp = StackNavigationProp<RootStackParamList, 'AnnualSimulation'>;
type RouteType = RouteProp<RootStackParamList, 'AnnualSimulation'>;

interface Props {
  navigation: NavigationProp;
  route: RouteType;
}

function formatFCFA(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(Math.round(amount)) + ' FCFA';
}

function formatKg(kg: number): string {
  return new Intl.NumberFormat('fr-FR').format(Math.round(kg)) + ' kg';
}

export default function AnnualSimulationScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const formData = route.params.formData;

  const { result: simulationResult, loading: simLoading } = useSelector(
    (s: RootState) => s.farmSetup.annualSimulation
  );
  const selectedCycles = 2 as const;
  const [launching, setLaunching] = useState(false);
  const [currentResult, setCurrentResult] = useState<AnnualSimulationResult | null>(
    simulationResult
  );

  // Charger la simulation initiale
  useEffect(() => {
    recalculate(selectedCycles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function recalculate(numCycles: 2 | 3) {
    const res = await dispatch(runAnnualSimulation(buildAnnualSimulationInput(formData, numCycles)));
    if (runAnnualSimulation.fulfilled.match(res)) {
      setCurrentResult(res.payload);
    }
  }

  async function handleLaunchFirstCycle() {
    if (!currentResult) return;
    setLaunching(true);

    try {
      // 1. Sauvegarder la configuration farm
      const farmProfile = await dispatch(completeFarmSetup(buildFarmSetupPayload(formData, selectedCycles))).unwrap();
      dispatch(setFarmProfile(farmProfile));

      // 2. Créer le premier cycle à partir des données de simulation
      const firstCycle = currentResult.cycles_breakdown[0];
      if (!firstCycle) {
        throw new Error('AUTH_UNKNOWN_ERROR');
      }
      const speciesForCycle = getSimulationSpecies(formData.species);
      const harvestWeightDefault = getSpeciesHarvestWeightDefault(formData.species);

      await dispatch(
        createProductionCycle({
          species: speciesForCycle,
          cycle_name: undefined,
          pond_identifier: t('simulationDefaultPondIdentifier'),
          pond_surface_m2: formData.unitSurface ? parseFloat(formData.unitSurface) : undefined,
          pond_volume_m3: formData.unitVolume ? parseFloat(formData.unitVolume) : undefined,
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
          fingerlings_cost_fcfa: firstCycle.fingerlings_cost_fcfa,
          other_operational_costs_fcfa: formData.otherCosts
            ? parseFloat(formData.otherCosts) / selectedCycles
            : 0,
          planned_feed_bags: firstCycle.feed_bags_total || currentResult.feed_bags_per_cycle || undefined,
        })
      ).unwrap();

      // 3. Aller sur le dashboard
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
        <TouchableOpacity onPress={() => recalculate(selectedCycles)}>
          <Text style={styles.retryLink}>{t('retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const productionPerCycle = currentResult.production_per_cycle_kg;
  const cycleDuration = currentResult.cycle_duration_days;

  // Capacité physique maximale par cycle (null = pas de données infra)
  const capacityWarning = getHarvestCapacityPerCycle(formData);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="analytics-outline" size={32} color={AQUACARE_COLORS.GREEN_PRIMARY} />
        <Text style={styles.title}>{t('simulationTitle')}</Text>
        <Text style={styles.subtitle}>{t('simulationSubtitle')}</Text>
      </View>

      {/* Carte résumé annuel */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('simulationAnnualSummary')}</Text>
        <MetricRow
          label={t('simulationProductionTarget')}
          value={formatKg(currentResult.annual_production_target_kg)}
          highlight
        />
        <MetricRow
          label={t('simulationRevenue')}
          value={formatFCFA(currentResult.annual_revenue_fcfa)}
        />
        <MetricRow
          label={t('simulationFeedCost')}
          value={`- ${formatFCFA(currentResult.annual_feed_cost_fcfa)}`}
          negative
        />
        {currentResult.annual_fingerlings_cost_fcfa > 0 && (
          <MetricRow
            label={t('simulationFingerlingsCost')}
            value={`- ${formatFCFA(currentResult.annual_fingerlings_cost_fcfa)}`}
            negative
          />
        )}
        {currentResult.annual_other_costs_fcfa > 0 && (
          <MetricRow
            label={t('simulationOtherCosts')}
            value={`- ${formatFCFA(currentResult.annual_other_costs_fcfa)}`}
            negative
          />
        )}
        <View style={styles.separator} />
        <MetricRow
          label={t('simulationNetProfit')}
          value={formatFCFA(currentResult.annual_net_profit_fcfa)}
          highlight
          large
        />
        <MetricRow
          label={t('simulationROI')}
          value={`${currentResult.annual_roi_pct > 0 ? '+' : ''}${currentResult.annual_roi_pct.toFixed(1)} %`}
          highlight
        />
      </View>

      {/* Carte frais AquaCare */}
      <View style={[styles.card, styles.aquacareCard]}>
        <Text style={styles.cardTitle}>{t('simulationAquacareFeeTitle')}</Text>
        <Text style={styles.aquacareFeeText}>
          {t('simulationAquacareFeePhrase')}
          <Text style={styles.aquacareFeeRate}>{t('simulationAquacareFeeRate')}</Text>
          {t('simulationAquacareFeePhrase2')}
          <Text style={styles.aquacareFeeAmount}>{formatFCFA(currentResult.aquacare_fee_fcfa)}</Text>
          {' '}{t('simulationAquacareFeePhrase3')}
        </Text>
      </View>

      {/* Rythme de production — 2 cycles fixes */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('simulationRythmTitle')}</Text>
        <View style={styles.cycleFixedBadge}>
          <Text style={styles.cycleFixedText}>
            {t('simulationCycles2Fixed', {
              kg: Math.round(currentResult.annual_production_target_kg / 2),
            })}
          </Text>
        </View>
        {capacityWarning !== null &&
          currentResult.annual_production_target_kg / 2 > capacityWarning && (
          <Text style={styles.cycleWarningText}>
            {t('simulationCapacityWarning', { max: Math.round(capacityWarning) })}
          </Text>
        )}
      </View>

      {/* Détail par cycle */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('simulationCycleDetail')}</Text>
        <MetricRow
          label={t('simulationFeedBags')}
          value={t('myFeedSacks', { count: currentResult.feed_bags_per_cycle })}
        />
        <MetricRow
          label={t('simulationFeedCostPerCycle')}
          value={formatFCFA(currentResult.annual_feed_cost_fcfa / selectedCycles)}
        />
        <MetricRow
          label={t('simulationDuration')}
          value={t('simulationDays', { days: cycleDuration })}
        />
      </View>

      {/* Boutons */}
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

// ── Sub-components ───────────────────────────────────────────────────────────

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

// ── Styles ───────────────────────────────────────────────────────────────────

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
  aquacareCard: {
    borderLeftWidth: 4,
    borderLeftColor: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  aquacareFeeText: {
    fontSize: 14,
    color: AQUACARE_COLORS.GRAY_DARK,
    lineHeight: 22,
  },
  aquacareFeeRate: {
    fontSize: 15,
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    fontWeight: '700',
  },
  aquacareFeeAmount: {
    fontSize: 15,
    color: AQUACARE_COLORS.GREEN_PRIMARY,
    fontWeight: '700',
  },
  cycleWarningText: {
    fontSize: 12,
    color: AQUACARE_COLORS.WARNING,
    marginTop: 2,
  },
  cycleFixedBadge: {
    backgroundColor: '#ecfdf5',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
    borderLeftColor: AQUACARE_COLORS.GREEN_PRIMARY,
  },
  cycleFixedText: {
    fontSize: 14,
    color: AQUACARE_COLORS.GREEN_DARK,
    fontWeight: '600',
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
