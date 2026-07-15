import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StackScreenProps } from '@react-navigation/stack';

import { AppText, Button, Card, EmptyState, ErrorState, LoadingState, Screen, TextField } from '@/components/ui';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import type { RootStackParamList } from '@/navigation/MainNavigator';
import { offlineService } from '@/services/offlineService';
import { spacing } from '@/theme';
import type { CalibrationTank } from '@/types/aquaculture';

type Props = StackScreenProps<RootStackParamList, 'CalibrationTanks'>;

export default function CalibrationTanksScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [tanks, setTanks] = useState<CalibrationTank[]>([]);
  const [name, setName] = useState('');
  const [volume, setVolume] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [serverResult, offlineResult] = await Promise.allSettled([
      aquacultureService.getCalibrationTanks(),
      offlineService.getOfflineCalibrationTanks(),
    ]);
    const serverTanks = serverResult.status === 'fulfilled' ? serverResult.value : [];
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
    setTanks([...serverTanks, ...pendingTanks.filter((tank) => !serverClientUuids.has(tank.client_uuid))]);
    setError(serverResult.status === 'rejected' && pendingTanks.length === 0);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    return navigation.addListener('focus', () => void load());
  }, [load, navigation]);

  const resetForm = () => {
    setEditingId(undefined);
    setName('');
    setVolume('');
  };

  const save = async () => {
    const parsed = Number(volume.replace(',', '.'));
    if (saving || !name.trim() || !Number.isFinite(parsed) || parsed <= 0) return;
    setSaving(true);
    try {
      if (editingId) {
        const tank = await aquacultureService.updateCalibrationTank(editingId, { name: name.trim(), volume_m3: parsed });
        setTanks((current) => current.map((item) => item.id === tank.id ? tank : item));
      } else {
        const tank = await aquacultureService.createCalibrationTank({ name: name.trim(), volume_m3: parsed });
        setTanks((current) => [...current, tank]);
      }
      resetForm();
    } catch (caught) {
      if (!editingId && !(caught as { response?: unknown })?.response) {
        const clientUuid = aquacultureService.prepareOfflineData({}).client_uuid;
        const localId = await offlineService.saveCalibrationTankOffline({
          client_uuid: clientUuid,
          name: name.trim(),
          volume_m3: parsed,
        });
        setTanks((current) => [...current, {
          id: localId,
          client_uuid: clientUuid,
          farm_profile: '',
          name: name.trim(),
          volume_m3: parsed,
          is_active: true,
          is_occupied: false,
          pending_sync: true,
          created_offline: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }]);
        resetForm();
      } else {
        const detail = (caught as { response?: { data?: { detail?: string } } }).response?.data?.detail;
        Alert.alert(t('error'), detail || t('calibrationTankSaveError'));
      }
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (tank: CalibrationTank) => {
    setEditingId(tank.id);
    setName(tank.name);
    setVolume(String(tank.volume_m3));
  };

  const toggleActive = async (tank: CalibrationTank) => {
    try {
      const updated = await aquacultureService.updateCalibrationTank(tank.id, { is_active: !tank.is_active });
      setTanks((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (caught) {
      const detail = (caught as { response?: { data?: { is_active?: string[]; detail?: string } } }).response?.data;
      Alert.alert(t('error'), detail?.is_active?.[0] || detail?.detail || t('calibrationTankSaveError'));
    }
  };

  const remove = (tank: CalibrationTank) => {
    Alert.alert(t('deleteCalibrationTank'), t('deleteCalibrationTankConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => void (async () => {
          try {
            await aquacultureService.deleteCalibrationTank(tank.id);
            setTanks((current) => current.filter((item) => item.id !== tank.id));
          } catch (caught) {
            const data = (caught as { response?: { data?: { detail?: string } } }).response?.data;
            Alert.alert(t('error'), data?.detail || t('calibrationTankDeleteError'));
          }
        })(),
      },
    ]);
  };

  if (loading) return <LoadingState message={t('calibrationTanksLoading')} />;
  if (error) return <Screen><ErrorState message={t('calibrationTanksLoadError')} /><Button label={t('retry')} onPress={() => void load()} /></Screen>;
  return (
    <Screen scroll>
      <View style={styles.content}>
        <AppText variant="screenTitle">{t('calibrationTanksTitle')}</AppText>
        <TextField label={t('calibrationTankName')} value={name} onChangeText={setName} required />
        <TextField label={t('calibrationTankVolume')} value={volume} onChangeText={setVolume} keyboardType="decimal-pad" required />
        <Button label={t(editingId ? 'saveCalibrationTank' : 'createCalibrationTank')} onPress={() => void save()} loading={saving} disabled={!name.trim() || !volume} />
        {editingId ? <Button label={t('cancel')} variant="outline" onPress={resetForm} /> : null}
        {!tanks.length ? <EmptyState title={t('noCalibrationTanks')} message={t('createCalibrationTankHint')} /> : tanks.map((tank) => {
          const active = tank.active_session;
          const density = active && tank.volume_m3 ? Number(active.current_biomass) / Number(tank.volume_m3) : 0;
          return (
            <Card key={tank.id} variant="outlined" style={styles.card}>
              <AppText variant="cardTitle">{tank.name}</AppText>
              <AppText>{t('calibrationTankVolumeValue', { volume: tank.volume_m3 })}</AppText>
              <AppText color={tank.pending_sync ? 'warning' : tank.is_occupied ? 'warning' : 'success'}>
                {t(tank.pending_sync ? 'calibrationTankPending' : tank.is_occupied ? 'calibrationTankOccupied' : tank.is_active ? 'calibrationTankAvailable' : 'calibrationTankInactive')}
              </AppText>
              {active ? (
                <>
                  <AppText>{t('calibrationTankSpeciesValue', { species: t(active.species) })}</AppText>
                  <AppText>{t('fishCountValue', { count: active.current_count })}</AppText>
                  <AppText>{t('biomassValue', { biomass: active.current_biomass })}</AppText>
                  <AppText>{t('projectedDensityValue', { density: density.toFixed(2) })}</AppText>
                </>
              ) : null}
              {!tank.pending_sync ? (
                <>
                  <Button label={t('viewCalibrationTank')} variant="outline" onPress={() => navigation.navigate('CalibrationTankDetail', { tankId: tank.id })} />
                  <Button label={t('editCalibrationTank')} variant="outline" onPress={() => startEdit(tank)} />
                  <Button label={t(tank.is_active ? 'deactivateCalibrationTank' : 'reactivateCalibrationTank')} variant="outline" onPress={() => void toggleActive(tank)} />
                  <Button label={t('deleteCalibrationTank')} variant="outline" onPress={() => remove(tank)} />
                </>
              ) : null}
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing[4] }, card: { gap: spacing[2] } });
