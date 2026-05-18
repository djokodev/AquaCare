import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { fetchCycleSimulation, resetSimulation, addToCart, fetchProducts } from '@/features/commerce/store/commerceSlice';
import { CycleSimulationParams } from '@/types/commerce';
import { AQUACARE_COLORS } from '@/constants/colors';
import { CYCLE_SIMULATION_DEFAULTS } from '@/domain/commerce/constants';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { aggregatePhasesByName, DisplayPhase } from '../utils/aggregatePhases';

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
      <View key={index} className="bg-white rounded-xl p-4 mb-3">
        <View className="flex-row items-center mb-3 gap-3">
          <View className="w-10 h-10 bg-cream rounded-full items-center justify-center">
            <Ionicons name="fast-food" size={20} color={AQUACARE_COLORS.GREEN_PRIMARY} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-gray-dark">{getPhaseLabel(phase.phase_name)}</Text>
            <Text className="text-xs text-gray-light">
              {t('days')} {phase.days_range[0]}-{phase.days_range[1]} | {phase.pellet_size_label}mm | {phase.weight_range_g[0]}-{phase.weight_range_g[1]}g
            </Text>
          </View>
        </View>

        <View className="flex-row bg-cream rounded-lg p-3 mb-3 gap-4">
          <View className="flex-1 items-center">
            <Text className="text-xs text-gray-light">{t('duration')}</Text>
            <Text className="text-sm font-semibold text-gray-dark">{phase.duration_days} {t('days')}</Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-xs text-gray-light">{t('consumption')}</Text>
            <Text className="text-sm font-semibold text-gray-dark">{phase.total_consumption_kg}kg</Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-xs text-gray-light">{t('dailyAverage')}</Text>
            <Text className="text-sm font-semibold text-gray-dark">{phase.daily_avg_kg.toFixed(1)}kg/j</Text>
          </View>
        </View>

        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-sm font-semibold text-gray-dark">
            {totalBags} {t(totalBags > 1 ? 'bags' : 'bag')}
          </Text>
          <Text className="text-base font-bold text-aquacare-primary">
            {Number(phase.total_price).toLocaleString()} FCFA
          </Text>
        </View>

        <View className="bg-cream rounded-lg p-3 gap-2 mb-3">
          {phase.products.map((product, pIndex) => (
            <View key={pIndex} className="flex-row justify-between items-center">
              <Text className="flex-1 text-sm text-gray-dark mr-2" numberOfLines={1}>
                {product.product_name}
              </Text>
              <Text className="text-sm font-semibold text-gray-light">
                {product.quantity_bags}x {product.package_weight_kg}kg
              </Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          className="bg-cream border border-aquacare-primary rounded-lg py-2 items-center"
          onPress={() => handleAddPhaseToCart(phase)}
        >
          <Text className="text-aquacare-primary font-semibold text-sm">{t('addPhaseToCart')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-cream">
      <View className="bg-white px-5 pt-16 pb-5 flex-row items-center shadow">
        <TouchableOpacity onPress={() => navigation.goBack()} className="w-10">
          <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.GRAY_DARK} />
        </TouchableOpacity>
        <View className="flex-1 items-center">
          <Text className="text-xl font-bold text-gray-dark">{t('cycleSimulator')}</Text>
          <Text className="text-xs text-gray-light mt-1">{t('predictROI')}</Text>
        </View>
        <View className="w-10" />
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="bg-white px-4 py-4 mb-2">
          <Text className="text-lg font-bold text-gray-dark mb-3">{t('simulationParameters')}</Text>

          <View className="mb-4">
            <Text className="text-sm font-semibold text-gray-dark mb-2">{t('species')} *</Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                className={`flex-1 flex-row items-center justify-center py-3 rounded-lg border-2 gap-2 ${
                  species === 'tilapia' ? 'bg-aquacare-primary border-aquacare-primary' : 'border-gray-light'
                }`}
                onPress={() => handleSpeciesChange('tilapia')}
              >
                <Ionicons
                  name="fish"
                  size={20}
                  color={species === 'tilapia' ? AQUACARE_COLORS.WHITE : AQUACARE_COLORS.GRAY_DARK}
                />
                <Text className={`text-sm font-semibold ${species === 'tilapia' ? 'text-white' : 'text-gray-dark'}`}>
                  {t('tilapia')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 flex-row items-center justify-center py-3 rounded-lg border-2 gap-2 ${
                  species === 'catfish' ? 'bg-aquacare-primary border-aquacare-primary' : 'border-gray-light'
                }`}
                onPress={() => handleSpeciesChange('catfish')}
              >
                <Ionicons
                  name="fish"
                  size={20}
                  color={species === 'catfish' ? AQUACARE_COLORS.WHITE : AQUACARE_COLORS.GRAY_DARK}
                />
                <Text className={`text-sm font-semibold ${species === 'catfish' ? 'text-white' : 'text-gray-dark'}`}>
                  {t('catfish')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-sm font-semibold text-gray-dark mb-2">{t('initialFishCount')} *</Text>
            <TextInput
              className="border border-gray-light rounded-lg px-3 py-3 text-base text-gray-dark"
              value={initialFishCount}
              onChangeText={setInitialFishCount}
              keyboardType="numeric"
              placeholder="1000"
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm font-semibold text-gray-dark mb-2">{t('simulationInitialWeight')} (g)</Text>
            <TextInput
              className="border border-gray-light rounded-lg px-3 py-3 text-base text-gray-dark"
              value={initialWeightG}
              onChangeText={setInitialWeightG}
              keyboardType="numeric"
              placeholder="5"
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm font-semibold text-gray-dark mb-2">{t('targetWeight')} (g)</Text>
            <TextInput
              className="border border-gray-light rounded-lg px-3 py-3 text-base text-gray-dark"
              value={targetWeightG}
              onChangeText={setTargetWeightG}
              keyboardType="numeric"
              placeholder={species === 'tilapia' ? '300' : '400'}
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm font-semibold text-gray-dark mb-2">{t('cycleDuration')} ({t('days')})</Text>
            <TextInput
              className="border border-gray-light rounded-lg px-3 py-3 text-base text-gray-dark"
              value={cycleDurationDays}
              onChangeText={setCycleDurationDays}
              keyboardType="numeric"
              placeholder={species === 'tilapia' ? '120' : '150'}
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm font-semibold text-gray-dark mb-2">{t('survivalRate')} (%)</Text>
            <TextInput
              className="border border-gray-light rounded-lg px-3 py-3 text-base text-gray-dark"
              value={survivalRate}
              onChangeText={setSurvivalRate}
              keyboardType="numeric"
              placeholder="85"
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm font-semibold text-gray-dark mb-2">{t('preEstimatedSellingPrice')}</Text>
            <TextInput
              className="border border-gray-light rounded-lg px-3 py-3 text-base text-gray-dark"
              value={sellingPricePerKg}
              onChangeText={setSellingPricePerKg}
              keyboardType="numeric"
              placeholder={species === 'tilapia' ? '2500' : '2800'}
            />
          </View>

          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-gray-dark mb-2">{t('fingerlingsCostFcfa')}</Text>
              <TextInput
                className="border border-gray-light rounded-lg px-3 py-3 text-base text-gray-dark"
                value={fingerlingsCost}
                onChangeText={setFingerlingsCost}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold text-gray-dark mb-2">{t('otherOperationalCosts')}</Text>
              <TextInput
                className="border border-gray-light rounded-lg px-3 py-3 text-base text-gray-dark"
                value={otherCosts}
                onChangeText={setOtherCosts}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
          </View>

          <View className="flex-row gap-3">
            <TouchableOpacity
              className={`flex-1 flex-row items-center justify-center py-3 rounded-lg gap-2 ${
                loading ? 'bg-aquacare-primary/60' : 'bg-aquacare-primary'
              }`}
              onPress={handleLaunchSimulation}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={AQUACARE_COLORS.WHITE} />
              ) : (
                <Ionicons name="analytics" size={20} color={AQUACARE_COLORS.WHITE} />
              )}
              <Text className="text-white text-base font-semibold">{t('simulate')}</Text>
            </TouchableOpacity>
            {simulationResult && (
              <TouchableOpacity
                className="bg-cream px-4 rounded-lg items-center justify-center"
                onPress={handleReset}
              >
                <Ionicons name="refresh" size={20} color={AQUACARE_COLORS.GRAY_DARK} />
              </TouchableOpacity>
            )}
          </View>

          {effectiveCycleId && (
            <TouchableOpacity
              className={`mt-3 rounded-lg py-3 items-center ${savingCycleParams ? 'bg-gray-200' : 'bg-cream border border-aquacare-primary'}`}
              onPress={handleUpdateCycleParameters}
              disabled={savingCycleParams}
            >
              {savingCycleParams ? (
                <ActivityIndicator size="small" color={AQUACARE_COLORS.GREEN_PRIMARY} />
              ) : (
                <Text className="text-aquacare-primary font-semibold">{t('updateCycleParameters')}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {error && (
          <View className="bg-white px-4 py-4 mb-2 items-center gap-3">
            <Ionicons name="alert-circle-outline" size={32} color={AQUACARE_COLORS.ERROR} />
            <Text className="text-sm text-center" style={{ color: AQUACARE_COLORS.ERROR }}>{error}</Text>
          </View>
        )}

        {simulationResult && (
          <View className="px-4 py-4">
            <Text className="text-lg font-bold text-gray-dark mb-3">{t('simulationResults')}</Text>

            <View className="flex-row flex-wrap gap-3 mb-4">
              <View className="flex-1 min-w-[45%] bg-white rounded-xl p-4 items-center">
                <Ionicons name="scale-outline" size={24} color={AQUACARE_COLORS.GREEN_PRIMARY} />
                <Text className="text-lg font-bold text-aquacare-primary mt-2">
                  {simulationResult.summary.total_feed_kg.toLocaleString()}kg
                </Text>
                <Text className="text-xs text-gray-light mt-1 text-center">{t('totalFeed')}</Text>
              </View>
              <View className="flex-1 min-w-[45%] bg-white rounded-xl p-4 items-center">
                <Ionicons name="wallet-outline" size={24} color={AQUACARE_COLORS.GREEN_PRIMARY} />
                <Text className="text-lg font-bold text-aquacare-primary mt-2">
                  {simulationResult.summary.total_cost_fcfa.toLocaleString()}
                </Text>
                <Text className="text-xs text-gray-light mt-1 text-center">{t('totalCosts')}</Text>
              </View>
              <View className="flex-1 min-w-[45%] bg-white rounded-xl p-4 items-center">
                <Ionicons name="trending-up-outline" size={24} color={AQUACARE_COLORS.GREEN_PRIMARY} />
                <Text className="text-lg font-bold text-aquacare-primary mt-2">
                  {simulationResult.summary.estimated_fcr.toFixed(1)}
                </Text>
                <Text className="text-xs text-gray-light mt-1 text-center">{t('estimatedFCR')}</Text>
              </View>
              <View className="flex-1 min-w-[45%] bg-white rounded-xl p-4 items-center">
                <Ionicons name="heart-outline" size={24} color={AQUACARE_COLORS.GREEN_PRIMARY} />
                <Text className="text-lg font-bold text-aquacare-primary mt-2">
                  {(simulationResult.summary.survival_rate * 100).toFixed(0)}%
                </Text>
                <Text className="text-xs text-gray-light mt-1 text-center">{t('survivalRate')}</Text>
              </View>
            </View>

            <View className="bg-white rounded-xl p-4 mb-4">
              <Text className="text-base font-bold text-gray-dark mb-3">{t('roi')}</Text>
              <View className="gap-3">
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm text-gray-light">{t('feedCost')}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">
                    {simulationResult.summary.feed_cost_fcfa.toLocaleString()} FCFA
                  </Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm text-gray-light">{t('fingerlingsCostFcfa')}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">
                    {simulationResult.summary.fingerlings_cost_fcfa.toLocaleString()} FCFA
                  </Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm text-gray-light">{t('otherOperationalCosts')}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">
                    {simulationResult.summary.other_costs_fcfa.toLocaleString()} FCFA
                  </Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm text-gray-light">{t('estimatedRevenue')}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">
                    {simulationResult.summary.estimated_revenue_fcfa.toLocaleString()} FCFA
                  </Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm text-gray-light">{t('estimatedProfit')}</Text>
                  <Text className="text-sm font-semibold text-gray-dark">
                    {simulationResult.summary.estimated_profit_fcfa.toLocaleString()} FCFA
                  </Text>
                </View>
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm text-gray-light">{t('roiPercentage')}</Text>
                  <Text
                    className="text-2xl font-bold"
                    style={{
                      color:
                        simulationResult.summary.roi_percentage > 0
                          ? AQUACARE_COLORS.SUCCESS
                          : AQUACARE_COLORS.ERROR,
                    }}
                  >
                    {simulationResult.summary.roi_percentage > 0 ? '+' : ''}
                    {simulationResult.summary.roi_percentage.toFixed(1)}%
                  </Text>
                </View>
              </View>
            </View>

            <View className="bg-white rounded-xl p-4 mb-4 flex-row items-start gap-3 border border-aquacare-primary/30">
              <Ionicons name="storefront-outline" size={24} color={AQUACARE_COLORS.GREEN_PRIMARY} style={{ marginTop: 2 }} />
              <View className="flex-1">
                <Text className="text-sm font-bold text-gray-dark mb-1">{t('buyerNetworkTitle')}</Text>
                <Text className="text-xs text-gray-light mb-3">{t('buyerNetworkROINote')}</Text>
                <TouchableOpacity
                  className="bg-aquacare-primary rounded-lg py-2 items-center"
                  onPress={() => navigation.navigate('Chat')}
                >
                  <Text className="text-white text-xs font-semibold">{t('buyerNetworkCTA')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View className="flex-row items-center mb-3 mt-2 gap-2">
              <Ionicons name="cart-outline" size={20} color={AQUACARE_COLORS.GREEN_PRIMARY} />
              <Text className="text-base font-bold text-gray-dark">{t('buyFeedSection')}</Text>
            </View>
            <Text className="text-xs text-gray-light mb-3">{t('feedingPhases')}</Text>
            {displayPhases.map((phase, index) => renderPhaseCard(phase, index))}

            <TouchableOpacity
              className="bg-aquacare-primary flex-row items-center justify-center py-4 rounded-lg gap-2 mt-3"
              onPress={handleAddAllToCart}
            >
              <Ionicons name="cart" size={20} color={AQUACARE_COLORS.WHITE} />
              <Text className="text-white text-base font-semibold">{t('addAllToCart')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {loading && (
        <View className="absolute inset-0 bg-black/10 items-center justify-center">
          <View className="bg-white px-4 py-3 rounded-lg flex-row items-center gap-3">
            <ActivityIndicator size="small" color={AQUACARE_COLORS.GREEN_PRIMARY} />
            <Text className="text-base text-gray-dark">{t('loading')}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
