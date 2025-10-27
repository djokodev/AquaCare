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
import { fetchProductionCycles } from '@/store/slices/aquacultureSlice';
import { ProductionCycle } from '@/types/aquaculture';
import { MAVECAM_COLORS } from '@/constants/colors';
import { formatNumber, formatPercentage, formatDate, formatDaysSince } from '@/utils';

export default function CycleHistoryScreen({ navigation }: any) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();

  // États locaux
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'clarias' | 'tilapia'>('all');

  // Sélecteurs Redux
  const {
    cycles,
    loading,
    error
  } = useSelector((state: RootState) => state.aquaculture);

  // Chargement initial
  useEffect(() => {
    dispatch(fetchProductionCycles());
  }, [dispatch]);

  // Fonction de rafraîchissement
  const onRefresh = React.useCallback(() => {
    dispatch(fetchProductionCycles());
  }, [dispatch]);

  // Filtrer les cycles récoltés
  const harvestedCycles = cycles.filter(cycle => cycle.status === 'harvested');

  // Appliquer le filtre par espèce
  const filteredCycles = harvestedCycles.filter(cycle => {
    if (selectedFilter === 'all') return true;
    return cycle.species === selectedFilter;
  });

  // Trier par date de fin (plus récent en premier)
  const sortedCycles = [...filteredCycles].sort((a, b) => {
    if (!a.end_date || !b.end_date) return 0;
    return new Date(b.end_date).getTime() - new Date(a.end_date).getTime();
  });

  /**
   * ✅ Utilisation des utilitaires centralisés
   * - formatDate() depuis @/utils/formatters
   * - formatDaysSince() depuis @/utils/formatters (calcule la durée)
   */
  const getDurationInDays = (startDate: string, endDate: string): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getPerformanceColor = (survivalRate: number | null | undefined, fcr: number | null | undefined) => {
    const survival = survivalRate || 0;
    const fcrValue = fcr || 999;

    if (survival >= 85 && fcrValue <= 1.8) return MAVECAM_COLORS.SUCCESS; // Excellent
    if (survival >= 75 && fcrValue <= 2.2) return MAVECAM_COLORS.WARNING; // Bon
    return MAVECAM_COLORS.ERROR; // À améliorer
  };

  const getPerformanceText = (survivalRate: number | null | undefined, fcr: number | null | undefined) => {
    const survival = survivalRate || 0;
    const fcrValue = fcr || 999;

    if (survival >= 85 && fcrValue <= 1.8) return 'Excellent';
    if (survival >= 75 && fcrValue <= 2.2) return 'Bon';
    return 'À améliorer';
  };

  // Fonction désactivée - pas de détails pour le moment
  // const handleCycleDetails = (cycle: ProductionCycle) => {
  //   // Fonctionnalité à implémenter plus tard
  // };

  /**
   * ⚠️ TODO BACKEND - CALCULS TEMPORAIRES
   * Ces aggregations DOIVENT être calculées par le backend.
   *
   * Backend devrait fournir: GET /aquaculture/cycles/?status=harvested&summary=true
   * Response: {
   *   cycles: [...],
   *   summary: {
   *     total_cycles: number,
   *     avg_survival_rate: number,
   *     avg_fcr: number,
   *     total_harvested_biomass: number
   *   }
   * }
   *
   * Pour l'instant, calcul temporaire frontend jusqu'à implémentation backend.
   */
  const totalCycles = sortedCycles.length;
  const avgSurvival = totalCycles > 0
    ? sortedCycles.reduce((sum, c) => sum + (c.survival_rate || 0), 0) / totalCycles
    : 0;
  const avgFCR = totalCycles > 0
    ? sortedCycles.reduce((sum, c) => sum + (c.fcr || 0), 0) / totalCycles
    : 0;
  const totalBiomass = sortedCycles.reduce((sum, c) => sum + (c.final_biomass || 0), 0);

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
        <Text style={styles.headerTitle}>{t('cycleHistory')}</Text>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={loading.cycles} onRefresh={onRefresh} />
        }
      >
        {/* Statistiques résumées */}
        <View style={styles.summaryContainer}>
          <Text style={styles.summaryTitle}>{t('historySummary')}</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{totalCycles}</Text>
              <Text style={styles.statLabel}>{t('completedCycles')}</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{formatPercentage(avgSurvival)}</Text>
              <Text style={styles.statLabel}>{t('avgSurvival')}</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{avgFCR > 0 ? avgFCR.toFixed(2) : '0'}</Text>
              <Text style={styles.statLabel}>{t('avgFCR')}</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{formatNumber(totalBiomass, 'kg')}</Text>
              <Text style={styles.statLabel}>{t('totalHarvested')}</Text>
            </View>
          </View>
        </View>

        {/* Filtres par espèce */}
        <View style={styles.filtersContainer}>
          <Text style={styles.filtersTitle}>{t('filterBySpecies')}</Text>

          <View style={styles.filterButtons}>
            {(['all', 'clarias', 'tilapia'] as const).map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterButton,
                  selectedFilter === filter && styles.filterButtonActive
                ]}
                onPress={() => setSelectedFilter(filter)}
              >
                <Text style={[
                  styles.filterButtonText,
                  selectedFilter === filter && styles.filterButtonTextActive
                ]}>
                  {filter === 'all' ? t('allSpecies') :
                   filter === 'clarias' ? 'Clarias' : 'Tilapia'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Liste des cycles */}
        <View style={styles.cyclesContainer}>
          <Text style={styles.cyclesTitle}>
            {t('harvestedCycles')} ({sortedCycles.length})
          </Text>

          {loading.cycles && sortedCycles.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
              <Text style={styles.loadingText}>{t('loading')}...</Text>
            </View>
          ) : sortedCycles.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="fish-outline" size={64} color={MAVECAM_COLORS.GRAY_LIGHT} />
              <Text style={styles.emptyText}>{t('noHarvestedCycles')}</Text>
              <Text style={styles.emptySubtext}>
                {t('completeCycleToSeeHistory')}
              </Text>
            </View>
          ) : (
            sortedCycles.map((cycle) => {
              const duration = getDurationInDays(cycle.start_date, cycle.end_date!);
              const performanceColor = getPerformanceColor(cycle.survival_rate, cycle.fcr);
              const performanceText = getPerformanceText(cycle.survival_rate, cycle.fcr);

              return (
                <View
                  key={cycle.id}
                  style={styles.cycleCard}
                >
                  <View style={styles.cycleHeader}>
                    <View style={styles.cycleInfo}>
                      <Text style={styles.cycleName}>{cycle.cycle_name}</Text>
                      <Text style={styles.cycleSpecies}>
                        {cycle.species === 'clarias' ? 'Silure africain (Clarias)' : 'Tilapia'} • {cycle.pond_identifier}
                      </Text>
                      <Text style={styles.cyclePeriod}>
                        {formatDate(cycle.start_date)} → {formatDate(cycle.end_date!)} • {duration} jours
                      </Text>
                    </View>

                    <View style={styles.performanceIndicator}>
                      <Text style={[styles.performanceText, { color: performanceColor }]}>
                        {performanceText}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cycleMetrics}>
                    <View style={styles.metricItem}>
                      <Text style={styles.metricValue}>{formatPercentage(cycle.survival_rate)}</Text>
                      <Text style={styles.metricLabel}>{t('survival')}</Text>
                    </View>

                    <View style={styles.metricItem}>
                      <Text style={styles.metricValue}>
                        {cycle.fcr ? cycle.fcr.toFixed(2) : '0.00'}
                      </Text>
                      <Text style={styles.metricLabel}>FCR</Text>
                    </View>

                    <View style={styles.metricItem}>
                      <Text style={styles.metricValue}>
                        {formatNumber(cycle.final_biomass, 'kg')}
                      </Text>
                      <Text style={styles.metricLabel}>{t('finalBiomass')}</Text>
                    </View>

                    <View style={styles.metricItem}>
                      <Text style={styles.metricValue}>
                        {cycle.final_average_weight ? `${cycle.final_average_weight}g` : '0g'}
                      </Text>
                      <Text style={styles.metricLabel}>{t('finalWeight')}</Text>
                    </View>
                  </View>

                </View>
              );
            })
          )}
        </View>
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
  summaryContainer: {
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
  summaryTitle: {
    fontSize: 18,
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
    width: '48%',
    alignItems: 'center',
    backgroundColor: MAVECAM_COLORS.CREAM,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  filtersContainer: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  filtersTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 12,
  },
  filterButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderWidth: 1,
    borderColor: MAVECAM_COLORS.GRAY_LIGHT,
  },
  filterButtonActive: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  filterButtonText: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_DARK,
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: MAVECAM_COLORS.WHITE,
  },
  cyclesContainer: {
    paddingHorizontal: 16,
  },
  cyclesTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 16,
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
    marginBottom: 12,
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
  cycleSpecies: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginBottom: 2,
  },
  cyclePeriod: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  performanceIndicator: {
    alignItems: 'center',
  },
  performanceText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  cycleMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: MAVECAM_COLORS.CREAM,
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 10,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
});