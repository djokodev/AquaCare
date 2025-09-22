import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { fetchDashboardData } from '@/store/slices/aquacultureSlice';
import { aquacultureService } from '@/services/aquacultureService';
import { offlineService } from '@/services/offlineService';
import { DailyLogForm } from '@/types/aquaculture';

// Couleurs MAVECAM selon spécifications
const MAVECAM_COLORS = {
  GREEN_PRIMARY: '#059669',
  GREEN_LIGHT: '#10b981',
  GREEN_DARK: '#047857',
  WHITE: '#ffffff',
  CREAM: '#f8fafc',
  BLUE: '#2563eb',
  SUCCESS: '#059669',
  WARNING: '#f59e0b',
  ERROR: '#dc2626',
  INFO: '#0ea5e9',
  GRAY_LIGHT: '#64748b',
  GRAY_DARK: '#1e293b',
};

interface DailyLogData {
  cycle_id: string;
  sample_count: string;
  sample_total_weight: string;
  mortality_count: string;
  water_temperature: string;
  ph_level: string;
  observations: string;
}

export default function DailyLogScreen({ navigation }: any) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { dashboardData, loading } = useSelector((state: RootState) => state.aquaculture);
  const activeCycles = dashboardData?.active_cycles || [];

  const [selectedCycle, setSelectedCycle] = useState<string>('');
  const [formData, setFormData] = useState<DailyLogData>({
    cycle_id: '',
    sample_count: '',
    sample_total_weight: '',
    mortality_count: '',
    water_temperature: '',
    ph_level: '',
    observations: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dispatch(fetchDashboardData());

    // Tenter la synchronisation des données offline
    tryOfflineSync();
  }, [dispatch]);

  const tryOfflineSync = async () => {
    try {
      const hasPending = await offlineService.hasPendingSync();
      if (hasPending) {
        console.log('🔄 Synchronisation des données offline...');

        const result = await offlineService.syncOfflineLogs();

        if (result.success > 0) {
          console.log(`✅ ${result.success} saisies synchronisées`);
          // Rafraîchir le dashboard après sync
          dispatch(fetchDashboardData());
        }

        if (result.failed > 0) {
          console.log(`❌ ${result.failed} saisies non synchronisées`);
        }
      }
    } catch (error) {
      console.error('Erreur synchronisation silencieuse:', error);
      // Ne pas alerter l'utilisateur, juste log
    }
  };

  useEffect(() => {
    if (activeCycles.length > 0 && !selectedCycle) {
      setSelectedCycle(activeCycles[0].id);
      setFormData(prev => ({ ...prev, cycle_id: activeCycles[0].id }));
    }
  }, [activeCycles, selectedCycle]);

  const handleSave = async () => {
    if (!selectedCycle) {
      Alert.alert(t('error'), t('noCycleSelected'));
      return;
    }

    setSaving(true);
    try {
      // Calculer le poids moyen à partir de l'échantillon
      const sampleCount = parseFloat(formData.sample_count) || 0;
      const sampleWeight = parseFloat(formData.sample_total_weight) || 0;
      const averageWeight = sampleCount > 0 ? sampleWeight / sampleCount : 0;

      // Préparer les données pour l'API
      const logData: DailyLogForm = {
        log_date: new Date().toISOString().split('T')[0], // Format YYYY-MM-DD
        mortality_count: formData.mortality_count ? parseInt(formData.mortality_count) : undefined,
        sample_count: sampleCount > 0 ? sampleCount : undefined,
        sample_total_weight: sampleWeight > 0 ? sampleWeight : undefined,
        water_temperature: formData.water_temperature ? parseFloat(formData.water_temperature) : undefined,
        ph_level: formData.ph_level ? parseFloat(formData.ph_level) : undefined,
        observations: formData.observations || undefined,
      };

      try {
        // Tentative d'appel API en ligne
        await aquacultureService.createCycleLog(selectedCycle, logData);

        // Rafraîchir le Dashboard pour afficher les nouvelles données
        dispatch(fetchDashboardData());

        Alert.alert(t('success'), t('recordSaved'), [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);

      } catch (apiError: any) {
        // Vérifier si c'est une erreur réseau
        const isNetworkError =
          apiError.code === 'NETWORK_ERROR' ||
          apiError.message?.toLowerCase().includes('network') ||
          apiError.message?.toLowerCase().includes('connection') ||
          !apiError.response;

        if (isNetworkError) {
          console.log('📱 Pas de connexion, sauvegarde offline...');

          // Sauvegarder en offline
          await offlineService.saveCycleLogOffline(selectedCycle, logData);

          Alert.alert(t('success'), t('recordSavedOffline'), [
            { text: 'OK', onPress: () => navigation.goBack() }
          ]);

        } else {
          // Erreur API réelle
          throw apiError;
        }
      }
    } catch (error: any) {
      console.error('Error creating daily log:', error);

      let errorMessage = t('recordSaveError');
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert(t('error'), errorMessage);
    } finally {
      setSaving(false);
    }
  };

  // Affichage de l'interface même pendant le chargement
  // if (loading) {
  //   return (
  //     <View style={styles.loadingContainer}>
  //       <ActivityIndicator size="large" color={MAVECAM_COLORS.GREEN_PRIMARY} />
  //       <Text style={styles.loadingText}>{t('loading')}...</Text>
  //     </View>
  //   );
  // }

  if (activeCycles.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="fish-outline" size={64} color={MAVECAM_COLORS.GRAY_LIGHT} />
        <Text style={styles.emptyTitle}>{t('noActiveCycles')}</Text>
        <Text style={styles.emptySubtitle}>{t('createCycleToStart')}</Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('NewCycle')}
        >
          <Text style={styles.buttonText}>{t('createCycle')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('dailyLogTitle')}</Text>
      </View>

      <View style={styles.content}>
        {/* Sélection du cycle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('cycleSelection')}</Text>
          {activeCycles.map((cycle) => (
            <TouchableOpacity
              key={cycle.id}
              style={[
                styles.cycleCard,
                selectedCycle === cycle.id && styles.cycleCardSelected
              ]}
              onPress={() => {
                setSelectedCycle(cycle.id);
                setFormData(prev => ({ ...prev, cycle_id: cycle.id }));
              }}
            >
              <View style={styles.cycleInfo}>
                <Text style={styles.cycleName}>Bassin {cycle.pond_identifier || cycle.id.slice(-4)}</Text>
                <Text style={styles.cycleDetails}>
                  {cycle.current_count} poissons • {cycle.species}
                </Text>
              </View>
              {selectedCycle === cycle.id && (
                <Ionicons name="checkmark-circle" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Formulaire de saisie */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('dailyData')}</Text>

          <View style={styles.formRow}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('sampleCount')}</Text>
              <TextInput
                style={styles.input}
                value={formData.sample_count}
                onChangeText={(value) => setFormData(prev => ({ ...prev, sample_count: value }))}
                placeholder="Ex: 10"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('sampleWeight')}</Text>
              <TextInput
                style={styles.input}
                value={formData.sample_total_weight}
                onChangeText={(value) => setFormData(prev => ({ ...prev, sample_total_weight: value }))}
                placeholder="Ex: 1200"
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('mortality')}</Text>
              <TextInput
                style={styles.input}
                value={formData.mortality_count}
                onChangeText={(value) => setFormData(prev => ({ ...prev, mortality_count: value }))}
                placeholder="Ex: 2"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('waterTemperatureUnit')}</Text>
              <TextInput
                style={styles.input}
                value={formData.water_temperature}
                onChangeText={(value) => setFormData(prev => ({ ...prev, water_temperature: value }))}
                placeholder="Ex: 28.5"
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('phLevel')}</Text>
            <TextInput
              style={styles.input}
              value={formData.ph_level}
              onChangeText={(value) => setFormData(prev => ({ ...prev, ph_level: value }))}
              placeholder="Ex: 7.2"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('observations')}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.observations}
              onChangeText={(value) => setFormData(prev => ({ ...prev, observations: value }))}
              placeholder={t('observationsPlaceholder')}
              multiline
              numberOfLines={4}
            />
          </View>
        </View>

        {/* Calculs automatiques */}
        {formData.sample_count && formData.sample_total_weight && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('autoCalculations')}</Text>
            <View style={styles.calculationsCard}>
              <View style={styles.calculationRow}>
                <Text style={styles.calculationLabel}>{t('averageWeight')} :</Text>
                <Text style={styles.calculationValue}>
                  {(parseFloat(formData.sample_total_weight) / parseFloat(formData.sample_count)).toFixed(1)} g
                </Text>
              </View>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={MAVECAM_COLORS.WHITE} />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color={MAVECAM_COLORS.WHITE} />
              <Text style={styles.buttonText}>{t('save')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
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
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: MAVECAM_COLORS.CREAM,
    padding: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
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
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 12,
  },
  cycleCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cycleCardSelected: {
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
    backgroundColor: '#f0fdf4',
  },
  cycleInfo: {
    flex: 1,
  },
  cycleName: {
    fontSize: 16,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  cycleDetails: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 4,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formGroup: {
    flex: 1,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 8,
  },
  input: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_DARK,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  primaryButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  calculationsCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: MAVECAM_COLORS.GREEN_LIGHT,
  },
  calculationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  calculationLabel: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
  },
  calculationValue: {
    fontSize: 14,
    fontWeight: '600',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
  },
});