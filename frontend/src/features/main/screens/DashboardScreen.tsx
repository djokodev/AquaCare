import React, { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store/store';
import { fetchDashboardData } from '@/features/aquaculture/store/aquacultureSlice';
import { fetchNotifications } from '@/features/notifications/store/notificationSlice';
import { offlineService } from '@/services/offlineService';
import HarvestModal from '@/components/modals/HarvestModal';
import DashboardHeader from '../components/DashboardHeader';
import QuickActionsPreview from '../components/QuickActionsPreview';
import QuickActionsSheet from '../components/QuickActionsSheet';
import { ProductionCycle } from '@/types/aquaculture';
import { MAVECAM_COLORS } from '@/constants/colors';
import { calculateStockValue, calculateFeedSavings } from '@/constants/aquaculture';
import { formatNumber, formatPercentage, formatCurrency } from '@/utils';
import { useAuth } from '@/hooks/useAuth';

/**
 * MetricCard - Carte métrique animée avec fade-in, slide-up et icône animée
 */
interface MetricCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  value: string | number;
  label: string;
  index: number;
  animationType?: 'bounce' | 'wave' | 'rotate' | 'pulse';
}

const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  color,
  value,
  label,
  index,
  animationType = 'pulse',
}) => {
  // Fade-in + slide-up animation
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  React.useEffect(() => {
    opacity.value = withDelay(
      index * 50,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) })
    );
    translateY.value = withDelay(
      index * 50,
      withSpring(0, { damping: 15, stiffness: 120 })
    );
  }, [index]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  // Animation continue pour l'icône (boucle infinie)
  const iconAnimation = useSharedValue(0);

  React.useEffect(() => {
    const startAnimation = () => {
      'worklet';
      if (animationType === 'bounce') {
        // Mouvement vertical (haut/bas) en boucle
        iconAnimation.value = withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }, (finished) => {
          if (finished) {
            iconAnimation.value = withTiming(0, { duration: 800, easing: Easing.inOut(Easing.ease) }, startAnimation);
          }
        });
      } else if (animationType === 'wave') {
        // Mouvement ondulant en boucle
        iconAnimation.value = withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }, (finished) => {
          if (finished) {
            iconAnimation.value = withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.sin) }, startAnimation);
          }
        });
      } else if (animationType === 'rotate') {
        // Rotation complète en boucle
        iconAnimation.value = withTiming(1, { duration: 3000, easing: Easing.linear }, (finished) => {
          if (finished) {
            iconAnimation.value = 0;
            startAnimation();
          }
        });
      } else {
        // Pulse (scale) en boucle
        iconAnimation.value = withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }, (finished) => {
          if (finished) {
            iconAnimation.value = withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) }, startAnimation);
          }
        });
      }
    };

    // Démarrer avec un délai initial pour l'effet stagger
    const timeout = setTimeout(() => {
      startAnimation();
    }, index * 100);

    return () => clearTimeout(timeout);
  }, [animationType, index]);

  const iconAnimatedStyle = useAnimatedStyle(() => {
    if (animationType === 'bounce') {
      return {
        transform: [{ translateY: iconAnimation.value * -8 }],
      };
    } else if (animationType === 'wave') {
      return {
        transform: [
          { translateX: iconAnimation.value * 5 },
          { translateY: Math.sin(iconAnimation.value * Math.PI * 2) * 3 },
        ],
      };
    } else if (animationType === 'rotate') {
      return {
        transform: [{ rotate: `${iconAnimation.value * 360}deg` }],
      };
    } else {
      // Pulse
      return {
        transform: [{ scale: 1 + iconAnimation.value * 0.1 }],
      };
    }
  });

  return (
    <Animated.View
      style={animatedStyle}
      className="w-[48%] bg-white rounded-2xl p-4 shadow-sm items-center mb-3"
    >
      <Animated.View style={iconAnimatedStyle}>
        <Ionicons name={icon} size={32} color={color} />
      </Animated.View>
      <Text className="text-2xl font-bold text-gray-dark mt-2">{value}</Text>
      <Text className="text-sm text-gray-light text-center mt-1">{label}</Text>
    </Animated.View>
  );
};

export default function DashboardScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { displayName } = useAuth();
  const dispatch = useDispatch<AppDispatch>();

  const [harvestModalVisible, setHarvestModalVisible] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<ProductionCycle | null>(null);
  const [actionsSheetVisible, setActionsSheetVisible] = useState(false);

  const { dashboardData, loading, error } = useSelector((state: RootState) => state.aquaculture);
  const { unreadCount } = useSelector((state: RootState) => state.notifications);

  useEffect(() => {
    const initializeDashboard = async () => {
      tryGlobalOfflineSync();
      dispatch(fetchDashboardData());
      dispatch(fetchNotifications());
    };

    initializeDashboard();
  }, [dispatch]);

  // Rafraîchir les notifications à chaque retour sur le dashboard (ex: après création commande)
  useFocusEffect(
    useCallback(() => {
      dispatch(fetchNotifications());
    }, [dispatch])
  );

  const tryGlobalOfflineSync = async () => {
    try {
      const hasPending = await offlineService.hasAnyPendingSync();
      if (hasPending) {
        const result = await offlineService.syncAllOfflineData();

        if (result.success > 0) {
          dispatch(fetchDashboardData());
        }
      }
    } catch (err) {
      // Sync error handled silently
    }
  };

  const onRefresh = useCallback(() => {
    dispatch(fetchDashboardData());
    dispatch(fetchNotifications());
  }, [dispatch]);

  const summary = {
    active_cycles_count: dashboardData?.active_cycles_count || 0,
    total_biomass: dashboardData?.total_biomass || 0,
    average_fcr: dashboardData?.average_fcr || 0,
    average_survival_rate: dashboardData?.average_survival_rate || 0,
    total_fish_count: dashboardData?.total_fish_count || 0,
  };

  const activeCycles = dashboardData?.active_cycles || [];

  const openHarvestModal = (cycle: ProductionCycle) => {
    setSelectedCycle(cycle);
    setHarvestModalVisible(true);
  };

  const closeHarvestModal = () => {
    setHarvestModalVisible(false);
    setSelectedCycle(null);
  };

  const handleHarvestSuccess = () => {
    dispatch(fetchDashboardData());
  };

  const handleNotificationsPress = () => {
    navigation.navigate('Notifications');
  };

  const handleSettingsPress = () => {
    navigation.navigate('ProfileStack', { screen: 'Settings' });
  };

  // Reanimated scroll handler for sticky header
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y; 
    },
  });

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    // Keep header fully opaque - no transparency
  }));

  if (error && !dashboardData) {
    return (
      <ScrollView
        className="flex-1 bg-cream"
        refreshControl={
          <RefreshControl refreshing={loading.dashboard} onRefresh={onRefresh} />
        }
      >
        <DashboardHeader
          displayName={displayName}
          unreadCount={unreadCount}
          onNotificationsPress={handleNotificationsPress}
          onSettingsPress={handleSettingsPress}
        />

        <View className="flex-1 items-center justify-center px-5 py-10">
          <Ionicons name="alert-circle" size={48} color={MAVECAM_COLORS.ERROR} />
          <Text className="text-base text-[#dc2626] text-center mt-3 mb-5">{error}</Text>
          <TouchableOpacity
            className="bg-mavecam-primary px-6 py-3 rounded-lg"
            onPress={onRefresh}
          >
            <Text className="text-white text-base font-semibold">{t('retry', { defaultValue: 'Réessayer' })}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <View className="flex-1 bg-cream">
      {/* Header Sticky - Outside ScrollView */}
      <Animated.View style={headerAnimatedStyle}>
        <DashboardHeader
          displayName={displayName}
          unreadCount={unreadCount}
          onNotificationsPress={handleNotificationsPress}
          onSettingsPress={handleSettingsPress}
        />
      </Animated.View>

      {/* Animated ScrollView with sticky header */}
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={loading.dashboard} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingTop: 140 }}
      >

      <View className="px-5 py-5">
        {loading.dashboard && !dashboardData ? (
          <View className="items-center justify-center py-10">
            <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <Text className="text-base text-gray-light mt-3">
              {t('loadingData', { defaultValue: 'Chargement des données...' })}
            </Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap justify-between">
            <MetricCard
              icon="nutrition"
              color={MAVECAM_COLORS.GREEN_PRIMARY}
              value={formatCurrency(calculateFeedSavings(summary.total_biomass, summary.average_fcr))}
              label={t('feedSavings')}
              index={0}
              animationType="pulse"
            />

            <MetricCard
              icon="water"
              color={MAVECAM_COLORS.GREEN_LIGHT}
              value={activeCycles.length}
              label={t('ponds')}
              index={1}
              animationType="wave"
            />

            <MetricCard
              icon="cash-outline"
              color={MAVECAM_COLORS.GREEN_DARK}
              value={formatCurrency(calculateStockValue(summary.total_biomass))}
              label={t('stockValue')}
              index={2}
              animationType="bounce"
            />

            <MetricCard
              icon="trending-up"
              color={MAVECAM_COLORS.SUCCESS}
              value={formatPercentage(summary.average_survival_rate)}
              label="Survie"
              index={3}
              animationType="bounce"
            />
          </View>
        )}
      </View>

      <QuickActionsPreview
        onOpenSheet={() => setActionsSheetVisible(true)}
        hasActiveCycles={activeCycles.length > 0}
        unreadCount={unreadCount}
        navigation={navigation}
      />

      {activeCycles.length > 0 && (
        <View className="px-5 py-5">

          {activeCycles.map((cycle) => (
            <View
              key={cycle.id}
              className="bg-white rounded-xl p-4 mb-3 shadow"
            >
              <View className="flex-row justify-between items-start">
                <View className="flex-1 mr-3">
                  <Text className="text-base font-bold text-gray-dark mb-1">{cycle.cycle_name}</Text>
                  <Text className="text-sm text-gray-light mb-1">
                    {cycle.species === 'clarias' ? 'Silure africain (Clarias)' : 'Tilapia'} - {cycle.pond_identifier}
                  </Text>
                  <Text className="text-xs text-gray-light">
                    {Math.floor((new Date().getTime() - new Date(cycle.start_date).getTime()) / (1000 * 60 * 60 * 24))} jours - {formatCurrency(calculateStockValue(cycle.current_biomass))} - {formatPercentage(cycle.survival_rate || 0)} survie
                  </Text>
                </View>

                <TouchableOpacity
                  className="bg-mavecam-primary flex-row items-center py-2 px-3 rounded-lg"
                  onPress={() => openHarvestModal(cycle)}
                >
                  <Text className="text-white text-sm font-semibold ml-1">{t('harvest')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <HarvestModal
        visible={harvestModalVisible}
        onClose={closeHarvestModal}
        cycle={selectedCycle}
        onSuccess={handleHarvestSuccess}
      />

      <QuickActionsSheet
        visible={actionsSheetVisible}
        onClose={() => setActionsSheetVisible(false)}
        unreadCount={unreadCount}
        navigation={navigation}
      />
      </Animated.ScrollView>
    </View>
  );
}