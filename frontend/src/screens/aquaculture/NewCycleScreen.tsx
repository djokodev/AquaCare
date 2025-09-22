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
import { useAuth } from '@/hooks/useAuth';
import { aquacultureService } from '@/services/aquacultureService';
import { CreateCycleForm } from '@/types/aquaculture';
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

const SPECIES_OPTIONS = [
  { value: 'clarias', label: 'Clarias', duration: '120 jours' },
  { value: 'tilapia', label: 'Tilapia', duration: '180 jours' },
];

interface NewCycleData {
  cycle_name: string;
  species: string;
  pond_identifier: string;
  pond_surface_m2: string;
  pond_volume_m3: string;
  initial_count: string;
  initial_average_weight: string;
  start_date: string;
}

export default function NewCycleScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { farmProfile } = useAuth();
  const dispatch = useDispatch<AppDispatch>();

  const [formData, setFormData] = useState<NewCycleData>({
    cycle_name: '',
    species: '',
    pond_identifier: '',
    pond_surface_m2: '',
    pond_volume_m3: '',
    initial_count: '',
    initial_average_weight: '',
    start_date: new Date().toISOString().split('T')[0], // Format YYYY-MM-DD
  });
  const [saving, setSaving] = useState(false);

  const getSelectedSpecies = () => {
    return SPECIES_OPTIONS.find(option => option.value === formData.species);
  };

  const calculateInitialBiomass = () => {
    const count = parseFloat(formData.initial_count) || 0;
    const weight = parseFloat(formData.initial_average_weight) || 0;
    return (count * weight / 1000).toFixed(2); // En kg
  };

  const calculateDensity = () => {
    const biomass = parseFloat(calculateInitialBiomass());
    const surface = parseFloat(formData.pond_surface_m2) || 0;
    if (surface === 0) return '0';
    return (biomass / surface).toFixed(2);
  };

  const generateCycleName = () => {
    const species = getSelectedSpecies();
    const date = new Date();
    const quarter = Math.ceil((date.getMonth() + 1) / 3);
    const year = date.getFullYear();

    if (species && formData.pond_identifier) {
      const name = `${species.label.split(' ')[0]} ${formData.pond_identifier} Q${quarter} ${year}`;
      setFormData(prev => ({ ...prev, cycle_name: name }));
    }
  };

  useEffect(() => {
    if (formData.species && formData.pond_identifier) {
      generateCycleName();
    }
  }, [formData.species, formData.pond_identifier]);

  const validateForm = () => {
    const required = [
      'cycle_name',
      'species',
      'pond_identifier',
      'pond_surface_m2',
      'initial_count',
      'initial_average_weight'
    ];

    for (const field of required) {
      if (!formData[field as keyof NewCycleData].trim()) {
        return false;
      }
    }

    // Validation des valeurs numériques
    if (parseFloat(formData.pond_surface_m2) <= 0) return false;
    if (parseFloat(formData.initial_count) <= 0) return false;
    if (parseFloat(formData.initial_average_weight) <= 0) return false;

    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      Alert.alert(t('error'), t('fillRequiredFields'));
      return;
    }

    setSaving(true);
    try {
      // Préparer les données pour l'API backend
      const cycleData: CreateCycleForm = {
        cycle_name: formData.cycle_name,
        species: formData.species as 'clarias' | 'tilapia',
        pond_identifier: formData.pond_identifier,
        pond_surface_m2: parseFloat(formData.pond_surface_m2),
        pond_volume_m3: formData.pond_volume_m3 ? parseFloat(formData.pond_volume_m3) : undefined,
        start_date: formData.start_date,
        initial_count: parseInt(formData.initial_count),
        initial_average_weight: parseFloat(formData.initial_average_weight),
      };

      console.log('Creating new cycle with data:', cycleData);

      // Appel API backend
      const newCycle = await aquacultureService.createProductionCycle(cycleData);

      console.log('Cycle created successfully:', newCycle);

      // Rafraîchir le Dashboard pour afficher le nouveau cycle
      dispatch(fetchDashboardData());

      Alert.alert(t('success'), t('cycleCreatedSuccess'), [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error: any) {
      console.error('Error creating cycle:', error);

      // Gestion des erreurs spécifiques
      let errorMessage = t('cycleCreationError');
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

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('newCycleTitle')}</Text>
      </View>

      <View style={styles.content}>
        {/* Info ferme */}
        <View style={styles.farmInfo}>
          <Ionicons name="business" size={20} color={MAVECAM_COLORS.GREEN_PRIMARY} />
          <Text style={styles.farmName}>
            {farmProfile?.farm_name || 'Ferme non définie'}
          </Text>
        </View>

        {/* Espèce */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('speciesSelection')} {t('requiredField')}</Text>
          <View style={styles.speciesGrid}>
            {SPECIES_OPTIONS.map((species) => (
              <TouchableOpacity
                key={species.value}
                style={[
                  styles.speciesCard,
                  formData.species === species.value && styles.speciesCardSelected
                ]}
                onPress={() => setFormData(prev => ({ ...prev, species: species.value }))}
              >
                <Text style={[
                  styles.speciesLabel,
                  formData.species === species.value && styles.speciesLabelSelected
                ]}>
                  {species.label}
                </Text>
                <Text style={[
                  styles.speciesDuration,
                  formData.species === species.value && styles.speciesDurationSelected
                ]}>
                  {species.duration}
                </Text>
                {formData.species === species.value && (
                  <Ionicons name="checkmark-circle" size={20} color={MAVECAM_COLORS.WHITE} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Informations du bassin */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('pondInfo')}</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('pondName')} {t('requiredField')}</Text>
            <TextInput
              style={styles.input}
              value={formData.pond_identifier}
              onChangeText={(value) => setFormData(prev => ({ ...prev, pond_identifier: value }))}
              placeholder={t('pondNamePlaceholder')}
            />
          </View>

          <View style={styles.formRow}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('surface')} {t('requiredField')}</Text>
              <TextInput
                style={styles.input}
                value={formData.pond_surface_m2}
                onChangeText={(value) => setFormData(prev => ({ ...prev, pond_surface_m2: value }))}
                placeholder="Ex: 100"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('volume')}</Text>
              <TextInput
                style={styles.input}
                value={formData.pond_volume_m3}
                onChangeText={(value) => setFormData(prev => ({ ...prev, pond_volume_m3: value }))}
                placeholder="Ex: 150"
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        {/* Empoissonnement */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('initialStocking')}</Text>

          <View style={styles.formRow}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('initialCount')} {t('requiredField')}</Text>
              <TextInput
                style={styles.input}
                value={formData.initial_count}
                onChangeText={(value) => setFormData(prev => ({ ...prev, initial_count: value }))}
                placeholder="Ex: 1000"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('initialWeight')} {t('requiredField')}</Text>
              <TextInput
                style={styles.input}
                value={formData.initial_average_weight}
                onChangeText={(value) => setFormData(prev => ({ ...prev, initial_average_weight: value }))}
                placeholder="Ex: 10"
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('startDate')} {t('requiredField')}</Text>
            <TextInput
              style={styles.input}
              value={formData.start_date}
              onChangeText={(value) => setFormData(prev => ({ ...prev, start_date: value }))}
              placeholder="YYYY-MM-DD"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('cycleName')}</Text>
            <TextInput
              style={styles.input}
              value={formData.cycle_name}
              onChangeText={(value) => setFormData(prev => ({ ...prev, cycle_name: value }))}
              placeholder={t('cycleNamePlaceholder')}
            />
          </View>
        </View>

        {/* Calculs automatiques */}
        {formData.initial_count && formData.initial_average_weight && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('autoCalculations')}</Text>
            <View style={styles.calculationsCard}>
              <View style={styles.calculationRow}>
                <Text style={styles.calculationLabel}>{t('initialBiomass')} :</Text>
                <Text style={styles.calculationValue}>{calculateInitialBiomass()} kg</Text>
              </View>

              {formData.pond_surface_m2 && (
                <View style={styles.calculationRow}>
                  <Text style={styles.calculationLabel}>{t('initialDensity')} :</Text>
                  <Text style={styles.calculationValue}>{calculateDensity()} kg/m²</Text>
                </View>
              )}

              {getSelectedSpecies() && (
                <View style={styles.calculationRow}>
                  <Text style={styles.calculationLabel}>{t('expectedDuration')} :</Text>
                  <Text style={styles.calculationValue}>{getSelectedSpecies()?.duration}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.saveButton, (!validateForm() || saving) && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={!validateForm() || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={MAVECAM_COLORS.WHITE} />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color={MAVECAM_COLORS.WHITE} />
              <Text style={styles.buttonText}>{t('createCycle')}</Text>
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
  farmInfo: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 16,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  farmName: {
    fontSize: 16,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
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
  speciesGrid: {
    gap: 8,
  },
  speciesCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  speciesCardSelected: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  speciesLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: MAVECAM_COLORS.GRAY_DARK,
    flex: 1,
  },
  speciesLabelSelected: {
    color: MAVECAM_COLORS.WHITE,
  },
  speciesDuration: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginRight: 8,
  },
  speciesDurationSelected: {
    color: MAVECAM_COLORS.WHITE,
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
  buttonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});