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
import { AppHeader, AppText, Button, Card, InlineAlert, LoadingState, SegmentedControl, TextField } from '@/components/ui';
import { colors, spacing } from '@/theme';

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
        <View className="flex-row items-center mb-3 gap-3">
          <View className="w-10 h-10 bg-cream rounded-full items-center justify-center">
            <Ionicons name="fast-food" size={20} color={colors.brand.primary} />
          </View>
          <View className="flex-1">
            <AppText className="text-sm font-bold text-gray-dark">{getPhaseLabel(phase.phase_name)}</AppText>
            <AppText className="text-xs text-gray-light">
              {t('days')} {phase.days_range[0]}-{phase.days_range[1]} | {phase.pellet_size_label}mm | {phase.weight_range_g[0]}-{phase.weight_range_g[1]}g
            </AppText>
          </View>
        </View>

        <View className="flex-row bg-cream rounded-lg p-3 mb-3 gap-4">
          <View className="flex-1 items-center">
            <AppText className="text-xs text-gray-light">{t('duration')}</AppText>
            <AppText className="text-sm font-semibold text-gray-dark">{phase.duration_days} {t('days')}</AppText>
          </View>
          <View className="flex-1 items-center">
            <AppText className="text-xs text-gray-light">{t('consumption')}</AppText>
            <AppText className="text-sm font-semibold text-gray-dark">{phase.total_consumption_kg}kg</AppText>
          </View>
          <View className="flex-1 items-center">
            <AppText className="text-xs text-gray-light">{t('dailyAverage')}</AppText>
            <AppText className="text-sm font-semibold text-gray-dark">{phase.daily_avg_kg.toFixed(1)}kg/j</AppText>
          </View>
        </View>

        <View className="flex-row justify-between items-center mb-3">
          <AppText className="text-sm font-semibold text-gray-dark">
            {totalBags} {t(totalBags > 1 ? 'bags' : 'bag')}
          </AppText>
          <AppText className="text-base font-bold text-aquacare-primary">
            {Number(phase.total_price).toLocaleString()} FCFA
          </AppText>
        </View>

        <View className="bg-cream rounded-lg p-3 gap-2 mb-3">
          {phase.products.map((product, pIndex) => (
            <View key={pIndex} className="flex-row justify-between items-center">
              <AppText className="flex-1 text-sm text-gray-dark mr-2" numberOfLines={1}>
                {product.product_name}
              </AppText>
              <AppText className="text-sm font-semibold text-gray-light">
                {product.quantity_bags}x {product.package_weight_kg}kg
              </AppText>
            </View>
          ))}
        </View>

        <Button label={t('addPhaseToCart')} variant="outline" size="small" onPress={() => handleAddPhaseToCart(phase)} />
      </Card>
    );
  };

  return (
    <View className="flex-1 bg-cream">
      <AppHeader title={t('cycleSimulator')} subtitle={t('predictROI')} onBack={() => navigation.goBack()} backLabel={t('back')} />

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <Card style={styles.parametersCard}>
          <AppText className="text-lg font-bold text-gray-dark mb-3">{t('simulationParameters')}</AppText>

          <View className="mb-4">
            <AppText className="text-sm font-semibold text-gray-dark mb-2">{t('species')} *</AppText>
            <SegmentedControl
              value={species}
              onChange={(value) => handleSpeciesChange(value as 'tilapia' | 'catfish')}
              options={[{ value: 'tilapia', label: t('tilapia') }, { value: 'catfish', label: t('catfish') }]}
            />
          </View>

          <View className="mb-4">
            <AppText className="text-sm font-semibold text-gray-dark mb-2">{t('initialFishCount')} *</AppText>
            <TextField
              className="border border-gray-light rounded-lg px-3 py-3 text-base text-gray-dark"
              value={initialFishCount}
              onChangeText={setInitialFishCount}
              keyboardType="numeric"
              placeholder="1000"
            />
          </View>

          <View className="mb-4">
            <AppText className="text-sm font-semibold text-gray-dark mb-2">{t('simulationInitialWeight')} (g)</AppText>
            <TextField
              className="border border-gray-light rounded-lg px-3 py-3 text-base text-gray-dark"
              value={initialWeightG}
              onChangeText={setInitialWeightG}
              keyboardType="numeric"
              placeholder="5"
            />
          </View>

          <View className="mb-4">
            <AppText className="text-sm font-semibold text-gray-dark mb-2">{t('targetWeight')} (g)</AppText>
            <TextField
              className="border border-gray-light rounded-lg px-3 py-3 text-base text-gray-dark"
              value={targetWeightG}
              onChangeText={setTargetWeightG}
              keyboardType="numeric"
              placeholder={species === 'tilapia' ? '300' : '400'}
            />
          </View>

          <View className="mb-4">
            <AppText className="text-sm font-semibold text-gray-dark mb-2">{t('cycleDuration')} ({t('days')})</AppText>
            <TextField
              className="border border-gray-light rounded-lg px-3 py-3 text-base text-gray-dark"
              value={cycleDurationDays}
              onChangeText={setCycleDurationDays}
              keyboardType="numeric"
              placeholder={species === 'tilapia' ? '120' : '150'}
            />
          </View>

          <View className="mb-4">
            <AppText className="text-sm font-semibold text-gray-dark mb-2">{t('survivalRate')} (%)</AppText>
            <TextField
              className="border border-gray-light rounded-lg px-3 py-3 text-base text-gray-dark"
              value={survivalRate}
              onChangeText={setSurvivalRate}
              keyboardType="numeric"
              placeholder="85"
            />
          </View>

          <View className="mb-4">
            <AppText className="text-sm font-semibold text-gray-dark mb-2">{t('preEstimatedSellingPrice')}</AppText>
            <TextField
              className="border border-gray-light rounded-lg px-3 py-3 text-base text-gray-dark"
              value={sellingPricePerKg}
              onChangeText={setSellingPricePerKg}
              keyboardType="numeric"
              placeholder={species === 'tilapia' ? '2500' : '2800'}
            />
          </View>

          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <AppText className="text-sm font-semibold text-gray-dark mb-2">{t('fingerlingsCostFcfa')}</AppText>
              <TextField
                className="border border-gray-light rounded-lg px-3 py-3 text-base text-gray-dark"
                value={fingerlingsCost}
                onChangeText={setFingerlingsCost}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
            <View className="flex-1">
              <AppText className="text-sm font-semibold text-gray-dark mb-2">{t('otherOperationalCosts')}</AppText>
              <TextField
                className="border border-gray-light rounded-lg px-3 py-3 text-base text-gray-dark"
                value={otherCosts}
                onChangeText={setOtherCosts}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
          </View>

          <View className="flex-row gap-3">
            <Button label={t('simulate')} iconLeft="analytics" loading={loading} onPress={handleLaunchSimulation} />
            {simulationResult ? <Button label={t('reset')} variant="outline" fullWidth={false} iconLeft="refresh" onPress={handleReset} /> : null}
          </View>

          {effectiveCycleId && (
            <Button label={t('updateCycleParameters')} variant="outline" loading={savingCycleParams} onPress={handleUpdateCycleParameters} />
          )}
        </Card>

        {error && (
          <View className="bg-white px-4 py-4 mb-2 items-center gap-3">
            <Ionicons name="alert-circle-outline" size={32} color={colors.status.error} />
            <AppText className="text-sm text-center" style={{ color: colors.status.error }}>{error}</AppText>
          </View>
        )}

        {simulationResult && (
          <View className="px-4 py-4">
            <AppText className="text-lg font-bold text-gray-dark mb-3">{t('simulationResults')}</AppText>

            <View className="flex-row flex-wrap gap-3 mb-4">
              <View className="flex-1 min-w-[45%] bg-white rounded-xl p-4 items-center">
                <Ionicons name="scale-outline" size={24} color={colors.brand.primary} />
                <AppText className="text-lg font-bold text-aquacare-primary mt-2">
                  {simulationResult.summary.total_feed_kg.toLocaleString()}kg
                </AppText>
                <AppText className="text-xs text-gray-light mt-1 text-center">{t('totalFeed')}</AppText>
              </View>
              <View className="flex-1 min-w-[45%] bg-white rounded-xl p-4 items-center">
                <Ionicons name="wallet-outline" size={24} color={colors.brand.primary} />
                <AppText className="text-lg font-bold text-aquacare-primary mt-2">
                  {simulationResult.summary.total_cost_fcfa.toLocaleString()}
                </AppText>
                <AppText className="text-xs text-gray-light mt-1 text-center">{t('totalCosts')}</AppText>
              </View>
              <View className="flex-1 min-w-[45%] bg-white rounded-xl p-4 items-center">
                <Ionicons name="trending-up-outline" size={24} color={colors.brand.primary} />
                <AppText className="text-lg font-bold text-aquacare-primary mt-2">
                  {simulationResult.summary.estimated_fcr.toFixed(1)}
                </AppText>
                <AppText className="text-xs text-gray-light mt-1 text-center">{t('estimatedFCR')}</AppText>
              </View>
              <View className="flex-1 min-w-[45%] bg-white rounded-xl p-4 items-center">
                <Ionicons name="heart-outline" size={24} color={colors.brand.primary} />
                <AppText className="text-lg font-bold text-aquacare-primary mt-2">
                  {(simulationResult.summary.survival_rate * 100).toFixed(0)}%
                </AppText>
                <AppText className="text-xs text-gray-light mt-1 text-center">{t('survivalRate')}</AppText>
              </View>
            </View>

            <Card variant="outlined" style={styles.resultCard}>
              <AppText className="text-base font-bold text-gray-dark mb-3">{t('roi')}</AppText>
              <View className="gap-3">
                <View className="flex-row justify-between items-center">
                  <AppText className="text-sm text-gray-light">{t('feedCost')}</AppText>
                  <AppText className="text-sm font-semibold text-gray-dark">
                    {simulationResult.summary.feed_cost_fcfa.toLocaleString()} FCFA
                  </AppText>
                </View>
                <View className="flex-row justify-between items-center">
                  <AppText className="text-sm text-gray-light">{t('fingerlingsCostFcfa')}</AppText>
                  <AppText className="text-sm font-semibold text-gray-dark">
                    {simulationResult.summary.fingerlings_cost_fcfa.toLocaleString()} FCFA
                  </AppText>
                </View>
                <View className="flex-row justify-between items-center">
                  <AppText className="text-sm text-gray-light">{t('otherOperationalCosts')}</AppText>
                  <AppText className="text-sm font-semibold text-gray-dark">
                    {simulationResult.summary.other_costs_fcfa.toLocaleString()} FCFA
                  </AppText>
                </View>
                <View className="flex-row justify-between items-center">
                  <AppText className="text-sm text-gray-light">{t('estimatedRevenue')}</AppText>
                  <AppText className="text-sm font-semibold text-gray-dark">
                    {simulationResult.summary.estimated_revenue_fcfa.toLocaleString()} FCFA
                  </AppText>
                </View>
                <View className="flex-row justify-between items-center">
                  <AppText className="text-sm text-gray-light">{t('estimatedProfit')}</AppText>
                  <AppText className="text-sm font-semibold text-gray-dark">
                    {simulationResult.summary.estimated_profit_fcfa.toLocaleString()} FCFA
                  </AppText>
                </View>
                <View className="flex-row justify-between items-center">
                  <AppText className="text-sm text-gray-light">{t('roiPercentage')}</AppText>
                  <AppText
                    className="text-2xl font-bold"
                    style={{
                      color:
                        simulationResult.summary.roi_percentage > 0
                          ? colors.status.success
                          : colors.status.error,
                    }}
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
                <AppText className="text-sm font-bold text-gray-dark mb-1">{t('buyerNetworkTitle')}</AppText>
                <AppText className="text-xs text-gray-light mb-3">{t('buyerNetworkROINote')}</AppText>
                <Button label={t('buyerNetworkCTA')} size="small" onPress={() => navigation.navigate('Chat')} />
              </View>
            </Card>

            <View className="flex-row items-center mb-3 mt-2 gap-2">
              <Ionicons name="cart-outline" size={20} color={colors.brand.primary} />
              <AppText className="text-base font-bold text-gray-dark">{t('buyFeedSection')}</AppText>
            </View>
            <AppText className="text-xs text-gray-light mb-3">{t('feedingPhases')}</AppText>
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

const styles = StyleSheet.create({
  phaseCard: { marginBottom: spacing[3] },
  parametersCard: { margin: spacing[4], gap: spacing[3] },
  resultCard: { marginBottom: spacing[4] },
  networkCard: { marginBottom: spacing[4], flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
});
