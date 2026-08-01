import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as estimators from '../../domain/estimators';
import { MessageComposer } from '../MessageComposer';
import { colors } from '@/theme';

const mockRequestMediaLibraryPermissionsAsync = jest.fn(() =>
  Promise.resolve({ status: 'granted' })
);
const mockLaunchImageLibraryAsync = jest.fn();

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: () =>
    mockRequestMediaLibraryPermissionsAsync(),
  launchImageLibraryAsync: () => mockLaunchImageLibraryAsync(),
  MediaTypeOptions: {
    Images: 'Images',
    Videos: 'Videos',
  },
}));

describe('features/chat/components/MessageComposer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('affiche la bannière offline et le compteur de caractères près de la limite', () => {
    const onSendMessage = jest.fn().mockResolvedValue(undefined);
    const screen = render(
      <MessageComposer onSendMessage={onSendMessage} offlinePendingCount={2} />
    );

    expect(screen.getByText('chatOfflinePending')).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText('chatPlaceholder'), 'a'.repeat(4100));
    expect(screen.getByText('4100/5000')).toBeTruthy();
  });

  it('envoie un message texte et réinitialise le formulaire', async () => {
    const onSendMessage = jest.fn().mockResolvedValue(undefined);
    const screen = render(<MessageComposer onSendMessage={onSendMessage} />);

    fireEvent.changeText(screen.getByPlaceholderText('chatPlaceholder'), 'Bonjour');
    fireEvent.press(screen.getByLabelText('chatSendMessage'));

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledWith('Bonjour', undefined, 'none');
    });
    expect(screen.queryByDisplayValue('Bonjour')).toBeNull();
  });

  it('garde l icône d envoi visible quand le message est vide', () => {
    const screen = render(<MessageComposer onSendMessage={jest.fn()} />);
    const sendButton = screen.getByTestId('messageComposerSendButton');

    expect(sendButton.props.accessibilityState).toMatchObject({ disabled: true });
    expect(sendButton.findByType(Ionicons).props.color).toBe(colors.text.muted);

    fireEvent.changeText(screen.getByPlaceholderText('chatPlaceholder'), 'Bonjour');

    expect(sendButton.props.accessibilityState).toMatchObject({ disabled: false });
    expect(sendButton.findByType(Ionicons).props.color).toBe(colors.brand.primary);
  });

  it('empêche deux envois pendant une requête en attente', async () => {
    let resolveSend: (() => void) | undefined;
    const pendingSend = new Promise<void>((resolve) => {
      resolveSend = resolve;
    });
    const onSendMessage = jest.fn(() => pendingSend);
    const screen = render(<MessageComposer onSendMessage={onSendMessage} />);

    fireEvent.changeText(screen.getByPlaceholderText('chatPlaceholder'), 'Bonjour');
    const sendButton = screen.getByLabelText('chatSendMessage');

    await act(async () => {
      fireEvent.press(sendButton);
      fireEvent.press(sendButton);
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('chatSendMessage').props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });

    await act(async () => {
      resolveSend?.();
      await pendingSend;
    });
  });

  it('affiche une erreur si l’envoi échoue', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const onSendMessage = jest.fn().mockRejectedValue(new Error('boom'));
    const screen = render(<MessageComposer onSendMessage={onSendMessage} />);

    fireEvent.changeText(screen.getByPlaceholderText('chatPlaceholder'), 'Message');
    fireEvent.press(screen.getByLabelText('chatSendMessage'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('chatSendError', 'boom');
    });
  });

  it('bloque l’envoi si la validation message échoue', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const validationSpy = jest
      .spyOn(estimators, 'validateMessageContent')
      .mockReturnValueOnce({ isValid: false, errorKey: 'chatMessageEmpty' });

    const onSendMessage = jest.fn().mockResolvedValue(undefined);
    const screen = render(<MessageComposer onSendMessage={onSendMessage} />);

    fireEvent.changeText(screen.getByPlaceholderText('chatPlaceholder'), 'Texte');
    fireEvent.press(screen.getByLabelText('chatSendMessage'));

    expect(alertSpy).toHaveBeenCalledWith('chatMessageError', 'chatMessageEmpty');
    expect(onSendMessage).not.toHaveBeenCalled();
    validationSpy.mockRestore();
  });

  it('gère sélection image valide et suppression du média', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValueOnce({
      status: 'granted',
    });
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file://photo.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1024,
        },
      ],
    });

    const screen = render(<MessageComposer onSendMessage={jest.fn()} />);

    fireEvent.press(screen.getByLabelText('chatSelectMedia'));
    const pickerOptions = alertSpy.mock.calls[0][2] as Array<{ onPress?: () => void }>;
    await act(async () => {
      await pickerOptions[0].onPress?.();
    });

    const removeButton = screen.queryByLabelText('close');
    expect(removeButton).toBeDefined();

    fireEvent.press(removeButton!);
    await waitFor(() => {
      expect(screen.queryByLabelText('close')).toBeNull();
    });
  });

  it('affiche une erreur image invalide et une erreur permission', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

    mockRequestMediaLibraryPermissionsAsync.mockResolvedValueOnce({
      status: 'granted',
    });
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file://big.jpg',
          mimeType: 'image/jpeg',
          fileSize: 11 * 1024 * 1024,
        },
      ],
    });

    const screen = render(<MessageComposer onSendMessage={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('chatSelectMedia'));
    let pickerOptions = alertSpy.mock.calls[0][2] as Array<{ onPress?: () => void }>;
    await act(async () => {
      await pickerOptions[0].onPress?.();
    });

    expect(alertSpy).toHaveBeenCalledWith('chatMediaError', 'chatMediaImageTooLarge');

    mockRequestMediaLibraryPermissionsAsync.mockResolvedValueOnce({
      status: 'denied',
    });
    fireEvent.press(screen.getByLabelText('chatSelectMedia'));
    pickerOptions = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as Array<{
      onPress?: () => void;
    }>;
    await act(async () => {
      await pickerOptions[0].onPress?.();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'chatPermissionDenied',
      'chatPermissionMediaLibrary'
    );
  });

  it('gère la sélection vidéo valide et vidéo invalide', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const screen = render(<MessageComposer onSendMessage={jest.fn()} />);

    mockRequestMediaLibraryPermissionsAsync.mockResolvedValueOnce({
      status: 'granted',
    });
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file://video.mp4',
          mimeType: 'video/mp4',
          fileSize: 1024,
        },
      ],
    });

    fireEvent.press(screen.getByLabelText('chatSelectMedia'));
    let pickerOptions = alertSpy.mock.calls[0][2] as Array<{ onPress?: () => void }>;
    await act(async () => {
      await pickerOptions[1].onPress?.();
    });
    expect(screen.getByText('chatVideoSelected')).toBeTruthy();

    mockRequestMediaLibraryPermissionsAsync.mockResolvedValueOnce({
      status: 'granted',
    });
    mockLaunchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file://video.avi',
          mimeType: 'video/avi',
          fileSize: 1024,
        },
      ],
    });
    fireEvent.press(screen.getByLabelText('chatSelectMedia'));
    pickerOptions = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as Array<{
      onPress?: () => void;
    }>;
    await act(async () => {
      await pickerOptions[1].onPress?.();
    });

    expect(alertSpy).toHaveBeenCalledWith('chatMediaError', 'chatMediaVideoInvalidFormat');
  });
});
