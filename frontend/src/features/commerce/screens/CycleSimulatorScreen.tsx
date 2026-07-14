import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { fetchCycleSimulation, resetSimulation, addToCart, fetchProducts } from '@/features/commerce/store/commerceSlice';
import { CycleSimulationParams } from '@/types/commerce';
import { CYCLE_SIMULATION_DEFAULTS } from '@/domain/commerce/constants';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { aggregatePhasesByName, DisplayPhase } from '../utils/aggregatePhases';
import { AppHeader, AppText, Button, Card, Divider, InlineAlert, LoadingState, SegmentedControl, TextField } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { getProductDisplayName } from '@/features/commerce/utils/productPresentation';
import MetricCard from '@/features/main/components/MetricCard';

type NavigationProp = StackNavigationProp<RootStackParamList>;
type ScreenRouteProp = RouteProp<RootStackParamList, 'CycleSimulator'>;

export default function CycleSimulatorScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();
  const dispatch = useDispatch<AppDispatch>();

  const { simulation, cart, products } = useSelector((state: RootState) => state.commerce);
  const { currentCycle } = useSelector((state: RootState) => state.aquaculture);
  const { result: simulationResult, loading, error } = simulation;

  const prefill = route.params?.prefill;
  const autoLaunchDoneRef = useRef(false);
  const sessionPrefillAppliedRef = useRef(false);

  const sessionCycle = useMemo(
    () => (currentCycle?.status === 'active' ? currentCycle : undefined),
    [currentCycle]
  );

  const effectiveCycleId = sessionCycle?.id;

  const [species, setSpecies] = useState<'tilapia' | 'catfish'>('tilapia');
  const [initialFishCount, setInitialFishCount] = useState('1000');
  const [initialWeightG, setInitialWeightG] = useState(CYCLE_SIMULATION_DEFAULTS.tilapia.initial_weight_g.toString());
  const [targetWeightG, setTargetWeightG] = useState(CYCLE_SIMULATION_DEFAULTS.tilapia.target_weight_g.toString());
  const [cycleDurationDays, setCycleDurationDays] = useState(CYCLE_SIMULATION_DEFAULTS.tilapia.cycle_duration_days.toString());
  const [survivalRate, setSurvivalRate] = useState((CYCLE_SIMULATION_DEFAULTS.tilapia.survival_rate * 100).toString());
  const [sellingPricePerKg, setSellingPricePerKg] = useState(
    CYCLE_SIMULATION_DEFAULTS.tilapia.selling_price_per_kg_fcfa.toString()
  );
  const [fingerlingsCost, setFingerlingsCost] = useState('0');
  const [otherCosts, setOtherCosts] = useState('0');
  const [savingCycleParams, setSavingCycleParams] = useState(false);

  useEffect(() => {
    dispatch(fetchProducts(undefined));
  }, [dispatch]);

  useEffect(() => {
    if (!prefill || autoLaunchDoneRef.current) {
      return;
    }

    setSpecies(prefill.species);
    setInitialFishCount(prefill.initial_fish_count.toString());
    setInitialWeightG(prefill.initial_weight_g.toString());
    setTargetWeightG(prefill.target_weight_g.toString());
    setCycleDurationDays(prefill.cycle_duration_days.toString());
    setSurvivalRate((prefill.survival_rate * 100).toString());
    setSellingPricePerKg(prefill.selling_price_per_kg_fcfa.toString());
    setFingerlingsCost(prefill.fingerlings_cost_fcfa.toString());
    setOtherCosts(prefill.other_costs_fcfa.toString());

    dispatch(fetchCycleSimulation(prefill));
    autoLaunchDoneRef.current = true;
  }, [prefill, dispatch]);

  useEffect(() => {
    if (prefill || sessionPrefillAppliedRef.current || !sessionCycle) {
      return;
    }

    const mappedSpecies = sessionCycle.species === 'clarias' ? 'catfish' : 'tilapia';
    const defaults = CYCLE_SIMULATION_DEFAULTS[mappedSpecies];

    setSpecies(mappedSpecies);
    setInitialFishCount(String(sessionCycle.initial_count || 1000));
    setInitialWeightG(String(sessionCycle.initial_average_weight || defaults.initial_weight_g));
    setTargetWeightG(String(sessionCycle.target_harvest_weight_g || defaults.target_weight_g));
    setCycleDurationDays(
      String(sessionCycle.planned_cycle_duration_days || defaults.cycle_duration_days)
    );
    setSurvivalRate(
      String(
        sessionCycle.expected_survival_rate_pct ||
          Math.round((sessionCycle.survival_rate || defaults.survival_rate) * 100)
      )
    );
    setSellingPricePerKg(
      String(
        sessionCycle.planned_selling_price_per_kg_fcfa || defaults.selling_price_per_kg_fcfa
      )
    );
    setFingerlingsCost(String(sessionCycle.fingerlings_cost_fcfa || 0));
    setOtherCosts(String(sessionCycle.other_operational_costs_fcfa || 0));

    sessionPrefillAppliedRef.current = true;
  }, [prefill, sessionCycle]);

  const handleSpeciesChange = (newSpecies: 'tilapia' | 'catfish') => {
    setSpecies(newSpecies);
    const defaults = CYCLE_SIMULATION_DEFAULTS[newSpecies];
    setInitialWeightG(defaults.initial_weight_g.toString());
    setTargetWeightG(defaults.target_weight_g.toString());
    setCycleDurationDays(defaults.cycle_duration_days.toString());
    setSurvivalRate((defaults.survival_rate * 100).toString());
    setSellingPricePerKg(defaults.selling_price_per_kg_fcfa.toString());
  };

  const parsedValues = useMemo(() => {
    const fishCount = Number.parseInt(initialFishCount, 10);
    const initWeight = Number.parseFloat(initialWeightG);
    const targWeight = Number.parseFloat(targetWeightG);
    const duration = Number.parseInt(cycleDurationDays, 10);
    const survival = Number.parseFloat(survivalRate) / 100;
    const sellingPrice = Number.parseFloat(sellingPricePerKg);
    const fingerlings = Number.parseFloat(fingerlingsCost || '0');
    const other = Number.parseFloat(otherCosts || '0');

    return {
      fishCount,
      initWeight,
      targWeight,
      duration,
      survival,
      sellingPrice,
      fingerlings,
      other,
    };
  }, [
    initialFishCount,
    initialWeightG,
    targetWeightG,
    cycleDurationDays,
    survivalRate,
    sellingPricePerKg,
    fingerlingsCost,
    otherCosts,
  ]);

  const displayPhases = useMemo(
    () => (simulationResult ? aggregatePhasesByName(simulationResult.feeding_phases) : []),
    [simulationResult]
  );

  const isInvalidParams = () => {
    const {
      fishCount,
      initWeight,
      targWeight,
      duration,
      survival,
      sellingPrice,
      fingerlings,
      other,
    } = parsedValues;

    if (!Number.isFinite(fishCount) || fishCount <= 0) return true;
    if (!Number.isFinite(initWeight) || initWeight <= 0) return true;
    if (!Number.isFinite(targWeight) || targWeight <= initWeight) return true;
    if (!Number.isFinite(duration) || duration < 30 || duration > 365) return true;
    if (!Number.isFinite(survival) || survival <= 0 || survival > 1) return true;
    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) return true;
    if (!Number.isFinite(fingerlings) || fingerlings < 0) return true;
    if (!Number.isFinite(other) || other < 0) return true;
    return false;
  };

  const buildSimulationParams = (): CycleSimulationParams => ({
    species,
    initial_fish_count: parsedValues.fishCount,
    initial_weight_g: parsedValues.initWeight,
    target_weight_g: parsedValues.targWeight,
    cycle_duration_days: parsedValues.duration,
    survival_rate: parsedValues.survival,
    selling_price_per_kg_fcfa: parsedValues.sellingPrice,
    fingerlings_cost_fcfa: parsedValues.fingerlings,
    other_costs_fcfa: parsedValues.other,
  });

  const handleLaunchSimulation = () => {
    if (isInvalidParams()) {
      Alert.alert(t('error'), t('invalidSimulationParams'));
      return;
    }

    dispatch(fetchCycleSimulation(buildSimulationParams()));
  };

  const handleReset = () => {
    dispatch(resetSimulation());
    setInitialFishCount('1000');
    setFingerlingsCost('0');
    setOtherCosts('0');
    handleSpeciesChange(species);
  };

  const handleAddAllToCart = () => {
    if (!simulationResult) return;

    let totalProducts = 0;
    simulationResult.feeding_phases.forEach((phase) => {
      phase.products.forEach((simulatedProduct) => {
        const product = products.items.find((entry) => entry.id === simulatedProduct.product_id);
        if (product) {
          dispatch(addToCart({ product, quantity: simulatedProduct.quantity_bags }));
          totalProducts += simulatedProduct.quantity_bags;
        }
      });
    });

    if (totalProducts === 0) {
      Alert.alert(t('warning'), t('simulationProductsNotFound'));
      return;
    }

    Alert.alert(t('success'), t('simulationProductsAdded', { count: totalProducts }), [
      { text: t('viewCart'), onPress: () => navigation.navigate('Cart') },
      { text: t('ok') },
    ]);
  };

  const handleAddPhaseToCart = (phase: DisplayPhase) => {
    let addedCount = 0;

    phase.products.forEach((simulatedProduct) => {
      const product = products.items.find((entry) => entry.id === simulatedProduct.product_id);
      if (product) {
        dispatch(addToCart({ product, quantity: simulatedProduct.quantity_bags }));
        addedCount += simulatedProduct.quantity_bags;
      }
    });

    if (addedCount === 0) {
      Alert.alert(t('warning'), t('simulationProductsNotFound'));
      return;
    }

    Alert.alert(
      t('success'),
      t('simulationPhaseAdded', {
        phase: getPhaseLabel(phase.phase_name),
        count: addedCount,
      }),
      [
        { text: t('viewCart'), onPress: () => navigation.navigate('Cart') },
        { text: t('ok') },
      ]
    );
  };

  const handleUpdateCycleParameters = async () => {
    if (!effectiveCycleId) {
      Alert.alert(t('warning'), t('cycleLinkUnavailable'));
      return;
    }
    if (isInvalidParams()) {
      Alert.alert(t('error'), t('invalidSimulationParams'));
      return;
    }

    setSavingCycleParams(true);
    try {
      await aquacultureService.patchProductionCycle(effectiveCycleId, {
        target_harvest_weight_g: parsedValues.targWeight,
        planned_cycle_duration_days: parsedValues.duration,
        expected_survival_rate_pct: parsedValues.survival * 100,
        planned_selling_price_per_kg_fcfa: parsedValues.sellingPrice,
        fingerlings_cost_fcfa: parsedValues.fingerlings,
        other_operational_costs_fcfa: parsedValues.other,
      });
      Alert.alert(t('success'), t('cycleParametersUpdated'));
    } catch {
      Alert.alert(t('error'), t('cycleParametersUpdateError'));
    } finally {
      setSavingCycleParams(false);
    }
  };

  const getPhaseLabel = (phaseName: string) => {
    const key = `phase.${phaseName}`;
    const translated = t(key);
    if (translated !== key) return translated;
    return phaseName
      .replace(/_/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const renderPhaseCard = (phase: DisplayPhase, index: number) => {
    const totalBags = phase.products.reduce((sum, product) => sum + product.quantity_bags, 0);

    return (
      <Card key={index} variant="outlined" style={styles.phaseCard}>
        <View style={styles.phaseHeading}>
          <View style={styles.phaseIcon}>
            <Ionicons name="fast-food" size={20} color={colors.brand.primary} />
          </View>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{getPhaseLabel(phase.phase_name)}</AppText>
            <AppText variant="caption" color="muted">
              {t('days')} {phase.days_range[0]}-{phase.days_range[1]} | {phase.pellet_size_label}mm | {phase.weight_range_g[0]}-{phase.weight_range_g[1]}g
            </AppText>
          </View>
        </View>

        <Card style={styles.phaseMetrics}>
          <View style={styles.phaseMetric}>
            <AppText variant="caption" color="muted">{t('duration')}</AppText>
            <AppText variant="label">{phase.duration_days} {t('days')}</AppText>
          </View>
          <View style={styles.phaseMetric}>
            <AppText variant="caption" color="muted">{t('consumption')}</AppText>
            <AppText variant="label">{phase.total_consumption_kg} kg</AppText>
          </View>
          <View style={styles.phaseMetric}>
            <AppText variant="caption" color="muted">{t('dailyAverage')}</AppText>
            <AppText variant="label">{phase.daily_avg_kg.toFixed(1)} {t('kgPerDay')}</AppText>
          </View>
        </Card>

        <View style={styles.summaryRow}>
          <AppText variant="label">
            {totalBags} {t(totalBags > 1 ? 'bags' : 'bag')}
          </AppText>
          <AppText variant="cardTitle" color="link">
            {Number(phase.total_price).toLocaleString()} FCFA
          </AppText>
        </View>

        <Card style={styles.productList}>
          {phase.products.map((product, pIndex) => (
            <View key={pIndex} style={styles.summaryRow}>
              <AppText style={styles.flex} numberOfLines={1}>
                {getProductDisplayName(product.product_name, t('catfish'))}
              </AppText>
              <AppText variant="label" color="muted">
                {product.quantity_bags}x {product.package_weight_kg} kg
              </AppText>
            </View>
          ))}
        </Card>

        <Button label={t('addPhaseToCart')} variant="outline" size="small" onPress={() => handleAddPhaseToCart(phase)} />
      </Card>
    );
  };

  return (
    <View className="flex-1 bg-cream">
      <AppHeader title={t('cycleSimulator')} subtitle={t('predictROI')} onBack={() => navigation.goBack()} backLabel={t('back')} />

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <Card variant="outlined" style={styles.parametersCard}>
          <AppText variant="sectionTitle">{t('simulationParameters')}</AppText>

          <View style={styles.fieldGroup}>
            <AppText variant="label">{t('species')} *</AppText>
            <SegmentedControl
              value={species}
              onChange={(value) => handleSpeciesChange(value as 'tilapia' | 'catfish')}
              options={[{ value: 'tilapia', label: t('tilapia') }, { value: 'catfish', label: t('catfish') }]}
            />
          </View>

          <View style={styles.fieldGroup}>
            <TextField
              label={t('initialFishCount')}
              required
              value={initialFishCount}
              onChangeText={setInitialFishCount}
              keyboardType="numeric"
              placeholder="1000"
            />
          </View>

          <View style={styles.fieldGroup}>
            <TextField
              label={`${t('simulationInitialWeight')} (g)`}
              value={initialWeightG}
              onChangeText={setInitialWeightG}
              keyboardType="numeric"
              placeholder="5"
            />
          </View>

          <View style={styles.fieldGroup}>
            <TextField
              label={`${t('targetWeight')} (g)`}
              value={targetWeightG}
              onChangeText={setTargetWeightG}
              keyboardType="numeric"
              placeholder={species === 'tilapia' ? '300' : '400'}
            />
          </View>

          <View style={styles.fieldGroup}>
            <TextField
              label={`${t('cycleDuration')} (${t('days')})`}
              value={cycleDurationDays}
              onChangeText={setCycleDurationDays}
              keyboardType="numeric"
              placeholder={species === 'tilapia' ? '120' : '150'}
            />
          </View>

          <View style={styles.fieldGroup}>
            <TextField
              label={`${t('survivalRate')} (%)`}
              value={survivalRate}
              onChangeText={setSurvivalRate}
              keyboardType="numeric"
              placeholder="85"
            />
          </View>

          <View style={styles.fieldGroup}>
            <TextField
              label={t('preEstimatedSellingPrice')}
              value={sellingPricePerKg}
              onChangeText={setSellingPricePerKg}
              keyboardType="numeric"
              placeholder={species === 'tilapia' ? '2500' : '2800'}
            />
          </View>

          <View style={styles.costFields}>
            <View style={styles.flex}>
              <TextField
                label={t('fingerlingsCostFcfa')}
                value={fingerlingsCost}
                onChangeText={setFingerlingsCost}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
            <View style={styles.flex}>
              <TextField
                label={t('otherOperationalCosts')}
                value={otherCosts}
                onChangeText={setOtherCosts}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
          </View>

          <View style={styles.actionRow}>
            <Button label={t('simulate')} iconLeft="analytics" loading={loading} onPress={handleLaunchSimulation} />
            {simulationResult ? <Button label={t('reset')} variant="outline" fullWidth={false} iconLeft="refresh" onPress={handleReset} /> : null}
          </View>

          {effectiveCycleId && (
            <Button label={t('updateCycleParameters')} variant="outline" loading={savingCycleParams} onPress={handleUpdateCycleParameters} />
          )}
        </Card>

        {error ? <View style={styles.screenAlert}><InlineAlert tone="error" message={error} /></View> : null}

        {simulationResult && (
          <View style={styles.results}>
            <AppText variant="sectionTitle">{t('simulationResults')}</AppText>

            <View style={styles.metricGrid}>
              <MetricCard value={`${simulationResult.summary.total_feed_kg.toLocaleString()} kg`} label={t('totalFeed')} />
              <MetricCard value={`${simulationResult.summary.total_cost_fcfa.toLocaleString()} FCFA`} label={t('totalCosts')} />
              <MetricCard value={simulationResult.summary.estimated_fcr.toFixed(1)} label={t('estimatedFCR')} />
              <MetricCard value={`${(simulationResult.summary.survival_rate * 100).toFixed(0)}%`} label={t('survivalRate')} />
            </View>

            <Card variant="outlined" style={styles.resultCard}>
              <AppText variant="cardTitle">{t('roi')}</AppText>
              <View style={styles.summaryRows}>
                <SummaryRow label={t('feedCost')} value={`${simulationResult.summary.feed_cost_fcfa.toLocaleString()} FCFA`} />
                <SummaryRow label={t('fingerlingsCostFcfa')} value={`${simulationResult.summary.fingerlings_cost_fcfa.toLocaleString()} FCFA`} />
                <SummaryRow label={t('otherOperationalCosts')} value={`${simulationResult.summary.other_costs_fcfa.toLocaleString()} FCFA`} />
                <Divider />
                <SummaryRow label={t('estimatedRevenue')} value={`${simulationResult.summary.estimated_revenue_fcfa.toLocaleString()} FCFA`} />
                <SummaryRow label={t('estimatedProfit')} value={`${simulationResult.summary.estimated_profit_fcfa.toLocaleString()} FCFA`} />
                <View style={styles.summaryRow}>
                  <AppText color="muted">{t('roiPercentage')}</AppText>
                  <AppText
                    variant="metric"
                    color={simulationResult.summary.roi_percentage > 0 ? 'success' : 'error'}
                  >
                    {simulationResult.summary.roi_percentage > 0 ? '+' : ''}
                    {simulationResult.summary.roi_percentage.toFixed(1)}%
                  </AppText>
                </View>
              </View>
            </Card>

            <Card variant="outlined" style={styles.networkCard}>
              <Ionicons name="storefront-outline" size={24} color={colors.brand.primary} style={{ marginTop: 2 }} />
              <View className="flex-1">
                <AppText variant="bodyStrong">{t('buyerNetworkTitle')}</AppText>
                <AppText variant="caption" color="muted">{t('buyerNetworkROINote')}</AppText>
                <Button label={t('buyerNetworkCTA')} size="small" onPress={() => navigation.navigate('Chat')} />
              </View>
            </Card>

            <View style={styles.sectionHeading}>
              <Ionicons name="cart-outline" size={20} color={colors.brand.primary} />
              <AppText variant="cardTitle">{t('buyFeedSection')}</AppText>
            </View>
            <AppText variant="caption" color="muted">{t('feedingPhases')}</AppText>
            {displayPhases.map((phase, index) => renderPhaseCard(phase, index))}

            <Button label={t('addAllToCart')} iconLeft="cart" onPress={handleAddAllToCart} />
          </View>
        )}
      </ScrollView>

      {loading && (
        <View className="absolute inset-0 bg-black/10 items-center justify-center">
          <Card><LoadingState compact message={t('loading')} /></Card>
        </View>
      )}
    </View>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <AppText color="muted">{label}</AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fieldGroup: { gap: spacing[2] },
  costFields: { flexDirection: 'row', gap: spacing[3] },
  actionRow: { flexDirection: 'row', gap: spacing[3] },
  screenAlert: { paddingHorizontal: spacing[4] },
  results: { padding: spacing[4], gap: spacing[4] },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  summaryRows: { gap: spacing[3] },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  phaseCard: { marginBottom: spacing[3], gap: spacing[3] },
  phaseHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  phaseIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface.page },
  phaseMetrics: { flexDirection: 'row', gap: spacing[2] },
  phaseMetric: { flex: 1, alignItems: 'center', gap: spacing[1] },
  productList: { gap: spacing[2] },
  parametersCard: { margin: spacing[4], gap: spacing[3] },
  resultCard: { gap: spacing[3] },
  networkCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
});
