import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { StackNavigationProp } from '@react-navigation/stack';

import { AppDispatch, RootState } from '@/store/store';
import { RootStackParamList } from '@/navigation/MainNavigator';
import {
  clearCurrentCycle,
  fetchDashboardData,
  setCurrentCycle,
} from '@/features/aquaculture/store/aquacultureSlice';
import { ProductionCycle } from '@/types/aquaculture';
import { MAVECAM_COLORS } from '@/constants/colors';
import CyclePicker from '../components/CyclePicker';

// ── Welcome screen styles ────────────────────────────────────────────────────
const welcomeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  hero: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 21,
  },
  featuresCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 28,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
  },
  ctaBtn: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    borderRadius: 14,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: MAVECAM_COLORS.GREEN_PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  ctaBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

type CycleSessionEntryNavigationProp = StackNavigationProp<
  RootStackParamList,
  'CycleSessionEntry'
>;

interface Props {
  navigation: CycleSessionEntryNavigationProp;
}

export default function CycleSessionEntryScreen({ navigation }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
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
    if (!isMounted.current || !isAuthenticated) return;
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
      if (isMounted.current && isAuthenticated) {
        setError((result.payload as string) || 'sessionCycleLoadError');
        setLoading(false);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, handleEntryLogic, isAuthenticated]);

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

  // 0 active cycles — CTA only
  if (activeCycles.length === 0) {
    return (
      <View style={welcomeStyles.container}>
        <TouchableOpacity
          style={welcomeStyles.ctaBtn}
          onPress={() => navigation.replace('CreateFarm')}
          activeOpacity={0.85}
        >
          <Text style={welcomeStyles.ctaBtnText}>{t('welcomeScreenCta')}</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
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
