import 'react-native-gesture-handler';
import React from 'react';
import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { store } from '@/store/store';
import AppNavigator from '@/navigation/AppNavigator';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import '@/i18n/i18n';
import './global.css';

export default function App() {
  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <NavigationContainer>
            <AppNavigator />
            <StatusBar style="auto" />
          </NavigationContainer>
        </ErrorBoundary>
      </SafeAreaProvider>
    </Provider>
  );
}
