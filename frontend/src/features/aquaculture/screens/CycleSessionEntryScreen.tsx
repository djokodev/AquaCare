import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { StackNavigationProp } from '@react-navigation/stack';

import {
  AppHeader,
  AppText,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
} from '@/components/ui';
import {
  clearCurrentCycle,
  fetchDashboardData,
  fetchProductionCycles,
  setCurrentCycle,
} from '@/features/aquaculture/store/aquacultureSlice';
import CyclePicker from '@/features/aquaculture/components/CyclePicker';
import { RootStackParamList } from '@/navigation/MainNavigator';
import { AppDispatch, RootState } from '@/store/store';
import { colors, spacing } from '@/theme';
import { ProductionCycle } from '@/types/aquaculture';

type CycleSessionEntryNavigationProp = StackNavigationProp<
  RootStackParamList,
  'CycleSessionEntry'
>;

interface Props {
  navigation: CycleSessionEntryNavigationProp;
  route: {
    params?: {
      showBackToDashboard?: boolean;
    };
  };
}

export default function CycleSessionEntryScreen({ navigation, route }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const isAuthenticated = useSelector(
    (state: RootState) => state.auth.isAuthenticated,
  );
  const allCycles = useSelector((state: RootState) => state.aquaculture.cycles) ?? [];
  const { t } = useTranslation();
  const isMounted = useRef(true);
  const showBackToDashboard = route.params?.showBackToDashboard === true;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCycles, setActiveCycles] = useState<ProductionCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleEntryLogic = useCallback(
    (cycles: ProductionCycle[]) => {
      if (cycles.length === 0) {
        dispatch(clearCurrentCycle());
        return;
      }

      if (cycles.length === 1) {
        dispatch(setCurrentCycle(cycles[0]));
        navigation.replace('MainTabs');
        return;
      }

      setActiveCycles(cycles);
      setSelectedCycleId(null);
    },
    [dispatch, navigation],
  );

  const loadCycles = useCallback(async () => {
    if (!isMounted.current || !isAuthenticated) {
      return;
    }

    setLoading(true);
    setError(null);

    const result = await dispatch(
      fetchDashboardData({ forceAllCycles: true, lightweight: true }),
    );

    if (!isMounted.current) {
      return;
    }

    if (fetchDashboardData.fulfilled.match(result)) {
      handleEntryLogic(result.payload.active_cycles ?? []);
      void dispatch(fetchProductionCycles());
      setLoading(false);
      return;
    }

    setError((result.payload as string) || 'sessionCycleLoadError');
    setLoading(false);
  }, [dispatch, handleEntryLogic, isAuthenticated]);

  useEffect(() => {
    void loadCycles();
  }, [loadCycles]);

  const handleBackToDashboard = () => {
    navigation.navigate('MainTabs');
  };

  const handleConfirm = () => {
    if (!selectedCycleId) {
      return;
    }

    const selectedCycle = activeCycles.find((cycle) => cycle.id === selectedCycleId);
    if (!selectedCycle) {
      return;
    }

    dispatch(setCurrentCycle(selectedCycle));
    navigation.replace('MainTabs');
  };

  const header = (
    <AppHeader
      title={t('sessionCycleTitle')}
      onBack={showBackToDashboard ? handleBackToDashboard : undefined}
      backLabel={t('backToDashboard')}
      titleAlignment="left"
    />
  );

  if (loading) {
    return (
      <View style={styles.root}>
        {header}
        <Screen style={styles.stateScreen}>
          <LoadingState message={t('sessionCycleLoading')} />
        </Screen>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.root}>
        {header}
        <Screen style={styles.stateScreen}>
          <ErrorState
            message={t(error)}
            actionLabel={t('retry')}
            onAction={() => void loadCycles()}
          />
        </Screen>
      </View>
    );
  }

  if (activeCycles.length === 0) {
    return (
      <View style={styles.root}>
        {header}
        <Screen style={styles.stateScreen}>
          <Card variant="elevated" style={styles.welcomeCard}>
            <EmptyState
              title={t('welcomeScreenTitle')}
              message={t('sessionNoCyclesHint')}
              actionLabel={t('welcomeScreenCta')}
              onAction={() => navigation.replace('CreateFarm')}
            />
            <AppText variant="caption" color="muted" style={styles.welcomeBody}>
              {t('welcomeScreenBody')}
            </AppText>
          </Card>
        </Screen>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {header}
      <Screen style={styles.pickerScreen}>
        <CyclePicker
          cycles={activeCycles}
          selectedCycleId={selectedCycleId}
          onSelectCycle={setSelectedCycleId}
          rankingCycles={allCycles}
        />
        <View style={styles.footer}>
          <Button
            label={t('sessionCycleConfirm')}
            onPress={handleConfirm}
            disabled={!selectedCycleId}
            style={styles.confirmButton}
          />
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.page },
  stateScreen: { justifyContent: 'center' },
  welcomeCard: { gap: spacing[3] },
  welcomeBody: { textAlign: 'center' },
  pickerScreen: { paddingBottom: 0 },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    marginHorizontal: -spacing[4],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  confirmButton: { backgroundColor: colors.brand.primary },
});
