import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { fetchDashboardData } from '@/store/slices/aquacultureSlice';
import { aquacultureService } from '@/services/aquacultureService';
import { offlineService } from '@/services/offlineService';
import { DailyLogForm } from '@/types/aquaculture';
import { MAVECAM_COLORS } from '@/constants/colors';
import { estimateAverageWeight } from '@/domain';

interface DailyLogData {
  cycle_id: string;
  sample_count: string;
  sample_total_weight: string;
  mortality_count: string;
  water_temperature: string;
  ph_level: string;
  observations: string;
}

export default function DailyLogScreen({ navigation }: any) {
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

  useEffect(() => {
    dispatch(fetchDashboardData());
    tryOfflineSync();
  }, [dispatch]);

  const tryOfflineSync = async () => {
    try {
      const hasPending = await offlineService.hasPendingSync();
      if (hasPending) {
        console.log('Sync offline data...');
        const result = await offlineService.syncOfflineLogs();

        if (result.success > 0) {
          console.log(`${result.success} saisies synchronisees`);
          dispatch(fetchDashboardData());
        }

        if (result.failed > 0) {
          console.log(`${result.failed} saisies non synchronisees`);
        }
      }
    } catch (error) {
      console.error('Erreur synchronisation silencieuse:', error);
    }
  };

  useEffect(() => {
    if (activeCycles.length > 0 && !selectedCycle) {
      setSelectedCycle(activeCycles[0].id);
      setFormData((prev) => ({ ...prev, cycle_id: activeCycles[0].id }));
    }
  }, [activeCycles, selectedCycle]);

  const handleSave = async () => {
    if (!selectedCycle) {
      Alert.alert(t('error'), t('noCycleSelected'));
      return;
    }

    setSaving(true);
    try {
      const sampleCount = parseFloat(formData.sample_count) || 0;
      const sampleWeight = parseFloat(formData.sample_total_weight) || 0;

      const logData: DailyLogForm = {
        log_date: new Date().toISOString().split('T')[0],
        mortality_count: formData.mortality_count ? parseInt(formData.mortality_count) : undefined,
        sample_count: sampleCount > 0 ? sampleCount : undefined,
        sample_total_weight: sampleWeight > 0 ? sampleWeight : undefined,
        water_temperature: formData.water_temperature ? parseFloat(formData.water_temperature) : undefined,
        ph_level: formData.ph_level ? parseFloat(formData.ph_level) : undefined,
        observations: formData.observations || undefined,
      };

      try {
        await aquacultureService.createCycleLog(selectedCycle, logData);
        dispatch(fetchDashboardData());

        Alert.alert(t('success'), t('recordSaved'), [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } catch (apiError: any) {
        const isNetworkError =
          apiError.code === 'NETWORK_ERROR' ||
          apiError.message?.toLowerCase().includes('network') ||
          apiError.message?.toLowerCase().includes('connection') ||
          !apiError.response;

        if (isNetworkError) {
          console.log('Pas de connexion, sauvegarde offline...');
          await offlineService.saveCycleLogOffline(selectedCycle, logData);

          Alert.alert(t('success'), t('recordSavedOffline'), [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        } else {
          throw apiError;
        }
      }
    } catch (error: any) {
      console.error('Error creating daily log:', error);

      let errorMessage = t('recordSaveError');
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert(t('error'), errorMessage);
    } finally {
      setSaving(false);
    }
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
        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('cycleSelection')}</Text>
          {activeCycles.map((cycle) => (
            <TouchableOpacity
              key={cycle.id}
              className={`bg-white p-4 rounded-lg mb-2 border flex-row justify-between items-center ${
                selectedCycle === cycle.id ? 'border-mavecam-primary bg-[#f0fdf4]' : 'border-gray-200'
              }`}
              onPress={() => {
                setSelectedCycle(cycle.id);
                setFormData((prev) => ({ ...prev, cycle_id: cycle.id }));
              }}
            >
              <View className="flex-1">
                <Text className="text-base font-semibold text-gray-dark">
                  Bassin {cycle.pond_identifier || cycle.id.slice(-4)}
                </Text>
                <Text className="text-sm text-gray-light mt-1">
                  {cycle.current_count} poissons - {cycle.species}
                </Text>
              </View>
              {selectedCycle === cycle.id && (
                <Ionicons name="checkmark-circle" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('dailyData')}</Text>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('sampleCount')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.sample_count}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, sample_count: value }))}
                placeholder="Ex: 10"
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
    </ScrollView>
  );
}
