import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from '@/navigation/AuthNavigator';
import { useAuth } from '@/hooks/useAuth';
import { RegisterRequest } from '@/types/auth';
import SelectField from '@/components/SelectField';

type RegisterScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Register'>;

interface Props {
  navigation: RegisterScreenNavigationProp;
}

const REGIONS = [
  { value: 'adamaoua', label: 'Adamaoua' },
  { value: 'centre', label: 'Centre' },
  { value: 'est', label: 'Est' },
  { value: 'extreme_nord', label: 'Extreme-Nord' },
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
  { value: 'commercant', label: 'Commercant de poisson' },
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
  { value: 'scoop', label: 'Cooperative Simplifiee (SCOOP)' },
  { value: 'coop_ca', label: 'Cooperative avec CA (Coop-CA)' },
  { value: 'sarl', label: 'SARL' },
  { value: 'sarlu', label: 'SARL Unipersonnelle (SARLU)' },
  { value: 'sa', label: 'Societe Anonyme (SA)' },
  { value: 'sas', label: 'SAS' },
  { value: 'sasu', label: 'SAS Unipersonnelle (SASU)' },
  { value: 'snc', label: 'Societe en Nom Collectif (SNC)' },
  { value: 'scs', label: 'Societe en Commandite Simple (SCS)' },
  { value: 'sci', label: 'Societe Civile Immobiliere (SCI)' },
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

    if (formData.account_type === 'individual') {
      if (!formData.first_name?.trim()) newErrors.first_name = t('required');
      if (!formData.last_name?.trim()) newErrors.last_name = t('required');
      if (!formData.age_group) newErrors.age_group = t('required');
    }

    if (formData.account_type === 'company') {
      if (!formData.business_name?.trim()) newErrors.business_name = t('required');
      if (!formData.legal_status) newErrors.legal_status = t('required');
      if (!formData.promoter_name?.trim()) newErrors.promoter_name = t('required');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateForm()) return;
    clearAuthError();
    try {
      await register(formData);
    } catch (err) {
      console.error('Registration error:', err);
    }
  };

  const updateField = <K extends keyof RegisterRequest>(field: K, value: RegisterRequest[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
    if (error) clearAuthError();
  };

  const handlePhoneNumberChange = (value: string) => {
    const digits = value.replace(/\D/g, '');
    let formattedPhone = '';

    if (digits.length === 0) {
      formattedPhone = '';
    } else if (digits.length <= 9) {
      formattedPhone = digits.length === 9 ? `+237${digits}` : digits.length > 0 ? `+237${digits}` : '';
    } else if (digits.length === 12 && digits.startsWith('237')) {
      formattedPhone = `+${digits}`;
    } else if (digits.length === 13 && digits.startsWith('237')) {
      formattedPhone = `+${digits}`;
    } else {
      formattedPhone = value;
    }

    updateField('phone_number', formattedPhone);
  };

  const renderError = (field: keyof typeof errors) =>
    errors[field] ? <Text className="text-sm text-error mt-1">{errors[field]}</Text> : null;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-cream"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
        <View className="items-center mb-8">
          <Text className="text-3xl font-bold text-mavecam-primary mb-2">{t('register')}</Text>
          <Text className="text-base text-gray-light text-center">{t('createAccount')}</Text>
        </View>

        <View className="bg-white p-5 rounded-2xl shadow">
          <View className="mb-4">
            <Text className="text-base font-medium text-gray-dark mb-2">{t('accountType')}</Text>
            <View className="flex-row bg-cream rounded-lg">
              <TouchableOpacity
                className={`flex-1 py-3 items-center rounded-lg ${
                  formData.account_type === 'individual' ? 'bg-mavecam-primary' : ''
                }`}
                onPress={() => updateField('account_type', 'individual')}
              >
                <Text
                  className={`text-sm font-semibold ${
                    formData.account_type === 'individual' ? 'text-white' : 'text-gray-light'
                  }`}
                >
                  {t('individual')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 py-3 items-center rounded-lg ${
                  formData.account_type === 'company' ? 'bg-mavecam-primary' : ''
                }`}
                onPress={() => updateField('account_type', 'company')}
              >
                <Text
                  className={`text-sm font-semibold ${
                    formData.account_type === 'company' ? 'text-white' : 'text-gray-light'
                  }`}
                >
                  {t('company')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-dark mb-2">{t('phoneNumber')} *</Text>
            <View
              className={`flex-row items-center border rounded-lg bg-white px-3 ${
                errors.phone_number ? 'border-error' : 'border-gray-300'
              }`}
            >
              <Text className="text-base font-semibold text-mavecam-primary mr-2">+237</Text>
              <TextInput
                className="flex-1 text-base py-3"
                value={formData.phone_number.replace('+237', '')}
                onChangeText={handlePhoneNumberChange}
                placeholder="652260368"
                keyboardType="phone-pad"
                maxLength={9}
              />
            </View>
            {renderError('phone_number')}
          </View>

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-dark mb-2">{t('email')}</Text>
            <TextInput
              className={`border rounded-lg px-3 py-3 text-base bg-white ${errors.email ? 'border-error' : 'border-gray-300'}`}
              value={formData.email}
              onChangeText={(value) => updateField('email', value)}
              placeholder="exemple@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {renderError('email')}
          </View>

          {formData.account_type === 'individual' && (
            <>
              <View className="mb-4">
                <Text className="text-base font-medium text-gray-dark mb-2">{t('firstName')} *</Text>
                <TextInput
                  className={`border rounded-lg px-3 py-3 text-base bg-white ${
                    errors.first_name ? 'border-error' : 'border-gray-300'
                  }`}
                  value={formData.first_name}
                  onChangeText={(value) => updateField('first_name', value)}
                  placeholder="Jean"
                  autoCapitalize="words"
                />
                {renderError('first_name')}
              </View>

              <View className="mb-4">
                <Text className="text-base font-medium text-gray-dark mb-2">{t('lastName')} *</Text>
                <TextInput
                  className={`border rounded-lg px-3 py-3 text-base bg-white ${
                    errors.last_name ? 'border-error' : 'border-gray-300'
                  }`}
                  value={formData.last_name}
                  onChangeText={(value) => updateField('last_name', value)}
                  placeholder="Farmer"
                  autoCapitalize="words"
                />
                {renderError('last_name')}
              </View>

              <SelectField
                label={t('ageGroup')}
                value={formData.age_group}
                onChange={(value) => updateField('age_group', value)}
                options={AGE_GROUPS}
                placeholder={t('selectOption')}
                error={errors.age_group}
                required
              />
            </>
          )}

          {formData.account_type === 'company' && (
            <>
              <View className="mb-4">
                <Text className="text-base font-medium text-gray-dark mb-2">{t('businessName')} *</Text>
                <TextInput
                  className={`border rounded-lg px-3 py-3 text-base bg-white ${
                    errors.business_name ? 'border-error' : 'border-gray-300'
                  }`}
                  value={formData.business_name}
                  onChangeText={(value) => updateField('business_name', value)}
                  placeholder="AquaFerme SARL"
                  autoCapitalize="words"
                />
                {renderError('business_name')}
              </View>

              <SelectField
                label={t('legalStatus')}
                value={formData.legal_status}
                onChange={(value) => updateField('legal_status', value)}
                options={LEGAL_STATUS_OPTIONS}
                placeholder={t('selectLegalStatus')}
                error={errors.legal_status}
                required
              />

              <View className="mb-4">
                <Text className="text-base font-medium text-gray-dark mb-2">{t('promoterName')} *</Text>
                <TextInput
                  className={`border rounded-lg px-3 py-3 text-base bg-white ${
                    errors.promoter_name ? 'border-error' : 'border-gray-300'
                  }`}
                  value={formData.promoter_name}
                  onChangeText={(value) => updateField('promoter_name', value)}
                  placeholder="Jean Dubois"
                  autoCapitalize="words"
                />
                {renderError('promoter_name')}
              </View>
            </>
          )}

          <SelectField
            label={t('activityType')}
            value={formData.activity_type}
            onChange={(value) => updateField('activity_type', value)}
            options={ACTIVITY_TYPES}
            placeholder={t('selectOption')}
          />

          <SelectField
            label={t('region')}
            value={formData.region}
            onChange={(value) => updateField('region', value)}
            options={REGIONS}
            placeholder={t('selectRegion')}
          />

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-dark mb-2">{t('password')} *</Text>
            <TextInput
              className={`border rounded-lg px-3 py-3 text-base bg-white ${
                errors.password ? 'border-error' : 'border-gray-300'
              }`}
              value={formData.password}
              onChangeText={(value) => updateField('password', value)}
              placeholder="********"
              secureTextEntry
            />
            {renderError('password')}
          </View>

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-dark mb-2">{t('confirmPassword')} *</Text>
            <TextInput
              className={`border rounded-lg px-3 py-3 text-base bg-white ${
                errors.password_confirm ? 'border-error' : 'border-gray-300'
              }`}
              value={formData.password_confirm}
              onChangeText={(value) => updateField('password_confirm', value)}
              placeholder="********"
              secureTextEntry
            />
            {renderError('password_confirm')}
          </View>

          {error && (
            <View className="bg-[#fef2f2] p-3 rounded-lg mb-4 border-l-4 border-l-error">
              <Text className="text-sm font-semibold text-error">{error}</Text>
            </View>
          )}

          <TouchableOpacity
            className={`py-4 rounded-lg items-center mb-4 ${isLoading ? 'bg-mavecam-primary/70' : 'bg-mavecam-primary'}`}
            onPress={handleRegister}
            disabled={isLoading}
          >
            <Text className="text-white text-base font-semibold">
              {isLoading ? t('loading') : t('signUp')}
            </Text>
          </TouchableOpacity>

          <View className="flex-row justify-center items-center">
            <Text className="text-sm text-gray-light">{t('haveAccount')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text className="text-sm font-semibold text-mavecam-primary">{t('signIn')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
