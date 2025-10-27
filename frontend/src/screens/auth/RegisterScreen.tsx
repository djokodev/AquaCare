import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';
import { MAVECAM_COLORS } from '@/constants/colors';

import { AuthStackParamList } from '@/navigation/AuthNavigator';
import { useAuth } from '@/hooks/useAuth';
import { RegisterRequest } from '@/types/auth';

type RegisterScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Register'>;

interface Props {
  navigation: RegisterScreenNavigationProp;
}

// Data from your backend constants
const REGIONS = [
  { value: 'adamaoua', label: 'Adamaoua' },
  { value: 'centre', label: 'Centre' },
  { value: 'est', label: 'Est' },
  { value: 'extreme_nord', label: 'Extrême-Nord' },
  { value: 'littoral', label: 'Littoral' },
  { value: 'nord', label: 'Nord' },
  { value: 'nord_ouest', label: 'Nord-Ouest' },
  { value: 'ouest', label: 'Ouest' },
  { value: 'sud', label: 'Sud' },
  { value: 'sud_ouest', label: 'Sud-Ouest' },
];

const ACTIVITY_TYPES = [
  { value: 'alevins', label: "Producteur d'alevins" },
  { value: 'poisson_table', label: 'Producteur de poisson de table' },
  { value: 'mixte', label: 'Production mixte' },
  { value: 'commercant', label: 'Commerçant de poisson' },
];

const AGE_GROUPS = [
  { value: '18_25', label: '18-25 ans' },
  { value: '26_35', label: '26-35 ans' },
  { value: '36_45', label: '36-45 ans' },
  { value: '46_55', label: '46-55 ans' },
  { value: '56_65', label: '56-65 ans' },
  { value: '65_plus', label: '65 ans et plus' },
];

const LEGAL_STATUS_OPTIONS = [
  { value: 'ei', label: 'Entreprise Individuelle (EI)' },
  { value: 'scoop', label: 'Coopérative Simplifiée (SCOOP)' },
  { value: 'coop_ca', label: 'Coopérative avec CA (Coop-CA)' },
  { value: 'sarl', label: 'SARL' },
  { value: 'sarlu', label: 'SARL Unipersonnelle (SARLU)' },
  { value: 'sa', label: 'Société Anonyme (SA)' },
  { value: 'sas', label: 'SAS' },
  { value: 'sasu', label: 'SAS Unipersonnelle (SASU)' },
  { value: 'snc', label: 'Société en Nom Collectif (SNC)' },
  { value: 'scs', label: 'Société en Commandite Simple (SCS)' },
  { value: 'sci', label: 'Société Civile Immobilière (SCI)' },
  { value: 'autre', label: 'Autre statut juridique' },
];

export default function RegisterScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { register, isLoading, error, clearAuthError } = useAuth();

  const [formData, setFormData] = useState<RegisterRequest>({
    phone_number: '',
    email: '',
    first_name: '',
    last_name: '',
    business_name: '',
    account_type: 'individual',
    age_group: '',
    activity_type: '',
    region: '',
    language_preference: 'fr',
    password: '',
    password_confirm: '',
    legal_status: '',
    promoter_name: '',
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    // Common validations
    if (!formData.phone_number.trim()) {
      newErrors.phone_number = t('required');
    } else if (!/^\+237[0-9]{9}$/.test(formData.phone_number.trim())) {
      newErrors.phone_number = t('invalidPhone');
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      newErrors.email = t('invalidEmail');
    }

    if (!formData.password.trim()) {
      newErrors.password = t('required');
    } else if (formData.password.length < 8) {
      newErrors.password = t('passwordTooShort');
    }

    if (formData.password !== formData.password_confirm) {
      newErrors.password_confirm = t('passwordMismatch');
    }

    // Individual account validations
    if (formData.account_type === 'individual') {
      if (!formData.first_name?.trim()) {
        newErrors.first_name = t('required');
      }
      if (!formData.last_name?.trim()) {
        newErrors.last_name = t('required');
      }
      if (!formData.age_group) {
        newErrors.age_group = t('required');
      }
    }

    // Company account validations
    if (formData.account_type === 'company') {
      if (!formData.business_name?.trim()) {
        newErrors.business_name = t('required');
      }
      if (!formData.legal_status) {
        newErrors.legal_status = t('required');
      }
      if (!formData.promoter_name?.trim()) {
        newErrors.promoter_name = t('required');
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateForm()) return;

    clearAuthError();

    try {
      const result = await register(formData);

      if (result.meta.requestStatus === 'fulfilled') {
        // Navigation will be handled automatically by AppNavigator
      }
    } catch (err) {
      console.error('Registration error:', err);
    }
  };

  const updateField = <K extends keyof RegisterRequest>(field: K, value: RegisterRequest[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    if (error) {
      clearAuthError();
    }
  };

  const handlePhoneNumberChange = (value: string) => {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');
    
    let formattedPhone = '';
    
    if (digits.length === 0) {
      formattedPhone = '';
    } else if (digits.length <= 9) {
      // If 9 digits or less, assume it's a Cameroon number without country code
      if (digits.length === 9) {
        formattedPhone = `+237${digits}`;
      } else {
        // Show partial formatting for user feedback
        formattedPhone = digits.length > 0 ? `+237${digits}` : '';
      }
    } else if (digits.length === 12 && digits.startsWith('237')) {
      // If starts with 237 and has 12 digits total, add +
      formattedPhone = `+${digits}`;
    } else if (digits.length === 13 && digits.startsWith('237')) {
      // If 13 digits starting with 237, assume country code included
      formattedPhone = `+${digits}`;
    } else {
      // For other cases, just use what user typed
      formattedPhone = value;
    }
    
    updateField('phone_number', formattedPhone);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('register')}</Text>
          <Text style={styles.subtitle}>{t('createAccount')}</Text>
        </View>

        <View style={styles.form}>
          {/* Account Type Selector */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('accountType')}</Text>
            <View style={styles.toggleContainer}>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  formData.account_type === 'individual' && styles.toggleButtonActive,
                ]}
                onPress={() => updateField('account_type', 'individual')}
              >
                <Text
                  style={[
                    styles.toggleText,
                    formData.account_type === 'individual' && styles.toggleTextActive,
                  ]}
                >
                  {t('individual')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.toggleButton,
                  formData.account_type === 'company' && styles.toggleButtonActive,
                ]}
                onPress={() => updateField('account_type', 'company')}
              >
                <Text
                  style={[
                    styles.toggleText,
                    formData.account_type === 'company' && styles.toggleTextActive,
                  ]}
                >
                  {t('company')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Phone Number */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('phoneNumber')} *</Text>
            <View style={styles.phoneInputContainer}>
              <Text style={styles.phonePrefix}>🇨🇲 +237</Text>
              <TextInput
                style={[styles.phoneInput, errors.phone_number && styles.inputError]}
                value={formData.phone_number.replace('+237', '')}
                onChangeText={handlePhoneNumberChange}
                placeholder="652260368"
                keyboardType="phone-pad"
                maxLength={9}
              />
            </View>
            {errors.phone_number && <Text style={styles.errorText}>{errors.phone_number}</Text>}
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('email')}</Text>
            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              value={formData.email}
              onChangeText={(value) => updateField('email', value)}
              placeholder="exemple@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
          </View>

          {/* Individual Fields */}
          {formData.account_type === 'individual' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('firstName')} *</Text>
                <TextInput
                  style={[styles.input, errors.first_name && styles.inputError]}
                  value={formData.first_name}
                  onChangeText={(value) => updateField('first_name', value)}
                  placeholder="Jean"
                  autoCapitalize="words"
                />
                {errors.first_name && <Text style={styles.errorText}>{errors.first_name}</Text>}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('lastName')} *</Text>
                <TextInput
                  style={[styles.input, errors.last_name && styles.inputError]}
                  value={formData.last_name}
                  onChangeText={(value) => updateField('last_name', value)}
                  placeholder="Farmer"
                  autoCapitalize="words"
                />
                {errors.last_name && <Text style={styles.errorText}>{errors.last_name}</Text>}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('ageGroup')} *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={formData.age_group}
                    onValueChange={(value) => updateField('age_group', value)}
                    style={styles.picker}
                  >
                    <Picker.Item label="Sélectionnez..." value="" />
                    {AGE_GROUPS.map((group) => (
                      <Picker.Item key={group.value} label={group.label} value={group.value} />
                    ))}
                  </Picker>
                </View>
                {errors.age_group && <Text style={styles.errorText}>{errors.age_group}</Text>}
              </View>
            </>
          )}

          {/* Company Fields */}
          {formData.account_type === 'company' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('businessName')} *</Text>
                <TextInput
                  style={[styles.input, errors.business_name && styles.inputError]}
                  value={formData.business_name}
                  onChangeText={(value) => updateField('business_name', value)}
                  placeholder="AquaFerme SARL"
                  autoCapitalize="words"
                />
                {errors.business_name && <Text style={styles.errorText}>{errors.business_name}</Text>}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('legalStatus')} *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={formData.legal_status}
                    onValueChange={(value) => updateField('legal_status', value)}
                    style={styles.picker}
                  >
                    <Picker.Item label={t('selectLegalStatus')} value="" />
                    {LEGAL_STATUS_OPTIONS.map((option) => (
                      <Picker.Item key={option.value} label={option.label} value={option.value} />
                    ))}
                  </Picker>
                </View>
                {errors.legal_status && <Text style={styles.errorText}>{errors.legal_status}</Text>}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('promoterName')} *</Text>
                <TextInput
                  style={[styles.input, errors.promoter_name && styles.inputError]}
                  value={formData.promoter_name}
                  onChangeText={(value) => updateField('promoter_name', value)}
                  placeholder="Jean Dubois"
                  autoCapitalize="words"
                />
                {errors.promoter_name && <Text style={styles.errorText}>{errors.promoter_name}</Text>}
              </View>
            </>
          )}

          {/* Activity Type */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('activityType')}</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={formData.activity_type}
                onValueChange={(value) => updateField('activity_type', value)}
                style={styles.picker}
              >
                <Picker.Item label="Sélectionnez..." value="" />
                {ACTIVITY_TYPES.map((type) => (
                  <Picker.Item key={type.value} label={type.label} value={type.value} />
                ))}
              </Picker>
            </View>
          </View>

          {/* Region */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('region')}</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={formData.region}
                onValueChange={(value) => updateField('region', value)}
                style={styles.picker}
              >
                <Picker.Item label="Sélectionnez..." value="" />
                {REGIONS.map((region) => (
                  <Picker.Item key={region.value} label={region.label} value={region.value} />
                ))}
              </Picker>
            </View>
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('password')} *</Text>
            <TextInput
              style={[styles.input, errors.password && styles.inputError]}
              value={formData.password}
              onChangeText={(value) => updateField('password', value)}
              placeholder="••••••••"
              secureTextEntry
            />
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
          </View>

          {/* Confirm Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('confirmPassword')} *</Text>
            <TextInput
              style={[styles.input, errors.password_confirm && styles.inputError]}
              value={formData.password_confirm}
              onChangeText={(value) => updateField('password_confirm', value)}
              placeholder="••••••••"
              secureTextEntry
            />
            {errors.password_confirm && <Text style={styles.errorText}>{errors.password_confirm}</Text>}
          </View>

          {/* Error Message */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorMessage}>{error}</Text>
            </View>
          )}

          {/* Register Button */}
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? t('loading') : t('signUp')}
            </Text>
          </TouchableOpacity>

          {/* Login Link */}
          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>{t('haveAccount')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>{t('signIn')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MAVECAM_COLORS.CREAM,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
  },
  form: {
    backgroundColor: MAVECAM_COLORS.WHITE,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 16,
    fontSize: 16,
    backgroundColor: MAVECAM_COLORS.WHITE,
  },
  inputError: {
    borderColor: MAVECAM_COLORS.ERROR,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: MAVECAM_COLORS.WHITE,
    paddingHorizontal: 12,
  },
  phonePrefix: {
    fontSize: 16,
    fontWeight: '600',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    marginRight: 8,
    paddingVertical: 16,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 16,
    borderWidth: 0,
  },
  phoneHint: {
    fontSize: 12,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 4,
    fontStyle: 'italic',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 8,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  toggleButtonActive: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  toggleText: {
    fontSize: 14,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    fontWeight: '500',
  },
  toggleTextActive: {
    color: MAVECAM_COLORS.WHITE,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: MAVECAM_COLORS.WHITE,
  },
  picker: {
    paddingHorizontal: 12,
  },
  errorText: {
    color: MAVECAM_COLORS.ERROR,
    fontSize: 14,
    marginTop: 4,
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: MAVECAM_COLORS.ERROR,
  },
  errorMessage: {
    color: MAVECAM_COLORS.ERROR,
    fontSize: 14,
    fontWeight: '500',
  },
  button: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY,
  },
  buttonText: {
    color: MAVECAM_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginText: {
    color: MAVECAM_COLORS.GRAY_LIGHT,
    fontSize: 14,
  },
  loginLink: {
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    fontSize: 14,
    fontWeight: '600',
  },
});