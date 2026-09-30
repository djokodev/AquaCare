import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';

import { notificationsService } from '@/services/notificationsService';
import { promptPushPermissionOnce, registerPushTokenIfPermitted, unregisterPushToken } from '../pushRegistration';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[abc12345]' })),
}));
jest.mock('expo-device', () => ({ isDevice: true, deviceName: 'Pixel', modelName: 'Pixel 8', osName: 'Android' }));
jest.mock('expo-application', () => ({ getAndroidId: jest.fn(() => 'android-id'), getIosIdForVendorAsync: jest.fn() }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { easConfig: { projectId: 'project' } } }));
jest.mock('@/i18n/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));
jest.mock('@/services/notificationsService', () => ({
  notificationsService: { registerPushToken: jest.fn(), unregisterPushToken: jest.fn() },
}));
jest.mock('@/utils/logger', () => ({ __esModule: true, default: { warn: jest.fn(), error: jest.fn() } }));

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const service = notificationsService as jest.Mocked<typeof notificationsService>;

describe('pushRegistration', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('n enregistre le token que si la permission est deja accordee, sans la demander', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true } as never);

    expect(await registerPushTokenIfPermitted()).toBe(false);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(service.registerPushToken).not.toHaveBeenCalled();

    mocked.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    expect(await registerPushTokenIfPermitted()).toBe(true);
    expect(service.registerPushToken).toHaveBeenCalledWith(expect.objectContaining({
      expo_push_token: 'ExponentPushToken[abc12345]',
      device_id: 'android-id',
    }));
  });

  it('explique puis demande la permission une seule fois', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ status: 'undetermined', canAskAgain: true } as never);
    mocked.requestPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'pushPermissionAllow')?.onPress?.();
    });

    await promptPushPermissionOnce('order');
    await promptPushPermissionOnce('support');

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][1]).toBe('pushPermissionOrderMessage');
    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(service.registerPushToken).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it('ne demande pas si l utilisateur a refuse definitivement', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ status: 'denied', canAskAgain: false } as never);
    const alertSpy = jest.spyOn(Alert, 'alert');

    await promptPushPermissionOnce('support');

    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('supprime le token du serveur a la deconnexion', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    await registerPushTokenIfPermitted();

    await unregisterPushToken();
    await unregisterPushToken();

    expect(service.unregisterPushToken).toHaveBeenCalledTimes(1);
    expect(service.unregisterPushToken).toHaveBeenCalledWith('ExponentPushToken[abc12345]');
  });
});
