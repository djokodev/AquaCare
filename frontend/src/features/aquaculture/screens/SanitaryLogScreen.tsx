import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { fetchDashboardData } from '@/features/aquaculture/store/aquacultureSlice';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { offlineService } from '@/services/offlineService';
import { ReactNativeUploadFile, SanitaryLogForm, SanitaryEventType } from '@/types/aquaculture';
import { RootStackParamList } from '@/navigation/MainNavigator';
import * as ImagePicker from 'expo-image-picker';
import { MAVECAM_COLORS } from '@/constants/colors';
import logger from '@/utils/logger';
import { isNetworkError, getApiErrorMessage } from '@/utils/errorParser';
import CycleSelector from '@/components/common/CycleSelector';

const SANITARY_EVENT_TYPES: Array<{
  value: SanitaryEventType;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { value: 'disease', labelKey: 'sanitaryEventDisease', icon: 'medical' },
  { value: 'treatment', labelKey: 'sanitaryEventTreatment', icon: 'medical-outline' },
  { value: 'vaccination', labelKey: 'sanitaryEventVaccination', icon: 'shield-checkmark' },
  { value: 'abnormal_mortality', labelKey: 'sanitaryEventAbnormalMortality', icon: 'skull' },
  { value: 'water_quality', labelKey: 'sanitaryEventWaterQuality', icon: 'water' },
  { value: 'other', labelKey: 'sanitaryEventOther', icon: 'help-circle' },
];

type SanitaryLogScreenNavigationProp = StackNavigationProp<RootStackParamList, 'SanitaryLog'>;

interface SanitaryLogScreenProps {
  navigation: SanitaryLogScreenNavigationProp;
}

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


export default function SanitaryLogScreen({ navigation }: SanitaryLogScreenProps) {
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
        return t('sanitarySuccessDisease');
      case 'treatment':
        return t('sanitarySuccessTreatment');
      case 'vaccination':
        return t('sanitarySuccessVaccination');
      case 'abnormal_mortality':
        return t('sanitarySuccessAbnormalMortality');
      case 'water_quality':
        return t('sanitarySuccessWaterQuality');
      case 'other':
        return t('sanitarySuccessOther');
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
      Alert.alert(t('error'), t('photoPermissionRequired'));
      return false;
    }
    return true;
  };

  const processImage = async (uri: string): Promise<string> => uri;

  const createFormDataFile = (uri: string, name: string): ReactNativeUploadFile => ({
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
    } catch {
      Alert.alert(t('error'), t('imageSelectionError'));
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('error'), t('cameraPermissionRequired'));
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
      logger.error('Erreur prise photo:', cameraError);
      Alert.alert(t('error'), t('cameraCaptureError'));
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
        affected_count: formData.affected_count ? parseInt(formData.affected_count, 10) : undefined,
        treatment_applied: formData.treatment_applied || undefined,
        medication_used: formData.medication_used || undefined,
        dosage: formData.dosage || undefined,
        treatment_duration_days: formData.treatment_duration_days
          ? parseInt(formData.treatment_duration_days, 10)
          : undefined,
        notes: formData.comments || undefined,
      };

      if (formData.photo) {
        try {
          sanitaryData.photo = createFormDataFile(formData.photo, `sanitary_log_${Date.now()}.jpg`);
        } catch (photoError) {
          logger.error('Erreur preparation photo:', photoError);
          sanitaryData.photo = undefined;
        }
      }

      try {
        await aquacultureService.createSanitaryLog(selectedCycle, sanitaryData);
        dispatch(fetchDashboardData());

        Alert.alert(t('success'), getSuccessMessage(formData.event_type), [
          { text: t('ok'), onPress: () => navigation.goBack() },
        ]);
      } catch (apiError: unknown) {
        if (isNetworkError(apiError)) {
          await offlineService.saveSanitaryLogOffline(selectedCycle, sanitaryData);

          Alert.alert(t('success'), `${getSuccessMessage(formData.event_type)}\n\n${t('offlineSaveMessage')}`, [
            { text: t('ok'), onPress: () => navigation.goBack() },
          ]);
        } else {
          throw apiError;
        }
      }
    } catch (error: unknown) {
      logger.error('Error creating sanitary log:', error);
      Alert.alert(t('error'), getApiErrorMessage(error, t('sanitaryRecordSaveError')));
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
        <Text className="text-xl font-bold text-white">{t('sanitaryLogTitle')}</Text>
      </View>

      <View className="p-4">
        <CycleSelector
          cycles={activeCycles}
          selectedCycleId={selectedCycle}
          onSelectCycle={(cycleId) => {
            setSelectedCycle(cycleId);
            setFormData((prev) => ({ ...prev, cycle_id: cycleId }));
          }}
        />

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('eventType')}</Text>
          <View className="flex-row flex-wrap">
            {SANITARY_EVENT_TYPES.map((type) => {
              const isSelected = formData.event_type === type.value;
              return (
                <View key={type.value} style={{ width: '31%', marginRight: '2%', marginBottom: 8 }}>
                  <TouchableOpacity
                    className={`p-3 rounded-lg border items-center ${
                      isSelected ? 'bg-mavecam-primary border-mavecam-primary' : 'bg-white border-gray-200'
                    }`}
                    onPress={() => setFormData((prev) => ({ ...prev, event_type: type.value }))}
                  >
                    <Ionicons
                      name={type.icon}
                      size={32}
                      color={isSelected ? MAVECAM_COLORS.WHITE : MAVECAM_COLORS.GRAY_LIGHT}
                    />
                    <Text className={`text-xs text-center mt-2 ${isSelected ? 'text-white' : 'text-gray-dark'}`}>
                      {t(type.labelKey)}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
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
                {shouldShowTreatmentFields ? t('treatmentFieldsInfo') : t('noTreatmentRequired')}
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
              placeholder={t('symptomsPlaceholder')}
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
              placeholder={t('exampleAffectedCount')}
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
                  placeholder={t('treatmentAppliedPlaceholder')}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View className="flex-row mb-4">
                <View className="flex-1" style={{ marginRight: 12 }}>
                  <Text className="text-sm font-medium text-gray-dark mb-2">{t('medicationUsed')}</Text>
                  <TextInput
                    className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                    value={formData.medication_used}
                    onChangeText={(value) => setFormData((prev) => ({ ...prev, medication_used: value }))}
                    placeholder={t('exampleMedication')}
                  />
                </View>

                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-dark mb-2">{t('dosage')}</Text>
                  <TextInput
                    className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                    value={formData.dosage}
                    onChangeText={(value) => setFormData((prev) => ({ ...prev, dosage: value }))}
                    placeholder={t('exampleDosage')}
                  />
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-sm font-medium text-gray-dark mb-2">{t('treatmentDurationDays')}</Text>
                <TextInput
                  className="bg-white border border-gray-200 rounded-lg px-3 py-3 text-base text-gray-dark"
                  value={formData.treatment_duration_days}
                  onChangeText={(value) => setFormData((prev) => ({ ...prev, treatment_duration_days: value }))}
                  placeholder={t('exampleTreatmentDuration')}
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
              placeholder={t('commentsPlaceholder')}
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        <View className="mb-6">
          <Text className="text-base font-bold text-gray-dark mb-3">{t('photo')}</Text>

          {!formData.photo ? (
            <TouchableOpacity
              className="bg-white border-2 border-dashed border-mavecam-primary rounded-lg p-5 items-center justify-center flex-row mb-4"
              onPress={chooseImageSource}
            >
              <Ionicons name="camera" size={24} color={MAVECAM_COLORS.GREEN_PRIMARY} style={{ marginRight: 8 }} />
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
          className={`bg-mavecam-primary flex-row items-center justify-center py-4 rounded-lg mt-2 ${saving ? 'opacity-60' : ''}`}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={MAVECAM_COLORS.WHITE} />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color={MAVECAM_COLORS.WHITE} style={{ marginRight: 8 }} />
              <Text className="text-white text-base font-semibold">{t('save')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
