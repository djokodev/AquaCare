/**
 * Composant générique pour un slide d'onboarding
 * Affiche icône, titre, description centrés
 * @module features/onboarding/components
 */

import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OnboardingSlideProps } from '../types/onboarding';
import { MAVECAM_COLORS } from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Slide individuel d'onboarding
 * Layout responsive avec largeur écran complète
 */
export default function OnboardingSlide({
  iconName,
  title,
  description,
}: OnboardingSlideProps) {
  return (
    <View style={styles.container}>
      {/* Icône principale */}
      <View style={styles.iconContainer}>
        <Ionicons
          name={iconName as any} // Type assertion nécessaire pour Ionicons
          size={100}
          color={MAVECAM_COLORS.GREEN_PRIMARY}
        />
      </View>

      {/* Titre */}
      <Text style={styles.title}>{title}</Text>

      {/* Description */}
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: MAVECAM_COLORS.WHITE,
  },

  iconContainer: {
    marginBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: MAVECAM_COLORS.GRAY_DARK,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
    lineHeight: 36,
  },

  description: {
    fontSize: 16,
    lineHeight: 24,
    color: MAVECAM_COLORS.GRAY_LIGHT,
    textAlign: 'center',
    paddingHorizontal: 24,
    maxWidth: 320, // Limite pour meilleure lisibilité
  },
});
