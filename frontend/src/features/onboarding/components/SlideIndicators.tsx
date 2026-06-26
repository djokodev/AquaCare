/**
 * Indicateurs de pagination animés (dots)
 * Utilise react-native-reanimated pour animations fluides
 * @module features/onboarding/components
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { SlideIndicatorsProps } from '../types/onboarding';
import { AQUACARE_COLORS } from '@/constants/colors';

/**
 * Composant dot individuel animé
 */
function AnimatedDot({ isActive }: { isActive: boolean }) {
  const width = useSharedValue(isActive ? 24 : 8);

  // Animation de largeur quand isActive change
  useEffect(() => {
    width.value = withTiming(isActive ? 24 : 8, {
      duration: 300,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [isActive, width]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: width.value,
  }));

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: isActive ? AQUACARE_COLORS.GREEN_PRIMARY : AQUACARE_COLORS.GRAY_LIGHT },
        animatedStyle,
      ]}
    />
  );
}

/**
 * Conteneur des 3 dots de pagination
 * Affiche l'index actuel avec animation
 */
export default function SlideIndicators({
  currentIndex,
  totalSlides,
}: SlideIndicatorsProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: totalSlides }).map((_, index) => (
        <AnimatedDot key={index} isActive={index === currentIndex} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 24,
    height: 16, // Hauteur fixe pour éviter layout shift
  },

  dot: {
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
});
