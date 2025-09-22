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
  average_weight: string;
  mortality_count: string;
  water_temperature: string;
  ph_level: string;
  notes: string;
}

export default function DailyLogScreen({ navigation }: any) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { dashboardData, loading } = useSelector((state: RootState) => state.aquaculture);
  const activeCycles = dashboardData?.active_cycles || [];

  const [selectedCycle, setSelectedCycle] = useState<string>('');
  const [formData, setFormData] = useState<DailyLogData>({
    cycle_id: '',
    average_weight: '',
    mortality_count: '',
    water_temperature: '',
    ph_level: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dispatch(fetchDashboardData());
  }, [dispatch]);

  useEffect(() => {
    if (activeCycles.length > 0 && !selectedCycle) {
      setSelectedCycle(activeCycles[0].id);
      setFormData(prev => ({ ...prev, cycle_id: activeCycles[0].id }));
    }
  }, [activeCycles, selectedCycle]);

  const handleSave = async () => {
    if (!selectedCycle) {
      Alert.alert(t('error'), 'Veuillez sélectionner un cycle');
      return;
    }

    setSaving(true);
    try {
      // TODO: Implémenter l'API call POST /api/aquaculture/cycle-logs/
      console.log('Saving daily log:', formData);

      // Simulation d'une sauvegarde
      await new Promise(resolve => setTimeout(resolve, 1000));

      Alert.alert(t('success'), 'Saisie enregistrée avec succès', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      Alert.alert(t('error'), 'Erreur lors de l\'enregistrement');
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
        <Text style={styles.emptyTitle}>Aucun cycle actif</Text>
        <Text style={styles.emptySubtitle}>Créez un cycle d'élevage pour commencer la saisie</Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('NewCycle')}
        >
          <Text style={styles.buttonText}>Créer un cycle</Text>
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
        <Text style={styles.headerTitle}>{t('dailyLog')}</Text>
      </View>

      <View style={styles.content}>
        {/* Sélection du cycle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cycle d'élevage</Text>
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
          <Text style={styles.sectionTitle}>Données du jour</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Poids moyen (g)</Text>
            <TextInput
              style={styles.input}
              value={formData.average_weight}
              onChangeText={(value) => setFormData(prev => ({ ...prev, average_weight: value }))}
              placeholder="Ex: 120"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.formRow}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Mortalité</Text>
              <TextInput
                style={styles.input}
                value={formData.mortality_count}
                onChangeText={(value) => setFormData(prev => ({ ...prev, mortality_count: value }))}
                placeholder="Ex: 2"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Température (°C)</Text>
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
            <Text style={styles.label}>pH de l'eau</Text>
            <TextInput
              style={styles.input}
              value={formData.ph_level}
              onChangeText={(value) => setFormData(prev => ({ ...prev, ph_level: value }))}
              placeholder="Ex: 7.2"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Observations</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.notes}
              onChangeText={(value) => setFormData(prev => ({ ...prev, notes: value }))}
              placeholder="Notes, observations particulières..."
              multiline
              numberOfLines={4}
            />
          </View>
        </View>

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
              <Text style={styles.buttonText}>Enregistrer</Text>
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
});