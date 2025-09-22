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
  Image,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { fetchDashboardData } from '@/store/slices/aquacultureSlice';
// import * as ImagePicker from 'expo-image-picker';

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

const SANITARY_EVENT_TYPES = [
  { value: 'disease', label: 'Maladie', icon: 'medical' },
  { value: 'mortality', label: 'Mortalité élevée', icon: 'skull' },
  { value: 'treatment', label: 'Traitement', icon: 'medical-outline' },
  { value: 'water_quality', label: 'Qualité eau', icon: 'water' },
  { value: 'feeding_issue', label: 'Problème alimentation', icon: 'nutrition' },
  { value: 'other', label: 'Autre', icon: 'help-circle' },
];

interface SanitaryLogData {
  cycle_id: string;
  event_type: string;
  severity: string;
  description: string;
  symptoms: string;
  treatment_applied: string;
  affected_count: string;
  photos: string[];
}

export default function SanitaryLogScreen({ navigation }: any) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { dashboardData, loading } = useSelector((state: RootState) => state.aquaculture);
  const activeCycles = dashboardData?.active_cycles || [];

  const [selectedCycle, setSelectedCycle] = useState<string>('');
  const [formData, setFormData] = useState<SanitaryLogData>({
    cycle_id: '',
    event_type: '',
    severity: 'medium',
    description: '',
    symptoms: '',
    treatment_applied: '',
    affected_count: '',
    photos: [],
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

  const pickImage = async () => {
    // TODO: Implémenter ImagePicker une fois expo-image-picker installé
    Alert.alert('Photo', 'Fonctionnalité photos à implémenter');

    // Simulation pour le moment
    const fakeUri = `https://via.placeholder.com/300x200?text=Photo${Date.now()}`;
    setFormData(prev => ({
      ...prev,
      photos: [...prev.photos, fakeUri]
    }));
  };

  const removePhoto = (index: number) => {
    setFormData(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
  };

  const handleSave = async () => {
    if (!selectedCycle) {
      Alert.alert(t('error'), 'Veuillez sélectionner un cycle');
      return;
    }

    if (!formData.event_type) {
      Alert.alert(t('error'), 'Veuillez sélectionner un type d\'événement');
      return;
    }

    setSaving(true);
    try {
      // TODO: Implémenter l'API call POST /api/aquaculture/sanitary-logs/
      console.log('Saving sanitary log:', formData);

      // Simulation d'une sauvegarde
      await new Promise(resolve => setTimeout(resolve, 1500));

      Alert.alert(t('success'), 'Journal sanitaire enregistré avec succès', [
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
        <Ionicons name="medical-outline" size={64} color={MAVECAM_COLORS.GRAY_LIGHT} />
        <Text style={styles.emptyTitle}>Aucun cycle actif</Text>
        <Text style={styles.emptySubtitle}>Créez un cycle d'élevage pour enregistrer des problèmes sanitaires</Text>
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
        <Text style={styles.headerTitle}>Journal Sanitaire</Text>
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

        {/* Type d'événement */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Type de problème</Text>
          <View style={styles.eventTypeGrid}>
            {SANITARY_EVENT_TYPES.map((type) => (
              <TouchableOpacity
                key={type.value}
                style={[
                  styles.eventTypeCard,
                  formData.event_type === type.value && styles.eventTypeCardSelected
                ]}
                onPress={() => setFormData(prev => ({ ...prev, event_type: type.value }))}
              >
                <Ionicons
                  name={type.icon as any}
                  size={24}
                  color={formData.event_type === type.value ? MAVECAM_COLORS.WHITE : MAVECAM_COLORS.GRAY_LIGHT}
                />
                <Text style={[
                  styles.eventTypeLabel,
                  formData.event_type === type.value && styles.eventTypeLabelSelected
                ]}>
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Gravité */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Gravité</Text>
          <View style={styles.severityButtons}>
            {[
              { value: 'low', label: 'Faible', color: MAVECAM_COLORS.SUCCESS },
              { value: 'medium', label: 'Modérée', color: MAVECAM_COLORS.WARNING },
              { value: 'high', label: 'Élevée', color: MAVECAM_COLORS.ERROR },
            ].map((severity) => (
              <TouchableOpacity
                key={severity.value}
                style={[
                  styles.severityButton,
                  { borderColor: severity.color },
                  formData.severity === severity.value && { backgroundColor: severity.color }
                ]}
                onPress={() => setFormData(prev => ({ ...prev, severity: severity.value }))}
              >
                <Text style={[
                  styles.severityLabel,
                  { color: formData.severity === severity.value ? MAVECAM_COLORS.WHITE : severity.color }
                ]}>
                  {severity.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Formulaire de saisie */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Détails</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Description du problème *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.description}
              onChangeText={(value) => setFormData(prev => ({ ...prev, description: value }))}
              placeholder="Décrivez le problème observé..."
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Symptômes observés</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.symptoms}
              onChangeText={(value) => setFormData(prev => ({ ...prev, symptoms: value }))}
              placeholder="Listez les symptômes visibles..."
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.formRow}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Nombre affecté</Text>
              <TextInput
                style={styles.input}
                value={formData.affected_count}
                onChangeText={(value) => setFormData(prev => ({ ...prev, affected_count: value }))}
                placeholder="Ex: 10"
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Traitement appliqué</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.treatment_applied}
              onChangeText={(value) => setFormData(prev => ({ ...prev, treatment_applied: value }))}
              placeholder="Décrivez le traitement appliqué..."
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        {/* Photos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photos</Text>

          <TouchableOpacity style={styles.addPhotoButton} onPress={pickImage}>
            <Ionicons name="camera" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
            <Text style={styles.addPhotoText}>Ajouter une photo</Text>
          </TouchableOpacity>

          {formData.photos.length > 0 && (
            <View style={styles.photoGrid}>
              {formData.photos.map((photo, index) => (
                <View key={index} style={styles.photoContainer}>
                  <Image source={{ uri: photo }} style={styles.photo} />
                  <TouchableOpacity
                    style={styles.removePhotoButton}
                    onPress={() => removePhoto(index)}
                  >
                    <Ionicons name="close-circle" size={24} color={MAVECAM_COLORS.ERROR} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
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
  eventTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  eventTypeCard: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    minWidth: '30%',
    gap: 8,
  },
  eventTypeCardSelected: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  eventTypeLabel: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_DARK,
    textAlign: 'center',
  },
  eventTypeLabelSelected: {
    color: MAVECAM_COLORS.WHITE,
  },
  severityButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  severityButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
  },
  severityLabel: {
    fontSize: 14,
    fontWeight: '500',
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
  addPhotoButton: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderWidth: 2,
    borderColor: MAVECAM_COLORS.GREEN_PRIMARY,
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  addPhotoText: {
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    fontSize: 16,
    fontWeight: '500',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoContainer: {
    position: 'relative',
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 12,
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