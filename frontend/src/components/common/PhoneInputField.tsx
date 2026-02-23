import React from 'react';
import { View, Text, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCameroonPhone } from '@/utils/phoneFormatter';

interface PhoneInputFieldProps {
  value: string;
  onChange: (formatted: string) => void;
  error?: string;
  label?: string;
  required?: boolean;
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
}: PhoneInputFieldProps) {
  const { t } = useTranslation();

  const displayLabel = label ?? t('phoneNumber');

  return (
    <View className="mb-4">
      <Text className="text-base font-medium text-gray-dark mb-2">
        {displayLabel}{required ? ' *' : ''}
      </Text>
      <View
        className={`flex-row items-center border rounded-lg bg-white px-3 ${
          error ? 'border-error' : 'border-gray-300'
        }`}
      >
        <Text className="text-base font-semibold text-mavecam-primary mr-2">+237</Text>
        <TextInput
          className="flex-1 text-base py-3"
          value={value.replace('+237', '')}
          onChangeText={(raw) => onChange(formatCameroonPhone(raw))}
          placeholder={t('placeholderPhoneExample')}
          keyboardType="phone-pad"
          maxLength={9}
          autoComplete="tel"
        />
      </View>
      {error ? <Text className="text-sm text-error mt-1">{error}</Text> : null}
    </View>
  );
}
