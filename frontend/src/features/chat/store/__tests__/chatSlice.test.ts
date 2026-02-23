import { configureStore } from '@reduxjs/toolkit';
import chatReducer, {
  addOptimisticMessage,
  removeOptimisticMessage,
  clearMessages,
  clearConversation,
  clearErrors,
  updateUnreadCount,
  addNewMessage,
  updateMessage,
  fetchConversation,
  fetchMessages,
  sendTextMessage,
  sendMediaMessage,
  markMessagesAsRead,
  syncOfflineQueue,
  loadOfflineQueue,
  refreshConversation,
  selectUnreadCount,
  selectHasUnreadMessages,
  selectOfflineQueueCount,
  selectHasPendingOfflineMessages,
} from '../chatSlice';
import * as chatApi from '../../services/api/chatApi';
import * as offlineChatService from '../../services/offline/offlineChatService';

jest.mock('../../services/api/chatApi', () => ({
  fetchConversation: jest.fn(),
  fetchMessages: jest.fn(),
  sendMessage: jest.fn(),
  sendMessageWithMedia: jest.fn(),
  markMessagesAsRead: jest.fn(),
  refreshConversation: jest.fn(),
}));

jest.mock('../../services/offline/offlineChatService', () => ({
  addToOfflineQueue: jest.fn(),
  syncOfflineQueue: jest.fn(),
  getOfflineQueue: jest.fn(),
}));

describe('features/chat/store/chatSlice', () => {
  const mockApi = chatApi as jest.Mocked<typeof chatApi>;
  const mockOffline = offlineChatService as jest.Mocked<typeof offlineChatService>;

  const conversation = {
    id: 'conv-1',
    user: 'user-1',
    user_name: 'Alice',
    created_at: '2026-02-20T08:00:00Z',
    updated_at: '2026-02-20T09:00:00Z',
    last_message_at: '2026-02-20T09:00:00Z',
    message_count: 2,
    unread_count_user: 1,
    unread_count_admin: 0,
    is_active: true,
  } as any;

  const messageA = {
    id: 'msg-1',
    client_uuid: 'uuid-1',
    conversation: 'conv-1',
    sender_type: 'user',
    content: 'Bonjour',
    media_type: 'none',
    media_url: null,
    is_read: false,
    read_at: null,
    created_offline: false,
    synced_at: null,
    created_at: '2026-02-20T09:00:00Z',
    updated_at: '2026-02-20T09:00:00Z',
  } as any;

  const createStore = () =>
    configureStore({
      reducer: { chat: chatReducer },
    });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gere les reducers synchrones', () => {
    let state = chatReducer(undefined, addOptimisticMessage(messageA));
    expect(state.messages).toHaveLength(1);

    state = chatReducer(state, addNewMessage(messageA));
    expect(state.messages).toHaveLength(1); // dedup

    const updated = { ...messageA, content: 'Salut' };
    state = chatReducer(state, updateMessage(updated));
    expect(state.messages[0].content).toBe('Salut');

    state = chatReducer(state, removeOptimisticMessage('msg-1'));
    expect(state.messages).toHaveLength(0);

    state = chatReducer(state, clearErrors());
    expect(state.conversationError).toBeNull();

    state = chatReducer(
      {
        ...state,
        conversation,
        messages: [messageA],
        offlineQueue: [{ client_uuid: 'q1' } as any],
      },
      clearConversation()
    );

    expect(state.conversation).toBeNull();
    expect(state.messages).toHaveLength(0);
    expect(state.offlineQueue).toHaveLength(0);

    state = chatReducer(
      {
        ...state,
        messages: [messageA],
        messagesPagination: { page: 3, hasNext: true, hasPrevious: true },
      },
      clearMessages()
    );

    expect(state.messages).toHaveLength(0);
    expect(state.messagesPagination.page).toBe(1);

    state = chatReducer({ ...state, conversation }, updateUnreadCount(4));
    expect(state.conversation?.unread_count_user).toBe(4);
  });

  it('fetchConversation et fetchMessages mettent a jour le state', async () => {
    const store = createStore();

    mockApi.fetchConversation.mockResolvedValueOnce(conversation as any);
    await store.dispatch(fetchConversation() as any);

    let state = store.getState().chat;
    expect(state.conversation?.id).toBe('conv-1');
    expect(state.conversationLoading).toBe(false);

    mockApi.fetchMessages.mockResolvedValueOnce({
      count: 1,
      next: null,
      previous: null,
      results: [messageA],
    } as any);

    await store.dispatch(fetchMessages({ conversationId: 'conv-1', page: 1 }) as any);

    state = store.getState().chat;
    expect(state.messages).toHaveLength(1);
    expect(state.messagesPagination.hasNext).toBe(false);
  });

  it('sendTextMessage online ajoute le message envoye', async () => {
    const store = createStore();
    mockApi.sendMessage.mockResolvedValueOnce(messageA as any);

    await store.dispatch(
      sendTextMessage({ conversationId: 'conv-1', content: 'Bonjour', isOnline: true }) as any
    );

    const state = store.getState().chat;
    expect(mockApi.sendMessage).toHaveBeenCalledWith('conv-1', {
      content: 'Bonjour',
      media_type: 'none',
      created_offline: false,
    });
    expect(state.messages).toHaveLength(1);
    expect(state.sendingMessage).toBe(false);
  });

  it('sendTextMessage offline cree un message optimiste', async () => {
    const store = createStore();
    mockOffline.addToOfflineQueue.mockResolvedValueOnce('offline-uuid-1');

    await store.dispatch(
      sendTextMessage({ conversationId: 'conv-1', content: 'Hors ligne', isOnline: false }) as any
    );

    const state = store.getState().chat;
    expect(mockOffline.addToOfflineQueue).toHaveBeenCalledWith('conv-1', 'Hors ligne', 'none');
    expect(state.messages[0].created_offline).toBe(true);
    expect(state.messages[0].id).toBe('offline-uuid-1');
  });

  it('sendTextMessage online bascule vers file offline sur erreur reseau', async () => {
    const store = createStore();
    mockApi.sendMessage.mockRejectedValueOnce(new Error('Network Error'));
    mockOffline.addToOfflineQueue.mockResolvedValueOnce('offline-network-1');

    await store.dispatch(
      sendTextMessage({ conversationId: 'conv-1', content: 'Fallback', isOnline: true }) as any
    );

    const state = store.getState().chat;
    expect(mockApi.sendMessage).toHaveBeenCalled();
    expect(mockOffline.addToOfflineQueue).toHaveBeenCalledWith('conv-1', 'Fallback', 'none');
    expect(state.messages.some((m) => m.id === 'offline-network-1')).toBe(true);
    expect(state.sendMessageError).toBeNull();
  });

  it('sendTextMessage rejected remonte une erreur detaillee', async () => {
    const store = createStore();
    mockApi.sendMessage.mockRejectedValueOnce({
      response: { data: { error: 'Message invalide' } },
      message: 'fallback',
    } as any);

    await store.dispatch(
      sendTextMessage({ conversationId: 'conv-1', content: '', isOnline: true }) as any
    );

    const state = store.getState().chat;
    expect(state.sendMessageError).toBe('Message invalide');
    expect(state.sendingMessage).toBe(false);
  });

  it('sendMediaMessage online et offline', async () => {
    const store = createStore();
    const mediaMessage = { ...messageA, id: 'msg-media-1', media_type: 'image' };

    mockApi.sendMessageWithMedia.mockResolvedValueOnce(mediaMessage as any);
    await store.dispatch(
      sendMediaMessage({
        conversationId: 'conv-1',
        content: 'Photo',
        mediaFile: { uri: 'file://img.jpg', type: 'image/jpeg', name: 'img.jpg' },
        mediaType: 'image',
        isOnline: true,
      }) as any
    );

    mockOffline.addToOfflineQueue.mockResolvedValueOnce('offline-media-1');
    await store.dispatch(
      sendMediaMessage({
        conversationId: 'conv-1',
        content: 'Photo offline',
        mediaFile: { uri: 'file://offline.jpg', type: 'image/jpeg', name: 'offline.jpg' },
        mediaType: 'image',
        isOnline: false,
      }) as any
    );

    const state = store.getState().chat;
    expect(mockApi.sendMessageWithMedia).toHaveBeenCalled();
    expect(mockOffline.addToOfflineQueue).toHaveBeenCalledWith(
      'conv-1',
      'Photo offline',
      'image',
      'file://offline.jpg'
    );
    expect(state.messages.some((m) => m.id === 'offline-media-1')).toBe(true);
  });

  it('markMessagesAsRead met les messages a read et met a jour la conversation', async () => {
    const seededStore = configureStore({
      reducer: { chat: chatReducer },
      preloadedState: {
        chat: {
          ...chatReducer(undefined, { type: '@@INIT' }),
          conversation,
          messages: [messageA],
        },
      },
    });

    mockApi.markMessagesAsRead.mockResolvedValueOnce({ ...conversation, unread_count_user: 0 } as any);
    await seededStore.dispatch(markMessagesAsRead('conv-1') as any);

    const state = seededStore.getState().chat;
    expect(state.conversation?.unread_count_user).toBe(0);
    expect(state.messages[0].is_read).toBe(true);
    expect(state.messages[0].read_at).toBeTruthy();
  });

  it('syncOfflineQueue, loadOfflineQueue et refreshConversation mettent a jour state', async () => {
    const store = createStore();

    mockOffline.syncOfflineQueue.mockResolvedValueOnce({
      successCount: 2,
      failureCount: 1,
      errors: { 'uuid-1': 'Network' },
    });
    await store.dispatch(syncOfflineQueue() as any);

    let state = store.getState().chat;
    expect(state.syncingOffline).toBe(false);
    expect(state.syncErrors).toEqual({ 'uuid-1': 'Network' });

    mockOffline.getOfflineQueue.mockResolvedValueOnce([
      { client_uuid: 'q1', conversation_id: 'conv-1', content: 'x', media_type: 'none', created_at: '2026-02-20', retry_count: 0 },
    ] as any);
    await store.dispatch(loadOfflineQueue() as any);

    state = store.getState().chat;
    expect(state.offlineQueue).toHaveLength(1);

    mockApi.refreshConversation.mockResolvedValueOnce({ ...conversation, message_count: 3 } as any);
    await store.dispatch(refreshConversation('conv-1') as any);

    state = store.getState().chat;
    expect(state.conversation?.message_count).toBe(3);
  });

  it('selectors calculent correctement les derivees', () => {
    const root = {
      chat: {
        ...chatReducer(undefined, { type: '@@INIT' }),
        conversation: { ...conversation, unread_count_user: 2 },
        offlineQueue: [{ client_uuid: 'q1' }],
      },
    } as any;

    expect(selectUnreadCount(root)).toBe(2);
    expect(selectHasUnreadMessages(root)).toBe(true);
    expect(selectOfflineQueueCount(root)).toBe(1);
    expect(selectHasPendingOfflineMessages(root)).toBe(true);
  });
});
