import React, { useState, useEffect } from 'react';
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
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import { aquacultureService } from '@/services/aquacultureService';
import { CycleLog } from '@/types/aquaculture';
import { MAVECAM_COLORS } from '@/constants/colors';
import { formatDate } from '@/utils';
import { estimateAverageWeight } from '@/domain';

export default function DailyLogHistoryScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { dashboardData } = useSelector((state: RootState) => state.aquaculture);
  const activeCycles = dashboardData?.active_cycles || [];

  const [logs, setLogs] = useState<CycleLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<string>('all');

  useEffect(() => {
    loadLogs();
  }, [selectedCycle]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const cycleId = selectedCycle === 'all' ? undefined : selectedCycle;
      const logsData = await aquacultureService.getCycleLogs(cycleId);
      setLogs(logsData);
    } catch (error) {
      console.error('Erreur lors du chargement des logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLogs();
    setRefreshing(false);
  };

  /**
   * ✅ Utilisation de formatDate() centralisé depuis @/utils
   * Note: formatDate supporte options personnalisées si nécessaire
   */

  const getCycleName = (cycleId: string) => {
    const cycle = activeCycles.find(c => c.id === cycleId);
    return cycle ? cycle.pond_identifier : `Cycle ${cycleId.slice(-4)}`;
  };

  const renderLogCard = (log: CycleLog) => (
    <View key={log.id} style={styles.logCard}>
      {/* Header carte */}
      <View style={styles.logHeader}>
        <Text style={styles.logDate}>{formatDate(log.log_date)}</Text>
        <Text style={styles.logCycle}>{getCycleName(log.cycle)}</Text>
      </View>

      {/* Données principales */}
      <View style={styles.logData}>
        {log.sample_count && log.sample_total_weight && (
          <View style={styles.dataItem}>
            <Text style={styles.dataLabel}>{t('averageWeight')} :</Text>
            <Text style={styles.dataValue}>
              {estimateAverageWeight(log.sample_total_weight, log.sample_count).toFixed(1)} g
            </Text>
          </View>
        )}

        {log.mortality_count && log.mortality_count > 0 && (
          <View style={styles.dataItem}>
            <Text style={styles.dataLabel}>{t('mortality')} :</Text>
            <Text style={styles.dataValue}>{log.mortality_count}</Text>
          </View>
        )}

        {log.water_temperature && (
          <View style={styles.dataItem}>
            <Text style={styles.dataLabel}>{t('waterTemperature')} :</Text>
            <Text style={styles.dataValue}>{log.water_temperature}°C</Text>
          </View>
        )}

        {log.ph_level && (
          <View style={styles.dataItem}>
            <Text style={styles.dataLabel}>pH :</Text>
            <Text style={styles.dataValue}>{log.ph_level}</Text>
          </View>
        )}
      </View>

      {/* Observations */}
      {log.observations && (
        <View style={styles.observationsSection}>
          <Text style={styles.observationsLabel}>{t('observations')} :</Text>
          <Text style={styles.observationsText}>{log.observations}</Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
        <Text style={styles.loadingText}>{t('loading')}...</Text>
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
        <Text style={styles.headerTitle}>{t('dailyLogHistory')}</Text>
      </View>

      {/* Filtres */}
      <View style={styles.filtersSection}>
        <Text style={styles.filterLabel}>{t('filterByCycle')} :</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <TouchableOpacity
            style={[
              styles.filterChip,
              selectedCycle === 'all' && styles.filterChipSelected
            ]}
            onPress={() => setSelectedCycle('all')}
          >
            <Text style={[
              styles.filterChipText,
              selectedCycle === 'all' && styles.filterChipTextSelected
            ]}>
              {t('allCycles')}
            </Text>
          </TouchableOpacity>

          {activeCycles.map((cycle) => (
            <TouchableOpacity
              key={cycle.id}
              style={[
                styles.filterChip,
                selectedCycle === cycle.id && styles.filterChipSelected
              ]}
              onPress={() => setSelectedCycle(cycle.id)}
            >
              <Text style={[
                styles.filterChipText,
                selectedCycle === cycle.id && styles.filterChipTextSelected
              ]}>
                {t('pond')} {cycle.pond_identifier}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Liste des logs */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {logs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-outline" size={64} color={MAVECAM_COLORS.GRAY_LIGHT} />
            <Text style={styles.emptyTitle}>{t('noLogsYet')}</Text>
            <Text style={styles.emptySubtitle}>{t('startLoggingData')}</Text>
          </View>
        ) : (
          logs.map(log => renderLogCard(log))
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
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  loadingText: {
    marginTop: 10,
    color: MAVECAM_COLORS.GRAY_DARK,
    fontSize: 16,
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
  filtersSection: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 8,
  },
  filterScroll: {
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipSelected: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  filterChipText: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  filterChipTextSelected: {
    color: MAVECAM_COLORS.WHITE,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  logCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  logDate: {
    fontSize: 16,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  logCycle: {
    fontSize: 14,
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    fontWeight: '500',
  },
  logData: {
    marginBottom: 8,
  },
  dataItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dataLabel: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    flex: 1,
  },
  dataValue: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  observationsSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  observationsLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 4,
  },
  observationsText: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
});