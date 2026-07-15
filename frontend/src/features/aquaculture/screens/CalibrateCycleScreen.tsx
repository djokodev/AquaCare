import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StackScreenProps } from '@react-navigation/stack';

import { AppText, Button, Card, ErrorState, LoadingState, Screen, TextField } from '@/components/ui';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import type { RootStackParamList } from '@/navigation/MainNavigator';
import { offlineService } from '@/services/offlineService';
import { spacing } from '@/theme';
import type { CalibrationRequest, CalibrationTank, ProductionCycle } from '@/types/aquaculture';

type Props = StackScreenProps<RootStackParamList, 'CalibrateCycle'>;
type SizeCategory = NonNullable<CalibrationRequest['size_category']>;

const DENSITY_LIMIT_KG_M3 = { tilapia: 100, clarias: 150 } as const;

const localDate = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const localTime = (value: Date): string => (
  `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
);

export default function CalibrateCycleScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const sourceAllocationId = route.params.sourceCycleUnitAllocationId;
  const now = useMemo(() => new Date(), []);
  const [source, setSource] = useState<ProductionCycle>();
  const [tanks, setTanks] = useState<CalibrationTank[]>([]);
  const [tankId, setTankId] = useState('');
  const [date, setDate] = useState(localDate(now));
  const [time, setTime] = useState(localTime(now));
  const [count, setCount] = useState('');
  const [weight, setWeight] = useState('');
  const [sampleCount, setSampleCount] = useState('');
  const [sampleWeight, setSampleWeight] = useState('');
  const [sizeCategory, setSizeCategory] = useState<SizeCategory>('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [cycleResult, tanksResult, offlineResult] = await Promise.allSettled([
      aquacultureService.getProductionCycle(route.params.sourceCycleId),
      aquacultureService.getCalibrationTanks(),
      offlineService.getOfflineCalibrationTanks(),
    ]);
    if (cycleResult.status === 'rejected') {
      setLoadError(true);
      setLoading(false);
      return;
    }
    const serverTanks = tanksResult.status === 'fulfilled' ? tanksResult.value : [];
    const pendingTanks: CalibrationTank[] = offlineResult.status === 'fulfilled'
      ? offlineResult.value.filter((item) => !item.synced).map((item) => ({
        id: item.id,
        client_uuid: item.tankData.client_uuid,
        farm_profile: '',
        name: item.tankData.name,
        volume_m3: item.tankData.volume_m3,
        is_active: item.tankData.is_active ?? true,
        is_occupied: false,
        pending_sync: true,
        created_offline: true,
        created_at: new Date(item.timestamp).toISOString(),
        updated_at: new Date(item.timestamp).toISOString(),
      }))
      : [];
    const serverClientUuids = new Set(serverTanks.map((tank) => tank.client_uuid).filter(Boolean));
    const activeTanks = [
      ...serverTanks,
      ...pendingTanks.filter((tank) => !serverClientUuids.has(tank.client_uuid)),
    ].filter((tank) => tank.is_active);
    setSource(cycleResult.value);
    setTanks(activeTanks);
    setTankId((current) => activeTanks.some((tank) => tank.id === current) ? current : activeTanks[0]?.id ?? '');
    setLoadError(tanksResult.status === 'rejected' && activeTanks.length === 0);
    setLoading(false);
  }, [route.params.sourceCycleId]);

  useEffect(() => {
    void loadData();
    return navigation.addListener('focus', () => void loadData());
  }, [loadData, navigation]);

  const preview = useMemo(() => {
    const transferredCount = Number(count);
    const directWeight = Number(weight.replace(',', '.'));
    const sampledCount = Number(sampleCount);
    const sampledWeight = Number(sampleWeight.replace(',', '.'));
    const effectiveWeight = sampledCount > 0 && sampledWeight > 0
      ? sampledWeight / sampledCount
      : directWeight > 0 ? directWeight : 0;
    const tank = tanks.find((item) => item.id === tankId);
    if (!source || !tank || !transferredCount || !effectiveWeight) return null;
    const sourceCount = route.params.sourceCurrentCount ?? source.current_count;
    const sourceBiomass = route.params.sourceCurrentBiomassKg ?? source.current_biomass;
    const transferredBiomass = transferredCount * effectiveWeight / 1000;
    const destinationCount = tank.active_session?.current_count ?? 0;
    const destinationBiomass = Number(tank.active_session?.current_biomass ?? 0);
    const destinationAfterCount = destinationCount + transferredCount;
    const destinationAfterBiomass = destinationBiomass + transferredBiomass;
    const destinationAfterWeight = destinationAfterCount > 0
      ? destinationAfterBiomass * 1000 / destinationAfterCount
      : 0;
    const projectedDensity = destinationAfterBiomass / Number(tank.volume_m3);
    const destinationWeight = Number(tank.active_session?.current_average_weight ?? 0);
    const warnings: Array<'weight_difference' | 'high_density'> = [];
    if (destinationWeight > 0 && Math.abs(effectiveWeight - destinationWeight) / destinationWeight > 0.25) {
      warnings.push('weight_difference');
    }
    if (projectedDensity > DENSITY_LIMIT_KG_M3[source.species]) warnings.push('high_density');
    return {
      effectiveWeight,
      sourceBeforeCount: sourceCount,
      sourceBeforeBiomass: sourceBiomass,
      sourceAfterCount: sourceCount - transferredCount,
      sourceAfterBiomass: sourceBiomass - transferredBiomass,
      transferredBiomass,
      destinationCount,
      destinationBiomass,
      destinationAfterCount,
      destinationAfterBiomass,
      destinationAfterWeight,
      projectedDensity,
      warnings,
    };
  }, [count, route.params.sourceCurrentBiomassKg, route.params.sourceCurrentCount, sampleCount, sampleWeight, source, tankId, tanks, weight]);

  const submit = async () => {
    if (saving || !source || !sourceAllocationId || !tankId || !preview) return;
    const calibratedAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(calibratedAt.getTime())) {
      Alert.alert(t('error'), t('calibrationInvalidDate'));
      return;
    }
    const destinationTank = tanks.find((tank) => tank.id === tankId);
    if (!destinationTank) return;
    const payload: CalibrationRequest = {
      client_uuid: aquacultureService.prepareOfflineData({}).client_uuid,
      source_allocation_id: sourceAllocationId,
      ...(destinationTank.pending_sync
        ? { destination_production_unit_client_uuid: destinationTank.client_uuid }
        : { destination_production_unit_id: destinationTank.id }),
      calibrated_at: calibratedAt.toISOString(),
      transferred_count: Number(count),
      ...(Number(weight.replace(',', '.')) > 0 ? { transferred_average_weight_g: Number(weight.replace(',', '.')) } : {}),
      ...(Number(sampleCount) > 0 ? { sample_count: Number(sampleCount) } : {}),
      ...(Number(sampleWeight.replace(',', '.')) > 0 ? { sample_total_weight_g: Number(sampleWeight.replace(',', '.')) } : {}),
      size_category: sizeCategory,
      notes: notes.trim(),
    };
    setSaving(true);
    try {
      const result = await aquacultureService.calibrateAllocation(sourceAllocationId, payload);
      const warningText = result.warnings.map((warning) => t(`calibrationWarning_${warning}`)).join('\n');
      Alert.alert(
        t('calibrationSuccess'),
        `${t('calibrationSuccessMessage', { count: result.destination_allocation.current_fish_count })}${warningText ? `\n\n${warningText}` : ''}`,
      );
      navigation.goBack();
    } catch (error) {
      const response = (error as { response?: { data?: { detail?: string } } }).response;
      if (!response) {
        await offlineService.saveCalibrationOperationOffline(sourceAllocationId, payload);
        Alert.alert(t('calibrationPending'), t('calibrationPendingMessage'));
        navigation.goBack();
      } else {
        Alert.alert(t('error'), response.data?.detail || t('calibrationError'));
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState message={t('calibrationLoading')} />;
  if (loadError) return <Screen><ErrorState message={t('calibrationLoadError')} /><Button label={t('retry')} onPress={() => void loadData()} /></Screen>;

  return (
    <Screen scroll>
      <View style={styles.content}>
        <AppText variant="screenTitle">{t('gradeFish')}</AppText>
        <TextField
          label={t('sourceUnit')}
          value={route.params.sourceUnitName ?? source?.cycle_name ?? ''}
          editable={false}
          style={styles.sourceUnitInput}
        />
        {!sourceAllocationId ? <AppText color="error">{t('calibrationSourceRequired')}</AppText> : null}
        {!tanks.length ? (
          <>
            <AppText>{t('noCalibrationTanksAvailable')}</AppText>
            <Button label={t('createCalibrationTank')} onPress={() => navigation.navigate('CalibrationTanks')} />
          </>
        ) : (
          <>
            <TextField label={t('calibrationDate')} value={date} onChangeText={setDate} required />
            <TextField label={t('calibrationTime')} value={time} onChangeText={setTime} required />
            <AppText variant="bodyStrong">{t('destinationTank')}</AppText>
            {tanks.map((tank) => (
              <Button key={tank.id} label={tank.name} variant={tank.id === tankId ? 'primary' : 'outline'} onPress={() => setTankId(tank.id)} />
            ))}
            <TextField label={t('transferredFish')} value={count} onChangeText={setCount} keyboardType="number-pad" required />
            <TextField label={t('averageWeightGrams')} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
            <TextField label={t('calibrationSampleCount')} value={sampleCount} onChangeText={setSampleCount} keyboardType="number-pad" />
            <TextField label={t('calibrationSampleWeight')} value={sampleWeight} onChangeText={setSampleWeight} keyboardType="decimal-pad" />
            <AppText variant="bodyStrong">{t('calibrationSizeCategory')}</AppText>
            {(['small', 'medium', 'large', 'other'] as SizeCategory[]).map((category) => (
              <Button key={category} label={t(`calibrationSize_${category}`)} variant={sizeCategory === category ? 'primary' : 'outline'} onPress={() => setSizeCategory(category)} />
            ))}
            <TextField label={t('calibrationNotes')} value={notes} onChangeText={setNotes} multiline />
            {preview ? (
              <Card>
                <AppText variant="cardTitle">{t('calibrationPreview')}</AppText>
                <AppText>{t('sourceBeforeValue', { count: preview.sourceBeforeCount, biomass: Number(preview.sourceBeforeBiomass).toFixed(2) })}</AppText>
                <AppText>{t('sourceAfterValue', { count: preview.sourceAfterCount, biomass: preview.sourceAfterBiomass.toFixed(2) })}</AppText>
                <AppText>{t('transferredBiomassValue', { biomass: preview.transferredBiomass.toFixed(2) })}</AppText>
                <AppText>{t('destinationBeforeValue', { count: preview.destinationCount, biomass: preview.destinationBiomass.toFixed(2) })}</AppText>
                <AppText>{t('destinationAfterValue', { count: preview.destinationAfterCount, biomass: preview.destinationAfterBiomass.toFixed(2) })}</AppText>
                <AppText>{t('destinationWeightValue', { weight: preview.destinationAfterWeight.toFixed(2) })}</AppText>
                <AppText>{t('projectedDensityValue', { density: preview.projectedDensity.toFixed(2) })}</AppText>
                {preview.warnings.map((warning) => <AppText key={warning} color="warning">{t(`calibrationWarning_${warning}`)}</AppText>)}
              </Card>
            ) : null}
            <Button label={t('confirmCalibration')} onPress={() => void submit()} loading={saving} disabled={!sourceAllocationId || !preview || preview.sourceAfterCount <= 0 || preview.sourceAfterBiomass <= 0 || Number(sampleCount) > Number(count)} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing[4] },
  sourceUnitInput: {
    alignSelf: 'stretch',
    includeFontPadding: false,
    textAlign: 'left',
    textAlignVertical: 'center',
  },
});
