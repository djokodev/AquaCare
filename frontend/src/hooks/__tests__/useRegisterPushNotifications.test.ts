import { renderHook, act } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

import { useRegisterPushNotifications } from '../useRegisterPushNotifications';
import { notificationsService } from '@/services/notificationsService';
import logger from '@/utils/logger';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));

jest.mock('expo-device', () => ({
  isDevice: true,
  osName: 'iOS',
  modelName: 'iPhone 15',
  deviceName: 'Mon iPhone',
}));

jest.mock('expo-application', () => ({
  getAndroidId: jest.fn(),
  getIosIdForVendorAsync: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  easConfig: { projectId: 'eas-project-id' },
  expoConfig: { extra: { eas: { projectId: 'fallback-project-id' } } },
}));

jest.mock('@/services/notificationsService', () => ({
  notificationsService: {
    registerPushToken: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('hooks/useRegisterPushNotifications', () => {
  const mockNotifications = Notifications as jest.Mocked<typeof Notifications>;
  const mockApplication = Application as jest.Mocked<typeof Application>;
  const mockService = notificationsService as jest.Mocked<typeof notificationsService>;
  const mockLogger = logger as jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.clearAllMocks();

    (Device as any).isDevice = true;
    (Device as any).osName = 'iOS';
    (Device as any).modelName = 'iPhone 15';
    (Device as any).deviceName = 'Mon iPhone';

    (Constants as any).easConfig = { projectId: 'eas-project-id' };
    (Constants as any).expoConfig = { extra: { eas: { projectId: 'fallback-project-id' } } };

    mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' } as any);
    mockNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' } as any);

    mockApplication.getAndroidId.mockReturnValue('android-id');
    mockApplication.getIosIdForVendorAsync.mockResolvedValue('ios-id' as any);

    mockService.registerPushToken.mockResolvedValue({ ok: true } as any);
  });

  it('arrete si aucun token Expo n est retourne', async () => {
    mockNotifications.getExpoPushTokenAsync.mockResolvedValueOnce({ data: null } as any);
    const { result } = renderHook(() => useRegisterPushNotifications());

    await act(async () => {
      await result.current.registerPushToken();
    });

    expect(mockService.registerPushToken).not.toHaveBeenCalled();
  });

  it('arrete si permission push refusee', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'denied' } as any);
    mockNotifications.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' } as any);

    const { result } = renderHook(() => useRegisterPushNotifications());

    await act(async () => {
      await result.current.registerPushToken();
    });

    expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalled();
    expect(mockService.registerPushToken).not.toHaveBeenCalled();
  });

  it('enregistre le token push avec projectId eas et android id', async () => {
    const { result } = renderHook(() => useRegisterPushNotifications());

    await act(async () => {
      await result.current.registerPushToken();
    });

    expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'eas-project-id' });
    expect(mockService.registerPushToken).toHaveBeenCalledWith({
      expo_push_token: 'ExponentPushToken[abc]',
      device_id: 'android-id',
      device_name: 'Mon iPhone',
      platform: 'ios',
    });
  });

  it('utilise fallback projectId et fallback device id si Android/iOS indisponibles', async () => {
    (Constants as any).easConfig = undefined;
    (Constants as any).expoConfig = { extra: { eas: { projectId: 'fallback-project-id' } } };

    mockApplication.getAndroidId.mockReturnValueOnce(null as any);
    mockApplication.getIosIdForVendorAsync.mockResolvedValueOnce(null as any);

    const { result } = renderHook(() => useRegisterPushNotifications());

    await act(async () => {
      await result.current.registerPushToken();
    });

    expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'fallback-project-id',
    });
    expect(mockService.registerPushToken).toHaveBeenCalledWith(
      expect.objectContaining({
        device_id: 'iOS-iPhone 15',
      })
    );
  });

  it('log un warning en cas erreur et relache le lock pour tentative suivante', async () => {
    mockService.registerPushToken.mockRejectedValueOnce(new Error('push error'));

    const { result } = renderHook(() => useRegisterPushNotifications());

    await act(async () => {
      await result.current.registerPushToken();
    });

    expect(mockLogger.warn).toHaveBeenCalledWith('Push token registration failed', expect.any(Error));

    await act(async () => {
      await result.current.registerPushToken();
    });

    expect(mockService.registerPushToken).toHaveBeenCalledTimes(2);
  });
});
