import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import SettingsScreen from '../SettingsScreen';
import { useAuth } from '@/hooks/useAuth';
import { STORAGE_KEYS } from '@/constants/api';

const listeners: Array<(lng: string) => void> = [];
const mockI18n = {
  language: 'fr',
  changeLanguage: jest.fn(async (lng: string) => {
    mockI18n.language = lng;
    listeners.forEach((fn) => fn(lng));
  }),
  on: jest.fn((_event: string, cb: (lng: string) => void) => {
    listeners.push(cb);
  }),
  off: jest.fn((_event: string, cb: (lng: string) => void) => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  }),
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      key === 'pushDeviceIdLabel' ? `pushDeviceIdLabel:${String(params?.deviceId ?? '')}` : key,
    i18n: mockI18n,
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('features/profile/screens/SettingsScreen', () => {
  const mockUpdateProfile = jest.fn();
  const mockLogout = jest.fn();
  const mockDeleteAccount = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockI18n.language = 'fr';

    (useAuth as jest.Mock).mockReturnValue({
      user: {
        display_name: 'Jean Dupont',
        phone_number: '+237670000000',
      },
      updateProfile: mockUpdateProfile,
      logout: mockLogout,
      deleteAccount: mockDeleteAccount,
    });

    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    (Alert.alert as jest.Mock).mockRestore?.();
  });

  it('affiche les infos user et change la langue', async () => {
    const { getByText } = render(<SettingsScreen navigation={mockNavigation as any} />);

    expect(getByText('Jean Dupont')).toBeTruthy();
    expect(getByText('+237670000000')).toBeTruthy();

    fireEvent.press(getByText('languageEnglish'));

    await waitFor(() => {
      expect(mockI18n.changeLanguage).toHaveBeenCalledWith('en');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(STORAGE_KEYS.LANGUAGE, 'en');
      expect(mockUpdateProfile).toHaveBeenCalledWith({ language_preference: 'en' });
    });
  });

  it('rollback la langue sur erreur et bloque la double action', async () => {
    let rejectUpdate: (reason?: unknown) => void = () => undefined;
    mockUpdateProfile.mockReturnValue(new Promise((_resolve, reject) => { rejectUpdate = reject; }));
    const screen = render(<SettingsScreen navigation={mockNavigation as any} />);

    fireEvent.press(screen.getByText('languageEnglish'));
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByText('languageEnglish'));
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);

    rejectUpdate(new Error('network'));
    await waitFor(() => {
      expect(mockI18n.changeLanguage).toHaveBeenLastCalledWith('fr');
      expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith(STORAGE_KEYS.LANGUAGE, 'fr');
      expect(Alert.alert).toHaveBeenCalledWith('error', 'languageChangeError');
    });
  });

  it('declenche logout quand l utilisateur confirme', () => {
    const { getByText } = render(<SettingsScreen navigation={mockNavigation as any} />);

    fireEvent.press(getByText('disconnect'));

    const logoutAlertCall = (Alert.alert as jest.Mock).mock.calls.find((call) => call[0] === 'logoutConfirm');
    expect(logoutAlertCall).toBeTruthy();

    const actions = logoutAlertCall?.[2] as Array<{ text: string; onPress?: () => void }>;
    const confirmAction = actions.find((a) => a.text === 'logoutConfirm');
    expect(confirmAction?.onPress).toBeTruthy();

    confirmAction?.onPress?.();
    expect(mockLogout).toHaveBeenCalled();
  });

  it('affiche la modale de confirmation lors de la suppression de compte', () => {
    const { getByText } = render(<SettingsScreen navigation={mockNavigation as any} />);

    fireEvent.press(getByText('deleteAccount'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'deleteAccountConfirmTitle',
      'deleteAccountConfirmMessage',
      expect.arrayContaining([
        expect.objectContaining({ style: 'cancel' }),
        expect.objectContaining({ style: 'destructive' }),
      ])
    );
  });

  it('appelle deleteAccount lors de la confirmation de suppression', async () => {
    mockDeleteAccount.mockResolvedValue(undefined);
    const { getByText, getAllByText, getByPlaceholderText } = render(<SettingsScreen navigation={mockNavigation as any} />);

    fireEvent.press(getByText('deleteAccount'));

    const alertCall = (Alert.alert as jest.Mock).mock.calls.find(
      (call) => call[0] === 'deleteAccountConfirmTitle'
    );
    const actions = alertCall?.[2] as Array<{ text: string; style: string; onPress?: () => void }>;
    const confirmAction = actions.find((a) => a.style === 'destructive');

    act(() => {
      confirmAction?.onPress?.();
    });
    expect(mockDeleteAccount).not.toHaveBeenCalled();

    fireEvent.changeText(getByPlaceholderText('********'), 'MotDePasse2026');
    fireEvent.press(getAllByText('deleteAccountConfirm').slice(-1)[0]);

    await waitFor(() => {
      expect(mockDeleteAccount).toHaveBeenCalledWith('MotDePasse2026');
    });
  });

  it('affiche l erreur de mot de passe sans supprimer le compte', async () => {
    mockDeleteAccount.mockRejectedValue({
      message: 'Le mot de passe actuel est incorrect.',
      fieldErrors: { current_password: 'Le mot de passe actuel est incorrect.' },
    });
    const { getByText, getAllByText, getByPlaceholderText, findByText } = render(
      <SettingsScreen navigation={mockNavigation as any} />
    );

    fireEvent.press(getByText('deleteAccount'));
    const alertCall = (Alert.alert as jest.Mock).mock.calls.find(
      (call) => call[0] === 'deleteAccountConfirmTitle'
    );
    const actions = alertCall?.[2] as Array<{ style: string; onPress?: () => void }>;
    act(() => {
      actions.find((a) => a.style === 'destructive')?.onPress?.();
    });

    fireEvent.changeText(getByPlaceholderText('********'), 'mauvais');
    fireEvent.press(getAllByText('deleteAccountConfirm').slice(-1)[0]);

    expect(await findByText('Le mot de passe actuel est incorrect.')).toBeTruthy();
  });
});
