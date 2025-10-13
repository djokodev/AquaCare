import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { aquacultureService } from '../../services/aquacultureService';
import { ProductionCycle, CycleStatistics } from '../../types/aquaculture';

const { width: screenWidth } = Dimensions.get('window');

// Couleurs MAVECAM
const MAVECAM_COLORS = {
  GREEN_PRIMARY: '#059669',
  GREEN_LIGHT: '#10b981',
  GREEN_DARK: '#047857',
  WHITE: '#ffffff',
  CREAM: '#f8fafc',
  SUCCESS: '#059669',
  WARNING: '#f59e0b',
  ERROR: '#dc2626',
  INFO: '#0ea5e9',
  GRAY_LIGHT: '#64748b',
  GRAY_DARK: '#1e293b',
};

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
      // TODO: Implémenter l'endpoint de statistiques détaillées
      // Pour l'instant, calculons des stats basiques à partir du cycle
      const cycle = harvestedCycles.find(c => c.id === cycleId);
      if (cycle) {
        const mockStats: CycleStatistics = {
          cycle_id: cycleId,
          // Utiliser days_active directement de l'API (calculé par le backend)
          days_active: Number(cycle.days_active) || 0,
          current_metrics: {
            survival_rate: Number(cycle.survival_rate) || 0,
            biomass: Number(cycle.final_biomass || cycle.current_biomass) || 0,
            average_weight: Number(cycle.final_average_weight || cycle.current_average_weight) || 0,
            fcr: Number(cycle.fcr) || 0,
            daily_growth_rate: calculateDailyGrowthRate(cycle),
            specific_growth_rate: calculateSpecificGrowthRate(cycle),
          },
          feed_metrics: {
            total_consumed: Number(cycle.total_feed_consumed) || 0,
            average_daily: calculateAverageDailyFeed(cycle),
            cost_estimate: estimateFeedCost(cycle),
          },
          mortality_analysis: {
            total: Math.max(0, (Number(cycle.initial_count) || 0) - (Number(cycle.final_count || cycle.current_count) || 0)),
            percentage: Math.max(0, 100 - (Number(cycle.survival_rate) || 0)),
            by_week: {}, // TODO: Implémenter avec données détaillées
            main_causes: [], // TODO: Implémenter avec journal sanitaire
          },
          growth_performance: [], // TODO: Implémenter avec logs quotidiens
        };
        setCycleStats(mockStats);
      }
    } catch (error: any) {
      console.error('Erreur chargement stats cycle:', error);
    }
  };

  // Fonctions de calcul utilitaires défensives

  const calculateDailyGrowthRate = (cycle: ProductionCycle): number => {
    try {
      // Utiliser days_active directement de l'API
      const days = Number(cycle.days_active) || 0;
      if (days === 0) return 0;
      const initialWeight = Number(cycle.initial_average_weight) || 0;
      const finalWeight = Number(cycle.final_average_weight || cycle.current_average_weight) || 0;
      const rate = (finalWeight - initialWeight) / days;
      return isNaN(rate) ? 0 : rate;
    } catch {
      return 0;
    }
  };

  const calculateSpecificGrowthRate = (cycle: ProductionCycle): number => {
    try {
      // Utiliser days_active directement de l'API
      const days = Number(cycle.days_active) || 0;
      if (days === 0) return 0;
      const initialWeight = Number(cycle.initial_average_weight) || 0;
      const finalWeight = Number(cycle.final_average_weight || cycle.current_average_weight) || 0;
      if (initialWeight <= 0 || finalWeight <= 0) return 0;
      const rate = (Math.log(finalWeight) - Math.log(initialWeight)) / days * 100;
      return isNaN(rate) ? 0 : rate;
    } catch {
      return 0;
    }
  };

  const calculateAverageDailyFeed = (cycle: ProductionCycle): number => {
    try {
      // Utiliser days_active directement de l'API
      const days = Number(cycle.days_active) || 0;
      if (days === 0) return 0;
      const totalFeed = Number(cycle.total_feed_consumed) || 0;
      const average = totalFeed / days;
      return isNaN(average) ? 0 : average;
    } catch {
      return 0;
    }
  };

  const estimateFeedCost = (cycle: ProductionCycle): number => {
    try {
      // Estimation basée sur 500 FCFA/kg d'aliment
      const totalFeed = Number(cycle.total_feed_consumed) || 0;
      console.log('Debug Feed Cost - totalFeed:', totalFeed, 'cycle.total_feed_consumed:', cycle.total_feed_consumed);

      // Si pas de données d'aliment du backend, estimons basé sur la biomasse et FCR
      if (totalFeed === 0) {
        const finalBiomass = Number(cycle.final_biomass || cycle.current_biomass) || 0;
        const fcr = Number(cycle.fcr) || 1.5; // FCR typique si pas de donnée
        const estimatedFeed = finalBiomass * fcr;
        console.log('Debug Feed Cost - Estimation par FCR:', estimatedFeed, 'biomasse:', finalBiomass, 'fcr:', fcr);
        const cost = estimatedFeed * 500;
        return isNaN(cost) ? 0 : cost;
      }

      const cost = totalFeed * 500;
      return isNaN(cost) ? 0 : cost;
    } catch {
      return 0;
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

  // Fonctions de formatage défensives
  const formatNumber = (value: number | undefined | null, unit?: string): string => {
    if (value === undefined || value === null || isNaN(Number(value))) return '0' + (unit ? ` ${unit}` : '');
    const numValue = Number(value);
    return numValue.toFixed(1) + (unit ? ` ${unit}` : '');
  };

  const formatPercentage = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(Number(value))) return '0%';
    const numValue = Number(value);
    return `${numValue.toFixed(1)}%`;
  };

  const formatCurrency = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(Number(value))) return '0 FCFA';
    const numValue = Number(value);
    return `${Math.round(numValue).toLocaleString()} FCFA`;
  };

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return 'N/A';
    }
  };

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