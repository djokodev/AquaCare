import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { fetchDashboardData, setCurrentCycle } from '@/features/aquaculture/store/aquacultureSlice';
import { DailyLogForm } from '@/types/aquaculture';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { estimateAverageWeight } from '@/domain/aquaculture/estimators';
import { calculateStockValue, calculateEstimatedBiomass } from '@/constants/aquaculture';
import SuccessRewardModal from '@/components/modals/SuccessRewardModal';
import CycleSelector from '@/components/common/CycleSelector';
import { AppHeader, AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { colors, spacing } from '@/theme';
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
  const selectedCycleData =
    sessionScopedCycles.find((cycle) => cycle.id === selectedCycle) || sessionScopedCycles[0] || null;
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
      <Screen style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[5] }}>
        <Ionicons name="fish-outline" size={64} color={colors.text.muted} />
        <AppText variant="cardTitle" style={{ marginTop: spacing[4] }}>{t('noActiveCycles')}</AppText>
        <AppText variant="body" color="muted" style={{ marginTop: spacing[2], marginBottom: spacing[6], textAlign: 'center' }}>{t('createCycleToStart')}</AppText>
        <Button label={t('createCycle')} onPress={() => navigation.navigate('CreateFarm')} fullWidth={false} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <AppHeader title={t('dailyLogTitle')} onBack={() => navigation.goBack()} backLabel={t('back')} />

      <View style={{ gap: spacing[5] }}>
        {unitAllocationId ? (
          <Card variant="outlined">
            <AppText variant="label" color="link" style={{ marginBottom: spacing[1] }}>
              {selectedCycleData?.cycle_name || t('sessionCycleNotSelected')}
            </AppText>
            <AppText variant="body" color="muted">{t('dailyLogUnitContextLabel', { unitName })}</AppText>
          </Card>
        ) : (
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
        )}

        <Card>
          <AppText variant="sectionTitle" style={{ marginBottom: spacing[4] }}>{t('dailyRecommendedSection')}</AppText>

          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <TextField
                label={t('mortality')}
                value={formData.mortality_count}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, mortality_count: value }))}
                placeholder={t('mortalityPlaceholder')}
                keyboardType="numeric"
              />
            </View>

            <View style={{ flex: 1 }}>
              <TextField
                label={t('mortalityReason')}
                value={formData.mortality_reason}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, mortality_reason: value }))}
                placeholder={t('mortalityReasonPlaceholder')}
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <TextField
                label={t('feedQuantity')}
                value={formData.feed_quantity}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, feed_quantity: value }))}
                placeholder={t('feedQuantityPlaceholder')}
                keyboardType="numeric"
              />
            </View>

            <View style={{ flex: 1 }}>
              <TextField
                label={t('feedType')}
                value={formData.feed_type}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, feed_type: value }))}
                placeholder={t('feedTypePlaceholder')}
              />
            </View>
          </View>

          <View>
            <TextField
              label={t('feedSizeMm')}
              value={formData.feed_size_mm}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, feed_size_mm: value }))}
              placeholder={t('feedSizeMmPlaceholder')}
              keyboardType="numeric"
            />
          </View>

          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <TextField
                label={t('waterTemperatureUnit')}
                value={formData.water_temperature}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, water_temperature: value }))}
                placeholder={t('waterTemperaturePlaceholder')}
                keyboardType="numeric"
              />
            </View>

            <View style={{ flex: 1 }}>
              <TextField
                label={t('dissolvedOxygen')}
                value={formData.dissolved_oxygen}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, dissolved_oxygen: value }))}
                placeholder={t('dissolvedOxygenPlaceholder')}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <TextField
                label={t('phLevel')}
                value={formData.ph_level}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, ph_level: value }))}
                placeholder={t('phLevelPlaceholder')}
                keyboardType="numeric"
              />
            </View>

            <View style={{ flex: 1 }}>
              <TextField
                label={t('ammoniaLevel')}
                value={formData.ammonia_level}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, ammonia_level: value }))}
                placeholder={t('ammoniaLevelPlaceholder')}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View>
            <TextField
              label={t('feedingTimes')}
              value={formData.feeding_times}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, feeding_times: value }))}
              placeholder={t('feedingTimesPlaceholder')}
            />
          </View>

          <View>
            <TextField
              label={t('observations')}
              value={formData.observations}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, observations: value }))}
              placeholder={t('observationsPlaceholder')}
              multiline
              numberOfLines={4}
            />
          </View>

          <AppText variant="sectionTitle" style={{ marginTop: spacing[1], marginBottom: spacing[4] }}>{t('weeklyRecommendedSection')}</AppText>

          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <TextField
                label={t('sampleCount')}
                value={formData.sample_count}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, sample_count: value }))}
                placeholder={t('exampleAffectedCount')}
                keyboardType="numeric"
              />
            </View>

            <View style={{ flex: 1 }}>
              <TextField
                label={t('sampleWeight')}
                value={formData.sample_total_weight}
                onChangeText={(value) => setFormData((prev) => ({ ...prev, sample_total_weight: value }))}
                placeholder={t('sampleWeightPlaceholder')}
                keyboardType="numeric"
              />
            </View>
          </View>
        </Card>

        {formData.sample_count && formData.sample_total_weight && (() => {
          const sampleWeight = parseOptionalNumber(formData.sample_total_weight) || 0;
          const sampleCount = parseOptionalInteger(formData.sample_count) || 0;
          const avgWeight = estimateAverageWeight(sampleWeight, sampleCount);

          return (
            <View>
              <AppText variant="sectionTitle" style={{ marginBottom: spacing[4] }}>{t('autoCalculations')}</AppText>
              <Card variant="outlined">
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <AppText variant="caption" color="muted">{t('averageWeight')} :</AppText>
                  <AppText variant="caption" color="link">{avgWeight.toFixed(1)} g</AppText>
                </View>
              </Card>
            </View>
          );
        })()}

        <Button label={t('save')} onPress={handleSave} disabled={saving} loading={saving} iconLeft="checkmark" />
      </View>

      <SuccessRewardModal
        visible={rewardModalVisible}
        onClose={handleCloseRewardModal}
        averageWeight={rewardData.averageWeight}
        fishCount={rewardData.fishCount}
        estimatedBiomass={rewardData.estimatedBiomass}
        stockValue={rewardData.stockValue}
      />
    </Screen>
  );
}
