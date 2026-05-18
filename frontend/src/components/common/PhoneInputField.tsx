import React from 'react';
import { View, Text, TextInput, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCameroonPhone } from '@/utils/phoneFormatter';

interface PhoneInputFieldProps {
  value: string;
  onChange: (formatted: string) => void;
  error?: string;
  label?: string;
  required?: boolean;
  hint?: string;
}

/**
 * Champ de saisie téléphone camerounais avec préfixe +237 intégré.
 * Partagé entre LoginScreen et RegisterScreen.
 */
export default function PhoneInputField({
  value,
  onChange,
  error,
  label,
  required,
  hint,
}: PhoneInputFieldProps) {
  const { t } = useTranslation();

  const displayLabel = label ?? t('phoneNumber');

  return (
    <View className="mb-4">
      <Text className="text-base font-medium text-gray-dark mb-2">
        {displayLabel}{required ? ' *' : ''}
      </Text>
      <View
        className={`flex-row items-center h-12 border rounded-lg bg-white px-3 ${
          error ? 'border-error' : 'border-gray-300'
        }`}
      >
        <View className="h-10 justify-center mr-2">
          <Text
            className="text-base font-semibold text-aquacare-primary"
            style={{ lineHeight: 20, marginVertical: 0, paddingVertical: 0 }}
          >
            +237
          </Text>
        </View>
        <TextInput
          className="flex-1 h-10 text-base text-gray-dark self-center"
          style={{
            paddingVertical: 0,
            marginVertical: 0,
            lineHeight: 20,
            ...(Platform.OS === 'android'
              ? {
                  textAlignVertical: 'center',
                  includeFontPadding: false,
                }
              : null),
          }}
          value={value.replace('+237', '')}
          onChangeText={(raw) => onChange(formatCameroonPhone(raw))}
          placeholder={t('placeholderPhoneExample')}
          keyboardType="phone-pad"
          maxLength={9}
          autoComplete="tel"
        />
      </View>
      {hint && !error ? <Text className="text-xs text-gray-light mt-1">{hint}</Text> : null}
      {error ? <Text className="text-sm text-error mt-1">{t(error)}</Text> : null}
    </View>
  );
}
