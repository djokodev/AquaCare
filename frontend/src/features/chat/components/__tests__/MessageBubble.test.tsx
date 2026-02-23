import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { TouchableOpacity } from 'react-native';
import { MessageBubble } from '../MessageBubble';
import type { Message } from '../../types/chat';

const BASE_MESSAGE: Message = {
  id: 'msg-1',
  conversation: 'conv-1',
  sender_type: 'user',
  content: 'Bonjour',
  media_type: 'none',
  media_url: null,
  is_read: false,
  created_offline: false,
  created_at: '2026-02-22T12:00:00Z',
  updated_at: '2026-02-22T12:00:00Z',
};

describe('features/chat/components/MessageBubble', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('affiche correctement user/admin/system et formats de timestamp', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-22T12:00:00Z'));

    const { getByText, rerender } = render(
      <MessageBubble
        message={{
          ...BASE_MESSAGE,
          sender_type: 'user',
          content: 'Message user',
          created_at: '2026-02-22T11:30:00Z',
        }}
      />
    );

    expect(getByText('Message user')).toBeTruthy();
    expect(getByText(/\d{2}:\d{2}/)).toBeTruthy();

    rerender(
      <MessageBubble
        message={{
          ...BASE_MESSAGE,
          sender_type: 'admin',
          content: 'Message admin',
          created_at: '2026-02-20T11:30:00Z',
        }}
      />
    );

    expect(getByText('Message admin')).toBeTruthy();
    expect(getByText(/\d{2}:\d{2}/)).toBeTruthy();

    rerender(
      <MessageBubble
        message={{
          ...BASE_MESSAGE,
          sender_type: 'system',
          content: 'Message system',
          created_at: '2026-02-01T11:30:00Z',
        }}
      />
    );

    expect(getByText('Message system')).toBeTruthy();
    expect(getByText(/\d{2}:\d{2}/)).toBeTruthy();
  });

  it('gère les médias image/video et callback image', () => {
    const onImagePress = jest.fn();
    const { UNSAFE_getByType, getByText, queryByText, rerender } = render(
      <MessageBubble
        message={{
          ...BASE_MESSAGE,
          media_type: 'image',
          media_url: 'https://cdn.example.com/photo.jpg',
        }}
        onImagePress={onImagePress}
      />
    );

    fireEvent.press(UNSAFE_getByType(TouchableOpacity));
    expect(onImagePress).toHaveBeenCalledWith('https://cdn.example.com/photo.jpg');

    rerender(
      <MessageBubble
        message={{
          ...BASE_MESSAGE,
          media_type: 'video',
          media_url: 'https://cdn.example.com/video.mp4',
        }}
      />
    );
    expect(getByText('chatVideoMessage')).toBeTruthy();

    rerender(
      <MessageBubble
        message={{
          ...BASE_MESSAGE,
          media_type: 'none',
          media_url: null,
        }}
      />
    );
    expect(queryByText('chatVideoMessage')).toBeNull();
  });

  it('retourne null pour un type média inattendu', () => {
    const { queryByText } = render(
      <MessageBubble
        message={{
          ...BASE_MESSAGE,
          media_type: 'audio' as any,
          media_url: 'https://cdn.example.com/audio.mp3',
        }}
      />
    );

    expect(queryByText('chatVideoMessage')).toBeNull();
  });

  it('import depuis types/chat est correct — regression guard [C3]', () => {
    // This test verifies that MessageBubble can import Message and MessageSenderType
    // from the correct relative path '../types/chat'.
    // If the import path were wrong, this render would throw a module-not-found error.
    const { getByText } = render(
      <MessageBubble
        message={{
          ...BASE_MESSAGE,
          sender_type: 'user',
          content: 'Import regression test',
        }}
      />
    );

    expect(getByText('Import regression test')).toBeTruthy();
  });
});
