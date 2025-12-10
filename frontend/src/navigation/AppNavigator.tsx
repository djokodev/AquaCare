import React, { useEffect, useMemo, useState } from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import { useAuth } from '@/hooks/useAuth';
import { useRegisterPushNotifications } from '@/hooks/useRegisterPushNotifications';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import { LoadingScreen } from '@/features/main';
import OnboardingService from '@/features/onboarding/services/onboardingService';
import OnboardingScreen from '@/features/onboarding/screens/OnboardingScreen';

type AppStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: undefined;
};

const Stack = createStackNavigator<AppStackParamList>();

export default function AppNavigator() {
  const { isAuthenticated, isLoading, checkAuth } = useAuth();
  const { registerPushToken } = useRegisterPushNotifications();

  // Etat onboarding
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    // Check authentication status on app start
    checkAuth();
  }, [checkAuth]);

  // Verifier onboarding au montage
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

  // Enregistrer le token push quand authentifié
  useEffect(() => {
    if (isAuthenticated) {
      registerPushToken();
    }
  }, [isAuthenticated, registerPushToken]);

  // Déterminer la route initiale
  const initialRouteName = useMemo(() => {
    if (!isAuthenticated) return 'Auth';
    if (!hasCompletedOnboarding) return 'Onboarding';
    return 'Main';
  }, [isAuthenticated, hasCompletedOnboarding]);

  // Force un reset du navigator quand l'état change (auth ou onboarding)
  const navigatorKey = `${isAuthenticated}-${hasCompletedOnboarding}`;

  if (isLoading || isCheckingOnboarding) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator
      key={navigatorKey}
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Auth" component={AuthNavigator} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="Main" component={MainNavigator} />
    </Stack.Navigator>
  );
}
