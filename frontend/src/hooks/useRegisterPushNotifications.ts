import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

import { notificationsService } from '@/services/notificationsService';

/**
 * Enregistre automatiquement le token push Expo pour l'utilisateur connecté.
 * Pensé pour être appelé une fois l'utilisateur authentifié.
 */
export const useRegisterPushNotifications = () => {
  const isRegistering = useRef(false);

  const registerPushToken = useCallback(async () => {
    if (isRegistering.current) {
      return;
    }
    isRegistering.current = true;

    try {
      if (!Device.isDevice) {
        return;
      }

      // Permissions
      const permission = await Notifications.getPermissionsAsync();
      let finalStatus = permission.status;
      if (finalStatus !== 'granted') {
        const request = await Notifications.requestPermissionsAsync();
        finalStatus = request.status;
      }
      if (finalStatus !== 'granted') {
        return;
      }

      // Token Expo : nécessite le projectId pour les builds EAS
      const projectId =
        Constants?.easConfig?.projectId ??
        // fallback pour Expo Go ou config extra
        (Constants?.expoConfig as any)?.extra?.eas?.projectId;

      const tokenResponse = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );
      const expoToken = tokenResponse?.data;
      if (!expoToken) {
        return;
      }

      // Identifiants device
      let deviceId: string | null = Application.getAndroidId?.() ?? null;
      if (!deviceId && (Application as any).getIosIdForVendorAsync) {
        deviceId = await (Application as any).getIosIdForVendorAsync();
      }
      if (!deviceId) {
        deviceId = `${Device.osName || Platform.OS}-${Device.modelName || 'device'}`;
      }

      const deviceName = Device.deviceName || Device.modelName || 'Unknown device';
      const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

      await notificationsService.registerPushToken({
        expo_push_token: expoToken,
        device_id: deviceId,
        device_name: deviceName,
        platform,
      });
    } catch (error) {
      console.warn('Push token registration failed', error);
    } finally {
      isRegistering.current = false;
    }
  }, []);

  return { registerPushToken };
};
