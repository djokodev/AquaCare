import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';
import { AuthStackParamList } from '@/navigation/AuthNavigator';
import { useAuth } from '@/hooks/useAuth';
import { LoginRequest } from '@/types/auth';

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
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!isPhoneMode) {
      if (!formData.loginName.trim()) {
        newErrors.loginName = t('required');
      }
    } else {
      if (!formData.phoneNumber.trim()) {
        newErrors.phoneNumber = t('required');
      } else if (!/^\+237[0-9]{9}$/.test(formData.phoneNumber.trim())) {
        newErrors.phoneNumber = t('invalidPhone');
      }
    }

    if (!formData.password.trim()) {
      newErrors.password = t('required');
    } else if (formData.password.length < 8) {
      newErrors.password = t('passwordTooShort');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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
      console.error('Login error:', err);
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

    updateField('phoneNumber', formattedPhone);
  };

  const renderError = (field: keyof typeof errors) =>
    errors[field] ? <Text className="text-sm text-error mt-1">{errors[field]}</Text> : null;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-cream"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }} className="px-5">
        <View className="items-center mb-10">
          <Text className="text-3xl font-bold text-mavecam-primary text-center">{t('welcomeMessage')}</Text>
        </View>

        <View className="bg-white p-5 rounded-2xl shadow">
          <Text className="text-2xl font-bold text-gray-dark mb-5 text-center">{t('login')}</Text>

          <View className="flex-row bg-cream rounded-lg mb-5">
            <TouchableOpacity
              className={`flex-1 py-3 items-center rounded-lg ${!isPhoneMode ? 'bg-mavecam-primary' : ''}`}
              onPress={() => !isPhoneMode || toggleMode()}
            >
              <Text className={`text-sm font-semibold ${!isPhoneMode ? 'text-white' : 'text-gray-light'}`}>
                {t('loginName')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 py-3 items-center rounded-lg ${isPhoneMode ? 'bg-mavecam-primary' : ''}`}
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
                className={`border border-gray-300 rounded-lg px-3 py-3 text-base bg-white ${
                  errors.loginName ? 'border-error' : ''
                }`}
                value={formData.loginName}
                onChangeText={(value) => updateField('loginName', value)}
                placeholder="Jean Farmer ou AquaFerme SARL"
                autoCapitalize="words"
                autoComplete="name"
              />
              {renderError('loginName')}
            </View>
          ) : (
            <View className="mb-4">
              <Text className="text-base font-medium text-gray-dark mb-2">{t('phoneNumber')}</Text>
              <View
                className={`flex-row items-center border rounded-lg bg-white px-3 ${
                  errors.phoneNumber ? 'border-error' : 'border-gray-300'
                }`}
              >
                <Text className="text-base font-semibold text-mavecam-primary mr-2">+237</Text>
                <TextInput
                  className="flex-1 text-base py-3"
                  value={formData.phoneNumber.replace('+237', '')}
                  onChangeText={handlePhoneNumberChange}
                  placeholder="652260368"
                  keyboardType="phone-pad"
                  maxLength={9}
                  autoComplete="tel"
                />
              </View>
              {renderError('phoneNumber')}
            </View>
          )}

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-dark mb-2">{t('password')}</Text>
            <TextInput
              className={`border border-gray-300 rounded-lg px-3 py-3 text-base bg-white ${
                errors.password ? 'border-error' : ''
              }`}
              value={formData.password}
              onChangeText={(value) => updateField('password', value)}
              placeholder="********"
              secureTextEntry
              autoComplete="password"
            />
            {renderError('password')}
          </View>

          {error && (
            <View className="bg-[#fef2f2] p-3 rounded-lg mb-4 border-l-4 border-l-error">
              <Text className="text-sm font-semibold text-error">{error}</Text>
            </View>
          )}

          <TouchableOpacity
            className={`py-4 rounded-lg items-center mb-4 ${isLoading ? 'bg-mavecam-primary/70' : 'bg-mavecam-primary'}`}
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
              <Text className="text-sm font-semibold text-mavecam-primary">{t('signUp')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
