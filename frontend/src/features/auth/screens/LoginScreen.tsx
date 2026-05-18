import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from '@/navigation/AuthNavigator';
import { useAuth } from '@/hooks/useAuth';
import { LoginRequest } from '@/features/auth/types/auth';
import logger from '@/utils/logger';
import PhoneInputField from '@/components/common/PhoneInputField';
import AuthErrorBlock from '@/components/common/AuthErrorBlock';
import {
  hasValidationErrors,
  validateLoginForm,
  type LoginValidationErrors,
} from '@/features/auth/domain/accountValidation';

type LoginScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Login'>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

export default function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { login, isLoading, error, clearAuthError } = useAuth();

  const [formData, setFormData] = useState({
    loginName: '',
    phoneNumber: '',
    password: '',
  });
  const [isPhoneMode, setIsPhoneMode] = useState(false);
  const [errors, setErrors] = useState<LoginValidationErrors>({});

  const validateForm = (): boolean => {
    const newErrors = validateLoginForm(formData, isPhoneMode);
    setErrors(newErrors);
    return !hasValidationErrors(newErrors);
  };

  const handleLogin = async () => {
    if (!validateForm()) return;

    clearAuthError();

    try {
      const credentials: LoginRequest = {
        password: formData.password,
      };

      if (isPhoneMode) {
        credentials.phone_number = formData.phoneNumber.trim();
      } else {
        credentials.login_name = formData.loginName.trim();
      }

      await login(credentials);
      // Navigation is handled by AppNavigator after auth state changes
    } catch (err) {
      logger.error('Login error:', err);
    }
  };

  const toggleMode = () => {
    setIsPhoneMode(!isPhoneMode);
    setFormData({ loginName: '', phoneNumber: '', password: '' });
    setErrors({});
    clearAuthError();
  };

  const updateField = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
    if (error) {
      clearAuthError();
    }
  };

  const renderError = (field: keyof typeof errors) =>
    errors[field] ? <Text className="text-sm text-error mt-1">{t(errors[field])}</Text> : null;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-cream"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} className="px-5">
        <View className="items-center mb-10">
          <Text className="text-2xl font-bold text-aquacare-primary text-center">{t('welcomeMessage')}</Text>
        </View>

        <View className="bg-white p-5 rounded-2xl">
          <Text className="text-xl font-bold text-gray-dark mb-5 text-center">{t('login')}</Text>

          <View className="flex-row bg-cream rounded-lg mb-5">
            <TouchableOpacity
              className={`flex-1 py-3 items-center rounded-lg ${!isPhoneMode ? 'bg-aquacare-primary' : ''}`}
              onPress={() => !isPhoneMode || toggleMode()}
            >
              <Text className={`text-sm font-semibold ${!isPhoneMode ? 'text-white' : 'text-gray-light'}`}>
                {t('loginName')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 py-3 items-center rounded-lg ${isPhoneMode ? 'bg-aquacare-primary' : ''}`}
              onPress={() => isPhoneMode || toggleMode()}
            >
              <Text className={`text-sm font-semibold ${isPhoneMode ? 'text-white' : 'text-gray-light'}`}>
                {t('phoneNumber')}
              </Text>
            </TouchableOpacity>
          </View>

          {!isPhoneMode ? (
            <View className="mb-4">
              <Text className="text-base font-medium text-gray-dark mb-2">{t('loginName')}</Text>
              <TextInput
                className={`border border-gray-300 rounded-lg px-3 h-12 text-base bg-white ${
                  errors.loginName ? 'border-error' : ''
                }`}
                value={formData.loginName}
                onChangeText={(value) => updateField('loginName', value)}
                placeholder={t('placeholderLoginName')}
                autoCapitalize="words"
                autoComplete="name"
                textAlignVertical="center"
              />
              {renderError('loginName')}
            </View>
          ) : (
            <PhoneInputField
              value={formData.phoneNumber}
              onChange={(formatted) => updateField('phoneNumber', formatted)}
              error={errors.phoneNumber}
            />
          )}

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-dark mb-2">{t('password')}</Text>
            <TextInput
              className={`border border-gray-300 rounded-lg px-3 h-12 text-base bg-white ${
                errors.password ? 'border-error' : ''
              }`}
              value={formData.password}
              onChangeText={(value) => updateField('password', value)}
              placeholder="********"
              secureTextEntry
              autoComplete="password"
              textAlignVertical="center"
            />
            {renderError('password')}
          </View>

          <AuthErrorBlock error={error} />

          <TouchableOpacity
            className={`py-4 rounded-lg items-center mb-4 ${isLoading ? 'bg-aquacare-primary/70' : 'bg-aquacare-primary'}`}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <Text className="text-white text-base font-semibold">
              {isLoading ? t('loading') : t('signIn')}
            </Text>
          </TouchableOpacity>

          <View className="flex-row justify-center items-center">
            <Text className="text-sm text-gray-light">{t('noAccount')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text className="text-sm font-semibold text-aquacare-primary">{t('signUp')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
