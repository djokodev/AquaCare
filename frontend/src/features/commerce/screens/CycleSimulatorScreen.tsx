import React, { useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { useDispatch, useSelector } from 'react-redux';

import { AppDispatch, RootState } from '@/store/store';
import { fetchCycleSimulation, resetSimulation, addToCart } from '@/features/commerce/store/commerceSlice';
import { CycleSimulationParams, SimulatedFeedingPhase } from '@/types/commerce';
import { MAVECAM_COLORS } from '@/constants/colors';
import { CYCLE_SIMULATION_DEFAULTS } from '@/domain/commerce';
import CustomPicker from '@/components/common/CustomPicker';

export default function CycleSimulatorScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const dispatch = useDispatch<AppDispatch>();

  const { simulation, cart, products } = useSelector((state: RootState) => state.commerce);
  const { result: simulationResult, loading, error } = simulation;

  const [species, setSpecies] = useState<'tilapia' | 'catfish'>('tilapia');
  const [initialFishCount, setInitialFishCount] = useState('1000');
  const [initialWeightG, setInitialWeightG] = useState(
    CYCLE_SIMULATION_DEFAULTS.tilapia.initial_weight_g.toString()
  );
  const [targetWeightG, setTargetWeightG] = useState(
    CYCLE_SIMULATION_DEFAULTS.tilapia.target_weight_g.toString()
  );
  const [cycleDurationDays, setCycleDurationDays] = useState(
    CYCLE_SIMULATION_DEFAULTS.tilapia.cycle_duration_days.toString()
  );
  const [survivalRate, setSurvivalRate] = useState(
    (CYCLE_SIMULATION_DEFAULTS.tilapia.survival_rate * 100).toString()
  );

  const handleSpeciesChange = (newSpecies: 'tilapia' | 'catfish') => {
    setSpecies(newSpecies);
    const defaults = CYCLE_SIMULATION_DEFAULTS[newSpecies];
    setInitialWeightG(defaults.initial_weight_g.toString());
    setTargetWeightG(defaults.target_weight_g.toString());
    setCycleDurationDays(defaults.cycle_duration_days.toString());
    setSurvivalRate((defaults.survival_rate * 100).toString());
  };

  const handleLaunchSimulation = () => {
    const fishCount = parseInt(initialFishCount, 10);
    const initWeight = parseFloat(initialWeightG);
    const targWeight = parseFloat(targetWeightG);
    const duration = parseInt(cycleDurationDays, 10);
    const survival = parseFloat(survivalRate) / 100;

    if (
      isNaN(fishCount) ||
      fishCount <= 0 ||
      isNaN(initWeight) ||
      initWeight <= 0 ||
      isNaN(targWeight) ||
      targWeight <= initWeight ||
      isNaN(duration) ||
      duration < 30 ||
      duration > 365 ||
      isNaN(survival) ||
      survival <= 0 ||
      survival > 1
    ) {
      Alert.alert(t('error'), t('invalidSimulationParams'));
      return;
    }

    const params: CycleSimulationParams = {
      species,
      initial_fish_count: fishCount,
      initial_weight_g: initWeight,
      target_weight_g: targWeight,
      cycle_duration_days: duration,
      survival_rate: survival,
    };

    dispatch(fetchCycleSimulation(params));
  };

  const handleReset = () => {
    dispatch(resetSimulation());
    setInitialFishCount('1000');
    handleSpeciesChange(species);
  };

  const handleAddAllToCart = () => {
    if (!simulationResult) return;

    let totalProducts = 0;
    simulationResult.feeding_phases.forEach((phase) => {
      phase.products.forEach((simulatedProduct) => {
        const product = products.items.find((p) => p.id === simulatedProduct.product_id);
        if (product) {
          dispatch(addToCart({ product, quantity: simulatedProduct.quantity_bags }));
          totalProducts += simulatedProduct.quantity_bags;
        }
      });
    });

    Alert.alert(t('success'), t('simulationProductsAdded', { count: totalProducts }), [
      { text: t('viewCart'), onPress: () => navigation.navigate('Cart' as never) },
      { text: t('ok') },
    ]);
  };

  const renderPhaseCard = (phase: SimulatedFeedingPhase, index: number) => {
    const totalBags = phase.products.reduce((sum, p) => sum + p.quantity_bags, 0);

    return (
      <View key={index} className="bg-white rounded-xl p-4 mb-3 shadow">
        <View className="flex-row items-center mb-3 gap-3">
          <View className="w-10 h-10 bg-cream rounded-full items-center justify-center">
            <Ionicons name="fast-food" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-gray-dark">{phase.phase_name}</Text>
            <Text className="text-xs text-gray-light">
              {t('days')} {phase.days_range[0]}-{phase.days_range[1]} - {phase.pellet_size_mm}mm - {phase.weight_range_g[0]}-{phase.weight_range_g[1]}g
            </Text>
          </View>
        </View>

        <View className="flex-row bg-cream rounded-lg p-3 mb-3 gap-4">
          <View className="flex-1 items-center">
            <Text className="text-[11px] text-gray-light">{t('duration')}</Text>
            <Text className="text-sm font-semibold text-gray-dark">{phase.duration_days} {t('days')}</Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-[11px] text-gray-light">{t('consumption')}</Text>
            <Text className="text-sm font-semibold text-gray-dark">{phase.total_consumption_kg}kg</Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-[11px] text-gray-light">{t('dailyAverage')}</Text>
            <Text className="text-sm font-semibold text-gray-dark">{phase.daily_avg_kg.toFixed(1)}kg/j</Text>
          </View>
        </View>

        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-sm font-semibold text-gray-dark">
            {totalBags} {t(totalBags > 1 ? 'bags' : 'bag')}
          </Text>
          <Text className="text-base font-bold text-mavecam-primary">
            {parseFloat(phase.total_price).toLocaleString()} FCFA
          </Text>
        </View>

        <View className="bg-cream rounded-lg p-3 gap-2">
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
      </View>
    );
  };

  return (
    <View className="flex-1 bg-cream">
      <View className="bg-white px-5 pt-16 pb-5 flex-row items-center justify-between shadow">
        <TouchableOpacity onPress={() => navigation.goBack()} className="w-10">
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.GRAY_DARK} />
        </TouchableOpacity>
        <View className="flex-1 items-center">
          <Text className="text-xl font-bold text-gray-dark">{t('cycleSimulator')}</Text>
          <Text className="text-xs text-gray-light mt-1">{t('predictROI')}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Cart' as never)} className="relative">
          <Ionicons name="cart-outline" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          {cart.items.length > 0 && (
            <View className="absolute -top-2 -right-2 bg-[#dc2626] rounded-full min-w-[20px] h-5 items-center justify-center px-1">
              <Text className="text-white text-[10px] font-bold">
                {cart.items.reduce((sum, item) => sum + item.quantity, 0)}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="bg-white px-4 py-4 mb-2">
          <Text className="text-lg font-bold text-gray-dark mb-3">{t('simulationParameters')}</Text>

          <View className="mb-4">
            <Text className="text-sm font-semibold text-gray-dark mb-2">{t('species')} *</Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                className={`flex-1 flex-row items-center justify-center py-3 rounded-lg border-2 gap-2 ${
                  species === 'tilapia' ? 'bg-mavecam-primary border-mavecam-primary' : 'border-gray-light'
                }`}
                onPress={() => handleSpeciesChange('tilapia')}
              >
                <Ionicons
                  name="fish"
                  size={20}
                  color={species === 'tilapia' ? MAVECAM_COLORS.WHITE : MAVECAM_COLORS.GRAY_DARK}
                />
                <Text
                  className={`text-sm font-semibold ${
                    species === 'tilapia' ? 'text-white' : 'text-gray-dark'
                  }`}
                >
                  {t('tilapia')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 flex-row items-center justify-center py-3 rounded-lg border-2 gap-2 ${
                  species === 'catfish' ? 'bg-mavecam-primary border-mavecam-primary' : 'border-gray-light'
                }`}
                onPress={() => handleSpeciesChange('catfish')}
              >
                <Ionicons
                  name="fish"
                  size={20}
                  color={species === 'catfish' ? MAVECAM_COLORS.WHITE : MAVECAM_COLORS.GRAY_DARK}
                />
                <Text
                  className={`text-sm font-semibold ${
                    species === 'catfish' ? 'text-white' : 'text-gray-dark'
                  }`}
                >
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

          <View className="flex-row gap-3">
            <TouchableOpacity
              className={`flex-1 flex-row items-center justify-center py-3 rounded-lg gap-2 ${
                loading ? 'bg-mavecam-primary/60' : 'bg-mavecam-primary'
              }`}
              onPress={handleLaunchSimulation}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={MAVECAM_COLORS.WHITE} />
              ) : (
                <Ionicons name="analytics" size={20} color={MAVECAM_COLORS.WHITE} />
              )}
              <Text className="text-white text-base font-semibold">{t('simulate')}</Text>
            </TouchableOpacity>
            {simulationResult && (
              <TouchableOpacity
                className="bg-cream px-4 rounded-lg items-center justify-center"
                onPress={handleReset}
              >
                <Ionicons name="refresh" size={20} color={MAVECAM_COLORS.GRAY_DARK} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {error && (
          <View className="bg-white px-4 py-4 mb-2 items-center gap-3">
            <Ionicons name="alert-circle-outline" size={32} color={MAVECAM_COLORS.ERROR} />
            <Text className="text-sm text-[#dc2626] text-center">{error}</Text>
          </View>
        )}

        {simulationResult && (
          <View className="px-4 py-4">
            <Text className="text-lg font-bold text-gray-dark mb-3">{t('simulationResults')}</Text>

            <View className="flex-row flex-wrap gap-3 mb-4">
              <View className="flex-1 min-w-[45%] bg-white rounded-xl p-4 items-center shadow">
                <Ionicons name="scale-outline" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                <Text className="text-lg font-bold text-mavecam-primary mt-2">
                  {simulationResult.summary.total_feed_kg.toLocaleString()}kg
                </Text>
                <Text className="text-xs text-gray-light mt-1 text-center">{t('totalFeed')}</Text>
              </View>
              <View className="flex-1 min-w-[45%] bg-white rounded-xl p-4 items-center shadow">
                <Ionicons name="wallet-outline" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                <Text className="text-lg font-bold text-mavecam-primary mt-2">
                  {simulationResult.summary.total_cost_fcfa.toLocaleString()}
                </Text>
                <Text className="text-xs text-gray-light mt-1 text-center">{t('feedCost')}</Text>
              </View>
              <View className="flex-1 min-w-[45%] bg-white rounded-xl p-4 items-center shadow">
                <Ionicons name="trending-up-outline" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                <Text className="text-lg font-bold text-mavecam-primary mt-2">
                  {simulationResult.summary.estimated_fcr.toFixed(2)}
                </Text>
                <Text className="text-xs text-gray-light mt-1 text-center">{t('estimatedFCR')}</Text>
              </View>
              <View className="flex-1 min-w-[45%] bg-white rounded-xl p-4 items-center shadow">
                <Ionicons name="heart-outline" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
                <Text className="text-lg font-bold text-mavecam-primary mt-2">
                  {(simulationResult.summary.survival_rate * 100).toFixed(0)}%
                </Text>
                <Text className="text-xs text-gray-light mt-1 text-center">{t('survivalRate')}</Text>
              </View>
            </View>

            <View className="bg-white rounded-xl p-4 mb-4 shadow">
              <Text className="text-base font-bold text-gray-dark mb-3">{t('roi')}</Text>
              <View className="gap-3">
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
                          ? MAVECAM_COLORS.SUCCESS
                          : MAVECAM_COLORS.ERROR,
                    }}
                  >
                    {simulationResult.summary.roi_percentage > 0 ? '+' : ''}
                    {simulationResult.summary.roi_percentage.toFixed(1)}%
                  </Text>
                </View>
              </View>
            </View>

            <Text className="text-base font-bold text-gray-dark mb-3">{t('feedingPhases')}</Text>
            {simulationResult.feeding_phases.map((phase, index) => renderPhaseCard(phase, index))}

            <TouchableOpacity
              className="bg-mavecam-primary flex-row items-center justify-center py-4 rounded-lg gap-2 mt-3"
              onPress={handleAddAllToCart}
            >
              <Ionicons name="cart" size={20} color={MAVECAM_COLORS.WHITE} />
              <Text className="text-white text-base font-semibold">{t('addAllToCart')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}




