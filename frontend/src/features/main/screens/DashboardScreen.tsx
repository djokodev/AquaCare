import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store/store';
import { fetchDashboardData } from '@/features/aquaculture/store/aquacultureSlice';
import { fetchNotifications } from '@/features/notifications/store/notificationSlice';
import { offlineService } from '@/services/offlineService';
import HarvestModal from '@/components/modals/HarvestModal';
import { ProductionCycle } from '@/types/aquaculture';
import { MAVECAM_COLORS } from '@/constants/colors';
import { formatNumber, formatPercentage } from '@/utils';
import { useAuth } from '@/hooks/useAuth';

export default function DashboardScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { displayName } = useAuth();
  const dispatch = useDispatch<AppDispatch>();

  const [harvestModalVisible, setHarvestModalVisible] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<ProductionCycle | null>(null);

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
      console.error('Erreur synchronisation globale silencieuse:', err);
    }
  };

  const onRefresh = useCallback(() => {
    dispatch(fetchDashboardData());
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

  if (error && !dashboardData) {
    return (
      <ScrollView
        className="flex-1 bg-cream"
        refreshControl={
          <RefreshControl refreshing={loading.dashboard} onRefresh={onRefresh} />
        }
      >
        <View className="bg-mavecam-primary px-5 pt-16 pb-5">
          <Text className="text-2xl font-bold text-white mb-1">
            {t('hello')}, {displayName}!
          </Text>
          <Text className="text-base text-white/80">{t('welcomeBoard')}</Text>
        </View>

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
    <ScrollView
      className="flex-1 bg-cream"
      refreshControl={
        <RefreshControl refreshing={loading.dashboard} onRefresh={onRefresh} />
      }
    >
      <View className="bg-mavecam-primary px-5 pt-16 pb-5">
        <Text className="text-2xl font-bold text-white mb-1">
          {t('hello')}, {displayName}!
        </Text>
        <Text className="text-base text-white/80">{t('welcomeBoard')}</Text>
      </View>

      <View className="px-5 py-5">
        <Text className="text-xl font-bold text-gray-dark mb-4">{t('quickOverview')}</Text>

        {loading.dashboard && !dashboardData ? (
          <View className="items-center justify-center py-10">
            <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <Text className="text-base text-gray-light mt-3">
              {t('loadingData', { defaultValue: 'Chargement des données...' })}
            </Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap justify-between">
            <View className="w-[48%] items-center mb-3 bg-white rounded-2xl p-4 shadow-sm">
              <Ionicons name="fish" size={32} color={MAVECAM_COLORS.GREEN_PRIMARY} />
              <Text className="text-2xl font-bold text-gray-dark mt-2">
                {summary.active_cycles_count}
              </Text>
              <Text className="text-sm text-gray-light text-center mt-1">
                {t('activeCycles')}
              </Text>
            </View>

            <View className="w-[48%] items-center mb-3 bg-white rounded-2xl p-4 shadow-sm">
              <Ionicons name="water" size={32} color={MAVECAM_COLORS.GREEN_LIGHT} />
              <Text className="text-2xl font-bold text-gray-dark mt-2">
                {activeCycles.length}
              </Text>
              <Text className="text-sm text-gray-light text-center mt-1">
                {t('ponds')}
              </Text>
            </View>

            <View className="w-[48%] items-center mb-3 bg-white rounded-2xl p-4 shadow-sm">
              <Ionicons name="scale" size={32} color={MAVECAM_COLORS.GREEN_DARK} />
              <Text className="text-2xl font-bold text-gray-dark mt-2">
                {formatNumber(summary.total_biomass, 'kg')}
              </Text>
              <Text className="text-sm text-gray-light text-center mt-1">Biomasse</Text>
            </View>

            <View className="w-[48%] items-center mb-3 bg-white rounded-2xl p-4 shadow-sm">
              <Ionicons name="trending-up" size={32} color={MAVECAM_COLORS.SUCCESS} />
              <Text className="text-2xl font-bold text-gray-dark mt-2">
                {formatPercentage(summary.average_survival_rate)}
              </Text>
              <Text className="text-sm text-gray-light text-center mt-1">Survie</Text>
            </View>
          </View>
        )}
      </View>

      <View className="px-5 py-5">
        <Text className="text-xl font-bold text-gray-dark mb-4">Actions</Text>
        <TouchableOpacity
          className="bg-white flex-row items-center p-4 rounded-xl mb-3 shadow-sm"
          onPress={() => navigation.navigate('NewCycle')}
        >
          <Ionicons name="add-circle" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text className="text-base font-medium text-gray-dark ml-3">{t('newCycle')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-white flex-row items-center p-4 rounded-xl mb-3 shadow-sm"
          onPress={() => navigation.navigate('DailyLog')}
        >
          <Ionicons name="create" size={24} color={MAVECAM_COLORS.GREEN_LIGHT} />
          <Text className="text-base font-medium text-gray-dark ml-3">{t('dailyLog')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-white flex-row items-center p-4 rounded-xl mb-3 shadow-sm"
          onPress={() => navigation.navigate('SanitaryLog')}
        >
          <Ionicons name="warning-outline" size={24} color={MAVECAM_COLORS.ERROR} />
          <Text className="text-base font-medium text-gray-dark ml-3">{t('sanitaryLog')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-white flex-row items-center p-4 rounded-xl mb-3 shadow-sm"
          onPress={() => navigation.navigate('CycleHistory')}
        >
          <Ionicons name="time-outline" size={24} color={MAVECAM_COLORS.INFO} />
          <Text className="text-base font-medium text-gray-dark ml-3">{t('cycleHistoryButton')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-white flex-row items-center p-4 rounded-xl mb-3 shadow-sm"
          onPress={() => navigation.navigate('Notifications')}
        >
          <View className="flex-row items-center relative">
            <Ionicons name="notifications-outline" size={24} color={MAVECAM_COLORS.WARNING} />
            <Text className="text-base font-medium text-gray-dark ml-3">{t('notifications')}</Text>
            {unreadCount > 0 && (
              <View className="absolute -top-2 -right-2 bg-[#dc2626] rounded-full px-1.5 py-0.5 min-w-[20px] items-center justify-center">
                <Text className="text-white text-[10px] font-bold">{unreadCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-white flex-row items-center p-4 rounded-xl mb-3 shadow-sm"
          onPress={() => navigation.navigate('FeedingPlan')}
        >
          <Ionicons name="restaurant-outline" size={24} color={MAVECAM_COLORS.INFO} />
          <Text className="text-base font-medium text-gray-dark ml-3">{t('feedingPlan')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-white flex-row items-center p-4 rounded-xl mb-3 shadow-sm"
          onPress={() => navigation.navigate('NutritionalGuides')}
        >
          <Ionicons name="library-outline" size={24} color={MAVECAM_COLORS.GREEN_DARK} />
          <Text className="text-base font-medium text-gray-dark ml-3">{t('nutritionalGuides')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-white flex-row items-center p-4 rounded-xl mb-3 shadow-sm"
          onPress={() => navigation.navigate('Statistics')}
        >
          <Ionicons name="bar-chart-outline" size={24} color={MAVECAM_COLORS.SUCCESS} />
          <Text className="text-base font-medium text-gray-dark ml-3">{t('statistics')}</Text>
        </TouchableOpacity>
      </View>

      <View className="px-5 py-5">
        <Text className="text-xl font-bold text-gray-dark mb-4">
          {t('commerceModule', { defaultValue: 'Commerce' })}
        </Text>

        <TouchableOpacity
          className="bg-white flex-row items-center p-4 rounded-xl mb-3 shadow-sm"
          onPress={() => navigation.navigate('ProductCatalog')}
        >
          <Ionicons name="storefront-outline" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text className="text-base font-medium text-gray-dark ml-3">{t('productCatalog')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-white flex-row items-center p-4 rounded-xl mb-3 shadow-sm"
          onPress={() => navigation.navigate('Cart')}
        >
          <Ionicons name="cart-outline" size={24} color={MAVECAM_COLORS.WARNING} />
          <Text className="text-base font-medium text-gray-dark ml-3">{t('cart')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-white flex-row items-center p-4 rounded-xl mb-3 shadow-sm"
          onPress={() => navigation.navigate('OrdersHistory')}
        >
          <Ionicons name="receipt-outline" size={24} color={MAVECAM_COLORS.INFO} />
          <Text className="text-base font-medium text-gray-dark ml-3">{t('ordersHistory')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-white flex-row items-center p-4 rounded-xl mb-3 shadow-sm"
          onPress={() => navigation.navigate('FeedingSuggestions')}
        >
          <Ionicons name="bulb-outline" size={24} color={MAVECAM_COLORS.SUCCESS} />
          <Text className="text-base font-medium text-gray-dark ml-3">{t('feedingSuggestions')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="bg-white flex-row items-center p-4 rounded-xl mb-3 shadow-sm"
          onPress={() => navigation.navigate('CycleSimulator')}
        >
          <Ionicons name="calculator-outline" size={24} color={MAVECAM_COLORS.BLUE} />
          <Text className="text-base font-medium text-gray-dark ml-3">{t('cycleSimulator')}</Text>
        </TouchableOpacity>
      </View>

      {activeCycles.length > 0 && (
        <View className="px-5 py-5">
          <Text className="text-xl font-bold text-gray-dark mb-4">{t('activeCycles')}</Text>

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
                    {Math.floor((new Date().getTime() - new Date(cycle.start_date).getTime()) / (1000 * 60 * 60 * 24))} jours - {formatNumber(cycle.current_biomass, 'kg')} - {formatPercentage(cycle.survival_rate || 0)} survie
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
    </ScrollView>
  );
}





