import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { fetchDashboardData } from '@/features/aquaculture/store/aquacultureSlice';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { offlineService } from '@/services/offlineService';
import { DailyLogForm } from '@/types/aquaculture';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { MAVECAM_COLORS } from '@/constants/colors';
import { estimateAverageWeight } from '@/domain';
import { calculateStockValue, calculateEstimatedBiomass } from '@/constants/aquaculture';
import SuccessRewardModal from '@/components/modals/SuccessRewardModal';
import CycleSelector from '@/components/common/CycleSelector';
import { getApiErrorMessage, isNetworkError } from '@/utils/errorParser';

interface DailyLogData {
  cycle_id: string;
  sample_count: string;
  sample_total_weight: string;
  mortality_count: string;
  water_temperature: string;
  ph_level: string;
  observations: string;
}

type DailyLogScreenNavigationProp = StackNavigationProp<RootStackParamList, 'DailyLog'>;

interface DailyLogScreenProps {
  navigation: DailyLogScreenNavigationProp;
}


export default function DailyLogScreen({ navigation }: DailyLogScreenProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { dashboardData } = useSelector((state: RootState) => state.aquaculture);
  const activeCycles = dashboardData?.active_cycles || [];

  const [selectedCycle, setSelectedCycle] = useState<string>('');
  const [formData, setFormData] = useState<DailyLogData>({
    cycle_id: '',
    sample_count: '',
    sample_total_weight: '',
    mortality_count: '',
    water_temperature: '',
    ph_level: '',
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
    dispatch(fetchDashboardData());
    tryOfflineSync();
  }, [dispatch]);

  const tryOfflineSync = async () => {
    try {
      const hasPending = await offlineService.hasPendingSync();
      if (hasPending) {
        const result = await offlineService.syncOfflineLogs();

        if (result.success > 0) {
          dispatch(fetchDashboardData());
        }
      }
    } catch {
      // Synchronisation silencieuse
    }
  };

  useEffect(() => {
    if (activeCycles.length > 0 && !selectedCycle) {
      setSelectedCycle(activeCycles[0].id);
      setFormData((prev) => ({ ...prev, cycle_id: activeCycles[0].id }));
    }
  }, [activeCycles, selectedCycle]);

  const getErrorMessage = (error: unknown): string =>
    getApiErrorMessage(error, t('recordSaveError'));

  const handleSave = async () => {
    if (!selectedCycle) {
      Alert.alert(t('error'), t('noCycleSelected'));
      return;
    }

    setSaving(true);
    try {
      const sampleCount = parseFloat(formData.sample_count) || 0;
      const sampleWeight = parseFloat(formData.sample_total_weight) || 0;

      if (sampleCount > 0 && sampleCount < 5) {
        Alert.alert(t('error'), t('sampleCountTooLow', { min: 5 }));
        setSaving(false);
        return;
      }

      if (sampleWeight > 0 && sampleCount <= 0) {
        Alert.alert(t('error'), t('sampleCountRequiredWithWeight'));
        setSaving(false);
        return;
      }

      const logData: DailyLogForm = {
        log_date: new Date().toISOString().split('T')[0],
        mortality_count: formData.mortality_count ? parseInt(formData.mortality_count, 10) : undefined,
        sample_count: sampleCount > 0 ? sampleCount : undefined,
        sample_total_weight: sampleWeight > 0 ? sampleWeight : undefined,
        water_temperature: formData.water_temperature ? parseFloat(formData.water_temperature) : undefined,
        ph_level: formData.ph_level ? parseFloat(formData.ph_level) : undefined,
        observations: formData.observations || undefined,
      };

      try {
        await aquacultureService.createCycleLog(selectedCycle, logData);
        dispatch(fetchDashboardData());

        const currentCycle = activeCycles.find((cycle) => cycle.id === selectedCycle);
        if (sampleCount > 0 && sampleWeight > 0 && currentCycle) {
          const avgWeight = sampleWeight / sampleCount;
          const mortality = parseInt(formData.mortality_count, 10) || 0;
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
          Alert.alert(t('success'), t('recordSaved'), [{ text: t('ok'), onPress: () => navigation.goBack() }]);
        }
      } catch (apiError: unknown) {
        if (isNetworkError(apiError)) {
          await offlineService.saveCycleLogOffline(selectedCycle, logData);

          const currentCycle = activeCycles.find((cycle) => cycle.id === selectedCycle);
          if (sampleCount > 0 && sampleWeight > 0 && currentCycle) {
            const avgWeight = sampleWeight / sampleCount;
            const mortality = parseInt(formData.mortality_count, 10) || 0;
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
            Alert.alert(t('success'), t('recordSavedOffline'), [{ text: t('ok'), onPress: () => navigation.goBack() }]);
          }
        } else {
          throw apiError;
        }
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      Alert.alert(t('error'), errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleCloseRewardModal = () => {
    setRewardModalVisible(false);
    navigation.goBack();
  };

  if (activeCycles.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-cream px-5">
        <Ionicons name="fish-outline" size={64} color={MAVECAM_COLORS.GRAY_LIGHT} />
        <Text className="text-lg font-bold text-gray-dark mt-4">{t('noActiveCycles')}</Text>
        <Text className="text-sm text-gray-light text-center mt-2 mb-6">{t('createCycleToStart')}</Text>
        <TouchableOpacity className="bg-mavecam-primary px-5 py-3 rounded-lg" onPress={() => navigation.navigate('NewCycle')}>
          <Text className="text-white text-base font-semibold">{t('createCycle')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-cream">
      <View className="bg-mavecam-primary flex-row items-center pt-14 pb-4 px-4">
        <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-white">{t('dailyLogTitle')}</Text>
      </View>

      <View className="p-4">
        <CycleSelector
          cycles={activeCycles}
          selectedCycleId={selectedCycle}
          onSelectCycle={(cycleId) => {
            setSelectedCycle(cycleId);
            setFormData((prev) => ({ ...prev, cycle_id: cycleId }));
          }}
        />

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('dailyData')}</Text>

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
                placeholder="Ex: 1200"
                keyboardType="numeric"
              />
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('mortality')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.mortality_count}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, mortality_count: value }))}
                placeholder="Ex: 2"
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('waterTemperatureUnit')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.water_temperature}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, water_temperature: value }))}
                placeholder="Ex: 28.5"
                keyboardType="numeric"
              />
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-dark mb-2">{t('phLevel')}</Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
              value={formData.ph_level}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, ph_level: value }))}
              placeholder="Ex: 7.2"
              keyboardType="numeric"
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
        </View>

        {formData.sample_count && formData.sample_total_weight && (() => {
          const sampleWeight = parseFloat(formData.sample_total_weight) || 0;
          const sampleCount = parseFloat(formData.sample_count) || 0;
          const avgWeight = estimateAverageWeight(sampleWeight, sampleCount);

          return (
            <View className="mb-6">
              <Text className="text-base font-bold text-gray-dark mb-3">{t('autoCalculations')}</Text>
              <View className="bg-white p-4 rounded-lg border border-green-200">
                <View className="flex-row justify-between mb-2">
                  <Text className="text-sm text-gray-light">{t('averageWeight')} :</Text>
                  <Text className="text-sm font-semibold text-mavecam-primary">{avgWeight.toFixed(1)} g</Text>
                </View>
              </View>
            </View>
          );
        })()}

        <TouchableOpacity
          className={`bg-mavecam-primary flex-row items-center justify-center py-4 rounded-lg mt-4 gap-2 ${saving ? 'opacity-60' : ''}`}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={MAVECAM_COLORS.WHITE} />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color={MAVECAM_COLORS.WHITE} />
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
