import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

import i18n from '@/i18n/i18n';
import { notificationsService } from '@/services/notificationsService';
import logger from '@/utils/logger';

/** Dernier token Expo enregistré côté serveur pour ce téléphone. */
const REGISTERED_TOKEN_KEY = 'push_registered_token_v1';
/** Explication déjà montrée : on ne redemande pas à chaque commande. */
const PERMISSION_EXPLAINED_KEY = 'push_permission_explained_v1';

export type PushPermissionContext = 'order' | 'support';

const getProjectId = (): string | undefined =>
  Constants?.easConfig?.projectId ??
  (Constants?.expoConfig as { extra?: { eas?: { projectId?: string } } } | null)?.extra?.eas?.projectId;

const getDeviceId = async (): Promise<string> => {
  let deviceId: string | null = null;
  try {
    deviceId = Application.getAndroidId?.() ?? null;
    if (!deviceId && Platform.OS === 'ios') {
      deviceId = await Application.getIosIdForVendorAsync();
    }
  } catch (error) {
    logger.warn('Device id unavailable', error);
  }
  return deviceId || `${Device.osName || Platform.OS}-${Device.modelName || 'device'}`;
};

const registerCurrentToken = async (): Promise<boolean> => {
  const projectId = getProjectId();
  const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const expoToken = tokenResponse?.data;
  if (!expoToken) {
    return false;
  }

  await notificationsService.registerPushToken({
    expo_push_token: expoToken,
    device_id: await getDeviceId(),
    device_name: Device.deviceName || Device.modelName || undefined,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  await AsyncStorage.setItem(REGISTERED_TOKEN_KEY, expoToken);
  return true;
};

/**
 * Enregistre le token push si l'utilisateur a DÉJÀ accordé la permission.
 * Ne déclenche jamais la demande système (appelé à la connexion / ouverture).
 */
export const registerPushTokenIfPermitted = async (): Promise<boolean> => {
  try {
    if (!Device.isDevice) {
      return false;
    }
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      return false;
    }
    return await registerCurrentToken();
  } catch (error) {
    logger.warn('Push token registration failed', error);
    return false;
  }
};

const confirmExplanation = (context: PushPermissionContext): Promise<boolean> =>
  new Promise((resolve) => {
    Alert.alert(
      i18n.t('pushPermissionTitle'),
      i18n.t(context === 'order' ? 'pushPermissionOrderMessage' : 'pushPermissionSupportMessage'),
      [
        { text: i18n.t('pushPermissionLater'), style: 'cancel', onPress: () => resolve(false) },
        { text: i18n.t('pushPermissionAllow'), onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });

/**
 * Demande la permission push au bon moment (première commande, premier
 * message au support) avec une explication préalable, une seule fois.
 */
export const promptPushPermissionOnce = async (context: PushPermissionContext): Promise<void> => {
  try {
    if (!Device.isDevice) {
      return;
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') {
      await registerCurrentToken();
      return;
    }
    if (!current.canAskAgain) {
      return;
    }
    if ((await AsyncStorage.getItem(PERMISSION_EXPLAINED_KEY)) === 'true') {
      return;
    }
    await AsyncStorage.setItem(PERMISSION_EXPLAINED_KEY, 'true');

    const accepted = await confirmExplanation(context);
    if (!accepted) {
      return;
    }
    const request = await Notifications.requestPermissionsAsync();
    if (request.status === 'granted') {
      await registerCurrentToken();
    }
  } catch (error) {
    logger.warn('Push permission prompt failed', error);
  }
};

/**
 * Supprime le token de ce téléphone côté serveur (déconnexion), pour que
 * les push du compte n'arrivent plus sur l'appareil. Best effort.
 */
export const unregisterPushToken = async (): Promise<void> => {
  try {
    const token = await AsyncStorage.getItem(REGISTERED_TOKEN_KEY);
    if (token) {
      await notificationsService.unregisterPushToken(token);
    }
  } catch (error) {
    logger.warn('Push token unregister failed', error);
  } finally {
    try {
      await AsyncStorage.removeItem(REGISTERED_TOKEN_KEY);
    } catch {
      // ignore
    }
  }
};
