import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { fetchDashboardData, setCurrentCycle } from '@/features/aquaculture/store/aquacultureSlice';
import { DailyLogForm } from '@/types/aquaculture';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AQUACARE_COLORS } from '@/constants/colors';
import { estimateAverageWeight } from '@/domain/aquaculture/estimators';
import { calculateStockValue, calculateEstimatedBiomass } from '@/constants/aquaculture';
import SuccessRewardModal from '@/components/modals/SuccessRewardModal';
import CycleSelector from '@/components/common/CycleSelector';
import { getApiErrorMessage, parseApiError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';
import {
  createCycleLogWithOfflineFallback,
  runSilentOfflineSync,
} from '@/features/aquaculture/services/aquacultureWorkflowService';

interface DailyLogData {
  cycle_id: string;
  mortality_count: string;
  mortality_reason: string;
  feed_quantity: string;
  feed_type: string;
  feed_size_mm: string;
  dissolved_oxygen: string;
  water_temperature: string;
  ph_level: string;
  ammonia_level: string;
  feeding_times: string;
  sample_count: string;
  sample_total_weight: string;
  observations: string;
}

type DailyLogScreenNavigationProp = StackNavigationProp<RootStackParamList, 'DailyLog'>;
type DailyLogScreenRouteProp = RouteProp<RootStackParamList, 'DailyLog'>;

interface DailyLogScreenProps {
  navigation: DailyLogScreenNavigationProp;
  route?: DailyLogScreenRouteProp;
}


export default function DailyLogScreen({ navigation, route }: DailyLogScreenProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { dashboardData, currentCycle } = useSelector((state: RootState) => state.aquaculture);
  const activeCycles = dashboardData?.active_cycles || [];
  const routeParams = route?.params;
  const routeCycleId = routeParams?.cycleId;
  const unitAllocationId = routeParams?.cycleUnitAllocationId;
  const unitName = routeParams?.productionUnitName || t('productionUnitsUnknownUnit');
  const sessionScopedCycles = routeCycleId
    ? activeCycles.filter((cycle) => cycle.id === routeCycleId)
    : currentCycle?.id
      ? activeCycles.filter((cycle) => cycle.id === currentCycle.id)
    : activeCycles;

  const [selectedCycle, setSelectedCycle] = useState<string>(routeCycleId || '');
  const [formData, setFormData] = useState<DailyLogData>({
    cycle_id: routeCycleId || '',
    mortality_count: '',
    mortality_reason: '',
    feed_quantity: '',
    feed_type: '',
    feed_size_mm: '',
    dissolved_oxygen: '',
    water_temperature: '',
    ph_level: '',
    ammonia_level: '',
    feeding_times: '',
    sample_count: '',
    sample_total_weight: '',
    observations: '',
  });
  const [saving, setSaving] = useState(false);

  const [rewardModalVisible, setRewardModalVisible] = useState(false);
  const [rewardData, setRewardData] = useState({
    averageWeight: 0,
    fishCount: 0,
    estimatedBiomass: 0,
    stockValue: 0,
  });

  useEffect(() => {
    const bootstrap = async () => {
      await runSilentOfflineSync();
      dispatch(fetchDashboardData({ lightweight: true }));
    };
    bootstrap();
  }, [dispatch]);

  useEffect(() => {
    if (sessionScopedCycles.length === 0) {
      return;
    }

    const preferredCycle = routeCycleId
      ? sessionScopedCycles.find((cycle) => cycle.id === routeCycleId) || sessionScopedCycles[0]
      : sessionScopedCycles[0];

    if (selectedCycle !== preferredCycle.id) {
      setSelectedCycle(preferredCycle.id);
      setFormData((prev) => ({ ...prev, cycle_id: preferredCycle.id }));
    }
  }, [routeCycleId, sessionScopedCycles, selectedCycle]);

  const parseOptionalNumber = (value: string): number | undefined => {
    if (!value.trim()) {
      return undefined;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const parseOptionalInteger = (value: string): number | undefined => {
    if (!value.trim()) {
      return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const parseFeedingTimes = (value: string): { valid: string[]; invalidCount: number } => {
    const rawValues = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (rawValues.length === 0) {
      return { valid: [], invalidCount: 0 };
    }

    const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const valid = rawValues.filter((item) => TIME_REGEX.test(item));
    return {
      valid,
      invalidCount: rawValues.length - valid.length,
    };
  };

  const handleSave = async () => {
    if (!selectedCycle) {
      Alert.alert(t('error'), t('noCycleSelected'));
      return;
    }

    setSaving(true);
    try {
      const sampleCount = parseOptionalInteger(formData.sample_count);
      const sampleWeight = parseOptionalNumber(formData.sample_total_weight);
      const hasSampleCount = formData.sample_count.trim().length > 0;
      const hasSampleWeight = formData.sample_total_weight.trim().length > 0;

      if (hasSampleCount !== hasSampleWeight) {
        Alert.alert(t('error'), t('samplingPairRequired'));
        setSaving(false);
        return;
      }

      if (sampleCount !== undefined && sampleCount < 5) {
        Alert.alert(t('error'), t('sampleCountTooLow', { min: 5 }));
        setSaving(false);
        return;
      }

      const mortalityCount = parseOptionalInteger(formData.mortality_count);
      const feedQuantity = parseOptionalNumber(formData.feed_quantity);
      const feedSize = parseOptionalNumber(formData.feed_size_mm);
      const waterTemperature = parseOptionalNumber(formData.water_temperature);
      const dissolvedOxygen = parseOptionalNumber(formData.dissolved_oxygen);
      const phLevel = parseOptionalNumber(formData.ph_level);
      const ammoniaLevel = parseOptionalNumber(formData.ammonia_level);
      const { valid: feedingTimes, invalidCount } = parseFeedingTimes(formData.feeding_times);

      if (invalidCount > 0) {
        Alert.alert(t('warning'), t('feedingTimesInvalidIgnored'));
      }

      const logData: DailyLogForm = {
        log_date: new Date().toISOString().split('T')[0],
        ...(unitAllocationId ? { cycle_unit_allocation: unitAllocationId } : {}),
        mortality_count: mortalityCount,
        mortality_reason: formData.mortality_reason.trim() || undefined,
        sample_count: sampleCount,
        sample_total_weight: sampleWeight,
        feed_quantity: feedQuantity,
        feed_type: formData.feed_type.trim() || undefined,
        feed_size_mm: feedSize,
        feeding_times: feedingTimes.length > 0 ? feedingTimes : undefined,
        water_temperature: waterTemperature,
        dissolved_oxygen: dissolvedOxygen,
        ph_level: phLevel,
        ammonia_level: ammoniaLevel,
        observations: formData.observations.trim() || undefined,
      };

      try {
        const creationResult = await createCycleLogWithOfflineFallback(selectedCycle, logData);
        dispatch(fetchDashboardData({ lightweight: true }));

        const currentCycle = sessionScopedCycles.find((cycle) => cycle.id === selectedCycle);
        if (sampleCount && sampleWeight && currentCycle) {
          const avgWeight = sampleWeight / sampleCount;
          const mortality = mortalityCount || 0;
          const remainingFish = (currentCycle.current_count || 0) - mortality;
          const biomass = calculateEstimatedBiomass(remainingFish, avgWeight);
          const value = calculateStockValue(biomass);

          setRewardData({
            averageWeight: avgWeight,
            fishCount: remainingFish,
            estimatedBiomass: biomass,
            stockValue: value,
          });
          setRewardModalVisible(true);
        } else {
          const successKey = creationResult.mode === 'online' ? 'recordSaved' : 'recordSavedOffline';
          Alert.alert(t('success'), t(successKey), [{ text: t('ok'), onPress: () => navigation.goBack() }]);
        }
      } catch (apiError: unknown) {
        throw apiError;
      }
    } catch (error: unknown) {
      const parsedError = parseApiError(error);
      const fallbackMessage = getApiErrorMessage(error, t('recordSaveError'));
      const actionableMessage =
        parsedError.status > 0 || parsedError.details.length > 0
          ? formatAquacultureErrorWithAction(parsedError, t)
          : fallbackMessage;
      Alert.alert(t('error'), actionableMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleCloseRewardModal = () => {
    setRewardModalVisible(false);
    navigation.goBack();
  };

  if (sessionScopedCycles.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-cream px-5">
        <Ionicons name="fish-outline" size={64} color={AQUACARE_COLORS.GRAY_LIGHT} />
        <Text className="text-lg font-bold text-gray-dark mt-4">{t('noActiveCycles')}</Text>
        <Text className="text-sm text-gray-light text-center mt-2 mb-6">{t('createCycleToStart')}</Text>
        <TouchableOpacity className="bg-aquacare-primary px-5 py-3 rounded-lg" onPress={() => navigation.navigate('CreateFarm')}>
          <Text className="text-white text-base font-semibold">{t('createCycle')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-cream">
      <View className="bg-aquacare-primary flex-row items-center pt-14 pb-4 px-4">
        <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.WHITE} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-white">{t('dailyLogTitle')}</Text>
      </View>

      <View className="p-4">
        {unitAllocationId ? (
          <View className="mb-6 rounded-2xl border border-green-200 bg-white p-4">
            <View className="flex-row items-center mb-2">
              <Ionicons name="cube-outline" size={18} color={AQUACARE_COLORS.GREEN_PRIMARY} />
              <Text className="ml-2 text-base font-bold text-gray-dark">
                {t('productionUnitLogContextTitle')}
              </Text>
            </View>
            <Text className="text-sm font-semibold text-aquacare-primary mb-1">{unitName}</Text>
            <Text className="text-sm text-gray-light">{t('productionUnitLogContextDescription')}</Text>
          </View>
        ) : null}

        <CycleSelector
          cycles={sessionScopedCycles}
          selectedCycleId={selectedCycle}
          onSelectCycle={(cycleId) => {
            setSelectedCycle(cycleId);
            setFormData((prev) => ({ ...prev, cycle_id: cycleId }));
            const cycle = sessionScopedCycles.find((item) => item.id === cycleId);
            if (cycle) {
              dispatch(setCurrentCycle(cycle));
            }
          }}
        />

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('dailyRecommendedSection')}</Text>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('mortality')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.mortality_count}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, mortality_count: value }))}
                placeholder={t('mortalityPlaceholder')}
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('mortalityReason')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.mortality_reason}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, mortality_reason: value }))}
                placeholder={t('mortalityReasonPlaceholder')}
              />
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('feedQuantity')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.feed_quantity}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, feed_quantity: value }))}
                placeholder={t('feedQuantityPlaceholder')}
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('feedType')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.feed_type}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, feed_type: value }))}
                placeholder={t('feedTypePlaceholder')}
              />
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-dark mb-2">{t('feedSizeMm')}</Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
              value={formData.feed_size_mm}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, feed_size_mm: value }))}
              placeholder={t('feedSizeMmPlaceholder')}
              keyboardType="numeric"
            />
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('waterTemperatureUnit')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.water_temperature}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, water_temperature: value }))}
                placeholder={t('waterTemperaturePlaceholder')}
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('dissolvedOxygen')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.dissolved_oxygen}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, dissolved_oxygen: value }))}
                placeholder={t('dissolvedOxygenPlaceholder')}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('phLevel')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.ph_level}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, ph_level: value }))}
                placeholder={t('phLevelPlaceholder')}
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('ammoniaLevel')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.ammonia_level}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, ammonia_level: value }))}
                placeholder={t('ammoniaLevelPlaceholder')}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-dark mb-2">{t('feedingTimes')}</Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
              value={formData.feeding_times}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, feeding_times: value }))}
              placeholder={t('feedingTimesPlaceholder')}
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-dark mb-2">{t('observations')}</Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark h-24"
              value={formData.observations}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, observations: value }))}
              placeholder={t('observationsPlaceholder')}
              multiline
              numberOfLines={4}
            />
          </View>

          <Text className="text-base font-bold text-gray-dark mb-3 mt-1">{t('weeklyRecommendedSection')}</Text>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('sampleCount')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.sample_count}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, sample_count: value }))}
                placeholder={t('exampleAffectedCount')}
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('sampleWeight')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.sample_total_weight}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, sample_total_weight: value }))}
                placeholder={t('sampleWeightPlaceholder')}
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {formData.sample_count && formData.sample_total_weight && (() => {
          const sampleWeight = parseOptionalNumber(formData.sample_total_weight) || 0;
          const sampleCount = parseOptionalInteger(formData.sample_count) || 0;
          const avgWeight = estimateAverageWeight(sampleWeight, sampleCount);

          return (
            <View className="mb-6">
              <Text className="text-base font-bold text-gray-dark mb-3">{t('autoCalculations')}</Text>
              <View className="bg-white p-4 rounded-lg border border-green-200">
                <View className="flex-row justify-between mb-2">
                  <Text className="text-sm text-gray-light">{t('averageWeight')} :</Text>
                  <Text className="text-sm font-semibold text-aquacare-primary">{avgWeight.toFixed(1)} g</Text>
                </View>
              </View>
            </View>
          );
        })()}

        <TouchableOpacity
          className={`bg-aquacare-primary flex-row items-center justify-center py-4 rounded-lg mt-4 gap-2 ${saving ? 'opacity-60' : ''}`}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={AQUACARE_COLORS.WHITE} />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color={AQUACARE_COLORS.WHITE} />
              <Text className="text-white text-base font-semibold">{t('save')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <SuccessRewardModal
        visible={rewardModalVisible}
        onClose={handleCloseRewardModal}
        averageWeight={rewardData.averageWeight}
        fishCount={rewardData.fishCount}
        estimatedBiomass={rewardData.estimatedBiomass}
        stockValue={rewardData.stockValue}
      />
    </ScrollView>
  );
}
