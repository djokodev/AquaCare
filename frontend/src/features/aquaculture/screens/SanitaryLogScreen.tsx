import React, { useState, useEffect } from 'react';
import { View, Alert, Image, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store/store';
import { fetchDashboardData, setCurrentCycle } from '@/features/aquaculture/store/aquacultureSlice';
import { ReactNativeUploadFile, SanitaryLogForm, SanitaryEventType } from '@/types/aquaculture';
import { RootStackParamList } from '@/navigation/MainNavigator';
import * as ImagePicker from 'expo-image-picker';
import logger from '@/utils/logger';
import { getApiErrorMessage, parseApiError } from '@/utils/errorParser';
import CycleSelector from '@/components/common/CycleSelector';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';
import {
  createSanitaryLogWithOfflineFallback,
  runSilentOfflineSync,
} from '@/features/aquaculture/services/aquacultureWorkflowService';
import { AppHeader, AppText, Button, Card, IconButton, InlineAlert, Screen, SelectableCard, TextField } from '@/components/ui';
import { colors, spacing } from '@/theme';

type VisibleSanitaryEventType = 'disease' | 'treatment' | 'abnormal_mortality' | 'other';

const SANITARY_EVENT_TYPES: Array<{
  value: VisibleSanitaryEventType;
  labelKey: string;
}> = [
  { value: 'disease', labelKey: 'sanitaryEventDisease' },
  { value: 'treatment', labelKey: 'sanitaryEventTreatment' },
  { value: 'abnormal_mortality', labelKey: 'sanitaryEventAbnormalMortality' },
  { value: 'other', labelKey: 'sanitaryEventOther' },
];

const SANITARY_EVENT_LAYOUT: Record<
  VisibleSanitaryEventType,
  {
    firstFieldLabelKey: string;
    firstFieldPlaceholderKey: string;
    countFieldLabelKey: string;
    countFieldPlaceholderKey: string;
    showTreatmentFields: boolean;
    infoMessageKey?: string;
  }
> = {
  disease: {
    firstFieldLabelKey: 'symptoms',
    firstFieldPlaceholderKey: 'symptomsPlaceholder',
    countFieldLabelKey: 'affectedCount',
    countFieldPlaceholderKey: 'exampleAffectedCount',
    showTreatmentFields: false,
  },
  treatment: {
    firstFieldLabelKey: 'symptoms',
    firstFieldPlaceholderKey: 'symptomsPlaceholder',
    countFieldLabelKey: 'affectedCount',
    countFieldPlaceholderKey: 'exampleAffectedCount',
    showTreatmentFields: true,
    infoMessageKey: 'treatmentFieldsInfo',
  },
  abnormal_mortality: {
    firstFieldLabelKey: 'mortalityReason',
    firstFieldPlaceholderKey: 'mortalityReasonPlaceholder',
    countFieldLabelKey: 'mortality',
    countFieldPlaceholderKey: 'mortalityPlaceholder',
    showTreatmentFields: false,
    infoMessageKey: 'noTreatmentRequired',
  },
  other: {
    firstFieldLabelKey: 'observations',
    firstFieldPlaceholderKey: 'observationsPlaceholder',
    countFieldLabelKey: 'affectedCount',
    countFieldPlaceholderKey: 'exampleAffectedCount',
    showTreatmentFields: false,
    infoMessageKey: 'noTreatmentRequired',
  },
};

type SanitaryLogScreenNavigationProp = StackNavigationProp<RootStackParamList, 'SanitaryLog'>;
type SanitaryLogScreenRouteProp = RouteProp<RootStackParamList, 'SanitaryLog'>;

interface SanitaryLogScreenProps {
  navigation: SanitaryLogScreenNavigationProp;
  route?: SanitaryLogScreenRouteProp;
}

interface SanitaryLogData {
  cycle_id: string;
  event_type: VisibleSanitaryEventType | '';
  symptoms: string;
  treatment_applied: string;
  medication_used: string;
  dosage: string;
  treatment_duration_days: string;
  affected_count: string;
  comments: string;
  photo: string | null;
}


export default function SanitaryLogScreen({ navigation, route }: SanitaryLogScreenProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { dashboardData, currentCycle } = useSelector((state: RootState) => state.aquaculture);
  const activeCycles = dashboardData?.active_cycles || [];
  const routeParams = route?.params;
  const routeCycleId = routeParams?.cycleId;
  const unitAllocationId = routeParams?.cycleUnitAllocationId;
  const sessionScopedCycles = routeCycleId
    ? activeCycles.filter((cycle) => cycle.id === routeCycleId)
    : currentCycle?.id
      ? activeCycles.filter((cycle) => cycle.id === currentCycle.id)
    : activeCycles;

  const [selectedCycle, setSelectedCycle] = useState<string>(routeCycleId || '');
  const [formData, setFormData] = useState<SanitaryLogData>({
    cycle_id: routeCycleId || '',
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

  const selectedEventLayout = formData.event_type
    ? SANITARY_EVENT_LAYOUT[formData.event_type as VisibleSanitaryEventType]
    : SANITARY_EVENT_LAYOUT.disease;

  const getSuccessMessage = (eventType: string) => {
    switch (eventType) {
      case 'disease':
        return t('sanitarySuccessDisease');
      case 'treatment':
        return t('sanitarySuccessTreatment');
      case 'abnormal_mortality':
        return t('sanitarySuccessAbnormalMortality');
      case 'other':
        return t('sanitarySuccessOther');
      default:
        return t('sanitaryRecordSaved');
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      await runSilentOfflineSync();
      dispatch(fetchDashboardData({ lightweight: true }));
    };
    bootstrap();
  }, [dispatch]);

  useEffect(() => {
    if (sessionScopedCycles.length === 0) {
      return;
    }

    const preferredCycle = routeCycleId
      ? sessionScopedCycles.find((cycle) => cycle.id === routeCycleId) || sessionScopedCycles[0]
      : sessionScopedCycles[0];

    if (selectedCycle !== preferredCycle.id) {
      setSelectedCycle(preferredCycle.id);
      setFormData((prev) => ({ ...prev, cycle_id: preferredCycle.id }));
    }
  }, [routeCycleId, sessionScopedCycles, selectedCycle]);

  useEffect(() => {
    if (!selectedEventLayout.showTreatmentFields) {
      setFormData((prev) => ({
        ...prev,
        treatment_applied: '',
        medication_used: '',
        dosage: '',
        treatment_duration_days: '',
      }));
    }
  }, [selectedEventLayout.showTreatmentFields]);

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
        ...(unitAllocationId ? { cycle_unit_allocation: unitAllocationId } : {}),
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
        const creationResult = await createSanitaryLogWithOfflineFallback(selectedCycle, sanitaryData);
        dispatch(fetchDashboardData({ lightweight: true }));
        const successMessage = creationResult.mode === 'online'
          ? getSuccessMessage(formData.event_type)
          : `${getSuccessMessage(formData.event_type)}\n\n${t('offlineSaveMessage')}`;
        Alert.alert(t('success'), successMessage, [
          { text: t('ok'), onPress: () => navigation.goBack() },
        ]);
      } catch (apiError: unknown) {
        throw apiError;
      }
    } catch (error: unknown) {
      logger.error('Error creating sanitary log:', error);
      const parsedError = parseApiError(error);
      const fallbackMessage = getApiErrorMessage(error, t('sanitaryRecordSaveError'));
      const actionableMessage =
        parsedError.status > 0 || parsedError.details.length > 0
          ? formatAquacultureErrorWithAction(parsedError, t)
          : fallbackMessage;
      Alert.alert(t('error'), actionableMessage);
    } finally {
      setSaving(false);
    }
  };

  if (sessionScopedCycles.length === 0) {
    return (
      <View style={styles.root}>
        <AppHeader title={t('sanitaryLogTitle')} onBack={() => navigation.goBack()} backLabel={t('back')} />
        <Screen style={styles.emptyScreen}>
          <Ionicons name="medical-outline" size={64} color={colors.text.muted} />
          <AppText variant="cardTitle" style={{ marginTop: spacing[4] }}>{t('noActiveCycles')}</AppText>
          <AppText variant="body" color="muted" style={{ marginTop: spacing[2], marginBottom: spacing[6], textAlign: 'center' }}>{t('createCycleToStart')}</AppText>
          <Button label={t('createCycle')} onPress={() => navigation.navigate('CreateFarm')} fullWidth={false} />
        </Screen>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader title={t('sanitaryLogTitle')} onBack={() => navigation.goBack()} backLabel={t('back')} />
      <Screen scroll style={styles.scrollContent}>
      <View style={{ gap: spacing[5] }}>
        <CycleSelector
          cycles={sessionScopedCycles}
          selectedCycleId={selectedCycle}
          onSelectCycle={(cycleId) => {
            setSelectedCycle(cycleId);
            setFormData((prev) => ({ ...prev, cycle_id: cycleId }));
            const cycle = sessionScopedCycles.find((item) => item.id === cycleId);
            if (cycle) {
              dispatch(setCurrentCycle(cycle));
            }
          }}
          showTitle={false}
          displayMode="cycle_name"
        />

        <Card>
          <AppText variant="sectionTitle" style={{ marginBottom: spacing[4] }}>{t('eventType')}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {SANITARY_EVENT_TYPES.map((type) => {
              const isSelected = formData.event_type === type.value;
              return (
                <View key={type.value} style={{ width: '48%' }}>
                  <SelectableCard
                    testID={`sanitary-event-${type.value}`}
                    selected={isSelected}
                    primaryBorder={isSelected}
                    layout="column"
                    accessibilityLabel={t(type.labelKey)}
                    onPress={() => setFormData((prev) => ({ ...prev, event_type: type.value }))}
                  >
                    <AppText variant="label" color="primary" style={{ textAlign: 'center' }}>
                      {t(type.labelKey)}
                    </AppText>
                  </SelectableCard>
                </View>
              );
            })}
          </View>

          {selectedEventLayout.infoMessageKey ? (
            <InlineAlert
              tone={selectedEventLayout.infoMessageKey === 'treatmentFieldsInfo' ? 'success' : 'info'}
              message={t(selectedEventLayout.infoMessageKey)}
            />
          ) : null}
        </Card>

        <Card>
          <AppText variant="sectionTitle" style={{ marginBottom: spacing[4] }}>{t('details')}</AppText>

          <TextField
              label={t(selectedEventLayout.firstFieldLabelKey)}
              value={formData.symptoms}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, symptoms: value }))}
              placeholder={t(selectedEventLayout.firstFieldPlaceholderKey)}
              multiline
              numberOfLines={3}
          />

          <TextField
              label={t(selectedEventLayout.countFieldLabelKey)}
              value={formData.affected_count}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, affected_count: value }))}
              placeholder={t(selectedEventLayout.countFieldPlaceholderKey)}
              keyboardType="numeric"
          />

          {selectedEventLayout.showTreatmentFields && (
            <>
              <TextField
                  label={t('treatmentApplied')}
                  value={formData.treatment_applied}
                  onChangeText={(value) => setFormData((prev) => ({ ...prev, treatment_applied: value }))}
                  placeholder={t('treatmentAppliedPlaceholder')}
                  multiline
                  numberOfLines={3}
              />

              <View style={{ flexDirection: 'row', gap: spacing[3] }}>
                <View style={{ flex: 1 }}>
                  <TextField
                    label={t('medicationUsed')}
                    value={formData.medication_used}
                    onChangeText={(value) => setFormData((prev) => ({ ...prev, medication_used: value }))}
                    placeholder={t('exampleMedication')}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <TextField
                    label={t('dosage')}
                    value={formData.dosage}
                    onChangeText={(value) => setFormData((prev) => ({ ...prev, dosage: value }))}
                    placeholder={t('exampleDosage')}
                  />
                </View>
              </View>

              <TextField
                  label={t('treatmentDurationDays')}
                  value={formData.treatment_duration_days}
                  onChangeText={(value) => setFormData((prev) => ({ ...prev, treatment_duration_days: value }))}
                  placeholder={t('exampleTreatmentDuration')}
                  keyboardType="numeric"
              />
            </>
          )}

          <TextField
              label={t('additionalComments')}
              value={formData.comments}
              onChangeText={(value) => setFormData((prev) => ({ ...prev, comments: value }))}
              placeholder={t('commentsPlaceholder')}
              multiline
              numberOfLines={3}
          />
        </Card>

        <Card>
          <AppText variant="sectionTitle" style={{ marginBottom: spacing[4] }}>{t('photo')}</AppText>

          {!formData.photo ? (
            <Button label={t('addPhoto')} onPress={chooseImageSource} variant="outline" iconLeft="camera" />
          ) : (
            <View style={{ position: 'relative' }}>
              <Image source={{ uri: formData.photo }} style={{ width: '100%', height: 208, borderRadius: 12, backgroundColor: colors.surface.page }} />
              <IconButton icon="close-circle" accessibilityLabel={t('removePhoto')} onPress={removePhoto} variant="surface" tone="danger" style={{ position: 'absolute', top: spacing[2], right: spacing[2] }} />
            </View>
          )}
        </Card>

        <Button label={t('save')} onPress={handleSave} disabled={saving} loading={saving} iconLeft="checkmark" />
      </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.page },
  emptyScreen: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[5] },
  scrollContent: { paddingTop: spacing[4], paddingBottom: spacing[6] },
});
