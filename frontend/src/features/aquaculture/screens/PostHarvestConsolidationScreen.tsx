import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  StyleSheet,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { StackScreenProps } from '@react-navigation/stack';
import { AppDispatch, RootState } from '@/store/store';
import { createProductionCycle } from '@/features/aquaculture/store/aquacultureSlice';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { parseApiError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';
import { AppHeader, AppText, Badge, Button, Card, InlineAlert, LoadingState, Screen, TextField } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { getBusinessIsoDate } from '@/utils/businessDate';

type Props = StackScreenProps<RootStackParamList, 'PostHarvestConsolidation'>;

const DEFAULT_INTER_CYCLE_REST_DAYS = 1;

// Densités maximales (poissons/m² ou poissons/m³) pour calcul capacité infra
const MAX_DENSITY_POND_PER_M2 = 10;
const MAX_DENSITY_TANK_PER_M3 = 300;

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return getBusinessIsoDate(d);
}

function formatKg(val: number): string {
  return val.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

export default function PostHarvestConsolidationScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { harvestedCycleId } = route.params;

  const farmProfile = useSelector((s: RootState) => s.auth.farmProfile);
  const cycleSimulation = useSelector((s: RootState) => s.farmSetup.cycleSimulation.result);
  const cycles = useSelector((s: RootState) => s.aquaculture.cycles);

  const harvestedCycle = useMemo(
    () => cycles.find((c) => c.id === harvestedCycleId) ?? null,
    [cycles, harvestedCycleId]
  );

  // ── Données de base ──────────────────────────────────────────────────────────
  const species = (harvestedCycle?.species ?? cycleSimulation?.species ?? 'tilapia') as string;
  const actualProductionKg = harvestedCycle?.final_biomass
    ? parseFloat(String(harvestedCycle.final_biomass))
    : harvestedCycle?.current_biomass
    ? parseFloat(String(harvestedCycle.current_biomass))
    : 0;
  const plannedPerCycleKg = cycleSimulation?.production_per_cycle_kg ?? 0;
  const annualTargetKg =
    cycleSimulation?.annual_production_target_kg ??
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
    : getBusinessIsoDate();

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
  const gapBadgeTone = isOnTarget ? 'success' : 'warning';

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
    return <View style={styles.root}><AppHeader title={t('consolidationTitle')} onBack={() => navigation.goBack()} backLabel={t('back')} /><Screen style={styles.loading}><LoadingState /></Screen></View>;
  }

  return (
    <View style={styles.root}>
      <AppHeader title={t('consolidationTitle')} onBack={() => navigation.goBack()} backLabel={t('back')} />
      <Screen scroll style={styles.content}>

      {/* ── Section 1 : Bilan cycle récolté ───────────────────────────────── */}
      <Card variant="outlined" style={[styles.billingCard, { backgroundColor: colors.status.successSurface }]}>
        <AppText variant="cardTitle">
          {t('consolidationCycle1Results', { num: harvestedThisYear })}
        </AppText>

        <View style={styles.comparisonRow}>
          <View style={styles.comparisonItem}>
            <AppText variant="helper" color="muted">{t('consolidationPlanned')}</AppText>
            <AppText variant="cardTitle">
              {plannedPerCycleKg > 0 ? `${formatKg(plannedPerCycleKg)} kg` : '—'}
            </AppText>
          </View>
          <Ionicons name="arrow-forward" size={20} color={colors.text.muted} />
          <View style={styles.comparisonItem}>
            <AppText variant="helper" color="muted">{t('consolidationActual')}</AppText>
            <AppText variant="cardTitle" color={isOnTarget ? 'success' : 'warning'}>
              {formatKg(actualProductionKg)} kg
            </AppText>
          </View>
        </View>

        <View style={styles.metricsRow}>
          {harvestedCycle.survival_rate != null && (
            <Badge label={`${parseFloat(String(harvestedCycle.survival_rate)).toFixed(1)}% ${t('consolidationSurvivalLabel')}`} tone="brand" />
          )}
          {harvestedCycle.fcr != null && (
            <Badge label={`FCR ${parseFloat(String(harvestedCycle.fcr)).toFixed(2)}`} tone="brand" />
          )}
        </View>
      </Card>

      {/* ── Section 2 : Progression annuelle ──────────────────────────────── */}
      <Card variant="outlined" style={styles.progressCard}>
        <AppText variant="cardTitle">{t('consolidationAnnualProgress')}</AppText>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
        </View>
        <AppText variant="helper" color="muted">
          {formatKg(actualProductionKg)} / {formatKg(annualTargetKg)} kg
          {' '}({progressPct.toFixed(0)}%)
        </AppText>

        <View style={styles.remainingBadge}>
          <Ionicons name="flag-outline" size={16} color={colors.text.link} />
          <AppText variant="helper" color="link">
            {t('consolidationRemainingTarget', { kg: formatKg(remainingKg) })}
          </AppText>
        </View>
      </Card>

      {/* ── Section 3 : Paramètres ajustés cycle suivant ──────────────────── */}
      <Card style={styles.formCard}>
        <AppText variant="cardTitle">
          {t('consolidationAdjustedParams', { num: nextCycleNum })}
        </AppText>

        {/* Repos inter-cycle */}
        <View style={styles.infoRow}>
          <Ionicons name="time-outline" size={16} color={colors.text.muted} />
          <AppText variant="helper" color="muted">
            {t('consolidationInterCycleRest', { days: restDays })}
          </AppText>
        </View>

        {/* Alevins */}
        <View style={styles.inputGroup}>
          <TextField
            label={t('consolidationFingerlingsLabel')}
            hint={t('consolidationRecommendedFingerlings')}
            value={fingerlings}
            onChangeText={setFingerlings}
            keyboardType="numeric"
          />
        </View>

        {/* Taux de survie */}
        <View style={styles.inputGroup}>
          <TextField
            label={t('consolidationSurvivalLabel')}
            hint={t('consolidationSurvivalAdjusted', { pct: Math.round(actualSurvivalRate) })}
            value={survivalRate}
            onChangeText={setSurvivalRate}
            keyboardType="numeric"
          />
        </View>

        {/* Date de départ */}
        <View style={styles.inputGroup}>
          <TextField
            label={t('consolidationStartDateLabel')}
            value={startDate}
            onChangeText={setStartDate}
            placeholder={t('dateFormatPlaceholder')}
          />
        </View>

        {/* Prix de vente */}
        <View style={styles.inputGroup}>
          <TextField
            label={t('consolidationSellingPriceLabel')}
            value={sellingPrice}
            onChangeText={setSellingPrice}
            keyboardType="numeric"
          />
        </View>

        {/* Infra en lecture seule */}
        <View style={styles.readonlyRow}>
          <AppText variant="helper" color="muted">{t('infrastructureType')}</AppText>
          <AppText variant="label">
            {harvestedCycle.pond_identifier}
            {surfaceM2 > 0 ? ` · ${surfaceM2} m²` : ''}
            {volumeM3 > 0 ? ` · ${volumeM3} m³` : ''}
          </AppText>
        </View>
      </Card>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <Button
        label={t('consolidationStartNextCycle', { num: nextCycleNum })}
        onPress={handleLaunch}
        disabled={launching}
        loading={launching}
        iconRight="arrow-forward"
      />

      <Button
        variant="ghost"
        label={t('consolidationSkip')}
        onPress={() => navigation.navigate('MainTabs')}
        disabled={launching}
      />

      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.page },
  loading: { justifyContent: 'center' },
  content: { gap: spacing[3], paddingTop: spacing[4], paddingBottom: spacing[6] },
  billingCard: { gap: spacing[3] },
  progressCard: { gap: spacing[2] },
  formCard: { gap: spacing[2] },
  comparisonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  comparisonItem: { alignItems: 'center', gap: spacing[1] },
  metricsRow: { flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' },
  progressBar: { height: 10, backgroundColor: colors.surface.disabled, borderRadius: radii.full, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.brand.primary, borderRadius: radii.full },
  remainingBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], backgroundColor: colors.surface.selected, borderRadius: radii.md, padding: spacing[2] },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  inputGroup: { marginBottom: spacing[1] },
  readonlyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing[3], paddingTop: spacing[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border.subtle },
});
