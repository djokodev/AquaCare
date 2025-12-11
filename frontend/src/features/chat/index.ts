/**
 * Chat feature exports
 *
 * Centralized exports for chat module following feature-based architecture
 */

// Screens
export { ChatScreen } from './screens/ChatScreen';

// Components
export { MessageBubble } from './components/MessageBubble';
export { MessageComposer } from './components/MessageComposer';

// Store
export {
  fetchConversation,
  fetchMessages,
  sendTextMessage,
  sendMediaMessage,
  markMessagesAsRead,
  syncOfflineQueue,
  loadOfflineQueue,
  selectConversation,
  selectMessages,
  selectConversationLoading,
  selectMessagesLoading,
  selectSendingMessage,
  selectConversationError,
  selectMessagesError,
  selectOfflineQueueCount,
  selectSyncingOffline,
} from './store/chatSlice';

// Types
export type {
  Message,
  Conversation,
  MessageSenderType,
  MediaType,
  SendMessageRequest,
  MessagesPaginatedResponse,
  OfflineMessageQueueItem,
  ChatState,
} from './types/chat';

// Services
export * from './services/api/chatApi';
export * from './services/offline/offlineChatService';

// Domain
export * from './domain/constants';
export * from './domain/estimators';
