import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

interface AuthErrorBlockProps {
  error: string | null;
}

/**
 * Bloc d'erreur API (erreurs globales, pas les erreurs de champ).
 * Partagé entre LoginScreen et RegisterScreen.
 * La couleur bg-red-50 correspond au token design #fef2f2.
 */
export default function AuthErrorBlock({ error }: AuthErrorBlockProps) {
  const { t } = useTranslation();

  if (!error) return null;

  return (
    <View className="bg-red-50 p-3 rounded-lg mb-4 border-l-4 border-l-error">
      <Text className="text-sm font-semibold text-error">
        {t(error, { defaultValue: error })}
      </Text>
    </View>
  );
}
