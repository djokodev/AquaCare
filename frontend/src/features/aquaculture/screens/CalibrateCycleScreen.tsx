import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StackScreenProps } from '@react-navigation/stack';

import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import type { RootStackParamList } from '@/navigation/MainNavigator';
import { offlineService } from '@/services/offlineService';
import { spacing } from '@/theme';
import type { CalibrationRequest, CalibrationTank, ProductionCycle } from '@/types/aquaculture';

type Props = StackScreenProps<RootStackParamList, 'CalibrateCycle'>;

export default function CalibrateCycleScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const [source, setSource] = useState<ProductionCycle>();
  const [tanks, setTanks] = useState<CalibrationTank[]>([]);
  const [tankId, setTankId] = useState('');
  const [count, setCount] = useState('');
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const [cycle, nextTanks] = await Promise.all([
      aquacultureService.getProductionCycle(route.params.sourceCycleId),
      aquacultureService.getCalibrationTanks(),
    ]);
    const activeTanks = nextTanks.filter((tank) => tank.is_active);
    setSource(cycle);
    setTanks(activeTanks);
    setTankId((current) => activeTanks.some((tank) => tank.id === current) ? current : activeTanks[0]?.id ?? '');
  }, [route.params.sourceCycleId]);

  useEffect(() => {
    void loadData();
    return navigation.addListener('focus', () => void loadData());
  }, [loadData, navigation]);

  const preview = useMemo(() => {
    const transferredCount = Number(count);
    const transferredWeight = Number(weight);
    if (!source || !transferredCount || !transferredWeight) return null;
    const sourceCount = route.params.sourceCurrentCount ?? source.current_count;
    const sourceBiomass = route.params.sourceCurrentBiomassKg ?? source.current_biomass;
    const transferredBiomass = transferredCount * transferredWeight / 1000;
    return {
      count: sourceCount - transferredCount,
      biomass: sourceBiomass - transferredBiomass,
      transferred: transferredBiomass,
    };
  }, [count, route.params.sourceCurrentBiomassKg, route.params.sourceCurrentCount, source, weight]);

  const submit = async () => {
    if (!source || !tankId || !preview) return;
    setSaving(true);
    const payload: CalibrationRequest = {
      client_uuid: aquacultureService.prepareOfflineData({}).client_uuid,
      destination_tank: tankId,
      source_cycle_unit_allocation: route.params.sourceCycleUnitAllocationId,
      calibrated_at: new Date().toISOString(),
      transferred_count: Number(count),
      transferred_average_weight_g: Number(weight),
    };
    try {
      const result = await aquacultureService.calibrateCycle(source.id, payload);
      Alert.alert(
        t('calibrationSuccess'),
        t('calibrationSuccessMessage', { count: result.destination_cycle.current_count }),
      );
      navigation.goBack();
    } catch (error) {
      if (!(error as { response?: unknown })?.response) {
        await offlineService.saveCalibrationOperationOffline(source.id, payload);
        Alert.alert(t('calibrationPending'), t('calibrationPendingMessage'));
        navigation.goBack();
      } else {
        Alert.alert(t('error'), t('calibrationError'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.content}>
        <AppText variant="screenTitle">{t('gradeFish')}</AppText>
        <TextField
          label={t('sourceUnit')}
          value={route.params.sourceUnitName ?? source?.cycle_name ?? ''}
          editable={false}
        />
        {!tanks.length ? (
          <>
            <AppText>{t('noCalibrationTanksAvailable')}</AppText>
            <Button
              label={t('createCalibrationTank')}
              onPress={() => navigation.navigate('CalibrationTanks')}
            />
          </>
        ) : (
          <>
            <AppText variant="bodyStrong">{t('destinationTank')}</AppText>
            {tanks.map((tank) => (
              <Button
                key={tank.id}
                label={tank.name}
                variant={tank.id === tankId ? 'primary' : 'outline'}
                onPress={() => setTankId(tank.id)}
              />
            ))}
            <TextField
              label={t('transferredFish')}
              value={count}
              onChangeText={setCount}
              keyboardType="number-pad"
            />
            <TextField
              label={t('averageWeightGrams')}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
            />
            {preview ? (
              <Card>
                <AppText>{t('transferredBiomassValue', { biomass: preview.transferred.toFixed(2) })}</AppText>
                <AppText>{t('sourceAfterValue', { count: preview.count, biomass: preview.biomass.toFixed(2) })}</AppText>
              </Card>
            ) : null}
            <Button
              label={t('confirmCalibration')}
              onPress={() => void submit()}
              loading={saving}
              disabled={!preview || preview.count <= 0 || preview.biomass <= 0}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing[4] } });
