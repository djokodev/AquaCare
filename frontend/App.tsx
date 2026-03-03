import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
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
  FEEDING_ALARM_ACTION_FEED_NOW,
  FEEDING_ALARM_ACTION_SNOOZE_10M,
  FEEDING_ALARM_CATEGORY_ID,
  FEEDING_ALARM_DATA_TYPE,
  registerFeedingAlarmCategory,
} from '@/features/notifications/utils/alarmScheduler';
import './global.css';

// Affiche les notifications même quand l'app est au premier plan
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const incrementBadgeSafe = async () => {
  try {
    const current = await Notifications.getBadgeCountAsync();
    await Notifications.setBadgeCountAsync(current + 1);
  } catch (error) {
    logger.warn('Impossible d incrementer le badge', error);
  }
};

const decrementBadgeSafe = async () => {
  try {
    const current = await Notifications.getBadgeCountAsync();
    await Notifications.setBadgeCountAsync(Math.max(current - 1, 0));
  } catch (error) {
    logger.warn('Impossible de decrementer le badge', error);
  }
};

const scheduleSnoozeNotification = async (notification: Notifications.Notification) => {
  const triggerDate = new Date(Date.now() + 10 * 60 * 1000);
  const data = (notification.request.content.data ?? {}) as Record<string, unknown>;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: notification.request.content.title ?? i18n.t('feedingAlarmTitle'),
      body: notification.request.content.body ?? i18n.t('feedingAlarmBodySnooze'),
      sound: 'default',
      categoryIdentifier: FEEDING_ALARM_CATEGORY_ID,
      data: {
        ...data,
        type: FEEDING_ALARM_DATA_TYPE,
        isSnooze: true,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });
};

function App() {
  useEffect(() => {
    const setupNotifications = async () => {
      try {
        await registerFeedingAlarmCategory({
          actionFeedNow: i18n.t('alarmActionFeedNow'),
          actionSnooze10m: i18n.t('alarmActionSnooze10m'),
        });

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            description: 'AquaCare reminders and alerts',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#059669',
            sound: 'default',
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          });
        }
      } catch (error) {
        logger.warn('Configuration notifications incomplete', error);
      }
    };

    setupNotifications();

    const receivedSub = Notifications.addNotificationReceivedListener(async (notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      if (data?.type === FEEDING_ALARM_DATA_TYPE) {
        await incrementBadgeSafe();
      }
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const notification = response.notification;
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      if (data?.type !== FEEDING_ALARM_DATA_TYPE) {
        return;
      }

      if (response.actionIdentifier === FEEDING_ALARM_ACTION_SNOOZE_10M) {
        await scheduleSnoozeNotification(notification);
        await decrementBadgeSafe();
        return;
      }

      if (
        response.actionIdentifier === FEEDING_ALARM_ACTION_FEED_NOW ||
        response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
      ) {
        await decrementBadgeSafe();
      }
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <NavigationContainer>
            <AppNavigator />
            <StatusBar style="auto" />
          </NavigationContainer>
          {config.environment === 'staging' && (
            <View style={styles.stagingBanner} pointerEvents="none">
              <Text style={styles.stagingBannerText}>⚠ BUILD DE TEST — STAGING</Text>
            </View>
          )}
        </ErrorBoundary>
      </SafeAreaProvider>
    </Provider>
  );
}

export default Sentry.wrap(App);
