import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch } from 'react-redux';
import { useAuth } from '@/hooks/useAuth';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { offlineService } from '@/services/offlineService';
import { CreateCycleForm } from '@/types/aquaculture';
import { AppDispatch } from '@/store/store';
import { fetchDashboardData } from '@/features/aquaculture/store/aquacultureSlice';
import { MAVECAM_COLORS } from '@/constants/colors';
import { estimateBiomass, estimateDensityWithUnit } from '@/domain';
import { parseApiError, formatErrorForDisplay, logApiError, hasFieldError } from '@/utils/errorParser';

const SPECIES_OPTIONS = [
  { value: 'clarias', label: 'Clarias', duration: '120 jours' },
  { value: 'tilapia', label: 'Tilapia', duration: '180 jours' },
];

interface NewCycleData {
  cycle_name: string;
  species: string;
  pond_identifier: string;
  pond_surface_m2: string;
  pond_volume_m3: string;
  initial_count: string;
  initial_average_weight: string;
  start_date: string;
}

export default function NewCycleScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { farmProfile } = useAuth();
  const dispatch = useDispatch<AppDispatch>();

  const [formData, setFormData] = useState<NewCycleData>({
    cycle_name: '',
    species: '',
    pond_identifier: '',
    pond_surface_m2: '',
    pond_volume_m3: '',
    initial_count: '',
    initial_average_weight: '',
    start_date: new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);

  const getSelectedSpecies = () => SPECIES_OPTIONS.find((option) => option.value === formData.species);

  const estimateInitialBiomass = () => {
    const count = parseFloat(formData.initial_count) || 0;
    const weight = parseFloat(formData.initial_average_weight) || 0;
    return estimateBiomass(count, weight).toFixed(2);
  };

  const estimateDensityValue = () => {
    const biomass = parseFloat(estimateInitialBiomass());
    const volume = parseFloat(formData.pond_volume_m3) || undefined;
    const surface = parseFloat(formData.pond_surface_m2) || undefined;

    const { value, unit } = estimateDensityWithUnit(biomass, volume, surface);
    return { value: value.toFixed(2), unit };
  };

  const generateCycleName = () => {
    const species = getSelectedSpecies();
    const date = new Date();
    const quarter = Math.ceil((date.getMonth() + 1) / 3);
    const year = date.getFullYear();

    if (species && formData.pond_identifier) {
      const name = `${species.label.split(' ')[0]} ${formData.pond_identifier} Q${quarter} ${year}`;
      setFormData((prev) => ({ ...prev, cycle_name: name }));
    }
  };

  useEffect(() => {
    if (formData.species && formData.pond_identifier) {
      generateCycleName();
    }
  }, [formData.species, formData.pond_identifier]);

  const validateForm = () => {
    const required = ['cycle_name', 'species', 'pond_identifier', 'initial_count', 'initial_average_weight'];

    for (const field of required) {
      if (!formData[field as keyof NewCycleData].trim()) {
        return false;
      }
    }

    if (parseFloat(formData.initial_count) <= 0) return false;
    if (parseFloat(formData.initial_average_weight) <= 0) return false;

    const hasSurface = formData.pond_surface_m2.trim() !== '' && parseFloat(formData.pond_surface_m2) > 0;
    const hasVolume = formData.pond_volume_m3.trim() !== '' && parseFloat(formData.pond_volume_m3) > 0;

    if (!hasSurface && !hasVolume) {
      return false;
    }

    return true;
  };

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
    dispatch(fetchDashboardData());
    tryOfflineSync();
  }, [dispatch]);

  const handleSave = async () => {
    if (!validateForm()) {
      Alert.alert(t('error'), t('fillRequiredFields'));
      return;
    }

    setSaving(true);
    try {
      const cycleData: CreateCycleForm = {
        cycle_name: formData.cycle_name,
        species: formData.species as 'clarias' | 'tilapia',
        pond_identifier: formData.pond_identifier,
        pond_surface_m2: formData.pond_surface_m2 ? parseFloat(formData.pond_surface_m2) : undefined,
        pond_volume_m3: formData.pond_volume_m3 ? parseFloat(formData.pond_volume_m3) : undefined,
        start_date: formData.start_date,
        initial_count: parseInt(formData.initial_count),
        initial_average_weight: parseFloat(formData.initial_average_weight),
      };

      try {
        await aquacultureService.createProductionCycle(cycleData);
        dispatch(fetchDashboardData());

        Alert.alert(t('success'), t('cycleCreatedSuccess'), [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } catch (apiError: any) {
        const isNetworkError =
          apiError.code === 'NETWORK_ERROR' ||
          apiError.message?.toLowerCase().includes('network') ||
          apiError.message?.toLowerCase().includes('connection') ||
          !apiError.response;

        if (isNetworkError) {
          console.log('Pas de connexion, sauvegarde cycle offline...');
          await offlineService.saveNewCycleOffline(cycleData);

          Alert.alert(t('success'), t('cycleCreatedOffline'), [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        } else {
          throw apiError;
        }
      }
    } catch (error: any) {
      // Parser l'erreur pour avoir des détails exploitables
      const parsedError = parseApiError(error);

      // Log détaillé en dev pour debugging
      logApiError(error, 'Création cycle de production');

      // Afficher l'erreur formatée à l'utilisateur
      Alert.alert(
        t('error'),
        formatErrorForDisplay(parsedError),
        [{ text: 'OK', style: 'cancel' }]
      );

      // Si erreur de densité, afficher aide contextuelle
      if (hasFieldError(parsedError, 'initial_count') && formData.initial_count && formData.pond_surface_m2) {
        const density = Math.round(
          parseInt(formData.initial_count) / parseFloat(formData.pond_surface_m2)
        );

        setTimeout(() => {
          Alert.alert(
            t('help'),
            `${t('densityTooHigh')}\n\n` +
              `${t('maxDensity')}: 500 ${t('fishPerM2')}\n` +
              `${t('yourDensity')}: ${density} ${t('fishPerM2')}\n\n` +
              t('densitySuggestion'),
            [{ text: t('understood'), style: 'default' }]
          );
        }, 500);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView className="flex-1 bg-cream">
      <View className="bg-mavecam-primary flex-row items-center pt-14 pb-4 px-4">
        <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-white">{t('newCycleTitle')}</Text>
      </View>

      <View className="p-4">
        <View className="bg-white p-4 rounded-lg flex-row items-center mb-6 gap-3 border border-gray-200">
          <Ionicons name="business" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text className="text-base font-semibold text-gray-dark">
            {farmProfile?.farm_name || 'Ferme non definie'}
          </Text>
        </View>

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('speciesSelection')} {t('requiredField')}</Text>
          <View className="gap-2">
            {SPECIES_OPTIONS.map((species) => (
              <TouchableOpacity
                key={species.value}
                className={`p-4 rounded-lg border flex-row items-center justify-between ${
                  formData.species === species.value
                    ? 'bg-mavecam-primary border-mavecam-primary'
                    : 'bg-white border-gray-200'
                }`}
                onPress={() => setFormData((prev) => ({ ...prev, species: species.value }))}
              >
                <View className="flex-1 mr-2">
                  <Text
                    className={`text-base font-semibold ${
                      formData.species === species.value ? 'text-white' : 'text-gray-dark'
                    }`}
                  >
                    {species.label}
                  </Text>
                  <Text
                    className={`text-sm ${
                      formData.species === species.value ? 'text-white' : 'text-gray-light'
                    }`}
                  >
                    {species.duration}
                  </Text>
                </View>
                {formData.species === species.value && (
                  <Ionicons name="checkmark-circle" size={20} color={MAVECAM_COLORS.WHITE} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('pondInfo')}</Text>

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-dark mb-2">{t('pondName')} {t('requiredField')}</Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
              value={formData.pond_identifier}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, pond_identifier: value }))}
              placeholder={t('pondNamePlaceholder')}
            />
          </View>

          <View className="flex-row items-center bg-[#e0f2fe] p-3 rounded-lg mb-4 gap-2">
            <Ionicons name="information-circle" size={18} color={MAVECAM_COLORS.INFO} />
            <Text className="flex-1 text-sm text-mavecam-primary">
              {t('pondDimensionsInfo') || 'Renseignez au moins la surface OU le volume du bassin'}
            </Text>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('surface')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.pond_surface_m2}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, pond_surface_m2: value }))}
                placeholder="Ex: 100"
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('volume')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.pond_volume_m3}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, pond_volume_m3: value }))}
                placeholder="Ex: 150"
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('initialStocking')}</Text>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('initialCount')} {t('requiredField')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.initial_count}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, initial_count: value }))}
                placeholder="Ex: 1000"
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('initialWeight')} {t('requiredField')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.initial_average_weight}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, initial_average_weight: value }))}
                placeholder="Ex: 10"
                keyboardType="numeric"
              />
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-dark mb-2">{t('startDate')} {t('requiredField')}</Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
              value={formData.start_date}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, start_date: value }))}
              placeholder="YYYY-MM-DD"
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-dark mb-2">{t('cycleName')}</Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
              value={formData.cycle_name}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, cycle_name: value }))}
              placeholder={t('cycleNamePlaceholder')}
            />
          </View>
        </View>

        {formData.initial_count && formData.initial_average_weight && (() => {
          const density = estimateDensityValue();
          const selectedSpecies = getSelectedSpecies();

          return (
            <View className="mb-6">
              <Text className="text-base font-bold text-gray-dark mb-3">{t('autoCalculations')}</Text>
              <View className="bg-white p-4 rounded-lg border border-green-200">
                <View className="flex-row justify-between mb-2">
                  <Text className="text-sm text-gray-light">{t('initialBiomass')} :</Text>
                  <Text className="text-sm font-semibold text-mavecam-primary">{estimateInitialBiomass()} kg</Text>
                </View>

                {(formData.pond_surface_m2 || formData.pond_volume_m3) && (
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-sm text-gray-light">{t('initialDensity')} :</Text>
                    <Text className="text-sm font-semibold text-mavecam-primary">
                      {density.value} {density.unit}
                    </Text>
                  </View>
                )}

                {selectedSpecies && (
                  <View className="flex-row justify-between">
                    <Text className="text-sm text-gray-light">{t('expectedDuration')} :</Text>
                    <Text className="text-sm font-semibold text-mavecam-primary">{selectedSpecies.duration}</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })()}

        <TouchableOpacity
          className={`bg-mavecam-primary flex-row items-center justify-center py-4 rounded-lg mt-4 gap-2 ${
            !validateForm() || saving ? 'opacity-60' : ''
          }`}
          onPress={handleSave}
          disabled={!validateForm() || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={MAVECAM_COLORS.WHITE} />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color={MAVECAM_COLORS.WHITE} />
              <Text className="text-white text-base font-semibold">{t('createCycle')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}




