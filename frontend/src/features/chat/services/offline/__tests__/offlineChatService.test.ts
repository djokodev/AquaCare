import AsyncStorage from '@react-native-async-storage/async-storage';
import * as offlineChatService from '../offlineChatService';
import * as chatApi from '../../api/chatApi';
import { OFFLINE_QUEUE_STORAGE_KEY, MAX_SYNC_RETRIES } from '../../../domain/constants';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'uuid-fixed-1'),
}));

jest.mock('../../api/chatApi', () => ({
  sendMessage: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('features/chat/services/offline/offlineChatService', () => {
  const mockChatApi = chatApi as jest.Mocked<typeof chatApi>;
  const realFetch = global.fetch;

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    global.fetch = realFetch;
  });

  afterAll(() => {
    global.fetch = realFetch;
  });

  it('addToOfflineQueue et getOfflineQueue stockent correctement', async () => {
    const clientUuid = await offlineChatService.addToOfflineQueue('conv-1', 'Hello', 'none');
    expect(clientUuid).toBe('uuid-fixed-1');

    const queue = await offlineChatService.getOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toEqual(
      expect.objectContaining({
        client_uuid: 'uuid-fixed-1',
        conversation_id: 'conv-1',
        content: 'Hello',
        media_type: 'none',
        retry_count: 0,
      })
    );
  });

  it('removeFromOfflineQueue, getOfflineQueueCount, isOfflineQueueEmpty et clearOfflineQueue', async () => {
    await AsyncStorage.setItem(
      OFFLINE_QUEUE_STORAGE_KEY,
      JSON.stringify([
        { client_uuid: 'a', retry_count: 0 },
        { client_uuid: 'b', retry_count: 0 },
      ])
    );

    expect(await offlineChatService.getOfflineQueueCount()).toBe(2);
    expect(await offlineChatService.isOfflineQueueEmpty()).toBe(false);

    await offlineChatService.removeFromOfflineQueue('a');
    let queue = await offlineChatService.getOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].client_uuid).toBe('b');

    await offlineChatService.clearOfflineQueue();
    queue = await offlineChatService.getOfflineQueue();
    expect(queue).toHaveLength(0);
    expect(await offlineChatService.isOfflineQueueEmpty()).toBe(true);
  });

  it('syncOfflineQueue gere success, max retries et echec avec increment retry', async () => {
    await AsyncStorage.setItem(
      OFFLINE_QUEUE_STORAGE_KEY,
      JSON.stringify([
        {
          client_uuid: 'ok-1',
          conversation_id: 'conv-1',
          content: 'ok',
          media_type: 'none',
          created_at: '2026-02-21T00:00:00Z',
          retry_count: 0,
        },
        {
          client_uuid: 'maxed',
          conversation_id: 'conv-1',
          content: 'skip',
          media_type: 'none',
          created_at: '2026-02-21T00:00:00Z',
          retry_count: MAX_SYNC_RETRIES,
        },
        {
          client_uuid: 'fail-1',
          conversation_id: 'conv-1',
          content: 'fail',
          media_type: 'none',
          created_at: '2026-02-21T00:00:00Z',
          retry_count: 1,
        },
      ])
    );

    mockChatApi.sendMessage
      .mockResolvedValueOnce({ id: 'srv-1' } as any)
      .mockRejectedValueOnce({ response: { data: { error: 'Backend KO' } } } as any);

    const result = await offlineChatService.syncOfflineQueue();

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(2);
    expect(result.errors.maxed).toContain('Max retries');
    expect(result.errors['fail-1']).toBe('Backend KO');

    const queueAfter = await offlineChatService.getOfflineQueue();
    expect(queueAfter.some((q) => q.client_uuid === 'ok-1')).toBe(false);

    const failItem = queueAfter.find((q) => q.client_uuid === 'fail-1');
    expect(failItem?.retry_count).toBe(2);
    expect(failItem?.last_error).toBe('Backend KO');
  });

  it('syncOfflineQueue tente lecture media et envoie media_file quand possible', async () => {
    await AsyncStorage.setItem(
      OFFLINE_QUEUE_STORAGE_KEY,
      JSON.stringify([
        {
          client_uuid: 'media-1',
          conversation_id: 'conv-1',
          content: 'photo',
          media_type: 'image',
          media_uri: 'file://test/photo.jpg',
          created_at: '2026-02-21T00:00:00Z',
          retry_count: 0,
        },
      ])
    );

    global.fetch = jest.fn().mockResolvedValue({
      blob: jest.fn().mockResolvedValue({ type: 'image/jpeg' }),
    } as any);
    mockChatApi.sendMessage.mockResolvedValueOnce({ id: 'srv-media' } as any);

    const result = await offlineChatService.syncOfflineQueue();

    expect(result.successCount).toBe(1);
    expect(mockChatApi.sendMessage).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        media_type: 'image',
        media_file: {
          uri: 'file://test/photo.jpg',
          type: 'image/jpeg',
          name: 'photo.jpg',
        },
      })
    );
  });

  it('getFailedMessages et clearFailedMessages filtrent correctement', async () => {
    await AsyncStorage.setItem(
      OFFLINE_QUEUE_STORAGE_KEY,
      JSON.stringify([
        { client_uuid: 'ok', retry_count: 1 },
        { client_uuid: 'failed', retry_count: MAX_SYNC_RETRIES },
      ])
    );

    const failed = await offlineChatService.getFailedMessages();
    expect(failed).toHaveLength(1);
    expect(failed[0].client_uuid).toBe('failed');

    await offlineChatService.clearFailedMessages();
    const remaining = await offlineChatService.getOfflineQueue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].client_uuid).toBe('ok');
  });

  it('getOfflineQueue retourne [] en cas erreur de lecture storage', async () => {
    const originalGetItem = AsyncStorage.getItem;
    (AsyncStorage.getItem as any) = jest.fn().mockRejectedValue(new Error('storage error'));

    await expect(offlineChatService.getOfflineQueue()).resolves.toEqual([]);

    (AsyncStorage.getItem as any) = originalGetItem;
  });

  it('syncOfflineQueue marque sync_failed si la lecture du fichier media echoue', async () => {
    await AsyncStorage.setItem(
      OFFLINE_QUEUE_STORAGE_KEY,
      JSON.stringify([
        {
          client_uuid: 'media-fail',
          conversation_id: 'conv-1',
          content: 'photo',
          media_type: 'image',
          media_uri: 'file://test/missing.jpg',
          created_at: '2026-02-21T00:00:00Z',
          retry_count: 0,
        },
      ])
    );

    // Simulate file read failure
    global.fetch = jest.fn().mockRejectedValue(new Error('File not found'));

    const result = await offlineChatService.syncOfflineQueue();

    // Item should be counted as failed
    expect(result.failureCount).toBe(1);
    expect(result.errors['media-fail']).toContain('File not found');

    // Item should be marked as sync_failed in storage
    const queueAfter = await offlineChatService.getOfflineQueue();
    const failedItem = queueAfter.find((q) => q.client_uuid === 'media-fail');
    expect(failedItem?.sync_failed).toBe(true);

    // sendMessage should NOT have been called (item was aborted before send)
    expect(mockChatApi.sendMessage).not.toHaveBeenCalled();
  });

  it('syncOfflineQueue ignore les items sync_failed et ne les retente pas', async () => {
    await AsyncStorage.setItem(
      OFFLINE_QUEUE_STORAGE_KEY,
      JSON.stringify([
        {
          client_uuid: 'permanently-failed',
          conversation_id: 'conv-1',
          content: 'failed photo',
          media_type: 'image',
          media_uri: 'file://test/missing.jpg',
          created_at: '2026-02-21T00:00:00Z',
          retry_count: 0,
          sync_failed: true,
          last_error: 'File not found',
        },
      ])
    );

    const result = await offlineChatService.syncOfflineQueue();

    expect(result.failureCount).toBe(1);
    expect(result.errors['permanently-failed']).toBeTruthy();
    // sendMessage should NOT have been called
    expect(mockChatApi.sendMessage).not.toHaveBeenCalled();
  });

  it('syncOfflineQueue ne retente pas un item ayant atteint MAX_SYNC_RETRIES', async () => {
    await AsyncStorage.setItem(
      OFFLINE_QUEUE_STORAGE_KEY,
      JSON.stringify([
        {
          client_uuid: 'maxed-out',
          conversation_id: 'conv-1',
          content: 'old message',
          media_type: 'none',
          created_at: '2026-02-20T00:00:00Z',
          retry_count: MAX_SYNC_RETRIES, // exactly at limit
          last_error: 'Previous error',
        },
      ])
    );

    const result = await offlineChatService.syncOfflineQueue();

    expect(result.failureCount).toBe(1);
    expect(result.errors['maxed-out']).toContain('Max retries');
    // sendMessage should NOT be called for maxed items
    expect(mockChatApi.sendMessage).not.toHaveBeenCalled();
  });
});
