import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, TouchableOpacity } from 'react-native';
import * as estimators from '../../domain/estimators';
import { MessageComposer } from '../MessageComposer';

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

function getButtons(screen: ReturnType<typeof render>) {
  return screen.UNSAFE_getAllByType(TouchableOpacity);
}

function findButtonByIconName(
  screen: ReturnType<typeof render>,
  iconName: string
) {
  return getButtons(screen).find((button) => {
    const children = Array.isArray(button.props.children)
      ? button.props.children
      : [button.props.children];

    return children.some((child: any) => child?.props?.name === iconName);
  });
}

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
    fireEvent.press(getButtons(screen)[1]);

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledWith('Bonjour', undefined, 'none');
    });
    expect(screen.queryByDisplayValue('Bonjour')).toBeNull();
  });

  it('affiche une erreur si l’envoi échoue', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const onSendMessage = jest.fn().mockRejectedValue(new Error('boom'));
    const screen = render(<MessageComposer onSendMessage={onSendMessage} />);

    fireEvent.changeText(screen.getByPlaceholderText('chatPlaceholder'), 'Message');
    fireEvent.press(getButtons(screen)[1]);

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
    fireEvent.press(getButtons(screen)[1]);

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

    fireEvent.press(getButtons(screen)[0]);
    const pickerOptions = alertSpy.mock.calls[0][2] as Array<{ onPress?: () => void }>;
    await act(async () => {
      await pickerOptions[0].onPress?.();
    });

    const removeButton = findButtonByIconName(screen, 'close-circle');
    expect(removeButton).toBeDefined();

    fireEvent.press(removeButton!);
    await waitFor(() => {
      expect(findButtonByIconName(screen, 'close-circle')).toBeUndefined();
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
    fireEvent.press(getButtons(screen)[0]);
    let pickerOptions = alertSpy.mock.calls[0][2] as Array<{ onPress?: () => void }>;
    await act(async () => {
      await pickerOptions[0].onPress?.();
    });

    expect(alertSpy).toHaveBeenCalledWith('chatMediaError', 'chatMediaImageTooLarge');

    mockRequestMediaLibraryPermissionsAsync.mockResolvedValueOnce({
      status: 'denied',
    });
    fireEvent.press(getButtons(screen)[0]);
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

    fireEvent.press(getButtons(screen)[0]);
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
    fireEvent.press(getButtons(screen)[0]);
    pickerOptions = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as Array<{
      onPress?: () => void;
    }>;
    await act(async () => {
      await pickerOptions[1].onPress?.();
    });

    expect(alertSpy).toHaveBeenCalledWith('chatMediaError', 'chatMediaVideoInvalidFormat');
  });
});
