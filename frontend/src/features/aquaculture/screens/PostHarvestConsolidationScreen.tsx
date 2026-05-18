import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { StackScreenProps } from '@react-navigation/stack';
import { AppDispatch, RootState } from '@/store/store';
import { createProductionCycle } from '@/features/aquaculture/store/aquacultureSlice';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AQUACARE_COLORS } from '@/constants/colors';
import { parseApiError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';

type Props = StackScreenProps<RootStackParamList, 'PostHarvestConsolidation'>;

const DEFAULT_INTER_CYCLE_REST_DAYS = 1;

// Densités maximales (poissons/m² ou poissons/m³) pour calcul capacité infra
const MAX_DENSITY_POND_PER_M2 = 10;
const MAX_DENSITY_TANK_PER_M3 = 300;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatKg(val: number): string {
  return val.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

export default function PostHarvestConsolidationScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { harvestedCycleId } = route.params;

  const farmProfile = useSelector((s: RootState) => s.auth.farmProfile);
  const annualSimulation = useSelector((s: RootState) => s.farmSetup.annualSimulation.result);
  const cycles = useSelector((s: RootState) => s.aquaculture.cycles);

  const harvestedCycle = useMemo(
    () => cycles.find((c) => c.id === harvestedCycleId) ?? null,
    [cycles, harvestedCycleId]
  );

  // ── Données de base ──────────────────────────────────────────────────────────
  const species = (harvestedCycle?.species ?? annualSimulation?.species ?? 'tilapia') as string;
  const actualProductionKg = harvestedCycle?.final_biomass
    ? parseFloat(String(harvestedCycle.final_biomass))
    : harvestedCycle?.current_biomass
    ? parseFloat(String(harvestedCycle.current_biomass))
    : 0;
  const plannedPerCycleKg = annualSimulation?.production_per_cycle_kg ?? 0;
  const annualTargetKg =
    annualSimulation?.annual_production_target_kg ??
    farmProfile?.annual_production_target_kg ??
    0;
  const remainingKg = Math.max(0, annualTargetKg - actualProductionKg);

  // Numéro du prochain cycle
  const currentYear = new Date().getFullYear();
  const harvestedThisYear = cycles.filter(
    (c) => c.status === 'harvested' && c.end_date && new Date(c.end_date).getFullYear() === currentYear
  ).length;
  const nextCycleNum = harvestedThisYear + 1;

  // ── Calcul des paramètres recommandés ────────────────────────────────────────
  const actualSurvivalRate = harvestedCycle?.survival_rate
    ? parseFloat(String(harvestedCycle.survival_rate))
    : harvestedCycle?.expected_survival_rate_pct
    ? parseFloat(String(harvestedCycle.expected_survival_rate_pct))
    : 85;

  const harvestWeightKg =
    (harvestedCycle?.target_harvest_weight_g
      ? parseFloat(String(harvestedCycle.target_harvest_weight_g))
      : species === 'clarias' ? 400 : 350) / 1000;

  // Capacité max infra
  const infraType = Array.isArray(harvestedCycle?.infrastructure_type)
    ? harvestedCycle!.infrastructure_type[0]
    : undefined;
  const isPond = !infraType || infraType === 'etang';
  const surfaceM2 = harvestedCycle?.pond_surface_m2
    ? parseFloat(String(harvestedCycle.pond_surface_m2))
    : 0;
  const volumeM3 = harvestedCycle?.pond_volume_m3
    ? parseFloat(String(harvestedCycle.pond_volume_m3))
    : 0;
  const infraCapacityMax = isPond
    ? Math.round(surfaceM2 * MAX_DENSITY_POND_PER_M2)
    : Math.round(volumeM3 * MAX_DENSITY_TANK_PER_M3);

  const recommendedFingerlings = useMemo(() => {
    if (!remainingKg || !harvestWeightKg || !actualSurvivalRate) return 0;
    const needed = Math.ceil(remainingKg / harvestWeightKg / (actualSurvivalRate / 100));
    return infraCapacityMax > 0 ? Math.min(needed, infraCapacityMax) : needed;
  }, [remainingKg, harvestWeightKg, actualSurvivalRate, infraCapacityMax]);

  const restDays = DEFAULT_INTER_CYCLE_REST_DAYS;
  const defaultStartDate = harvestedCycle?.end_date
    ? addDays(harvestedCycle.end_date, restDays)
    : new Date().toISOString().split('T')[0];

  // ── État du formulaire ───────────────────────────────────────────────────────
  const [fingerlings, setFingerlings] = useState(String(recommendedFingerlings));
  const [survivalRate, setSurvivalRate] = useState(String(Math.round(actualSurvivalRate)));
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [sellingPrice, setSellingPrice] = useState(
    String(harvestedCycle?.planned_selling_price_per_kg_fcfa ?? '')
  );
  const [launching, setLaunching] = useState(false);

  // ── Barre de progression ─────────────────────────────────────────────────────
  const progressPct = annualTargetKg > 0 ? Math.min(100, (actualProductionKg / annualTargetKg) * 100) : 0;
  const isOnTarget = actualProductionKg >= plannedPerCycleKg * 0.9;
  const gapBadgeColor = isOnTarget ? AQUACARE_COLORS.SUCCESS : AQUACARE_COLORS.WARNING;

  // ── Lancer le cycle suivant ──────────────────────────────────────────────────
  const handleLaunch = useCallback(async () => {
    if (!harvestedCycle || !farmProfile) return;
    const count = parseInt(fingerlings, 10);
    const survival = parseFloat(survivalRate);
    if (!count || count <= 0) {
      Alert.alert(t('error'), t('finalCountRequired'));
      return;
    }
    setLaunching(true);
    try {
      await dispatch(
        createProductionCycle({
          cycle_name: undefined,
          species: species as 'tilapia' | 'clarias',
          pond_identifier: harvestedCycle.pond_identifier,
          pond_surface_m2: surfaceM2 || undefined,
          pond_volume_m3: volumeM3 || undefined,
          infrastructure_type: harvestedCycle.infrastructure_type,
          start_date: startDate,
          initial_count: count,
          initial_average_weight: undefined,
          target_harvest_weight_g: harvestedCycle.target_harvest_weight_g
            ? parseFloat(String(harvestedCycle.target_harvest_weight_g))
            : undefined,
          expected_survival_rate_pct: survival || undefined,
          planned_selling_price_per_kg_fcfa: sellingPrice
            ? parseFloat(sellingPrice)
            : harvestedCycle.planned_selling_price_per_kg_fcfa
            ? parseFloat(String(harvestedCycle.planned_selling_price_per_kg_fcfa))
            : undefined,
          fingerlings_cost_fcfa: harvestedCycle.fingerlings_cost_fcfa
            ? parseFloat(String(harvestedCycle.fingerlings_cost_fcfa))
            : undefined,
          other_operational_costs_fcfa: harvestedCycle.other_operational_costs_fcfa
            ? parseFloat(String(harvestedCycle.other_operational_costs_fcfa))
            : undefined,
        })
      ).unwrap();
      navigation.navigate('MainTabs');
    } catch (err: unknown) {
      Alert.alert(
        t('error'),
        formatAquacultureErrorWithAction(parseApiError(err), t)
      );
    } finally {
      setLaunching(false);
    }
  }, [
    harvestedCycle, farmProfile, fingerlings, survivalRate, startDate, sellingPrice,
    species, nextCycleNum, surfaceM2, volumeM3, dispatch, navigation, t,
  ]);

  if (!harvestedCycle) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={AQUACARE_COLORS.GREEN_PRIMARY} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Section 1 : Bilan cycle récolté ───────────────────────────────── */}
      <View style={styles.billingCard}>
        <Text style={styles.sectionTitle}>
          {t('consolidationCycle1Results', { num: harvestedThisYear })}
        </Text>

        <View style={styles.comparisonRow}>
          <View style={styles.comparisonItem}>
            <Text style={styles.comparisonLabel}>{t('consolidationPlanned')}</Text>
            <Text style={styles.comparisonValueNeutral}>
              {plannedPerCycleKg > 0 ? `${formatKg(plannedPerCycleKg)} kg` : '—'}
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={20} color={AQUACARE_COLORS.GRAY_LIGHT} />
          <View style={styles.comparisonItem}>
            <Text style={styles.comparisonLabel}>{t('consolidationActual')}</Text>
            <Text style={[styles.comparisonValueActual, { color: gapBadgeColor }]}>
              {formatKg(actualProductionKg)} kg
            </Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          {harvestedCycle.survival_rate != null && (
            <View style={styles.metricChip}>
              <Ionicons name="fish" size={16} color={AQUACARE_COLORS.GREEN_PRIMARY} />
              <Text style={styles.metricChipText}>
                {parseFloat(String(harvestedCycle.survival_rate)).toFixed(1)}% survie
              </Text>
            </View>
          )}
          {harvestedCycle.fcr != null && (
            <View style={styles.metricChip}>
              <Ionicons name="leaf" size={16} color={AQUACARE_COLORS.GREEN_PRIMARY} />
              <Text style={styles.metricChipText}>
                FCR {parseFloat(String(harvestedCycle.fcr)).toFixed(2)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Section 2 : Progression annuelle ──────────────────────────────── */}
      <View style={styles.progressCard}>
        <Text style={styles.sectionTitle}>{t('consolidationAnnualProgress')}</Text>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
        </View>
        <Text style={styles.progressLabel}>
          {formatKg(actualProductionKg)} / {formatKg(annualTargetKg)} kg
          {' '}({progressPct.toFixed(0)}%)
        </Text>

        <View style={styles.remainingBadge}>
          <Ionicons name="flag-outline" size={16} color={AQUACARE_COLORS.GREEN_DARK} />
          <Text style={styles.remainingText}>
            {t('consolidationRemainingTarget', { kg: formatKg(remainingKg) })}
          </Text>
        </View>
      </View>

      {/* ── Section 3 : Paramètres ajustés cycle suivant ──────────────────── */}
      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>
          {t('consolidationAdjustedParams', { num: nextCycleNum })}
        </Text>

        {/* Repos inter-cycle */}
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={16} color={AQUACARE_COLORS.GRAY_LIGHT} />
          <Text style={styles.infoText}>
            {t('consolidationInterCycleRest', { days: restDays })}
          </Text>
        </View>

        {/* Alevins */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('consolidationFingerlingsLabel')}</Text>
          <Text style={styles.inputHint}>{t('consolidationRecommendedFingerlings')}</Text>
          <TextInput
            style={styles.textInput}
            value={fingerlings}
            onChangeText={setFingerlings}
            keyboardType="numeric"
          />
        </View>

        {/* Taux de survie */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('consolidationSurvivalLabel')}</Text>
          <Text style={styles.inputHint}>
            {t('consolidationSurvivalAdjusted', { pct: Math.round(actualSurvivalRate) })}
          </Text>
          <TextInput
            style={styles.textInput}
            value={survivalRate}
            onChangeText={setSurvivalRate}
            keyboardType="numeric"
          />
        </View>

        {/* Date de départ */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('consolidationStartDateLabel')}</Text>
          <TextInput
            style={styles.textInput}
            value={startDate}
            onChangeText={setStartDate}
            placeholder={t('dateFormatPlaceholder')}
          />
        </View>

        {/* Prix de vente */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>{t('consolidationSellingPriceLabel')}</Text>
          <TextInput
            style={styles.textInput}
            value={sellingPrice}
            onChangeText={setSellingPrice}
            keyboardType="numeric"
          />
        </View>

        {/* Infra en lecture seule */}
        <View style={styles.readonlyRow}>
          <Text style={styles.readonlyLabel}>{t('infrastructureType')}</Text>
          <Text style={styles.readonlyValue}>
            {harvestedCycle.pond_identifier}
            {surfaceM2 > 0 ? ` · ${surfaceM2} m²` : ''}
            {volumeM3 > 0 ? ` · ${volumeM3} m³` : ''}
          </Text>
        </View>
      </View>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.launchButton, launching && styles.buttonDisabled]}
        onPress={handleLaunch}
        disabled={launching}
        activeOpacity={0.8}
      >
        {launching ? (
          <ActivityIndicator color={AQUACARE_COLORS.WHITE} />
        ) : (
          <>
            <Text style={styles.launchButtonText}>
              {t('consolidationStartNextCycle', { num: nextCycleNum })}
            </Text>
            <Ionicons name="arrow-forward" size={20} color={AQUACARE_COLORS.WHITE} />
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.skipButton}
        onPress={() => navigation.navigate('MainTabs')}
        disabled={launching}
      >
        <Text style={styles.skipButtonText}>{t('consolidationSkip')}</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AQUACARE_COLORS.CREAM,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Cards
  billingCard: {
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  progressCard: {
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  formCard: {
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: AQUACARE_COLORS.GRAY_DARK,
    marginBottom: 12,
  },

  // Comparison row
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  comparisonItem: {
    alignItems: 'center',
  },
  comparisonLabel: {
    fontSize: 12,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    marginBottom: 4,
  },
  comparisonValueNeutral: {
    fontSize: 18,
    fontWeight: '700',
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  comparisonValueActual: {
    fontSize: 18,
    fontWeight: '700',
  },

  // Metrics chips
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  metricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AQUACARE_COLORS.WHITE,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  metricChipText: {
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_DARK,
    fontWeight: '500',
  },

  // Progress
  progressBar: {
    height: 10,
    backgroundColor: '#e2e8f0',
    borderRadius: 5,
    marginBottom: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
    borderRadius: 5,
  },
  progressLabel: {
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    marginBottom: 10,
  },
  remainingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ecfdf5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  remainingText: {
    fontSize: 14,
    fontWeight: '600',
    color: AQUACARE_COLORS.GREEN_DARK,
  },

  // Info row
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  infoText: {
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    fontStyle: 'italic',
  },

  // Form
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: AQUACARE_COLORS.GRAY_DARK,
    marginBottom: 2,
  },
  inputHint: {
    fontSize: 12,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: AQUACARE_COLORS.WHITE,
    color: AQUACARE_COLORS.GRAY_DARK,
  },
  readonlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: AQUACARE_COLORS.CREAM,
    marginTop: 4,
  },
  readonlyLabel: {
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_LIGHT,
  },
  readonlyValue: {
    fontSize: 13,
    color: AQUACARE_COLORS.GRAY_DARK,
    fontWeight: '500',
  },

  // Buttons
  launchButton: {
    flexDirection: 'row',
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  launchButtonText: {
    color: AQUACARE_COLORS.WHITE,
    fontSize: 17,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipButtonText: {
    fontSize: 14,
    color: AQUACARE_COLORS.GRAY_LIGHT,
    textDecorationLine: 'underline',
  },
});
