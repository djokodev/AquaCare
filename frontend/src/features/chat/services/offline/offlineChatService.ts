/**
 * Offline chat service
 *
 * Manages offline message queue in AsyncStorage
 * Handles sync when connection restored
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import type { OfflineMessageQueueItem, SendMessageRequest } from '../../types/chat';
import {
  OFFLINE_QUEUE_STORAGE_KEY,
  MAX_SYNC_RETRIES,
} from '../../domain/constants';
import * as chatApi from '../api/chatApi';

/**
 * Add message to offline queue
 *
 * @param conversationId - Conversation UUID
 * @param content - Message content
 * @param mediaType - Media type ('none', 'image', 'video')
 * @param mediaUri - Optional local file URI
 * @returns Client UUID for deduplication
 */
export async function addToOfflineQueue(
  conversationId: string,
  content: string,
  mediaType: 'none' | 'image' | 'video' = 'none',
  mediaUri?: string
): Promise<string> {
  const clientUuid = uuidv4();

  const queueItem: OfflineMessageQueueItem = {
    client_uuid: clientUuid,
    conversation_id: conversationId,
    content,
    media_type: mediaType,
    media_uri: mediaUri,
    created_at: new Date().toISOString(),
    retry_count: 0,
  };

  // Get existing queue
  const queue = await getOfflineQueue();

  // Add new item
  queue.push(queueItem);

  // Save updated queue
  await AsyncStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(queue));

  return clientUuid;
}

/**
 * Get offline message queue
 *
 * @returns Array of pending offline messages
 */
export async function getOfflineQueue(): Promise<OfflineMessageQueueItem[]> {
  try {
    const queueJson = await AsyncStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);

    if (!queueJson) {
      return [];
    }

    return JSON.parse(queueJson);
  } catch (error) {
    console.error('Error reading offline queue:', error);
    return [];
  }
}

/**
 * Remove message from offline queue
 *
 * @param clientUuid - Client UUID of message to remove
 */
export async function removeFromOfflineQueue(clientUuid: string): Promise<void> {
  const queue = await getOfflineQueue();

  const updatedQueue = queue.filter((item) => item.client_uuid !== clientUuid);

  await AsyncStorage.setItem(
    OFFLINE_QUEUE_STORAGE_KEY,
    JSON.stringify(updatedQueue)
  );
}

/**
 * Clear entire offline queue
 */
export async function clearOfflineQueue(): Promise<void> {
  await AsyncStorage.removeItem(OFFLINE_QUEUE_STORAGE_KEY);
}

/**
 * Increment retry count for a queue item
 *
 * @param clientUuid - Client UUID of message
 * @param error - Error message
 */
async function incrementRetryCount(
  clientUuid: string,
  error: string
): Promise<void> {
  const queue = await getOfflineQueue();

  const updatedQueue = queue.map((item) => {
    if (item.client_uuid === clientUuid) {
      return {
        ...item,
        retry_count: item.retry_count + 1,
        last_error: error,
      };
    }
    return item;
  });

  await AsyncStorage.setItem(
    OFFLINE_QUEUE_STORAGE_KEY,
    JSON.stringify(updatedQueue)
  );
}

/**
 * Sync offline queue with backend
 *
 * Attempts to send all pending offline messages
 * Uses UUID deduplication to prevent duplicates
 *
 * @returns Object with success/failure counts and errors
 */
export async function syncOfflineQueue(): Promise<{
  successCount: number;
  failureCount: number;
  errors: Record<string, string>;
}> {
  const queue = await getOfflineQueue();

  let successCount = 0;
  let failureCount = 0;
  const errors: Record<string, string> = {};

  // Process each queued message
  for (const item of queue) {
    try {
      // Skip if max retries exceeded
      if (item.retry_count >= MAX_SYNC_RETRIES) {
        errors[item.client_uuid] = `Max retries (${MAX_SYNC_RETRIES}) exceeded`;
        failureCount++;
        continue;
      }

      // Prepare message request
      const request: SendMessageRequest = {
        content: item.content,
        media_type: item.media_type,
        client_uuid: item.client_uuid,
        created_offline: true,
      };

      // Handle media file if present
      if (item.media_uri && item.media_type !== 'none') {
        // Convert local URI to File object
        // Note: In React Native, we need to use fetch API or library
        // to read the file from URI
        try {
          const fileResponse = await fetch(item.media_uri);
          const blob = await fileResponse.blob();
          const fileName = item.media_uri.split('/').pop() || 'media';

          // Create File-like object
          request.media_file = {
            uri: item.media_uri,
            type: blob.type,
            name: fileName,
          } as any;
        } catch (fileError) {
          console.warn(
            `Could not read media file for ${item.client_uuid}:`,
            fileError
          );
          // Continue without media - send text only
        }
      }

      // Send message
      await chatApi.sendMessage(item.conversation_id, request);

      // Success - remove from queue
      await removeFromOfflineQueue(item.client_uuid);
      successCount++;
    } catch (error: any) {
      // Failure - increment retry count
      const errorMessage = error?.response?.data?.error || error?.message || 'Unknown error';

      await incrementRetryCount(item.client_uuid, errorMessage);
      errors[item.client_uuid] = errorMessage;
      failureCount++;
    }
  }

  return { successCount, failureCount, errors };
}

/**
 * Get count of pending offline messages
 *
 * @returns Number of messages waiting to sync
 */
export async function getOfflineQueueCount(): Promise<number> {
  const queue = await getOfflineQueue();
  return queue.length;
}

/**
 * Check if offline queue is empty
 *
 * @returns True if no pending messages
 */
export async function isOfflineQueueEmpty(): Promise<boolean> {
  const count = await getOfflineQueueCount();
  return count === 0;
}

/**
 * Get failed messages (exceeded max retries)
 *
 * @returns Array of failed queue items
 */
export async function getFailedMessages(): Promise<OfflineMessageQueueItem[]> {
  const queue = await getOfflineQueue();
  return queue.filter((item) => item.retry_count >= MAX_SYNC_RETRIES);
}

/**
 * Remove all failed messages from queue
 *
 * Useful to clean up after user acknowledges failures
 */
export async function clearFailedMessages(): Promise<void> {
  const queue = await getOfflineQueue();

  const activeQueue = queue.filter(
    (item) => item.retry_count < MAX_SYNC_RETRIES
  );

  await AsyncStorage.setItem(
    OFFLINE_QUEUE_STORAGE_KEY,
    JSON.stringify(activeQueue)
  );
}
