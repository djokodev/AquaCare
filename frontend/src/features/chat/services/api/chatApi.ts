/**
 * Chat API service
 *
 * HTTP client for chat/support endpoints
 * Handles all communication with backend REST API
 */

import { apiService as api } from '@/services/api';
import type {
  Conversation,
  Message,
  MessagesPaginatedResponse,
  ReactNativeFile,
  SendMessageRequest,
} from '../../types/chat';

/**
 * Base chat API URL (relative to API_CONFIG.baseURL)
 */
const CHAT_BASE_URL = '/support';

/**
 * Get or create user's conversation with administration
 *
 * Uses the /me/ endpoint which automatically creates conversation if it doesn't exist.
 *
 * @returns User's conversation (always exists after this call)
 */
export async function fetchConversation(): Promise<Conversation> {
  const response = await api.get<Conversation>(
    `${CHAT_BASE_URL}/conversations/me/`
  );

  return response.data;
}

/**
 * Get conversation by ID
 *
 * @param conversationId - Conversation UUID
 * @returns Conversation details
 */
export async function fetchConversationById(
  conversationId: string
): Promise<Conversation> {
  const response = await api.get<Conversation>(
    `${CHAT_BASE_URL}/conversations/${conversationId}/`
  );

  return response.data;
}

/**
 * Get messages for a conversation (paginated)
 *
 * @param conversationId - Conversation UUID
 * @param page - Page number (1-indexed)
 * @returns Paginated messages response
 */
export async function fetchMessages(
  conversationId: string,
  page: number = 1
): Promise<MessagesPaginatedResponse> {
  const response = await api.get<MessagesPaginatedResponse>(
    `${CHAT_BASE_URL}/conversations/${conversationId}/messages/`,
    {
      params: { page },
    }
  );

  return response.data;
}

/**
 * Send a text message
 *
 * @param conversationId - Conversation UUID (or 'auto' to auto-create)
 * @param request - Message content and metadata
 * @returns Created message
 */
export async function sendMessage(
  conversationId: string,
  request: SendMessageRequest
): Promise<Message> {
  // Conversation ID is always valid (obtained via fetchConversation which calls /me/)
  // No need for "auto" logic anymore

  // Prepare form data (for text or multipart with media)
  const formData = new FormData();
  formData.append('content', request.content);

  if (request.media_type && request.media_type !== 'none') {
    formData.append('media_type', request.media_type);
  }

  if (request.media_file) {
    // React Native requires the file to be appended as a plain object (not a Blob).
    // FormData.append typing expects string | Blob, but RN's FormData accepts ReactNativeFile.
    formData.append('media_file', request.media_file as unknown as Blob);
  }

  if (request.client_uuid) {
    formData.append('client_uuid', request.client_uuid);
  }

  if (request.created_offline !== undefined) {
    formData.append('created_offline', String(request.created_offline));
  }

  const response = await api.post<Message>(
    `${CHAT_BASE_URL}/conversations/${conversationId}/send_message/`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  return response.data;
}

/**
 * Send a message with media attachment
 *
 * @param conversationId - Conversation UUID
 * @param content - Message text content
 * @param mediaFile - File object (image or video)
 * @param mediaType - Media type ('image' or 'video')
 * @param clientUuid - Optional UUID for offline deduplication
 * @returns Created message
 */
export async function sendMessageWithMedia(
  conversationId: string,
  content: string,
  mediaFile: File | ReactNativeFile,
  mediaType: 'image' | 'video',
  clientUuid?: string
): Promise<Message> {
  return sendMessage(conversationId, {
    content,
    media_file: mediaFile,
    media_type: mediaType,
    client_uuid: clientUuid,
    created_offline: false,
  });
}

/**
 * Mark messages as read
 *
 * Marks all unread admin/system messages as read
 *
 * @param conversationId - Conversation UUID
 * @returns Updated conversation with reset unread count
 */
export async function markMessagesAsRead(
  conversationId: string
): Promise<Conversation> {
  const response = await api.post<Conversation>(
    `${CHAT_BASE_URL}/conversations/${conversationId}/mark_read/`
  );

  return response.data;
}

/**
 * Refresh conversation to get latest state
 *
 * @param conversationId - Conversation UUID
 * @returns Updated conversation
 */
export async function refreshConversation(
  conversationId: string
): Promise<Conversation> {
  return fetchConversationById(conversationId);
}

/**
 * Check if conversation exists for current user
 *
 * @returns True if conversation exists
 */
export async function conversationExists(): Promise<boolean> {
  try {
    await fetchConversation();
    return true;
  } catch (error) {
    return false;
  }
}
