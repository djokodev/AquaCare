import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from '@/navigation/AuthNavigator';
import { useAuth } from '@/hooks/useAuth';
import { RegisterRequest } from '@/features/auth/types/auth';
import SelectField from '@/components/SelectField';
import logger from '@/utils/logger';
import PhoneInputField from '@/components/common/PhoneInputField';
import AuthErrorBlock from '@/components/common/AuthErrorBlock';
import { REGIONS, AGE_GROUPS, LEGAL_STATUS_OPTIONS } from '@/constants/registration';
import {
  hasValidationErrors,
  validateRegisterForm,
  type RegisterValidationErrors,
} from '@/features/auth/domain/accountValidation';

type RegisterScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Register'>;

interface Props {
  navigation: RegisterScreenNavigationProp;
}

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
    activity_type: 'poisson_table',
    region: '',
    language_preference: 'fr',
    password: '',
    password_confirm: '',
    legal_status: '',
    promoter_name: '',
  });

  const [errors, setErrors] = useState<RegisterValidationErrors>({});

  const validateForm = (): boolean => {
    const newErrors = validateRegisterForm(formData);
    setErrors(newErrors);
    return !hasValidationErrors(newErrors);
  };

  const handleRegister = async () => {
    if (!validateForm()) return;
    clearAuthError();
    try {
      await register(formData);
    } catch (err) {
      logger.error('Registration error:', err);
    }
  };

  const updateField = <K extends keyof RegisterRequest>(field: K, value: RegisterRequest[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
    if (error) clearAuthError();
  };

  const renderError = (field: keyof typeof errors) =>
    errors[field] ? <Text className="text-sm text-error mt-1">{t(errors[field])}</Text> : null;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-cream"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 48 }}>
        <View className="items-center mb-8">
          <Text className="text-2xl font-bold text-aquacare-primary mb-2">{t('register')}</Text>
          <Text className="text-base text-gray-light text-center">{t('createAccount')}</Text>
        </View>

        <View className="bg-white p-5 rounded-2xl">
          <View className="mb-4">
            <Text className="text-base font-medium text-gray-dark mb-2">{t('accountType')}</Text>
            <View className="flex-row bg-cream rounded-lg">
              <TouchableOpacity
                className={`flex-1 py-3 items-center rounded-lg ${
                  formData.account_type === 'individual' ? 'bg-aquacare-primary' : ''
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
                  formData.account_type === 'company' ? 'bg-aquacare-primary' : ''
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

          <PhoneInputField
            value={formData.phone_number}
            onChange={(formatted) => updateField('phone_number', formatted)}
            error={errors.phone_number}
            hint={t('whatsAppHint')}
            required
          />

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-dark mb-2">{t('email')}</Text>
            <TextInput
              className={`border rounded-lg px-3 h-12 text-base bg-white ${errors.email ? 'border-error' : 'border-gray-300'}`}
              value={formData.email}
              onChangeText={(value) => updateField('email', value)}
              placeholder={t('placeholderEmail')}
              keyboardType="email-address"
              autoCapitalize="none"
              textAlignVertical="center"
            />
            {renderError('email')}
          </View>

          {formData.account_type === 'individual' && (
            <>
              <View className="mb-4">
                <Text className="text-base font-medium text-gray-dark mb-2">{t('firstName')} *</Text>
                <TextInput
                  className={`border rounded-lg px-3 h-12 text-base bg-white ${
                    errors.first_name ? 'border-error' : 'border-gray-300'
                  }`}
                  value={formData.first_name}
                  onChangeText={(value) => updateField('first_name', value)}
                  placeholder={t('placeholderFirstName')}
                  autoCapitalize="words"
                  textAlignVertical="center"
                />
                {renderError('first_name')}
              </View>

              <View className="mb-4">
                <Text className="text-base font-medium text-gray-dark mb-2">{t('lastName')} *</Text>
                <TextInput
                  className={`border rounded-lg px-3 h-12 text-base bg-white ${
                    errors.last_name ? 'border-error' : 'border-gray-300'
                  }`}
                  value={formData.last_name}
                  onChangeText={(value) => updateField('last_name', value)}
                  placeholder={t('placeholderLastName')}
                  autoCapitalize="words"
                  textAlignVertical="center"
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
                  className={`border rounded-lg px-3 h-12 text-base bg-white ${
                    errors.business_name ? 'border-error' : 'border-gray-300'
                  }`}
                  value={formData.business_name}
                  onChangeText={(value) => updateField('business_name', value)}
                  placeholder={t('placeholderBusinessName')}
                  autoCapitalize="words"
                  textAlignVertical="center"
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
                  className={`border rounded-lg px-3 h-12 text-base bg-white ${
                    errors.promoter_name ? 'border-error' : 'border-gray-300'
                  }`}
                  value={formData.promoter_name}
                  onChangeText={(value) => updateField('promoter_name', value)}
                  placeholder={t('placeholderPromoterName')}
                  autoCapitalize="words"
                  textAlignVertical="center"
                />
                {renderError('promoter_name')}
              </View>
            </>
          )}

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
              className={`border rounded-lg px-3 h-12 text-base bg-white ${
                errors.password ? 'border-error' : 'border-gray-300'
              }`}
              value={formData.password}
              onChangeText={(value) => updateField('password', value)}
              placeholder="********"
              secureTextEntry
              textAlignVertical="center"
            />
            {renderError('password')}
          </View>

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-dark mb-2">{t('confirmPassword')} *</Text>
            <TextInput
              className={`border rounded-lg px-3 h-12 text-base bg-white ${
                errors.password_confirm ? 'border-error' : 'border-gray-300'
              }`}
              value={formData.password_confirm}
              onChangeText={(value) => updateField('password_confirm', value)}
              placeholder="********"
              secureTextEntry
              textAlignVertical="center"
            />
            {renderError('password_confirm')}
          </View>

          <AuthErrorBlock error={error} />

          <TouchableOpacity
            className={`py-4 rounded-lg items-center mb-4 ${isLoading ? 'bg-aquacare-primary/70' : 'bg-aquacare-primary'}`}
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
              <Text className="text-sm font-semibold text-aquacare-primary">{t('signIn')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
