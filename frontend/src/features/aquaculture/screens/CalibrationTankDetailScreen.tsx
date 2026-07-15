import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StackScreenProps } from '@react-navigation/stack';

import { AppText, Button, Card, EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import type { RootStackParamList } from '@/navigation/MainNavigator';
import { offlineService } from '@/services/offlineService';
import { spacing } from '@/theme';
import type { CalibrationOperation, CalibrationTank } from '@/types/aquaculture';

type Props = StackScreenProps<RootStackParamList, 'CalibrationTankDetail'>;

export default function CalibrationTankDetailScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const [tank, setTank] = useState<CalibrationTank>();
  const [operations, setOperations] = useState<CalibrationOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextTank, nextOperations, offlineOperations] = await Promise.all([
        aquacultureService.getCalibrationTank(route.params.tankId),
        aquacultureService.getCalibrationOperations(route.params.tankId),
        offlineService.getOfflineCalibrationOperations(),
      ]);
      setTank(nextTank);
      const serverClientUuids = new Set(nextOperations.map((operation) => operation.client_uuid));
      const pendingOperations: CalibrationOperation[] = offlineOperations
        .filter((item) => !item.synced)
        .filter((item) => (
          item.operationData.destination_production_unit_id === route.params.tankId
          || (
            nextTank.client_uuid != null
            && item.operationData.destination_production_unit_client_uuid === nextTank.client_uuid
          )
        ))
        .filter((item) => !serverClientUuids.has(item.operationData.client_uuid))
        .map((item) => ({
          id: item.id,
          client_uuid: item.operationData.client_uuid,
          source_allocation: item.sourceAllocationId,
          destination_allocation: '',
          source_unit_name: t('calibrationPendingSource'),
          destination_unit_name: nextTank.name,
          calibrated_at: item.operationData.calibrated_at,
          transferred_count: item.operationData.transferred_count,
          transferred_average_weight_g: item.operationData.transferred_average_weight_g ?? (
            Number(item.operationData.sample_total_weight_g ?? 0) / Number(item.operationData.sample_count ?? 1)
          ),
          transferred_biomass_kg: (
            item.operationData.transferred_count * (
              item.operationData.transferred_average_weight_g ?? (
                Number(item.operationData.sample_total_weight_g ?? 0) / Number(item.operationData.sample_count ?? 1)
              )
            ) / 1000
          ),
          size_category: item.operationData.size_category,
          notes: item.operationData.notes,
          created_offline: true,
          pending_sync: true,
        }));
      setOperations([...nextOperations, ...pendingOperations]);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [route.params.tankId, t]);

  useEffect(() => { void load(); }, [load]);
  if (loading) return <LoadingState message={t('calibrationTanksLoading')} />;
  if (error || !tank) return <Screen><ErrorState message={t('calibrationTankDetailError')} /><Button label={t('retry')} onPress={() => void load()} /></Screen>;

  const active = tank.active_session;
  const allocation = tank.active_allocation;
  const density = active && tank.volume_m3 ? Number(active.current_biomass) / Number(tank.volume_m3) : 0;
  const previousAllocations = (tank.allocations ?? []).filter((item) => item.id !== allocation?.id);

  return (
    <Screen scroll>
      <View style={styles.content}>
        <AppText variant="screenTitle">{tank.name}</AppText>
        <Card>
          <AppText variant="cardTitle">{t('calibrationTankPhysicalInfo')}</AppText>
          <AppText>{t('calibrationTankVolumeValue', { volume: tank.volume_m3 })}</AppText>
          <AppText>{t(tank.is_occupied ? 'calibrationTankOccupied' : tank.is_active ? 'calibrationTankAvailable' : 'calibrationTankInactive')}</AppText>
        </Card>
        {active && allocation ? (
          <Card>
            <AppText variant="cardTitle">{t('activeCalibrationSession')}</AppText>
            <AppText>{active.cycle_name}</AppText>
            <AppText>{t('calibrationTankSpeciesValue', { species: t(active.species) })}</AppText>
            <AppText>{t('fishCountValue', { count: allocation.current_fish_count })}</AppText>
            <AppText>{t('calibrationAverageWeightValue', { weight: active.current_average_weight })}</AppText>
            <AppText>{t('biomassValue', { biomass: allocation.current_biomass_kg ?? 0 })}</AppText>
            <AppText>{t('projectedDensityValue', { density: density.toFixed(2) })}</AppText>
            <Button
              label={t('openUnitDashboard')}
              onPress={() => navigation.navigate('ProductionUnitOverview', {
                cycleId: active.id,
                allocationId: allocation.id,
                cycleUnitAllocationId: allocation.id,
                productionUnitId: allocation.production_unit,
                productionUnitName: tank.name,
              })}
            />
          </Card>
        ) : <EmptyState title={t('noActiveCalibrationSession')} message={t('calibrationTankAvailable')} />}
        <AppText variant="sectionTitle">{t('calibrationHistory')}</AppText>
        {!operations.length ? <EmptyState title={t('calibrationHistoryEmpty')} /> : operations.map((operation) => {
          const incoming = operation.destination_unit_name === tank.name;
          return (
            <Card key={operation.id}>
              <AppText variant="bodyStrong">{t(incoming ? 'calibrationIncomingMovement' : 'calibrationOutgoingMovement')}</AppText>
              <AppText>{t('calibrationMovementSummary', {
                count: operation.transferred_count,
                source: operation.source_unit_name,
                destination: operation.destination_unit_name,
              })}</AppText>
              <AppText>{t('transferredBiomassValue', { biomass: operation.transferred_biomass_kg })}</AppText>
              <AppText>{new Date(operation.calibrated_at).toLocaleString()}</AppText>
              {operation.pending_sync ? <AppText color="warning">{t('calibrationPending')}</AppText> : null}
            </Card>
          );
        })}
        <AppText variant="sectionTitle">{t('previousCalibrationSessions')}</AppText>
        {!previousAllocations.length ? <EmptyState title={t('previousCalibrationSessionsEmpty')} /> : previousAllocations.map((item) => (
          <Card key={item.id}>
            <AppText>{item.cycle_name}</AppText>
            <AppText>{item.status_display ?? item.status}</AppText>
            <AppText>{t('fishCountValue', { count: item.final_fish_count ?? item.current_fish_count })}</AppText>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing[4] } });
