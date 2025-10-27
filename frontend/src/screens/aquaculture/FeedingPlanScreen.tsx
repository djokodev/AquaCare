import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store/store';
import { aquacultureService } from '@/services/aquacultureService';
import { ProductionCycle, FeedingPlan } from '@/types/aquaculture';
import { MAVECAM_COLORS } from '@/constants/colors';
import { formatNumber, formatPercentage } from '@/utils';

export default function FeedingPlanScreen({ navigation }: any) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  // États locaux
  const [loading, setLoading] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCycles, setActiveCycles] = useState<ProductionCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<ProductionCycle | null>(null);
  const [feedingPlans, setFeedingPlans] = useState<FeedingPlan[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Chargement initial
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Charger les cycles actifs
      const cycles = await aquacultureService.getActiveCycles();
      setActiveCycles(cycles);

      // Sélectionner automatiquement le premier cycle actif
      if (cycles.length > 0 && !selectedCycle) {
        setSelectedCycle(cycles[0]);
        await loadFeedingPlans(cycles[0].id);
      }
    } catch (error: any) {
      console.error('Erreur chargement données:', error);
      setError('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  const loadFeedingPlans = async (cycleId: string) => {
    try {
      // Réinitialiser les plans avant de charger les nouveaux
      setFeedingPlans([]);
      const plans = await aquacultureService.getFeedingPlans(cycleId);
      setFeedingPlans(plans);
    } catch (error: any) {
      console.error('Erreur chargement plans:', error);
      setFeedingPlans([]); // Réinitialiser même en cas d'erreur
      setError('Erreur lors du chargement des plans d\'alimentation');
    }
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  const handleCycleSelection = async (cycle: ProductionCycle) => {
    setSelectedCycle(cycle);
    setLoadingPlans(true);
    await loadFeedingPlans(cycle.id);
    setLoadingPlans(false);
  };

  const generateFeedingPlan = async () => {
    if (!selectedCycle) return;

    Alert.alert(
      t('generateFeedingPlan'),
      t('generateFeedingPlanConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('confirm'),
          onPress: async () => {
            try {
              setGeneratingPlan(true);

              // Appel API pour générer le plan
              await aquacultureService.generateFeedingPlan(selectedCycle.id);

              // Recharger les plans
              await loadFeedingPlans(selectedCycle.id);

              Alert.alert(t('success'), t('feedingPlanGenerated'));
            } catch (error: any) {
              console.error('Erreur génération plan:', error);
              Alert.alert(t('error'), t('feedingPlanGenerationError'));
            } finally {
              setGeneratingPlan(false);
            }
          }
        }
      ]
    );
  };

  const getDaysBetween = (startDate: string, endDate?: string) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getCurrentWeek = (startDate: string) => {
    const days = getDaysBetween(startDate);
    return Math.ceil(days / 7);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('feedingPlan')}</Text>
        </View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text style={styles.loadingText}>{t('loading')}...</Text>
        </View>
      </View>
    );
  }

  if (activeCycles.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('feedingPlan')}</Text>
        </View>

        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.emptyContainer}>
            <Ionicons name="restaurant-outline" size={64} color={MAVECAM_COLORS.GRAY_LIGHT} />
            <Text style={styles.emptyText}>{t('noActiveCycles')}</Text>
            <Text style={styles.emptySubtext}>{t('createCycleToGeneratePlan')}</Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation.navigate('NewCycle')}
            >
              <Text style={styles.primaryButtonText}>{t('newCycle')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('feedingPlan')}</Text>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Sélection du cycle */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>{t('selectCycle')}</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {activeCycles.map((cycle) => (
              <TouchableOpacity
                key={cycle.id}
                style={[
                  styles.cycleCard,
                  selectedCycle?.id === cycle.id && styles.cycleCardSelected
                ]}
                onPress={() => handleCycleSelection(cycle)}
              >
                <Text style={[
                  styles.cycleName,
                  selectedCycle?.id === cycle.id && styles.cycleNameSelected
                ]}>
                  {cycle.cycle_name}
                </Text>
                <Text style={[
                  styles.cycleDetails,
                  selectedCycle?.id === cycle.id && styles.cycleDetailsSelected
                ]}>
                  {cycle.species === 'clarias' ? 'Silure' : 'Tilapia'} • {cycle.pond_identifier}
                </Text>
                <Text style={[
                  styles.cycleMetrics,
                  selectedCycle?.id === cycle.id && styles.cycleMetricsSelected
                ]}>
                  J{getDaysBetween(cycle.start_date)} • {formatNumber(cycle.current_biomass, 'kg')}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {selectedCycle && (
          <>
            {/* Informations du cycle sélectionné */}
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>{t('cycleInformation')}</Text>

              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>{t('currentWeek')}</Text>
                    <Text style={styles.infoValue}>
                      {t('week')} {getCurrentWeek(selectedCycle.start_date)}
                    </Text>
                  </View>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>{t('currentBiomass')}</Text>
                    <Text style={styles.infoValue}>
                      {formatNumber(selectedCycle.current_biomass, 'kg')}
                    </Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>{t('averageWeight')}</Text>
                    <Text style={styles.infoValue}>
                      {formatNumber(selectedCycle.current_average_weight, 'g')}
                    </Text>
                  </View>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>{t('survivalRate')}</Text>
                    <Text style={styles.infoValue}>
                      {formatPercentage(selectedCycle.survival_rate)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Plans d'alimentation */}
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('feedingPlans')}</Text>
                <TouchableOpacity
                  style={[styles.generateButton, generatingPlan && styles.generateButtonDisabled]}
                  onPress={generateFeedingPlan}
                  disabled={generatingPlan}
                >
                  {generatingPlan ? (
                    <ActivityIndicator size="small" color={MAVECAM_COLORS.WHITE} />
                  ) : (
                    <Ionicons name="refresh" size={16} color={MAVECAM_COLORS.WHITE} />
                  )}
                  <Text style={styles.generateButtonText}>
                    {generatingPlan ? t('generating') : t('generatePlan')}
                  </Text>
                </TouchableOpacity>
              </View>

              {loadingPlans ? (
                <View style={styles.noPlanContainer}>
                  <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
                  <Text style={styles.noPlanText}>{t('loading')}...</Text>
                </View>
              ) : feedingPlans.length === 0 ? (
                <View style={styles.noPlanContainer}>
                  <Ionicons name="restaurant-outline" size={48} color={MAVECAM_COLORS.GRAY_LIGHT} />
                  <Text style={styles.noPlanText}>{t('noFeedingPlans')}</Text>
                  <Text style={styles.noPlanSubtext}>{t('generateFirstPlan')}</Text>
                </View>
              ) : (
                feedingPlans.map((plan) => (
                  <View key={plan.id} style={styles.planCard}>
                    <View style={styles.planHeader}>
                      <Text style={styles.planTitle}>
                        {t('week')} {plan.week_number}
                      </Text>
                      <Text style={styles.planDate}>
                        {new Date(plan.start_date).toLocaleDateString('fr-FR')}
                      </Text>
                    </View>

                    <View style={styles.planContent}>
                      <View style={styles.planRow}>
                        <View style={styles.planItem}>
                          <Text style={styles.planLabel}>{t('dailyRation')}</Text>
                          <Text style={styles.planValue}>
                            {formatNumber(plan.daily_feed_amount, 'kg/j')}
                          </Text>
                        </View>
                        <View style={styles.planItem}>
                          <Text style={styles.planLabel}>{t('feedingPercentage')}</Text>
                          <Text style={styles.planValue}>
                            {formatPercentage(plan.feeding_rate)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.planRow}>
                        <View style={styles.planItem}>
                          <Text style={styles.planLabel}>{t('feedingFrequency')}</Text>
                          <Text style={styles.planValue}>
                            {plan.meals_per_day}x/{t('day')}
                          </Text>
                        </View>
                        <View style={styles.planItem}>
                          <Text style={styles.planLabel}>{t('feedPerMeal')}</Text>
                          <Text style={styles.planValue}>
                            {formatNumber(plan.feed_per_meal, 'kg')}
                          </Text>
                        </View>
                      </View>

                      {plan.notes && (
                        <View style={styles.notesContainer}>
                          <Text style={styles.notesLabel}>{t('notes')}:</Text>
                          <Text style={styles.notesText}>{plan.notes}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  header: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.WHITE,
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  sectionContainer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cycleCard: {
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    minWidth: 200,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cycleCardSelected: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY + '10',
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  cycleName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 4,
  },
  cycleNameSelected: {
    color: MAVECAM_COLORS.GREEN_DARK,
  },
  cycleDetails: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 6,
  },
  cycleDetailsSelected: {
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  cycleMetrics: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  cycleMetricsSelected: {
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  infoCard: {
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 8,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  infoItem: {
    flex: 1,
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 4,
    textAlign: 'center',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    textAlign: 'center',
  },
  generateButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  noPlanContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noPlanText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginTop: 12,
    marginBottom: 6,
  },
  noPlanSubtext: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  planCard: {
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  planTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  planDate: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  planContent: {
    gap: 12,
  },
  planRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  planItem: {
    flex: 1,
    alignItems: 'center',
  },
  planLabel: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 4,
    textAlign: 'center',
  },
  planValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    textAlign: 'center',
  },
  notesContainer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 12,
    borderRadius: 6,
    marginTop: 8,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    lineHeight: 20,
  },
});