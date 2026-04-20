import React, { useCallback, useEffect, useState } from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import { useAuth } from '@/hooks/useAuth';
import { useRegisterPushNotifications } from '@/hooks/useRegisterPushNotifications';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import LoadingScreen from '@/features/main/screens/LoadingScreen';
import OnboardingService from '@/features/onboarding/services/onboardingService';
import OnboardingScreen from '@/features/onboarding/screens/OnboardingScreen';
import logger from '@/utils/logger';

type AppStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: undefined;
};

const Stack = createStackNavigator<AppStackParamList>();

export default function AppNavigator() {
  const { isAuthenticated, checkAuth } = useAuth();
  const { registerPushToken } = useRegisterPushNotifications();

  // Etat onboarding
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    // Check authentication status on app start — one-time gate only
    checkAuth().finally(() => setAuthReady(true));
  }, [checkAuth]);

  const refreshOnboardingFlag = useCallback(async () => {
    try {
      const completed = await OnboardingService.hasCompleted();
      setHasCompletedOnboarding(completed);
    } catch (error) {
      logger.error('[AppNavigator] Erreur checkOnboarding:', error);
      setHasCompletedOnboarding(true); // Failsafe : ne pas bloquer
    } finally {
      setIsCheckingOnboarding(false);
    }
  }, []);

  useEffect(() => {
    refreshOnboardingFlag();
  }, [refreshOnboardingFlag]);

  // Enregistrer le token push quand authentifié
  useEffect(() => {
    if (isAuthenticated) {
      registerPushToken();
    }
  }, [isAuthenticated, registerPushToken]);

  if (!authReady || isCheckingOnboarding) {
    return <LoadingScreen />;
  }

  // Conditional Stack.Screen children — pattern recommandé par React Navigation
  // (https://reactnavigation.org/docs/auth-flow/). React Navigation gère la
  // transition fluidement quand l'ensemble des écrans monté change. Évite les
  // races du pattern précédent (key dynamique sur Stack.Navigator).
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <Stack.Screen name="Main" component={MainNavigator} />
      ) : !hasCompletedOnboarding ? (
        <Stack.Screen name="Onboarding">
          {() => <OnboardingScreen onCompleted={refreshOnboardingFlag} />}
        </Stack.Screen>
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
    </Stack.Navigator>
  );
}
