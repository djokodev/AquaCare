import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { StackNavigationProp } from '@react-navigation/stack';

import { AppDispatch } from '@/store/store';
import { RootStackParamList } from '@/navigation/MainNavigator';
import {
  clearCurrentCycle,
  fetchDashboardData,
  setCurrentCycle,
} from '@/features/aquaculture/store/aquacultureSlice';
import { ProductionCycle } from '@/types/aquaculture';
import { MAVECAM_COLORS } from '@/constants/colors';
import CyclePicker from '../components/CyclePicker';

type CycleSessionEntryNavigationProp = StackNavigationProp<
  RootStackParamList,
  'CycleSessionEntry'
>;

interface Props {
  navigation: CycleSessionEntryNavigationProp;
}

export default function CycleSessionEntryScreen({ navigation }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const { t } = useTranslation();
  const isMounted = useRef(true);

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
    [dispatch, navigation]
  );

  const loadCycles = useCallback(async () => {
    if (!isMounted.current) return;
    setLoading(true);
    setError(null);

    const result = await dispatch(fetchDashboardData({ forceAllCycles: true }));

    if (!isMounted.current) return;

    if (fetchDashboardData.fulfilled.match(result)) {
      const cycles = result.payload.active_cycles || [];
      handleEntryLogic(cycles);
      // Set loading=false after handleEntryLogic in same microtask to minimize intermediate renders
      if (isMounted.current) setLoading(false);
    } else {
      if (isMounted.current) {
        setError((result.payload as string) || 'sessionCycleLoadError');
        setLoading(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, handleEntryLogic]);

  useEffect(() => {
    loadCycles();
  }, [loadCycles]);

  const handleConfirm = () => {
    if (!selectedCycleId) return;
    const selectedCycle = activeCycles.find((cycle) => cycle.id === selectedCycleId);
    if (!selectedCycle) return;
    dispatch(setCurrentCycle(selectedCycle));
    navigation.replace('MainTabs');
  };

  if (loading) {
    return (
      <View className="flex-1 bg-cream items-center justify-center px-6">
        <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
        <Text className="text-base text-gray-light mt-3">{t('sessionCycleLoading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-cream items-center justify-center px-6">
        <Ionicons name="alert-circle-outline" size={48} color={MAVECAM_COLORS.ERROR} />
        <Text className="text-base text-error text-center mt-3 mb-5">{error}</Text>
        <TouchableOpacity className="bg-mavecam-primary px-6 py-3 rounded-lg" onPress={loadCycles}>
          <Text className="text-white font-semibold text-base">{t('retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 0 active cycles — show CTA to create a cycle
  if (activeCycles.length === 0) {
    return (
      <View className="flex-1 bg-cream items-center justify-center px-6">
        <Ionicons name="water-outline" size={64} color={MAVECAM_COLORS.GREEN_PRIMARY} />
        <Text className="text-xl font-bold text-gray-dark text-center mt-4 mb-2">
          {t('noCycles')}
        </Text>
        <Text className="text-sm text-gray-light text-center mb-8">
          {t('sessionNoCyclesHint', { defaultValue: 'Créez votre premier cycle pour commencer le suivi.' })}
        </Text>
        <TouchableOpacity
          className="bg-mavecam-primary px-8 py-4 rounded-xl flex-row items-center gap-2"
          onPress={() => navigation.replace('MainTabs')}
        >
          <Ionicons name="add-circle-outline" size={20} color={MAVECAM_COLORS.WHITE} />
          <Text className="text-white text-base font-semibold">
            {t('sessionCreateFirstCycle', { defaultValue: 'Créer mon premier cycle' })}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 2+ cycles — show picker
  return (
    <View className="flex-1 bg-cream">
      <View className="bg-mavecam-primary px-5 pt-16 pb-6">
        <Text className="text-2xl font-bold text-white mb-2">{t('sessionCycleTitle')}</Text>
        <Text className="text-sm text-white/90">{t('sessionCycleDescription')}</Text>
      </View>

      <View className="flex-1 px-4 py-4">
        <CyclePicker
          cycles={activeCycles}
          selectedCycleId={selectedCycleId}
          onSelectCycle={setSelectedCycleId}
        />
      </View>

      <View className="px-4 py-4 border-t border-gray-200 bg-white">
        <TouchableOpacity
          className={`rounded-lg py-3 items-center ${
            selectedCycleId ? 'bg-mavecam-primary' : 'bg-gray-300'
          }`}
          onPress={handleConfirm}
          disabled={!selectedCycleId}
        >
          <Text className="text-white text-base font-semibold">{t('sessionCycleConfirm')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
