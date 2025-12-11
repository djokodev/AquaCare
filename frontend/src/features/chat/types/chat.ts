/**
 * TypeScript types for Chat/Support module
 *
 * Maps to backend API responses and domain models
 */

/**
 * Message sender type
 */
export type MessageSenderType = 'user' | 'admin' | 'system';

/**
 * Media type for message attachments
 */
export type MediaType = 'none' | 'image' | 'video';

/**
 * Message model
 * Represents a single message in a conversation
 */
export interface Message {
  id: string;
  client_uuid?: string; // UUID for offline deduplication
  conversation: string; // Conversation ID
  sender_type: MessageSenderType;
  sender_name?: string; // Computed: name of sender
  content: string;
  media_type: MediaType;
  media_url?: string | null; // Full URL to media file
  is_read: boolean;
  read_at?: string | null; // ISO datetime
  created_offline: boolean;
  synced_at?: string | null; // ISO datetime
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}

/**
 * Conversation model
 * Represents the single conversation between user and administration
 */
export interface Conversation {
  id: string;
  user: string; // User ID
  user_name: string; // Computed: user's full name or phone
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
  last_message_at: string; // ISO datetime
  last_message?: string | null; // Computed: preview of last message
  message_count: number; // Computed: total messages
  unread_count_user: number; // Unread messages for user
  unread_count_admin: number; // Unread messages for admin
  is_active: boolean;
}

/**
 * Request payload for sending a message
 */
export interface SendMessageRequest {
  content: string;
  media_type?: MediaType;
  media_file?: File | { uri: string; type: string; name: string }; // React Native file object
  client_uuid?: string; // For offline deduplication
  created_offline?: boolean;
}

/**
 * Paginated response for messages
 */
export interface MessagesPaginatedResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Message[];
}

/**
 * Offline queue item for messages
 * Stored in AsyncStorage when offline
 */
export interface OfflineMessageQueueItem {
  client_uuid: string;
  conversation_id: string;
  content: string;
  media_type: MediaType;
  media_uri?: string; // Local file URI
  created_at: string; // ISO datetime
  retry_count: number;
  last_error?: string;
}

/**
 * Chat slice state in Redux store
 */
export interface ChatState {
  // Current conversation
  conversation: Conversation | null;
  conversationLoading: boolean;
  conversationError: string | null;

  // Messages
  messages: Message[];
  messagesLoading: boolean;
  messagesError: string | null;
  messagesPagination: {
    page: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };

  // Sending message
  sendingMessage: boolean;
  sendMessageError: string | null;

  // Offline queue
  offlineQueue: OfflineMessageQueueItem[];
  syncingOffline: boolean;
  syncErrors: Record<string, string>; // clientUuid -> error message
}

/**
 * Message display mode for UI
 */
export type MessageDisplayMode = 'bubble' | 'compact';

/**
 * Chat screen params for navigation
 */
export interface ChatScreenParams {
  // Could add conversation_id if supporting multiple conversations in future
}
