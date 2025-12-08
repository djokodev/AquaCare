import React, { useEffect } from 'react';
import { createStackNavigator } from '@react-navigation/stack';

import { useAuth } from '@/hooks/useAuth';
import { useRegisterPushNotifications } from '@/hooks/useRegisterPushNotifications';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import { LoadingScreen } from '@/features/main';

const Stack = createStackNavigator();

export default function AppNavigator() {
  const { isAuthenticated, isLoading, checkAuth } = useAuth();
  const { registerPushToken } = useRegisterPushNotifications();

  useEffect(() => {
    // Check authentication status on app start
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    // Dès que l'utilisateur est authentifié, enregistrer le token push si disponible
    if (isAuthenticated) {
      registerPushToken();
    }
  }, [isAuthenticated, registerPushToken]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <Stack.Screen name="Main" component={MainNavigator} />
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
    </Stack.Navigator>
  );
}


