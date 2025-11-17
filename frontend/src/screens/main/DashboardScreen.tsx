import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store/store';
import { fetchDashboardData } from '@/store/slices/aquacultureSlice';
import { fetchNotifications } from '@/store/slices/notificationSlice';
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

  // États pour le modal de récolte
  const [harvestModalVisible, setHarvestModalVisible] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<ProductionCycle | null>(null);

  // Sélecteurs Redux
  const {
    dashboardData,
    loading,
    error
  } = useSelector((state: RootState) => state.aquaculture);

  const { unreadCount } = useSelector((state: RootState) => state.notifications);

  // Chargement initial des données + synchronisation offline
  useEffect(() => {
    const initializeDashboard = async () => {
      // Tenter la synchronisation offline en arrière-plan
      tryGlobalOfflineSync();

      // Charger les données du dashboard
      dispatch(fetchDashboardData());

      // Charger les notifications pour le badge
      dispatch(fetchNotifications());
    };

    initializeDashboard();
  }, [dispatch]);

  const tryGlobalOfflineSync = async () => {
    try {
      const hasPending = await offlineService.hasAnyPendingSync();
      if (hasPending) {
        console.log('🔄 Synchronisation globale des données offline...');

        const result = await offlineService.syncAllOfflineData();

        if (result.success > 0) {
          console.log(`✅ ${result.success} éléments synchronisés`);
          // Rafraîchir le dashboard après sync
          dispatch(fetchDashboardData());
        }

        if (result.failed > 0) {
          console.log(`❌ ${result.failed} éléments non synchronisés`);
        }
      }
    } catch (error) {
      console.error('Erreur synchronisation globale silencieuse:', error);
      // Ne pas alerter l'utilisateur, juste log
    }
  };

  // Fonction de rafraîchissement
  const onRefresh = React.useCallback(() => {
    dispatch(fetchDashboardData());
  }, [dispatch]);

  // Calcul des métriques avec données réelles ou valeurs par défaut
  const summary = {
    active_cycles_count: dashboardData?.active_cycles_count || 0,
    total_biomass: dashboardData?.total_biomass || 0,
    average_fcr: dashboardData?.average_fcr || 0,
    average_survival_rate: dashboardData?.average_survival_rate || 0,
    total_fish_count: dashboardData?.total_fish_count || 0,
  };

  const activeCycles = dashboardData?.active_cycles || [];

  // Fonctions pour le modal de récolte
  const openHarvestModal = (cycle: ProductionCycle) => {
    setSelectedCycle(cycle);
    setHarvestModalVisible(true);
  };

  const closeHarvestModal = () => {
    setHarvestModalVisible(false);
    setSelectedCycle(null);
  };

  const handleHarvestSuccess = () => {
    // Rafraîchir le dashboard après récolte réussie
    dispatch(fetchDashboardData());
  };

  // Affichage d'erreur
  if (error && !dashboardData) {
    return (
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={loading.dashboard} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>
            {t('hello')}, {displayName}! 👋
          </Text>
          <Text style={styles.subtitle}>
            {t('welcomeBoard')}
          </Text>
        </View>

        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={MAVECAM_COLORS.ERROR} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={loading.dashboard} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.greeting}>
          {t('hello')}, {displayName}! 👋
        </Text>
        <Text style={styles.subtitle}>
          {t('welcomeBoard')}
        </Text>
      </View>

      <View style={styles.quickStatsContainer}>
        <Text style={styles.sectionTitle}>{t('quickOverview')}</Text>

        {loading.dashboard && !dashboardData ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <Text style={styles.loadingText}>Chargement des données...</Text>
          </View>
        ) : (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Ionicons name="fish" size={32} color={MAVECAM_COLORS.GREEN_PRIMARY} />
              <Text style={styles.statNumber}>{summary.active_cycles_count}</Text>
              <Text style={styles.statLabel}>{t('activeCycles')}</Text>
            </View>

            <View style={styles.statCard}>
              <Ionicons name="water" size={32} color={MAVECAM_COLORS.GREEN_LIGHT} />
              <Text style={styles.statNumber}>{activeCycles.length}</Text>
              <Text style={styles.statLabel}>{t('ponds')}</Text>
            </View>

            <View style={styles.statCard}>
              <Ionicons name="scale" size={32} color={MAVECAM_COLORS.GREEN_DARK} />
              <Text style={styles.statNumber}>{formatNumber(summary.total_biomass, 'kg')}</Text>
              <Text style={styles.statLabel}>Biomasse</Text>
            </View>

            <View style={styles.statCard}>
              <Ionicons name="trending-up" size={32} color={MAVECAM_COLORS.SUCCESS} />
              <Text style={styles.statNumber}>{formatPercentage(summary.average_survival_rate)}</Text>
              <Text style={styles.statLabel}>Survie</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.actionContainer}>
        <Text style={styles.sectionTitle}>Actions</Text>
        
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('NewCycle')}
        >
          <Ionicons name="add-circle" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text style={styles.actionText}>{t('newCycle')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('DailyLog')}
        >
          <Ionicons name="create" size={24} color={MAVECAM_COLORS.GREEN_LIGHT} />
          <Text style={styles.actionText}>{t('dailyLog')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('SanitaryLog')}
        >
          <Ionicons name="warning-outline" size={24} color={MAVECAM_COLORS.ERROR} />
          <Text style={styles.actionText}>{t('sanitaryLog')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('CycleHistory')}
        >
          <Ionicons name="time-outline" size={24} color={MAVECAM_COLORS.INFO} />
          <Text style={styles.actionText}>{t('cycleHistoryButton')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Notifications')}
        >
          <View style={styles.actionButtonWithBadge}>
            <Ionicons name="notifications-outline" size={24} color={MAVECAM_COLORS.WARNING} />
            <Text style={styles.actionText}>{t('notifications')}</Text>
            {unreadCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('FeedingPlan')}
        >
          <Ionicons name="restaurant-outline" size={24} color={MAVECAM_COLORS.INFO} />
          <Text style={styles.actionText}>{t('feedingPlan')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('NutritionalGuides')}
        >
          <Ionicons name="library-outline" size={24} color={MAVECAM_COLORS.GREEN_DARK} />
          <Text style={styles.actionText}>{t('nutritionalGuides')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Statistics')}
        >
          <Ionicons name="bar-chart-outline" size={24} color={MAVECAM_COLORS.SUCCESS} />
          <Text style={styles.actionText}>{t('statistics')}</Text>
        </TouchableOpacity>
      </View>

      {/* Section Module Commerce */}
      <View style={styles.actionContainer}>
        <Text style={styles.sectionTitle}>🛒 Commerce</Text>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('ProductCatalog')}
        >
          <Ionicons name="storefront-outline" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text style={styles.actionText}>{t('productCatalog')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Cart')}
        >
          <Ionicons name="cart-outline" size={24} color={MAVECAM_COLORS.WARNING} />
          <Text style={styles.actionText}>{t('cart')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('OrdersHistory')}
        >
          <Ionicons name="receipt-outline" size={24} color={MAVECAM_COLORS.INFO} />
          <Text style={styles.actionText}>{t('ordersHistory')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('FeedingSuggestions')}
        >
          <Ionicons name="bulb-outline" size={24} color={MAVECAM_COLORS.SUCCESS} />
          <Text style={styles.actionText}>{t('feedingSuggestions')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('CycleSimulator')}
        >
          <Ionicons name="calculator-outline" size={24} color={MAVECAM_COLORS.BLUE} />
          <Text style={styles.actionText}>{t('cycleSimulator')}</Text>
        </TouchableOpacity>
      </View>

      {/* Section des cycles actifs */}
      {activeCycles.length > 0 && (
        <View style={styles.activeCyclesContainer}>
          <Text style={styles.sectionTitle}>{t('activeCycles')}</Text>

          {activeCycles.map((cycle) => (
            <View key={cycle.id} style={styles.cycleCard}>
              <View style={styles.cycleHeader}>
                <View style={styles.cycleInfo}>
                  <Text style={styles.cycleName}>{cycle.cycle_name}</Text>
                  <Text style={styles.cycleDetails}>
                    {cycle.species === 'clarias' ? 'Silure africain (Clarias)' : 'Tilapia'} • {cycle.pond_identifier}
                  </Text>
                  <Text style={styles.cycleMetrics}>
                    {Math.floor((new Date().getTime() - new Date(cycle.start_date).getTime()) / (1000 * 60 * 60 * 24))} jours • {formatNumber(cycle.current_biomass, 'kg')} • {formatPercentage(cycle.survival_rate || 0)} survie
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.harvestButton}
                  onPress={() => openHarvestModal(cycle)}
                >
                  <Text style={styles.harvestButtonText}>{t('harvest')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Modal de récolte */}
      <HarvestModal
        visible={harvestModalVisible}
        onClose={closeHarvestModal}
        cycle={selectedCycle}
        onSuccess={handleHarvestSuccess}
      />

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  header: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    padding: 20,
    paddingTop: 60,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.WHITE,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  quickStatsContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    width: '48%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 4,
    textAlign: 'center',
  },
  actionContainer: {
    padding: 20,
  },
  actionButton: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '500',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginLeft: 12,
  },
  // Styles pour le chargement
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 12,
  },
  // Styles pour l'erreur
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  errorText: {
    fontSize: 16,
    color: MAVECAM_COLORS.ERROR,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  // Styles pour le bouton notifications avec badge
  actionButtonWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: MAVECAM_COLORS.ERROR,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadgeText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 10,
    fontWeight: 'bold',
  },
  // Styles pour les cycles actifs
  activeCyclesContainer: {
    padding: 20,
  },
  cycleCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  cycleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cycleInfo: {
    flex: 1,
    marginRight: 12,
  },
  cycleName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 4,
  },
  cycleDetails: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 6,
  },
  cycleMetrics: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  harvestButton: {
    backgroundColor: MAVECAM_COLORS.SUCCESS,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  harvestButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
});