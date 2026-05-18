/**
 * Composant bouton réutilisable pour l'onboarding
 * Respecte la charte graphique AquaCare
 * @module features/onboarding/components
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';
import { OnboardingButtonProps } from '../types/onboarding';
import { AQUACARE_COLORS } from '@/constants/colors';

/**
 * Bouton primaire AquaCare pour onboarding
 * Gère états normal, pressé, désactivé
 */
export default function OnboardingButton({
  title,
  onPress,
  disabled = false,
}: OnboardingButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        disabled && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: AQUACARE_COLORS.GREEN_PRIMARY,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,

    // Shadow iOS
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,

    // Shadow Android
    elevation: 4,
  },

  buttonDisabled: {
    backgroundColor: '#9CA3AF', // Gris neutre
    opacity: 0.6,
  },

  buttonText: {
    color: AQUACARE_COLORS.WHITE,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
