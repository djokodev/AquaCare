import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { store } from '@/store/store';
import AppNavigator from '@/navigation/AppNavigator';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import i18n from '@/i18n/i18n';
import logger from '@/utils/logger';
import { getEnvironment } from '@/config/environment';
import { colors } from '@/theme';
import { navigationTheme } from '@/theme/navigationTheme';

// Sentry — actif uniquement dans les builds EAS (staging + production).
// Désactivé en Expo Go (__DEV__) pour éviter les erreurs de module natif.
const isExpoGo = Constants.appOwnership === 'expo';
if (!__DEV__ && !isExpoGo) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
    environment: getEnvironment(),
    // Capture 10 % des traces de performance en staging/prod
    tracesSampleRate: 0.1,
    // Désactiver les logs Sentry en staging pour éviter le bruit
    debug: false,
  });
}
import {
  FEEDING_ALARM_ACTION_SNOOZE,
  isFeedingAlarmNotification,
  scheduleFeedingSnooze,
} from '@/features/notifications/reminders/feedingReminders';
import { openNotificationTarget } from '@/features/notifications/services/notificationNavigation';
import { navigationRef } from '@/navigation/navigationRef';
import './global.css';

// Affiche les notifications même quand l'app est au premier plan
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const handledResponses = new Set<string>();

const handleNotificationResponse = async (response: Notifications.NotificationResponse) => {
  const { notification, actionIdentifier } = response;
  // Une même réponse peut arriver par le listener et par la « dernière réponse » au démarrage.
  const responseKey = `${notification.request.identifier}:${actionIdentifier}:${notification.date}`;
  if (handledResponses.has(responseKey)) {
    return;
  }
  handledResponses.add(responseKey);

  if (isFeedingAlarmNotification(notification)) {
    // Les boutons d'action ne ferment pas toujours la notification sur Android.
    await Notifications.dismissNotificationAsync(notification.request.identifier).catch(() => undefined);
    if (actionIdentifier === FEEDING_ALARM_ACTION_SNOOZE) {
      await scheduleFeedingSnooze(notification, {
        title: i18n.t('feedingAlarmTitle'),
        snoozeBody: i18n.t('feedingAlarmBodySnooze'),
      });
    }
    return;
  }

  if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    openNotificationTarget(notification.request.content.data as Parameters<typeof openNotificationTarget>[0]);
  }
};

function App() {
  useEffect(() => {
    if (Platform.OS === 'android') {
      // Canal des push serveur (commandes, support). Les alarmes de nourrissage
      // ont leur propre canal, créé à l'activation des rappels.
      Notifications.setNotificationChannelAsync('default', {
        name: i18n.t('pushChannelName'),
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: colors.brand.primary,
        sound: 'default',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      }).catch((error) => logger.warn('Configuration notifications incomplete', error));
    }

    // Tap sur une notification alors que l'app était fermée.
    try {
      const lastResponse = Notifications.getLastNotificationResponse();
      if (lastResponse) {
        void handleNotificationResponse(lastResponse);
        Notifications.clearLastNotificationResponse();
      }
    } catch (error) {
      logger.warn('Last notification response unavailable', error);
    }

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleNotificationResponse(response);
    });

    return () => {
      responseSub.remove();
    };
  }, []);

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <NavigationContainer ref={navigationRef} theme={navigationTheme}>
            <AppNavigator />
            <StatusBar style="auto" />
          </NavigationContainer>
        </ErrorBoundary>
      </SafeAreaProvider>
    </Provider>
  );
}

export default Sentry.wrap(App);
