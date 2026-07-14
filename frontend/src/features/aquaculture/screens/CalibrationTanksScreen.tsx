import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StackScreenProps } from '@react-navigation/stack';

import { AppText, Button, Card, EmptyState, ErrorState, LoadingState, Screen, TextField } from '@/components/ui';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { offlineService } from '@/services/offlineService';
import type { RootStackParamList } from '@/navigation/MainNavigator';
import { spacing } from '@/theme';
import type { CalibrationTank } from '@/types/aquaculture';

type Props = StackScreenProps<RootStackParamList, 'CalibrationTanks'>;

export default function CalibrationTanksScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [tanks, setTanks] = useState<CalibrationTank[]>([]);
  const [name, setName] = useState('');
  const [volume, setVolume] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try { setTanks(await aquacultureService.getCalibrationTanks()); setError(false); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    const parsed = Number(volume.replace(',', '.'));
    if (!name.trim() || !Number.isFinite(parsed) || parsed <= 0) return;
    setSaving(true);
    try {
      const tank = await aquacultureService.createCalibrationTank({ name: name.trim(), volume_m3: parsed });
      setTanks((current) => [...current, tank]); setName(''); setVolume('');
    } catch (error) {
      if (!(error as { response?: unknown })?.response) {
        await offlineService.saveCalibrationTankOffline({ name: name.trim(), volume_m3: parsed });
        setName(''); setVolume('');
      } else { setError(true); }
    } finally { setSaving(false); }
  };

  if (loading) return <LoadingState message={t('calibrationTanksLoading')} />;
  if (error) return <Screen><ErrorState message={t('calibrationTanksLoadError')} /><Button label={t('retry')} onPress={() => void load()} /></Screen>;
  return (
    <Screen scroll>
      <View style={styles.content}>
        <AppText variant="screenTitle">{t('calibrationTanksTitle')}</AppText>
        <TextField label={t('calibrationTankName')} value={name} onChangeText={setName} required />
        <TextField label={t('calibrationTankVolume')} value={volume} onChangeText={setVolume} keyboardType="decimal-pad" required />
        <Button label={t('createCalibrationTank')} onPress={() => void create()} loading={saving} disabled={!name.trim() || !volume} />
        {!tanks.length ? <EmptyState title={t('noCalibrationTanks')} message={t('createCalibrationTankHint')} /> : tanks.map((tank) => (
          <Card key={tank.id} variant="outlined" style={styles.card}>
            <AppText variant="cardTitle">{tank.name}</AppText>
            <AppText>{t('calibrationTankVolumeValue', { volume: tank.volume_m3 })}</AppText>
            <AppText color={tank.is_occupied ? 'warning' : 'success'}>{t(tank.is_occupied ? 'calibrationTankOccupied' : 'calibrationTankAvailable')}</AppText>
            <Button label={t('viewCalibrationTank')} variant="outline" onPress={() => navigation.navigate('CalibrationTankDetail', { tankId: tank.id })} />
          </Card>
        ))}
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({ content: { gap: spacing[4] }, card: { gap: spacing[2] } });
