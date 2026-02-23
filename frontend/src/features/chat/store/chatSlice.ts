/**
 * Chat Redux Slice
 *
 * State management for support chat module
 * Handles conversation, messages, offline queue, and sync
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '@/store/store';
import type {
  Conversation,
  Message,
  ChatState,
  SendMessageRequest,
  OfflineMessageQueueItem,
  MessagesPaginatedResponse,
} from '../types/chat';
import * as chatApi from '../services/api/chatApi';
import * as offlineChatService from '../services/offline/offlineChatService';

/**
 * Initial state
 */
const initialState: ChatState = {
  conversation: null,
  conversationLoading: false,
  conversationError: null,
  messages: [],
  messagesLoading: false,
  messagesError: null,
  messagesPagination: {
    page: 1,
    hasNext: false,
    hasPrevious: false,
  },
  sendingMessage: false,
  sendMessageError: null,
  offlineQueue: [],
  syncingOffline: false,
  syncErrors: {},
};

const ERROR_KEYS = {
  fetchConversation: 'chatFetchConversationError',
  fetchMessages: 'chatFetchMessagesError',
  sendMessage: 'chatSendErrorGeneric',
  sendMediaMessage: 'chatSendErrorGeneric',
  markRead: 'chatMarkReadError',
  syncOffline: 'chatSyncOfflineError',
  loadOfflineQueue: 'chatLoadOfflineQueueError',
  refreshConversation: 'chatRefreshConversationError',
} as const;

function getApiErrorMessage(error: any, fallbackKey: string): string {
  const apiError = error?.response?.data?.error;
  if (typeof apiError === 'string' && apiError.trim().length > 0) {
    return apiError;
  }
  return fallbackKey;
}

function isNetworkLikeError(error: any): boolean {
  return !error?.response;
}

function buildOptimisticMessage(params: {
  clientUuid: string;
  conversationId: string;
  content: string;
  mediaType: 'none' | 'image' | 'video';
  mediaUrl?: string | null;
}): Message {
  return {
    id: params.clientUuid,
    client_uuid: params.clientUuid,
    conversation: params.conversationId,
    sender_type: 'user',
    content: params.content,
    media_type: params.mediaType,
    media_url: params.mediaUrl ?? null,
    is_read: false,
    read_at: null,
    created_offline: true,
    synced_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Fetch or create user's conversation with administration
 */
export const fetchConversation = createAsyncThunk<Conversation, void>(
  'chat/fetchConversation',
  async () => {
    return await chatApi.fetchConversation();
  }
);

/**
 * Fetch messages for conversation (paginated)
 *
 * @param page - Page number (1-indexed)
 */
export const fetchMessages = createAsyncThunk<
  MessagesPaginatedResponse,
  { conversationId: string; page?: number }
>('chat/fetchMessages', async ({ conversationId, page = 1 }) => {
  return await chatApi.fetchMessages(conversationId, page);
});

/**
 * Send text message (online or add to offline queue)
 *
 * @param conversationId - Conversation UUID or 'auto' to auto-create
 * @param content - Message text content
 * @param isOnline - Whether device is online
 */
export const sendTextMessage = createAsyncThunk<
  Message,
  { conversationId: string; content: string; isOnline: boolean },
  { rejectValue: string }
>('chat/sendTextMessage', async ({ conversationId, content, isOnline }, { rejectWithValue }) => {
  const enqueueOfflineText = async (): Promise<Message> => {
    const clientUuid = await offlineChatService.addToOfflineQueue(
      conversationId,
      content,
      'none'
    );

    return buildOptimisticMessage({
      clientUuid,
      conversationId,
      content,
      mediaType: 'none',
    });
  };

  try {
    if (isOnline) {
      // Online - send immediately
      const request: SendMessageRequest = {
        content,
        media_type: 'none',
        created_offline: false,
      };

      return await chatApi.sendMessage(conversationId, request);
    } else {
      return await enqueueOfflineText();
    }
  } catch (error: any) {
    if (isOnline && isNetworkLikeError(error)) {
      try {
        return await enqueueOfflineText();
      } catch (offlineError: any) {
        return rejectWithValue(getApiErrorMessage(offlineError, ERROR_KEYS.sendMessage));
      }
    }
    return rejectWithValue(getApiErrorMessage(error, ERROR_KEYS.sendMessage));
  }
});

/**
 * Send message with media attachment (image or video)
 *
 * @param conversationId - Conversation UUID
 * @param content - Message text content
 * @param mediaFile - File object
 * @param mediaType - Media type ('image' or 'video')
 * @param isOnline - Whether device is online
 */
export const sendMediaMessage = createAsyncThunk<
  Message,
  {
    conversationId: string;
    content: string;
    mediaFile: File | { uri: string; type: string; name: string };
    mediaType: 'image' | 'video';
    isOnline: boolean;
  },
  { rejectValue: string }
>(
  'chat/sendMediaMessage',
  async ({ conversationId, content, mediaFile, mediaType, isOnline }, { rejectWithValue }) => {
    const enqueueOfflineMedia = async (): Promise<Message> => {
      const mediaUri = 'uri' in mediaFile ? mediaFile.uri : '';
      const clientUuid = await offlineChatService.addToOfflineQueue(
        conversationId,
        content,
        mediaType,
        mediaUri
      );

      return buildOptimisticMessage({
        clientUuid,
        conversationId,
        content,
        mediaType,
        mediaUrl: mediaUri || null,
      });
    };

    try {
      if (isOnline) {
        // Online - send immediately
        return await chatApi.sendMessageWithMedia(
          conversationId,
          content,
          mediaFile,
          mediaType
        );
      } else {
        return await enqueueOfflineMedia();
      }
    } catch (error: any) {
      if (isOnline && isNetworkLikeError(error)) {
        try {
          return await enqueueOfflineMedia();
        } catch (offlineError: any) {
          return rejectWithValue(
            getApiErrorMessage(offlineError, ERROR_KEYS.sendMediaMessage)
          );
        }
      }
      return rejectWithValue(getApiErrorMessage(error, ERROR_KEYS.sendMediaMessage));
    }
  }
);

/**
 * Mark messages as read
 *
 * @param conversationId - Conversation UUID
 */
export const markMessagesAsRead = createAsyncThunk<Conversation, string>(
  'chat/markMessagesAsRead',
  async (conversationId) => {
    return await chatApi.markMessagesAsRead(conversationId);
  }
);

/**
 * Sync offline queue with backend
 *
 * Attempts to send all pending offline messages
 */
export const syncOfflineQueue = createAsyncThunk<
  { successCount: number; failureCount: number; errors: Record<string, string> },
  void
>('chat/syncOfflineQueue', async () => {
  return await offlineChatService.syncOfflineQueue();
});

/**
 * Load offline queue from AsyncStorage
 *
 * Called on app start to restore pending messages
 */
export const loadOfflineQueue = createAsyncThunk<OfflineMessageQueueItem[], void>(
  'chat/loadOfflineQueue',
  async () => {
    return await offlineChatService.getOfflineQueue();
  }
);

/**
 * Refresh conversation to get latest state
 *
 * @param conversationId - Conversation UUID
 */
export const refreshConversation = createAsyncThunk<Conversation, string>(
  'chat/refreshConversation',
  async (conversationId) => {
    return await chatApi.refreshConversation(conversationId);
  }
);

/**
 * Chat slice
 */
const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    /**
     * Add optimistic message to state (for offline mode)
     */
    addOptimisticMessage(state, action: PayloadAction<Message>) {
      state.messages.push(action.payload);
    },

    /**
     * Remove optimistic message (after sync success or failure)
     */
    removeOptimisticMessage(state, action: PayloadAction<string>) {
      state.messages = state.messages.filter((msg) => msg.id !== action.payload);
    },

    /**
     * Clear all messages (e.g., on logout)
     */
    clearMessages(state) {
      state.messages = [];
      state.messagesPagination = {
        page: 1,
        hasNext: false,
        hasPrevious: false,
      };
    },

    /**
     * Clear conversation (e.g., on logout)
     */
    clearConversation(state) {
      state.conversation = null;
      state.messages = [];
      state.offlineQueue = [];
      state.conversationError = null;
      state.messagesError = null;
      state.sendMessageError = null;
    },

    /**
     * Clear errors
     */
    clearErrors(state) {
      state.conversationError = null;
      state.messagesError = null;
      state.sendMessageError = null;
    },

    /**
     * Update conversation unread count locally
     */
    updateUnreadCount(state, action: PayloadAction<number>) {
      if (state.conversation) {
        state.conversation.unread_count_user = action.payload;
      }
    },

    /**
     * Add new message to state (e.g., from WebSocket or polling)
     */
    addNewMessage(state, action: PayloadAction<Message>) {
      // Check if message already exists (prevent duplicates)
      const exists = state.messages.some((msg) => msg.id === action.payload.id);
      if (!exists) {
        state.messages.push(action.payload);
      }
    },

    /**
     * Update message in state (e.g., mark as read)
     */
    updateMessage(state, action: PayloadAction<Message>) {
      const index = state.messages.findIndex((msg) => msg.id === action.payload.id);
      if (index !== -1) {
        state.messages[index] = action.payload;
      }
    },
  },
  extraReducers: (builder) => {
    // Fetch conversation
    builder
      .addCase(fetchConversation.pending, (state) => {
        state.conversationLoading = true;
        state.conversationError = null;
      })
      .addCase(fetchConversation.fulfilled, (state, action) => {
        state.conversationLoading = false;
        state.conversation = action.payload;
      })
      .addCase(fetchConversation.rejected, (state) => {
        state.conversationLoading = false;
        state.conversationError = ERROR_KEYS.fetchConversation;
      });

    // Fetch messages
    builder
      .addCase(fetchMessages.pending, (state) => {
        state.messagesLoading = true;
        state.messagesError = null;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.messagesLoading = false;
        state.messages = action.payload.results;
        state.messagesPagination = {
          page: state.messagesPagination.page,
          hasNext: action.payload.next !== null,
          hasPrevious: action.payload.previous !== null,
        };
      })
      .addCase(fetchMessages.rejected, (state) => {
        state.messagesLoading = false;
        state.messagesError = ERROR_KEYS.fetchMessages;
      });

    // Send text message
    builder
      .addCase(sendTextMessage.pending, (state) => {
        state.sendingMessage = true;
        state.sendMessageError = null;
      })
      .addCase(sendTextMessage.fulfilled, (state, action) => {
        state.sendingMessage = false;
        // Add message to state if not already present
        const exists = state.messages.some((msg) => msg.id === action.payload.id);
        if (!exists) {
          state.messages.push(action.payload);
        }
      })
      .addCase(sendTextMessage.rejected, (state, action) => {
        state.sendingMessage = false;
        state.sendMessageError = action.payload || ERROR_KEYS.sendMessage;
      });

    // Send media message
    builder
      .addCase(sendMediaMessage.pending, (state) => {
        state.sendingMessage = true;
        state.sendMessageError = null;
      })
      .addCase(sendMediaMessage.fulfilled, (state, action) => {
        state.sendingMessage = false;
        const exists = state.messages.some((msg) => msg.id === action.payload.id);
        if (!exists) {
          state.messages.push(action.payload);
        }
      })
      .addCase(sendMediaMessage.rejected, (state, action) => {
        state.sendingMessage = false;
        state.sendMessageError = action.payload || ERROR_KEYS.sendMediaMessage;
      });

    // Mark messages as read
    builder
      .addCase(markMessagesAsRead.fulfilled, (state, action) => {
        // Update conversation with new unread count
        state.conversation = action.payload;

        // Mark all messages as read in state
        state.messages = state.messages.map((msg) => ({
          ...msg,
          is_read: true,
          read_at: msg.read_at || new Date().toISOString(),
        }));
      })
      .addCase(markMessagesAsRead.rejected, (state) => {
        state.messagesError = ERROR_KEYS.markRead;
      });

    // Sync offline queue
    builder
      .addCase(syncOfflineQueue.pending, (state) => {
        state.syncingOffline = true;
        state.syncErrors = {};
      })
      .addCase(syncOfflineQueue.fulfilled, (state, action) => {
        state.syncingOffline = false;
        state.syncErrors = action.payload.errors;

        // Remove successfully synced messages from offline queue
        // (Backend handles actual removal via offlineChatService)
        // Load fresh queue after sync
      })
      .addCase(syncOfflineQueue.rejected, (state) => {
        state.syncingOffline = false;
        state.messagesError = ERROR_KEYS.syncOffline;
      });

    // Load offline queue
    builder
      .addCase(loadOfflineQueue.fulfilled, (state, action) => {
        state.offlineQueue = action.payload;
      })
      .addCase(loadOfflineQueue.rejected, (state) => {
        state.messagesError = ERROR_KEYS.loadOfflineQueue;
      });

    // Refresh conversation
    builder
      .addCase(refreshConversation.fulfilled, (state, action) => {
        state.conversation = action.payload;
      })
      .addCase(refreshConversation.rejected, (state) => {
        state.conversationError = ERROR_KEYS.refreshConversation;
      });
  },
});

/**
 * Actions
 */
export const {
  addOptimisticMessage,
  removeOptimisticMessage,
  clearMessages,
  clearConversation,
  clearErrors,
  updateUnreadCount,
  addNewMessage,
  updateMessage,
} = chatSlice.actions;

/**
 * Selectors
 */
export const selectConversation = (state: RootState) => state.chat.conversation;
export const selectMessages = (state: RootState) => state.chat.messages;
export const selectOfflineQueue = (state: RootState) => state.chat.offlineQueue;
export const selectConversationLoading = (state: RootState) => state.chat.conversationLoading;
export const selectMessagesLoading = (state: RootState) => state.chat.messagesLoading;
export const selectSendingMessage = (state: RootState) => state.chat.sendingMessage;
export const selectSyncingOffline = (state: RootState) => state.chat.syncingOffline;
export const selectConversationError = (state: RootState) => state.chat.conversationError;
export const selectMessagesError = (state: RootState) => state.chat.messagesError;
export const selectSendMessageError = (state: RootState) => state.chat.sendMessageError;
export const selectMessagesPagination = (state: RootState) => state.chat.messagesPagination;
export const selectSyncErrors = (state: RootState) => state.chat.syncErrors;

/**
 * Computed selectors
 */
export const selectUnreadCount = (state: RootState) =>
  state.chat.conversation?.unread_count_user || 0;

export const selectHasUnreadMessages = (state: RootState) =>
  (state.chat.conversation?.unread_count_user || 0) > 0;

export const selectOfflineQueueCount = (state: RootState) => state.chat.offlineQueue.length;

export const selectHasPendingOfflineMessages = (state: RootState) =>
  state.chat.offlineQueue.length > 0;

/**
 * Export reducer
 */
export default chatSlice.reducer;
