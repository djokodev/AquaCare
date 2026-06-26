import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { useDispatch } from 'react-redux';

import { useAuth } from '@/hooks/useAuth';
import { AppDispatch } from '@/store/store';
import { fetchDashboardData } from '@/features/aquaculture/store/aquacultureSlice';
import { AQUACARE_COLORS } from '@/constants/colors';
import { estimateBiomass, estimateDensityWithUnit } from '@/domain/aquaculture/estimators';
import { parseApiError, logApiError, hasFieldError } from '@/utils/errorParser';
import { RootStackParamList } from '@/navigation/MainNavigator';
import {
  NewCycleData,
  ECONOMIC_DEFAULTS,
  MAX_DENSITY_BY_INFRA,
  parseFormNumber,
  validateNewCycleData,
  buildCyclePayload,
  buildSimulatorPrefill,
} from '@/features/aquaculture/utils/newCycleForm';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';
import {
  createProductionCycleWithOfflineFallback,
  runSilentOfflineSync,
} from '@/features/aquaculture/services/aquacultureWorkflowService';

const SPECIES_OPTIONS = [
  { value: 'clarias', labelKey: 'clarias', durationDays: 120 },
  { value: 'tilapia', labelKey: 'tilapia', durationDays: 180 },
] as const;

type NewCycleScreenNavigationProp = StackNavigationProp<RootStackParamList, 'NewCycle'>;

interface NewCycleScreenProps {
  navigation: NewCycleScreenNavigationProp;
}

const INFRASTRUCTURE_OPTIONS = [
  { value: 'etang', labelKey: 'etang' },
  { value: 'cage_flottante', labelKey: 'cageFlottante' },
  { value: 'bac_hors_sol', labelKey: 'bacHorsSol' },
] as const;

export default function NewCycleScreen({ navigation }: NewCycleScreenProps) {
  const { t } = useTranslation();
  const { farmProfile } = useAuth();
  const dispatch = useDispatch<AppDispatch>();

  const [formData, setFormData] = useState<NewCycleData>({
    cycle_name: '',
    species: '',
    pond_identifier: '',
    pond_surface_m2: '',
    pond_volume_m3: '',
    infrastructure_type: [],
    initial_count: '',
    initial_average_weight: '',
    start_date: new Date().toISOString().split('T')[0],
    target_harvest_weight_g: '',
    planned_cycle_duration_days: '',
    expected_survival_rate_pct: '',
    planned_selling_price_per_kg_fcfa: '',
    fingerlings_cost_fcfa: '0',
    other_operational_costs_fcfa: '0',
  });
  const [saving, setSaving] = useState(false);

  const getSelectedSpecies = () => SPECIES_OPTIONS.find((option) => option.value === formData.species);

  const applyEconomicDefaults = (species: 'clarias' | 'tilapia') => {
    const defaults = ECONOMIC_DEFAULTS[species];
    setFormData((prev) => ({
      ...prev,
      species,
      target_harvest_weight_g: String(defaults.target_harvest_weight_g),
      planned_cycle_duration_days: String(defaults.planned_cycle_duration_days),
      expected_survival_rate_pct: String(defaults.expected_survival_rate_pct),
      planned_selling_price_per_kg_fcfa: String(defaults.planned_selling_price_per_kg_fcfa),
      fingerlings_cost_fcfa: prev.fingerlings_cost_fcfa || '0',
      other_operational_costs_fcfa: prev.other_operational_costs_fcfa || '0',
    }));
  };

  const toggleInfrastructure = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      infrastructure_type: prev.infrastructure_type.includes(value)
        ? prev.infrastructure_type.filter((entry) => entry !== value)
        : [...prev.infrastructure_type, value],
    }));
  };

  const estimateInitialBiomass = () => {
    const count = parseFormNumber(formData.initial_count);
    const weight = parseFormNumber(formData.initial_average_weight);
    return estimateBiomass(count, weight).toFixed(2);
  };

  const estimateDensityValue = () => {
    const biomass = parseFormNumber(estimateInitialBiomass());
    const volume = parseFormNumber(formData.pond_volume_m3) || undefined;
    const surface = parseFormNumber(formData.pond_surface_m2) || undefined;

    const { value, unit } = estimateDensityWithUnit(biomass, volume, surface);
    return { value: value.toFixed(2), unit };
  };

  const generateCycleName = () => {
    const species = getSelectedSpecies();
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const year = now.getFullYear();

    if (species && formData.pond_identifier) {
      const name = `${t(species.labelKey)} ${formData.pond_identifier} Q${quarter} ${year}`;
      setFormData((prev) => ({ ...prev, cycle_name: name }));
    }
  };

  useEffect(() => {
    if (formData.species && formData.pond_identifier) {
      generateCycleName();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.species, formData.pond_identifier]);

  useEffect(() => {
    const bootstrap = async () => {
      await runSilentOfflineSync();
      dispatch(fetchDashboardData({ lightweight: true }));
    };
    bootstrap();
  }, [dispatch]);
  const isFormValid = validateNewCycleData(formData);

  const handleSave = async () => {
    if (!validateNewCycleData(formData)) {
      Alert.alert(t('error'), t('fillRequiredFields'));
      return;
    }

    setSaving(true);
    const cycleData = buildCyclePayload(formData);

    try {
      const creationResult = await createProductionCycleWithOfflineFallback(cycleData);
      if (creationResult.mode === 'online') {
        const createdCycle = creationResult.data;
        dispatch(fetchDashboardData({ lightweight: true }));

        const prefill = buildSimulatorPrefill(cycleData);
        Alert.alert(t('success'), t('cycleCreatedSuccess'), [
          {
            text: t('ok'),
            onPress: () =>
              navigation.replace('CycleSimulator', {
                cycleId: createdCycle.id,
                prefill,
              }),
          },
        ]);
      } else {
        Alert.alert(t('success'), t('cycleCreatedOfflineSimulationInfo'), [
          { text: t('ok'), onPress: () => navigation.goBack() },
        ]);
        return;
      }
    } catch (error: unknown) {
      const parsedError = parseApiError(error);
      logApiError(error, 'Creation cycle de production');

      Alert.alert(t('error'), formatAquacultureErrorWithAction(parsedError, t), [{ text: t('ok'), style: 'cancel' }]);

      if (hasFieldError(parsedError, 'initial_count') && formData.initial_count && formData.pond_surface_m2) {
        const surface = parseFormNumber(formData.pond_surface_m2);
        const volume = parseFormNumber(formData.pond_volume_m3);
        const count = parseFormNumber(formData.initial_count);
        const usePondDensity =
          formData.infrastructure_type.length === 0 ||
          formData.infrastructure_type.includes('etang');

        const density = usePondDensity && surface > 0
          ? Math.round(count / surface)
          : volume > 0
            ? Math.round(count / volume)
            : Math.round(count / Math.max(surface, 1));
        const maxDensity = usePondDensity
          ? MAX_DENSITY_BY_INFRA.pondPerM2
          : MAX_DENSITY_BY_INFRA.tankPerM3;
        const unit = usePondDensity ? t('fishPerM2') : t('fishPerM3');
        setTimeout(() => {
          Alert.alert(
            t('help'),
            `${t('densityTooHigh')}\n\n${t('maxDensity')}: ${maxDensity} ${unit}\n${t('yourDensity')}: ${density} ${unit}\n\n${t('densitySuggestion')}`,
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
      <View className="bg-aquacare-primary flex-row items-center pt-14 pb-4 px-4">
        <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={AQUACARE_COLORS.WHITE} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-white">{t('newCycleTitle')}</Text>
      </View>

      <View className="p-4">
        <View className="bg-white p-4 rounded-lg flex-row items-center mb-6 gap-3 border border-gray-200">
          <Ionicons name="business" size={20} color={AQUACARE_COLORS.GREEN_PRIMARY} />
          <Text className="text-base font-semibold text-gray-dark">{farmProfile?.farm_name || t('farmNotDefined')}</Text>
        </View>

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">
            {t('speciesSelection')} {t('requiredField')}
          </Text>
          <View className="gap-2">
            {SPECIES_OPTIONS.map((species) => (
              <TouchableOpacity
                key={species.value}
                className={`p-4 rounded-lg border flex-row items-center justify-between ${
                  formData.species === species.value
                    ? 'bg-aquacare-primary border-aquacare-primary'
                    : 'bg-white border-gray-200'
                }`}
                onPress={() => applyEconomicDefaults(species.value)}
              >
                <View className="flex-1 mr-2">
                  <Text
                    className={`text-base font-semibold ${
                      formData.species === species.value ? 'text-white' : 'text-gray-dark'
                    }`}
                  >
                    {t(species.labelKey)}
                  </Text>
                  <Text
                    className={`text-sm ${
                      formData.species === species.value ? 'text-white' : 'text-gray-light'
                    }`}
                  >
                    {species.durationDays} {t('days')}
                  </Text>
                </View>
                {formData.species === species.value && (
                  <Ionicons name="checkmark-circle" size={20} color={AQUACARE_COLORS.WHITE} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('pondInfo')}</Text>

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-dark mb-2">
              {t('pondName')} {t('requiredField')}
            </Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
              value={formData.pond_identifier}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, pond_identifier: value }))}
              placeholder={t('pondNamePlaceholder')}
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-dark mb-2">{t('infrastructureType')}</Text>
            <Text className="text-xs text-gray-light mb-2">{t('infrastructureTypeHint')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {INFRASTRUCTURE_OPTIONS.map((option) => {
                const selected = formData.infrastructure_type.includes(option.value);
                return (
                  <TouchableOpacity
                    key={option.value}
                    className={`flex-row items-center px-4 py-2 rounded-full border ${
                      selected ? 'bg-aquacare-primary border-aquacare-primary' : 'bg-white border-gray-200'
                    }`}
                    onPress={() => toggleInfrastructure(option.value)}
                  >
                    {selected && (
                      <Ionicons name="checkmark" size={14} color={AQUACARE_COLORS.WHITE} style={{ marginRight: 4 }} />
                    )}
                    <Text className={`text-sm font-medium ${selected ? 'text-white' : 'text-gray-dark'}`}>
                      {t(option.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View className="flex-row items-center bg-white border border-gray-200 p-3 rounded-lg mb-4 gap-2">
            <Ionicons name="information-circle" size={18} color={AQUACARE_COLORS.INFO} />
            <Text className="flex-1 text-sm text-aquacare-primary">{t('pondDimensionsInfo')}</Text>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('surface')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.pond_surface_m2}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, pond_surface_m2: value }))}
                placeholder={t('exampleValuePlaceholder', { value: 100 })}
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('volume')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.pond_volume_m3}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, pond_volume_m3: value }))}
                placeholder={t('exampleValuePlaceholder', { value: 150 })}
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('initialStocking')}</Text>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">
                {t('initialCount')} {t('requiredField')}
              </Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.initial_count}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, initial_count: value }))}
                placeholder={t('exampleValuePlaceholder', { value: 1000 })}
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">
                {t('initialWeight')} {t('requiredField')}
              </Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.initial_average_weight}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, initial_average_weight: value }))}
                placeholder={t('exampleValuePlaceholder', { value: 10 })}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-dark mb-2">
              {t('startDate')} {t('requiredField')}
            </Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
              value={formData.start_date}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, start_date: value }))}
              placeholder={t('dateFormatPlaceholder')}
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

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('economicProjectionTitle')}</Text>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">
                {t('targetWeight')} (g) {t('requiredField')}
              </Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.target_harvest_weight_g}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, target_harvest_weight_g: value }))}
                placeholder={t('exampleValuePlaceholder', {
                  value: formData.species === 'clarias' ? 400 : 300,
                })}
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">
                {t('cycleDuration')} ({t('days')}) {t('requiredField')}
              </Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.planned_cycle_duration_days}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, planned_cycle_duration_days: value }))}
                placeholder={t('exampleValuePlaceholder', {
                  value: formData.species === 'clarias' ? 150 : 120,
                })}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">
                {t('survivalRate')} (%) {t('requiredField')}
              </Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.expected_survival_rate_pct}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, expected_survival_rate_pct: value }))}
                placeholder={t('exampleValuePlaceholder', { value: 85 })}
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">
                {t('preEstimatedSellingPrice')} {t('requiredField')}
              </Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.planned_selling_price_per_kg_fcfa}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, planned_selling_price_per_kg_fcfa: value }))}
                placeholder={t('exampleValuePlaceholder', {
                  value: formData.species === 'clarias' ? 2000 : 1800,
                })}
                keyboardType="numeric"
              />
              <Text style={{ fontSize: 11, color: AQUACARE_COLORS.GREEN_PRIMARY, marginTop: 4 }}>
                {t('buyerNetworkSellingPriceHint')}
              </Text>
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('fingerlingsCostFcfa')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.fingerlings_cost_fcfa}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, fingerlings_cost_fcfa: value }))}
                placeholder={t('zeroValuePlaceholder')}
                keyboardType="numeric"
              />
            </View>

            <View className="flex-1 mb-4">
              <Text className="text-sm font-medium text-gray-dark mb-2">{t('otherOperationalCosts')}</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                value={formData.other_operational_costs_fcfa}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, other_operational_costs_fcfa: value }))}
                placeholder={t('zeroValuePlaceholder')}
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {formData.initial_count && formData.initial_average_weight ? (
          (() => {
            const density = estimateDensityValue();
            const selectedSpecies = getSelectedSpecies();
            const expectedDuration = formData.planned_cycle_duration_days || selectedSpecies?.durationDays;

            return (
              <View className="mb-6">
                <Text className="text-base font-bold text-gray-dark mb-3">{t('autoCalculations')}</Text>
                <View className="bg-white p-4 rounded-lg border border-green-200">
                  <View className="flex-row justify-between mb-2">
                    <Text className="text-sm text-gray-light">{t('initialBiomass')} :</Text>
                    <Text className="text-sm font-semibold text-aquacare-primary">{estimateInitialBiomass()} kg</Text>
                  </View>

                  {(formData.pond_surface_m2 || formData.pond_volume_m3) && (
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-sm text-gray-light">{t('initialDensity')} :</Text>
                      <Text className="text-sm font-semibold text-aquacare-primary">
                        {density.value} {density.unit}
                      </Text>
                    </View>
                  )}

                  {expectedDuration && (
                    <View className="flex-row justify-between">
                      <Text className="text-sm text-gray-light">{t('expectedDuration')} :</Text>
                      <Text className="text-sm font-semibold text-aquacare-primary">
                        {expectedDuration} {t('days')}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })()
        ) : null}

        <TouchableOpacity
          className={`bg-aquacare-primary flex-row items-center justify-center py-4 rounded-lg mt-4 gap-2 ${
            !isFormValid || saving ? 'opacity-60' : ''
          }`}
          onPress={handleSave}
          disabled={!isFormValid || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={AQUACARE_COLORS.WHITE} />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color={AQUACARE_COLORS.WHITE} />
              <Text className="text-white text-base font-semibold">{t('createCycle')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
