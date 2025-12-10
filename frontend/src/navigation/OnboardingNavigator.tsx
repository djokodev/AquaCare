/**
 * Stack Navigator pour le flux d'onboarding
 * Wraps OnboardingScreen sans header ni gestures
 * @module navigation
 */

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import OnboardingScreen from '@/features/onboarding/screens/OnboardingScreen';

/**
 * Type pour les param\u00e8tres de navigation du stack Onboarding
 */
export type OnboardingStackParamList = {
  Onboarding: undefined;
};

const Stack = createStackNavigator<OnboardingStackParamList>();

/**
 * Navigator d\u00e9di\u00e9 au flow d'onboarding
 * Pas de header ni de swipe-back (utilisateur doit compl\u00e9ter ou ignorer)
 */
export default function OnboardingNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: false, // Désactiver swipe-back iOS
      }}
    >
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
    </Stack.Navigator>
  );
}
