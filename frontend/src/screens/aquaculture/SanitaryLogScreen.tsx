import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Image } from 'react-native';
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
  { value: 'abnormal_mortality', label: 'Mortalite anormale', icon: 'skull' },
  { value: 'water_quality', label: 'Qualite eau', icon: 'water' },
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
  comments: string;
  photo: string | null;
}

export default function SanitaryLogScreen({ navigation }: any) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { dashboardData } = useSelector((state: RootState) => state.aquaculture);
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

  const shouldShowTreatmentFields = ['treatment', 'vaccination', 'disease'].includes(formData.event_type);

  const getSuccessMessage = (eventType: string) => {
    switch (eventType) {
      case 'disease':
        return "Maladie signalee avec succes. L'equipe MAVECAM va analyser votre rapport et vous contacter si necessaire.";
      case 'treatment':
        return "Traitement enregistre avec succes. Continuez a surveiller l'evolution et informez-nous des resultats.";
      case 'vaccination':
        return 'Vaccination enregistree avec succes. Votre programme de prevention est a jour.';
      case 'abnormal_mortality':
        return "Mortalite anormale signalee avec succes. L'equipe MAVECAM va vous contacter rapidement pour assistance.";
      case 'water_quality':
        return "Probleme de qualite d'eau signale avec succes. Verifiez les parametres et appliquez les corrections necessaires.";
      case 'other':
        return "Evenement enregistre avec succes. L'equipe MAVECAM examinera votre rapport.";
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
      setFormData((prev) => ({ ...prev, cycle_id: activeCycles[0].id }));
    }
  }, [activeCycles, selectedCycle]);

  useEffect(() => {
    if (!shouldShowTreatmentFields) {
      setFormData((prev) => ({
        ...prev,
        treatment_applied: '',
        medication_used: '',
        dosage: '',
        treatment_duration_days: '',
      }));
    }
  }, [shouldShowTreatmentFields]);

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('error'), "Permission d'acces aux photos requise");
      return false;
    }
    return true;
  };

  const processImage = async (uri: string): Promise<string> => uri;

  const createFormDataFile = (uri: string, name: string) => ({
    uri,
    type: 'image/jpeg',
    name,
  });

  const pickImage = async () => {
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const processedUri = await processImage(result.assets[0].uri);
        setFormData((prev) => ({ ...prev, photo: processedUri }));
      }
    } catch (pickError) {
      console.error('Erreur selection image:', pickError);
      Alert.alert(t('error'), "Erreur lors de la selection de l'image");
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('error'), "Permission d'acces a l'appareil photo requise");
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
        setFormData((prev) => ({ ...prev, photo: processedUri }));
      }
    } catch (cameraError) {
      console.error('Erreur prise photo:', cameraError);
      Alert.alert(t('error'), 'Erreur lors de la prise de photo');
    }
  };

  const chooseImageSource = () => {
    Alert.alert(t('addPhoto'), t('choosePhotoSource'), [
      { text: t('gallery'), onPress: pickImage },
      { text: t('camera'), onPress: takePhoto },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const removePhoto = () => {
    setFormData((prev) => ({ ...prev, photo: null }));
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
      const sanitaryData: SanitaryLogForm = {
        event_date: new Date().toISOString().split('T')[0],
        event_type: formData.event_type as SanitaryEventType,
        symptoms: formData.symptoms,
        affected_count: formData.affected_count ? parseInt(formData.affected_count) : undefined,
        treatment_applied: formData.treatment_applied || undefined,
        medication_used: formData.medication_used || undefined,
        dosage: formData.dosage || undefined,
        treatment_duration_days: formData.treatment_duration_days ? parseInt(formData.treatment_duration_days) : undefined,
        notes: formData.comments || undefined,
      };

      if (formData.photo) {
        try {
          const photoFile = createFormDataFile(formData.photo, `sanitary_log_${Date.now()}.jpg`);
          sanitaryData.photo = photoFile as any;
        } catch (photoError) {
          console.error('Erreur preparation photo:', photoError);
          sanitaryData.photo = undefined;
        }
      }

      try {
        await aquacultureService.createSanitaryLog(selectedCycle, sanitaryData);
        dispatch(fetchDashboardData());

        Alert.alert(t('success'), getSuccessMessage(formData.event_type), [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } catch (apiError: any) {
        const isNetworkError =
          apiError.code === 'NETWORK_ERROR' ||
          apiError.message?.toLowerCase().includes('network') ||
          apiError.message?.toLowerCase().includes('connection') ||
          !apiError.response;

        if (isNetworkError) {
          console.log('Pas de connexion, sauvegarde log sanitaire offline...');
          await offlineService.saveSanitaryLogOffline(selectedCycle, sanitaryData);

          Alert.alert(
            t('success'),
            `${getSuccessMessage(formData.event_type)}\n\n${t('offlineSaveMessage') || 'Sauvegarde hors ligne - sera synchronisee des que possible.'}`,
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        } else {
          throw apiError;
        }
      }
    } catch (error: any) {
      console.error('Error creating sanitary log:', error);

      let errorMessage = t('sanitaryRecordSaveError');
      if (error.response?.data) {
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

  if (activeCycles.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-cream px-5">
        <Ionicons name="medical-outline" size={64} color={MAVECAM_COLORS.GRAY_LIGHT} />
        <Text className="text-lg font-bold text-gray-dark mt-4">{t('noActiveCycles')}</Text>
        <Text className="text-sm text-gray-light text-center mt-2 mb-6">{t('createCycleToStart')}</Text>
        <TouchableOpacity className="bg-mavecam-primary px-5 py-3 rounded-lg" onPress={() => navigation.navigate('NewCycle')}>
          <Text className="text-white text-base font-semibold">{t('createCycle')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-cream">
      <View className="bg-mavecam-primary flex-row items-center pt-14 pb-4 px-4">
        <TouchableOpacity className="mr-4" onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={MAVECAM_COLORS.WHITE} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-white">Journal Sanitaire</Text>
      </View>

      <View className="p-4">
        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('cycleSelection')}</Text>
          {activeCycles.map((cycle) => (
            <TouchableOpacity
              key={cycle.id}
              className={`bg-white p-4 rounded-lg mb-2 border flex-row justify-between items-center ${
                selectedCycle === cycle.id ? 'border-mavecam-primary bg-[#f0fdf4]' : 'border-gray-200'
              }`}
              onPress={() => {
                setSelectedCycle(cycle.id);
                setFormData((prev) => ({ ...prev, cycle_id: cycle.id }));
              }}
            >
              <View className="flex-1">
                <Text className="text-base font-semibold text-gray-dark">
                  Bassin {cycle.pond_identifier || cycle.id.slice(-4)}
                </Text>
                <Text className="text-sm text-gray-light mt-1">
                  {cycle.current_count} poissons - {cycle.species}
                </Text>
              </View>
              {selectedCycle === cycle.id && <Ionicons name="checkmark-circle" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />}
            </TouchableOpacity>
          ))}
        </View>

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('eventType')}</Text>
          <View className="flex-row flex-wrap gap-2">
            {SANITARY_EVENT_TYPES.map((type) => (
              <TouchableOpacity
                key={type.value}
                className={`bg-white p-3 rounded-lg border items-center min-w-[30%] gap-2 ${
                  formData.event_type === type.value ? 'bg-mavecam-primary border-mavecam-primary' : 'border-gray-200'
                }`}
                onPress={() => setFormData((prev) => ({ ...prev, event_type: type.value }))}
              >
                <Ionicons
                  name={type.icon as any}
                  size={24}
                  color={formData.event_type === type.value ? MAVECAM_COLORS.WHITE : MAVECAM_COLORS.GRAY_LIGHT}
                />
                <Text
                  className={`text-xs text-center ${
                    formData.event_type === type.value ? 'text-white' : 'text-gray-dark'
                  }`}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {formData.event_type && (
            <View
              className={`flex-row items-center p-3 mt-4 rounded-lg border ${
                shouldShowTreatmentFields ? 'bg-[#f0fdf4] border-green-200' : 'bg-[#eff6ff] border-blue-200'
              }`}
            >
              <Ionicons
                name={shouldShowTreatmentFields ? 'medical' : 'information-circle'}
                size={16}
                color={shouldShowTreatmentFields ? MAVECAM_COLORS.GREEN_PRIMARY : MAVECAM_COLORS.BLUE}
              />
              <Text
                className={`ml-2 text-sm flex-1 ${
                  shouldShowTreatmentFields ? 'text-green-700' : 'text-blue-700'
                }`}
              >
                {shouldShowTreatmentFields
                  ? t('treatmentFieldsInfo') || 'Les champs de traitement sont disponibles ci-dessous'
                  : t('noTreatmentRequired') || "Aucun traitement requis pour ce type d'evenement"}
              </Text>
            </View>
          )}
        </View>

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('details')}</Text>

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-dark mb-2">{t('symptoms')}</Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark h-20"
              value={formData.symptoms}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, symptoms: value }))}
              placeholder={t('symptomsPlaceholder') || 'Listez les symptomes visibles...'}
              multiline
              numberOfLines={3}
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-dark mb-2">{t('affectedCount')}</Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
              value={formData.affected_count}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, affected_count: value }))}
              placeholder="Ex: 10"
              keyboardType="numeric"
            />
          </View>

          {shouldShowTreatmentFields && (
            <>
              <View className="mb-4">
                <Text className="text-sm font-medium text-gray-dark mb-2">{t('treatmentApplied')}</Text>
                <TextInput
                  className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark h-20"
                  value={formData.treatment_applied}
                  onChangeText={(value) => setFormData((prev) => ({ ...prev, treatment_applied: value }))}
                  placeholder={t('treatmentAppliedPlaceholder') || 'Decrivez le traitement applique...'}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View className="flex-row gap-3 mb-4">
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-dark mb-2">{t('medicationUsed')}</Text>
                  <TextInput
                    className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                    value={formData.medication_used}
                    onChangeText={(value) => setFormData((prev) => ({ ...prev, medication_used: value }))}
                    placeholder="Ex: Antibiotique XYZ"
                  />
                </View>

                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-dark mb-2">{t('dosage')}</Text>
                  <TextInput
                    className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                    value={formData.dosage}
                    onChangeText={(value) => setFormData((prev) => ({ ...prev, dosage: value }))}
                    placeholder="Ex: 5mg/L"
                  />
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-sm font-medium text-gray-dark mb-2">{t('treatmentDurationDays')}</Text>
                <TextInput
                  className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                  value={formData.treatment_duration_days}
                  onChangeText={(value) => setFormData((prev) => ({ ...prev, treatment_duration_days: value }))}
                  placeholder="Ex: 7"
                  keyboardType="numeric"
                />
              </View>
            </>
          )}

          <View className="mb-4">
            <Text className="text-sm font-medium text-gray-dark mb-2">{t('additionalComments')}</Text>
            <TextInput
              className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark h-20"
              value={formData.comments}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, comments: value }))}
              placeholder={t('commentsPlaceholder') || 'Notes, observations supplementaires...'}
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('photo')}</Text>

          {!formData.photo ? (
            <TouchableOpacity
              className="bg-white border-2 border-dashed border-mavecam-primary rounded-lg p-5 items-center justify-center flex-row gap-2 mb-4"
              onPress={chooseImageSource}
            >
              <Ionicons name="camera" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} />
              <Text className="text-mavecam-primary text-base font-semibold">{t('addPhoto')}</Text>
            </TouchableOpacity>
          ) : (
            <View className="relative mt-3">
              <Image source={{ uri: formData.photo }} className="w-full h-52 rounded-lg bg-cream" />
              <TouchableOpacity className="absolute top-2 right-2 bg-white rounded-full shadow p-1" onPress={removePhoto}>
                <Ionicons name="close-circle" size={24} color={MAVECAM_COLORS.ERROR} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity
          className={`bg-mavecam-primary flex-row items-center justify-center py-4 rounded-lg mt-2 gap-2 ${saving ? 'opacity-60' : ''}`}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={MAVECAM_COLORS.WHITE} />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color={MAVECAM_COLORS.WHITE} />
              <Text className="text-white text-base font-semibold">{t('save')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
