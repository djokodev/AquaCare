/**
 * Business constants for Chat/Support module
 *
 * Aligned with backend domain rules
 */

/**
 * Maximum message content length (characters)
 * Backend validation: 5000 chars max
 */
export const MAX_MESSAGE_LENGTH = 5000;

/**
 * Maximum image file size in MB
 * Backend validation: 10MB max for images
 */
export const MAX_IMAGE_SIZE_MB = 10;

/**
 * Maximum video file size in MB
 * Backend validation: 50MB max for videos
 */
export const MAX_VIDEO_SIZE_MB = 50;

/**
 * Allowed image MIME types
 * Must match backend MediaAttachment validation
 */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

/**
 * Allowed video MIME types
 * Must match backend MediaAttachment validation
 */
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime'] as const;

/**
 * Messages per page for pagination
 */
export const MESSAGES_PER_PAGE = 20;

/**
 * Offline sync retry attempts
 */
export const MAX_SYNC_RETRIES = 3;

/**
 * Offline queue AsyncStorage key
 */
export const OFFLINE_QUEUE_STORAGE_KEY = '@aquacare_chat_offline_queue';

/**
 * Auto-refresh interval for new messages (milliseconds)
 * Poll for new messages every 30 seconds when screen is active
 */
export const AUTO_REFRESH_INTERVAL_MS = 30000;

/**
 * Acknowledgment message pattern for detection
 * Used to identify system acknowledgment messages
 */
export const ACKNOWLEDGMENT_MESSAGE_PATTERN = /reçu|received/i;

/**
 * Message bubble colors (MAVECAM design system)
 */
export const MESSAGE_COLORS = {
  user: '#059669', // GREEN_PRIMARY - user messages
  admin: '#ffffff', // WHITE - admin messages with border
  system: '#f8fafc', // CREAM - system messages
  userText: '#ffffff', // WHITE - text in user bubbles
  adminText: '#1e293b', // GRAY_DARK - text in admin bubbles
  systemText: '#64748b', // GRAY_LIGHT - text in system bubbles
  adminBorder: '#64748b', // GRAY_LIGHT - border for admin bubbles
  systemBorder: '#cbd5e1', // Light gray - border for system bubbles
} as const;

/**
 * Message bubble maximum width as a percentage string (React Native DimensionValue)
 */
export const BUBBLE_MAX_WIDTH = '80%' as const;

/**
 * Message bubble numeric dimensions (pixels / dp)
 */
export const MESSAGE_DIMENSIONS = {
  bubbleBorderRadius: 16,
  bubblePadding: 12,
  bubbleMarginVertical: 6,
  avatarSize: 32,
  mediaBorderRadius: 12,
  mediaMaxWidth: 300,
  mediaMaxHeight: 400,
} as const;

/**
 * Typing indicator display duration (milliseconds)
 */
export const TYPING_INDICATOR_DURATION = 3000;

/**
 * Media compression quality for images (0-1)
 * Balance between quality and file size
 */
export const IMAGE_COMPRESSION_QUALITY = 0.8;

/**
 * Maximum image dimensions for compression (pixels)
 * Reduces bandwidth for rural Cameroon users
 */
export const IMAGE_MAX_DIMENSIONS = {
  width: 1280,
  height: 720,
} as const;
