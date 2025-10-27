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
import { aquacultureService } from '@/services/aquacultureService';
import { offlineService } from '@/services/offlineService';
import { SanitaryLogForm, SanitaryEventType } from '@/types/aquaculture';
import * as ImagePicker from 'expo-image-picker';
import { MAVECAM_COLORS } from '@/constants/colors';

const SANITARY_EVENT_TYPES = [
  { value: 'disease', label: 'Maladie', icon: 'medical' },
  { value: 'treatment', label: 'Traitement', icon: 'medical-outline' },
  { value: 'vaccination', label: 'Vaccination', icon: 'shield-checkmark' },
  { value: 'abnormal_mortality', label: 'Mortalité anormale', icon: 'skull' },
  { value: 'water_quality', label: 'Qualité eau', icon: 'water' },
  { value: 'other', label: 'Autre', icon: 'help-circle' },
];

interface SanitaryLogData {
  cycle_id: string;
  event_type: string;
  symptoms: string;
  treatment_applied: string;
  medication_used: string;
  dosage: string;
  treatment_duration_days: string;
  affected_count: string;
  comments: string; // Commentaires additionnels (correspond à notes backend)
  photo: string | null; // URI de l'image ou null
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
    symptoms: '',
    treatment_applied: '',
    medication_used: '',
    dosage: '',
    treatment_duration_days: '',
    affected_count: '',
    comments: '',
    photo: null,
  });
  const [saving, setSaving] = useState(false);

  // Détermine si les champs de traitement doivent être affichés
  const shouldShowTreatmentFields = ['treatment', 'vaccination', 'disease'].includes(formData.event_type);

  // Génère un message de confirmation personnalisé selon le type d'événement
  const getSuccessMessage = (eventType: string) => {
    switch (eventType) {
      case 'disease':
        return 'Maladie signalée avec succès.\nL\'équipe MAVECAM va analyser votre rapport et vous contacter si nécessaire.';
      case 'treatment':
        return 'Traitement enregistré avec succès.\nContinuez à surveiller l\'évolution et informez-nous des résultats.';
      case 'vaccination':
        return 'Vaccination enregistrée avec succès.\nVotre programme de prévention est à jour.';
      case 'abnormal_mortality':
        return 'Mortalité anormale signalée avec succès.\n⚠️ L\'équipe MAVECAM va vous contacter rapidement pour assistance.';
      case 'water_quality':
        return 'Problème de qualité d\'eau signalé avec succès.\nVérifiez les paramètres et appliquez les corrections nécessaires.';
      case 'other':
        return 'Événement enregistré avec succès.\nL\'équipe MAVECAM examinera votre rapport.';
      default:
        return t('sanitaryRecordSaved');
    }
  };

  useEffect(() => {
    dispatch(fetchDashboardData());
  }, [dispatch]);

  useEffect(() => {
    if (activeCycles.length > 0 && !selectedCycle) {
      setSelectedCycle(activeCycles[0].id);
      setFormData(prev => ({ ...prev, cycle_id: activeCycles[0].id }));
    }
  }, [activeCycles, selectedCycle]);

  // Nettoie les champs de traitement quand on change vers un type d'événement qui n'en a pas besoin
  useEffect(() => {
    if (!shouldShowTreatmentFields) {
      setFormData(prev => ({
        ...prev,
        treatment_applied: '',
        medication_used: '',
        dosage: '',
        treatment_duration_days: ''
      }));
    }
  }, [shouldShowTreatmentFields]);

  // Fonction pour demander les permissions
  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('error'), 'Permission d\'accès aux photos requise');
      return false;
    }
    return true;
  };

  // Fonction pour compresser et convertir l'image en File
  const processImage = async (uri: string): Promise<string> => {
    // Pour l'instant, on retourne l'URI directement
    // La conversion en File se fait dans handleSave
    return uri;
  };

  // Fonction pour convertir URI React Native en objet pour FormData
  const createFormDataFile = (uri: string, name: string) => {
    // Pour React Native, on utilise un objet spécial pour FormData
    return {
      uri: uri,
      type: 'image/jpeg',
      name: name,
    };
  };

  // Fonction pour sélectionner une image depuis la galerie
  const pickImage = async () => {
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9], // Format paysage recommandé pour photos aquaculture
        quality: 0.8, // Compression à 80%
        base64: false, // Pas besoin de base64 pour l'affichage
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const processedUri = await processImage(result.assets[0].uri);
        setFormData(prev => ({ ...prev, photo: processedUri }));
      }
    } catch (error) {
      console.error('Erreur sélection image:', error);
      Alert.alert(t('error'), 'Erreur lors de la sélection de l\'image');
    }
  };

  // Fonction pour prendre une photo avec l'appareil
  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('error'), 'Permission d\'accès à l\'appareil photo requise');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const processedUri = await processImage(result.assets[0].uri);
        setFormData(prev => ({ ...prev, photo: processedUri }));
      }
    } catch (error) {
      console.error('Erreur prise photo:', error);
      Alert.alert(t('error'), 'Erreur lors de la prise de photo');
    }
  };

  // Fonction pour choisir la source de l'image
  const chooseImageSource = () => {
    Alert.alert(
      'Ajouter une photo',
      'Choisissez la source de votre photo',
      [
        {
          text: 'Galerie',
          onPress: pickImage,
        },
        {
          text: 'Appareil photo',
          onPress: takePhoto,
        },
        {
          text: 'Annuler',
          style: 'cancel',
        },
      ]
    );
  };

  // Fonction pour supprimer la photo
  const removePhoto = () => {
    setFormData(prev => ({ ...prev, photo: null }));
  };

  const handleSave = async () => {
    if (!selectedCycle) {
      Alert.alert(t('error'), t('noCycleSelected'));
      return;
    }

    if (!formData.event_type) {
      Alert.alert(t('error'), t('selectEventType'));
      return;
    }

    if (!formData.symptoms.trim()) {
      Alert.alert(t('error'), t('fillRequiredFields'));
      return;
    }

    setSaving(true);
    try {
      // Préparer les données pour l'API
      const sanitaryData: SanitaryLogForm = {
        event_date: new Date().toISOString().split('T')[0],
        event_type: formData.event_type as SanitaryEventType,
        symptoms: formData.symptoms,
        affected_count: formData.affected_count ? parseInt(formData.affected_count) : undefined,
        treatment_applied: formData.treatment_applied || undefined,
        medication_used: formData.medication_used || undefined,
        dosage: formData.dosage || undefined,
        treatment_duration_days: formData.treatment_duration_days ? parseInt(formData.treatment_duration_days) : undefined,
        notes: formData.comments || undefined, // Commentaires → notes backend
      };

      // Préparer la photo pour React Native FormData si présente
      if (formData.photo) {
        try {
          const photoFile = createFormDataFile(
            formData.photo,
            `sanitary_log_${Date.now()}.jpg`
          );
          sanitaryData.photo = photoFile as any; // TypeScript workaround pour React Native
        } catch (error) {
          console.error('Erreur préparation photo:', error);
          // Continuer sans photo en cas d'erreur
          sanitaryData.photo = undefined;
        }
      }

      try {
        // Tentative d'appel API en ligne
        await aquacultureService.createSanitaryLog(selectedCycle, sanitaryData);

        // Rafraîchir le Dashboard pour afficher les nouvelles données
        dispatch(fetchDashboardData());

        Alert.alert(t('success'), getSuccessMessage(formData.event_type), [
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
          console.log('📱 Pas de connexion, sauvegarde log sanitaire offline...');

          // Sauvegarder en offline
          await offlineService.saveSanitaryLogOffline(selectedCycle, sanitaryData);

          Alert.alert(t('success'), getSuccessMessage(formData.event_type) + '\n\n📱 Sauvegardé hors ligne - Sera synchronisé dès que possible.', [
            { text: 'OK', onPress: () => navigation.goBack() }
          ]);

        } else {
          // Erreur API réelle
          throw apiError;
        }
      }
    } catch (error: any) {
      console.error('Error creating sanitary log:', error);

      // Debug détaillé de l'erreur
      if (error.response) {
        console.error('🚨 Erreur HTTP:', error.response.status);
        console.error('🚨 Données erreur:', error.response.data);
        console.error('🚨 Headers erreur:', error.response.headers);
      }

      let errorMessage = t('sanitaryRecordSaveError');
      if (error.response?.data) {
        // Afficher les erreurs de validation Django
        if (typeof error.response.data === 'object') {
          const errors = Object.entries(error.response.data)
            .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`)
            .join('\n');
          errorMessage = `Erreurs de validation:\n${errors}`;
        } else if (error.response.data.message) {
          errorMessage = error.response.data.message;
        } else if (error.response.data.detail) {
          errorMessage = error.response.data.detail;
        }
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

          {/* Message informatif pour les champs de traitement */}
          {formData.event_type && (
            <View style={[
              styles.infoBox,
              shouldShowTreatmentFields ? styles.infoBoxTreatment : styles.infoBoxNoTreatment
            ]}>
              <Ionicons
                name={shouldShowTreatmentFields ? "medical" : "information-circle"}
                size={16}
                color={shouldShowTreatmentFields ? MAVECAM_COLORS.GREEN_PRIMARY : MAVECAM_COLORS.BLUE}
              />
              <Text style={[
                styles.infoText,
                shouldShowTreatmentFields ? styles.infoTextTreatment : styles.infoTextNoTreatment
              ]}>
                {shouldShowTreatmentFields
                  ? "Les champs de traitement sont disponibles ci-dessous"
                  : "Aucun traitement requis pour ce type d'événement"}
              </Text>
            </View>
          )}
        </View>

        {/* Formulaire de saisie */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Détails</Text>

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

          {/* Section traitement - Affichée conditionnellement */}
          {shouldShowTreatmentFields && (
            <>
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

              <View style={styles.formRow}>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Médicament utilisé</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.medication_used}
                    onChangeText={(value) => setFormData(prev => ({ ...prev, medication_used: value }))}
                    placeholder="Ex: Antibiotique XYZ"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Dosage</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.dosage}
                    onChangeText={(value) => setFormData(prev => ({ ...prev, dosage: value }))}
                    placeholder="Ex: 5mg/L"
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Durée du traitement (jours)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.treatment_duration_days}
                  onChangeText={(value) => setFormData(prev => ({ ...prev, treatment_duration_days: value }))}
                  placeholder="Ex: 7"
                  keyboardType="numeric"
                />
              </View>
            </>
          )}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Commentaires additionnels</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.comments}
              onChangeText={(value) => setFormData(prev => ({ ...prev, comments: value }))}
              placeholder="Notes, observations supplémentaires..."
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        {/* Photos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Photo</Text>

          {!formData.photo ? (
            <TouchableOpacity style={styles.addPhotoButton} onPress={chooseImageSource}>
              <Ionicons name="camera" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
              <Text style={styles.addPhotoText}>Ajouter une photo</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.photoContainer}>
              <Image source={{ uri: formData.photo }} style={styles.photo} />
              <TouchableOpacity
                style={styles.removePhotoButton}
                onPress={removePhoto}
              >
                <Ionicons name="close-circle" size={24} color={MAVECAM_COLORS.ERROR} />
              </TouchableOpacity>
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
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginTop: 16,
    borderRadius: 8,
    gap: 8,
  },
  infoBoxTreatment: {
    backgroundColor: '#f0fdf4', // Vert très clair
    borderWidth: 1,
    borderColor: MAVECAM_COLORS.GREEN_LIGHT,
  },
  infoBoxNoTreatment: {
    backgroundColor: '#eff6ff', // Bleu très clair
    borderWidth: 1,
    borderColor: MAVECAM_COLORS.BLUE,
  },
  infoText: {
    fontSize: 14,
    flex: 1,
  },
  infoTextTreatment: {
    color: MAVECAM_COLORS.GREEN_DARK,
  },
  infoTextNoTreatment: {
    color: MAVECAM_COLORS.BLUE,
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
  photoContainer: {
    position: 'relative',
    marginTop: 12,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  removePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: MAVECAM_COLORS.WHITE,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
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