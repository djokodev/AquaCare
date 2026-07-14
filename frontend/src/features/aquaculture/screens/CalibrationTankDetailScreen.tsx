import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { StackScreenProps } from '@react-navigation/stack';
import { AppText, Card, LoadingState, Screen } from '@/components/ui';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import type { RootStackParamList } from '@/navigation/MainNavigator';
import { spacing } from '@/theme';
import type { CalibrationOperation, CalibrationTank } from '@/types/aquaculture';
type Props = StackScreenProps<RootStackParamList, 'CalibrationTankDetail'>;
export default function CalibrationTankDetailScreen({ route }: Props) {
  const { t } = useTranslation();
  const [tank, setTank] = useState<CalibrationTank>();
  const [operations, setOperations] = useState<CalibrationOperation[]>([]);
  useEffect(() => { void Promise.all([aquacultureService.getCalibrationTank(route.params.tankId), aquacultureService.getCalibrationOperations(route.params.tankId)]).then(([nextTank, nextOps]) => { setTank(nextTank); setOperations(nextOps); }); }, [route.params.tankId]);
  if (!tank) return <LoadingState message={t('calibrationTanksLoading')} />;
  return <Screen scroll><View style={styles.content}><AppText variant="screenTitle">{tank.name}</AppText><Card><AppText>{t('calibrationTankVolumeValue', { volume: tank.volume_m3 })}</AppText>{tank.active_session ? <><AppText variant="cardTitle">{t('activeCalibrationSession')}</AppText><AppText>{t('fishCountValue', { count: tank.active_session.current_count })}</AppText><AppText>{t('biomassValue', { biomass: tank.active_session.current_biomass })}</AppText></> : <AppText>{t('calibrationTankAvailable')}</AppText>}</Card><AppText variant="sectionTitle">{t('calibrationHistory')}</AppText>{operations.map((operation) => <Card key={operation.id}><AppText>{t('calibrationArrivalSummary', { count: operation.transferred_count, source: operation.source_cycle_name })}</AppText><AppText>{new Date(operation.calibrated_at).toLocaleString()}</AppText></Card>)}</View></Screen>;
}
const styles = StyleSheet.create({ content: { gap: spacing[4] } });

