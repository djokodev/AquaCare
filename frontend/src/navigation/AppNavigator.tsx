import React, { useEffect, useState } from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import { useAuth } from '@/hooks/useAuth';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import OnboardingNavigator from './OnboardingNavigator';
import { LoadingScreen } from '@/features/main';
import OnboardingService from '@/features/onboarding/services/onboardingService';

const Stack = createStackNavigator();

export default function AppNavigator() {
  const { isAuthenticated, isLoading, checkAuth } = useAuth();

  // \u00c9tat onboarding
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    // Check authentication status on app start
    checkAuth();
  }, [checkAuth]);

  // V\u00e9rifier onboarding au montage
  useEffect(() => {
    async function checkOnboarding() {
      try {
        const completed = await OnboardingService.hasCompleted();
        setHasCompletedOnboarding(completed);
      } catch (error) {
        console.error('[AppNavigator] Erreur checkOnboarding:', error);
        setHasCompletedOnboarding(true); // Failsafe : ne pas bloquer
      } finally {
        setIsCheckingOnboarding(false);
      }
    }

    checkOnboarding();
  }, []);

  // Loading pendant auth + onboarding
  if (isLoading || isCheckingOnboarding) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : !hasCompletedOnboarding ? (
        <Stack.Screen name="Onboarding" component={OnboardingNavigator} />
      ) : (
        <Stack.Screen name="Main" component={MainNavigator} />
      )}
    </Stack.Navigator>
  );
}




