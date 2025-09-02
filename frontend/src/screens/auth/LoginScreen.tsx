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
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { StackNavigationProp } from '@react-navigation/stack';

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

      const result = await login(credentials);
      
      if (result.meta.requestStatus === 'fulfilled') {
        // Navigation will be handled automatically by AppNavigator
        console.log('Login successful');
      }
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
    
    updateField('phoneNumber', formattedPhone);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.logoText}>MAVECAM</Text>
          <Text style={styles.logoSubText}>AquaCare</Text>
          <Text style={styles.welcomeText}>{t('welcomeMessage')}</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>{t('login')}</Text>

          {/* Toggle between login methods */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleButton, !isPhoneMode && styles.toggleButtonActive]}
              onPress={() => !isPhoneMode || toggleMode()}
            >
              <Text style={[styles.toggleText, !isPhoneMode && styles.toggleTextActive]}>
                {t('loginName')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, isPhoneMode && styles.toggleButtonActive]}
              onPress={() => isPhoneMode || toggleMode()}
            >
              <Text style={[styles.toggleText, isPhoneMode && styles.toggleTextActive]}>
                {t('phoneNumber')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Login Name or Phone Number Field */}
          {!isPhoneMode ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('loginName')}</Text>
              <TextInput
                style={[styles.input, errors.loginName && styles.inputError]}
                value={formData.loginName}
                onChangeText={(value) => updateField('loginName', value)}
                placeholder="Jean Farmer ou AquaFerme SARL"
                autoCapitalize="words"
                autoComplete="name"
              />
              {errors.loginName && <Text style={styles.errorText}>{errors.loginName}</Text>}
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('phoneNumber')}</Text>
              <View style={styles.phoneInputContainer}>
                <Text style={styles.phonePrefix}>🇨🇲 +237</Text>
                <TextInput
                  style={[styles.phoneInput, errors.phoneNumber && styles.inputError]}
                  value={formData.phoneNumber.replace('+237', '')}
                  onChangeText={handlePhoneNumberChange}
                  placeholder="652260368"
                  keyboardType="phone-pad"
                  maxLength={9}
                  autoComplete="tel"
                />
              </View>
              <Text style={styles.phoneHint}>{t('phoneHint')}</Text>
              {errors.phoneNumber && <Text style={styles.errorText}>{errors.phoneNumber}</Text>}
            </View>
          )}

          {/* Password Field */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('password')}</Text>
            <TextInput
              style={[styles.input, errors.password && styles.inputError]}
              value={formData.password}
              onChangeText={(value) => updateField('password', value)}
              placeholder="••••••••"
              secureTextEntry
              autoComplete="password"
            />
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
          </View>

          {/* Error Message */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorMessage}>{error}</Text>
            </View>
          )}

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? t('loading') : t('signIn')}
            </Text>
          </TouchableOpacity>

          {/* Register Link */}
          <View style={styles.registerContainer}>
            <Text style={styles.registerText}>{t('noAccount')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.registerLink}>{t('signUp')}</Text>
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
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    letterSpacing: 2,
  },
  logoSubText: {
    fontSize: 18,
    fontWeight: '300',
    color: MAVECAM_COLORS.GREEN_DARK,
    marginTop: 4,
  },
  welcomeText: {
    fontSize: 16,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    marginTop: 20,
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    marginBottom: 20,
    textAlign: 'center',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: MAVECAM_COLORS.CREAM,
    borderRadius: 8,
    marginBottom: 20,
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
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
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
  registerText: {
    color: MAVECAM_COLORS.GRAY_LIGHT,
    fontSize: 14,
  },
  registerLink: {
    color: MAVECAM_COLORS.GREEN_PRIMARY,
    fontSize: 14,
    fontWeight: '600',
  },
});