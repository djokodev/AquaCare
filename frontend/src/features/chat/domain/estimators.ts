/**
 * Chat domain estimators
 *
 * Pure functions for estimating media upload times and validating inputs
 * UX-only estimations, no business logic
 */

import {
  MAX_MESSAGE_LENGTH,
  MAX_IMAGE_SIZE_MB,
  MAX_VIDEO_SIZE_MB,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
} from './constants';

/**
 * Validation result for media files
 */
export interface MediaValidationResult {
  isValid: boolean;
  errorKey?: string; // i18n key for error message
  errorParams?: Record<string, string | number>;
}

/**
 * Upload estimation result
 */
export interface UploadEstimation {
  estimatedSeconds: number;
  isLarge: boolean; // Should warn user about large file
  canUpload: boolean;
}

/**
 * Validate message content length
 *
 * @param content - Message text content
 * @returns Validation result
 */
export function validateMessageContent(content: string): MediaValidationResult {
  if (!content || content.trim().length === 0) {
    return {
      isValid: false,
      errorKey: 'chatMessageEmpty',
    };
  }

  if (content.length > MAX_MESSAGE_LENGTH) {
    return {
      isValid: false,
      errorKey: 'chatMessageTooLong',
      errorParams: { length: MAX_MESSAGE_LENGTH },
    };
  }

  return { isValid: true };
}

/**
 * Validate image file
 *
 * @param fileSizeMB - File size in megabytes
 * @param mimeType - File MIME type
 * @returns Validation result
 */
export function validateImageFile(
  fileSizeMB: number,
  mimeType: string
): MediaValidationResult {
  // Check file size
  if (fileSizeMB > MAX_IMAGE_SIZE_MB) {
    return {
      isValid: false,
      errorKey: 'chatMediaImageTooLarge',
      errorParams: { size: MAX_IMAGE_SIZE_MB },
    };
  }

  // Check MIME type
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType as any)) {
    return {
      isValid: false,
      errorKey: 'chatMediaImageInvalidFormat',
    };
  }

  return { isValid: true };
}

/**
 * Validate video file
 *
 * @param fileSizeMB - File size in megabytes
 * @param mimeType - File MIME type
 * @returns Validation result
 */
export function validateVideoFile(
  fileSizeMB: number,
  mimeType: string
): MediaValidationResult {
  // Check file size
  if (fileSizeMB > MAX_VIDEO_SIZE_MB) {
    return {
      isValid: false,
      errorKey: 'chatMediaVideoTooLarge',
      errorParams: { size: MAX_VIDEO_SIZE_MB },
    };
  }

  // Check MIME type
  if (!ALLOWED_VIDEO_TYPES.includes(mimeType as any)) {
    return {
      isValid: false,
      errorKey: 'chatMediaVideoInvalidFormat',
    };
  }

  return { isValid: true };
}

/**
 * Estimate media upload time (UX only, rough estimation)
 *
 * Assumes average mobile data speed in rural Cameroon: 1-2 Mbps
 * Conservative estimation to avoid user frustration
 *
 * @param fileSizeMB - File size in megabytes
 * @returns Upload estimation
 */
export function estimateMediaUploadTime(fileSizeMB: number): UploadEstimation {
  // Assume 1 Mbps average speed (conservative for rural areas)
  const speedMbps = 1;
  const fileSizeMb = fileSizeMB * 8; // Convert MB to Megabits
  const estimatedSeconds = Math.ceil(fileSizeMb / speedMbps);

  return {
    estimatedSeconds,
    isLarge: estimatedSeconds > 30, // Warn if > 30 seconds
    canUpload: estimatedSeconds < 180, // Max 3 minutes
  };
}

/**
 * Format upload time for display
 *
 * @param seconds - Estimated upload time in seconds
 * @returns Formatted string (e.g., "1m 30s", "45s")
 */
export function formatUploadTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return `${minutes}m`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Get file size in MB from bytes
 *
 * @param bytes - File size in bytes
 * @returns Size in MB (rounded to 2 decimals)
 */
export function bytesToMB(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

/**
 * Check if message is a system acknowledgment
 *
 * @param content - Message content
 * @returns True if message is an acknowledgment
 */
export function isAcknowledgmentMessage(content: string): boolean {
  return /reçu|received/i.test(content);
}

/**
 * Truncate message content for preview
 *
 * @param content - Full message content
 * @param maxLength - Maximum length for preview (default: 100)
 * @returns Truncated content with ellipsis
 */
export function truncateMessageContent(
  content: string,
  maxLength: number = 100
): string {
  if (content.length <= maxLength) {
    return content;
  }

  return content.substring(0, maxLength) + '...';
}
