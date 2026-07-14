import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StackScreenProps } from '@react-navigation/stack';

import { AppText, Button, Card, EmptyState, ErrorState, LoadingState, Screen } from '@/components/ui';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import type { RootStackParamList } from '@/navigation/MainNavigator';
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
      const [nextTank, nextOperations] = await Promise.all([
        aquacultureService.getCalibrationTank(route.params.tankId),
        aquacultureService.getCalibrationOperations(route.params.tankId),
      ]);
      setTank(nextTank);
      setOperations(nextOperations);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [route.params.tankId]);

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
