import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { aquacultureService } from '../../services/aquacultureService';
import { ProductionCycle, CycleStatistics } from '../../types/aquaculture';
import { MAVECAM_COLORS } from '@/constants/colors';
import {
  formatNumber,
  formatPercentage,
  formatCurrency,
} from '@/utils';

export default function StatisticsScreen({ navigation }: any) {
  const { t } = useTranslation();

  // États locaux
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [harvestedCycles, setHarvestedCycles] = useState<ProductionCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<ProductionCycle | null>(null);
  const [cycleStats, setCycleStats] = useState<CycleStatistics | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Chargement initial
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // LOGIQUE MÉTIER STRICTE : SEULS les cycles récoltés ont des statistiques finales
      const cycles = await aquacultureService.getHarvestedCycles();
      setHarvestedCycles(cycles);

    } catch (error: any) {
      console.error('Erreur chargement données:', error);
      setError('Erreur lors du chargement des statistiques');
    } finally {
      setLoading(false);
    }
  };

  const loadCycleStatistics = async (cycleId: string) => {
    try {
      /**
       * ✅ REFACTORÉ : Utilise UNIQUEMENT les données calculées par le backend.
       * Backend est la source unique de vérité pour TOUS les calculs métier.
       *
       * Métriques fournies par ProductionCycleSerializer (backend) :
       * - daily_growth_rate (depuis CycleMetrics)
       * - specific_growth_rate (depuis CycleMetrics)
       * - average_daily_feed (depuis CycleMetrics)
       * - total_feed_cost (calculé avec prix configurable)
       * - fcr, survival_rate, biomass, etc. (déjà calculés)
       */
      const cycle = harvestedCycles.find(c => c.id === cycleId);
      if (cycle) {
        const mockStats: CycleStatistics = {
          cycle_id: cycleId,
          days_active: Number(cycle.days_active) || 0,
          current_metrics: {
            // ✅ Données DIRECTES du backend (pas de recalcul)
            survival_rate: Number(cycle.survival_rate) || 0,
            biomass: Number(cycle.final_biomass || cycle.current_biomass) || 0,
            average_weight: Number(cycle.final_average_weight || cycle.current_average_weight) || 0,
            fcr: Number(cycle.fcr) || 0,
            // ✅ Métriques CycleMetrics exposées par backend
            daily_growth_rate: Number(cycle.daily_growth_rate) || 0,
            specific_growth_rate: Number(cycle.specific_growth_rate) || 0,
          },
          feed_metrics: {
            total_consumed: Number(cycle.total_feed_consumed) || 0,
            // ✅ Backend calcule la moyenne quotidienne
            average_daily: Number(cycle.average_daily_feed) || 0,
            // ✅ Backend calcule le coût avec prix configurable
            cost_estimate: Number(cycle.total_feed_cost) || 0,
          },
          mortality_analysis: {
            /**
             * ⚠️ TODO BACKEND - Ces valeurs DOIVENT venir du backend
             * Backend devrait exposer:
             * - total_mortality_count (initial_count - final_count)
             * - mortality_percentage (100 - survival_rate)
             *
             * Pour l'instant, calcul temporaire frontend jusqu'à implémentation backend.
             */
            total: Math.max(0, (Number(cycle.initial_count) || 0) - (Number(cycle.final_count || cycle.current_count) || 0)),
            percentage: Math.max(0, 100 - (Number(cycle.survival_rate) || 0)),
            by_week: {}, // TODO: Implémenter avec données détaillées backend
            main_causes: [], // TODO: Implémenter avec journal sanitaire backend
          },
          growth_performance: [], // TODO: Implémenter avec logs quotidiens backend
        };
        setCycleStats(mockStats);
      }
    } catch (error: any) {
      console.error('Erreur chargement stats cycle:', error);
    }
  };

  const handleCycleSelection = async (cycle: ProductionCycle) => {
    setSelectedCycle(cycle);
    await loadCycleStatistics(cycle.id);
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t('loading')}...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={MAVECAM_COLORS.ERROR} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData}>
            <Text style={styles.retryButtonText}>{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (harvestedCycles.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Ionicons name="bar-chart-outline" size={48} color={MAVECAM_COLORS.GRAY_LIGHT} />
          <Text style={styles.emptyText}>Aucune statistique disponible</Text>
          <Text style={styles.emptySubtext}>Récoltez un cycle pour voir les statistiques</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header avec flèche retour */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('statistics')}</Text>
      </View>

      <ScrollView
        style={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Sélecteur de cycle */}
        <View style={styles.cycleSelector}>
        <Text style={styles.sectionTitle}>Cycles récoltés disponibles</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cycleList}>
          {harvestedCycles.map((cycle) => (
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
                styles.cycleSpecies,
                selectedCycle?.id === cycle.id && styles.cycleSpeciesSelected
              ]}>
                {cycle.species} • {formatPercentage(cycle.survival_rate || 0)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Message de sélection si aucun cycle sélectionné */}
      {!selectedCycle && harvestedCycles.length > 0 && (
        <View style={styles.selectionContainer}>
          <Ionicons name="analytics-outline" size={48} color={MAVECAM_COLORS.GRAY_LIGHT} />
          <Text style={styles.selectionText}>Sélectionnez un cycle à analyser</Text>
          <Text style={styles.selectionSubtext}>Cliquez sur un cycle ci-dessus pour voir ses statistiques détaillées</Text>
        </View>
      )}

      {/* Métriques principales */}
      {selectedCycle && cycleStats && (
        <>
          <View style={styles.metricsContainer}>
            <Text style={styles.sectionTitle}>Métriques Clés</Text>
            <View style={styles.metricsGrid}>
              <View style={styles.metricCard}>
                <Ionicons name="trending-up" size={24} color={MAVECAM_COLORS.SUCCESS} />
                <Text style={styles.metricValue}>
                  {formatNumber(cycleStats.current_metrics.fcr)}
                </Text>
                <Text style={styles.metricLabel}>FCR</Text>
              </View>

              <View style={styles.metricCard}>
                <Ionicons name="heart" size={24} color={MAVECAM_COLORS.ERROR} />
                <Text style={styles.metricValue}>
                  {formatPercentage(cycleStats.current_metrics.survival_rate)}
                </Text>
                <Text style={styles.metricLabel}>Survie</Text>
              </View>

              <View style={styles.metricCard}>
                <Ionicons name="scale" size={24} color={MAVECAM_COLORS.INFO} />
                <Text style={styles.metricValue}>
                  {formatNumber(cycleStats.current_metrics.daily_growth_rate, 'g/j')}
                </Text>
                <Text style={styles.metricLabel}>Croissance</Text>
              </View>

              <View style={styles.metricCard}>
                <Ionicons name="cash" size={24} color={MAVECAM_COLORS.WARNING} />
                <Text style={styles.metricValue}>
                  {formatCurrency(cycleStats.feed_metrics.cost_estimate)}
                </Text>
                <Text style={styles.metricLabel}>Coût Aliment</Text>
              </View>
            </View>
          </View>

          {/* Détails du cycle */}
          <View style={styles.detailsContainer}>
            <Text style={styles.sectionTitle}>Détails du Cycle</Text>
            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Durée</Text>
                <Text style={styles.detailValue}>{cycleStats.days_active} jours</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Biomasse finale</Text>
                <Text style={styles.detailValue}>{formatNumber(cycleStats.current_metrics.biomass, 'kg')}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Poids moyen final</Text>
                <Text style={styles.detailValue}>{formatNumber(cycleStats.current_metrics.average_weight, 'g')}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Aliment consommé</Text>
                <Text style={styles.detailValue}>{formatNumber(cycleStats.feed_metrics.total_consumed, 'kg')}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Ration quotidienne</Text>
                <Text style={styles.detailValue}>{formatNumber(cycleStats.feed_metrics.average_daily, 'kg/j')}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Mortalité totale</Text>
                <Text style={styles.detailValue}>{cycleStats.mortality_analysis.total} poissons</Text>
              </View>
            </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: MAVECAM_COLORS.GRAY_DARK,
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: MAVECAM_COLORS.ERROR,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 8,
    textAlign: 'center',
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
  },
  headerSubtitle: {
    fontSize: 16,
    color: MAVECAM_COLORS.WHITE,
    opacity: 0.9,
  },
  scrollContent: {
    flex: 1,
  },
  cycleSelector: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 12,
  },
  cycleList: {
    marginTop: 8,
  },
  cycleCard: {
    backgroundColor: MAVECAM_COLORS.CREAM,
    padding: 12,
    borderRadius: 8,
    marginRight: 12,
    minWidth: 140,
    borderWidth: 1,
    borderColor: MAVECAM_COLORS.GRAY_LIGHT,
  },
  cycleCardSelected: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    borderColor: MAVECAM_COLORS.GREEN_DARK,
  },
  cycleName: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 4,
  },
  cycleNameSelected: {
    color: MAVECAM_COLORS.WHITE,
  },
  cycleSpecies: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  cycleSpeciesSelected: {
    color: MAVECAM_COLORS.WHITE,
    opacity: 0.9,
  },
  metricsContainer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  metricCard: {
    width: '48%',
    backgroundColor: MAVECAM_COLORS.CREAM,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginTop: 8,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  detailsContainer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  detailItem: {
    width: '48%',
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  chartsPlaceholder: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginBottom: 32,
  },
  chartPlaceholderBox: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: MAVECAM_COLORS.GRAY_LIGHT,
  },
  chartPlaceholderText: {
    fontSize: 16,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginTop: 12,
  },
  chartPlaceholderSubtext: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 4,
  },
  filterContainer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    margin: 16,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  filterWarning: {
    fontSize: 12,
    color: MAVECAM_COLORS.WARNING,
    marginTop: 8,
    fontStyle: 'italic',
  },
  selectionContainer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    margin: 16,
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: MAVECAM_COLORS.GRAY_LIGHT,
  },
  selectionText: {
    fontSize: 18,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginTop: 12,
    textAlign: 'center',
  },
  selectionSubtext: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
});