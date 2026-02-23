import {
  MAX_MESSAGE_LENGTH,
  MAX_IMAGE_SIZE_MB,
  MAX_VIDEO_SIZE_MB,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MESSAGES_PER_PAGE,
  MAX_SYNC_RETRIES,
  OFFLINE_QUEUE_STORAGE_KEY,
  AUTO_REFRESH_INTERVAL_MS,
  ACKNOWLEDGMENT_MESSAGE_PATTERN,
  MESSAGE_COLORS,
  MESSAGE_DIMENSIONS,
  TYPING_INDICATOR_DURATION,
  IMAGE_COMPRESSION_QUALITY,
  IMAGE_MAX_DIMENSIONS,
} from '../constants';

describe('features/chat/domain/constants', () => {
  it('expose les constantes metier attendues', () => {
    expect(MAX_MESSAGE_LENGTH).toBe(5000);
    expect(MAX_IMAGE_SIZE_MB).toBe(10);
    expect(MAX_VIDEO_SIZE_MB).toBe(50);
    expect(ALLOWED_IMAGE_TYPES).toContain('image/jpeg');
    expect(ALLOWED_VIDEO_TYPES).toContain('video/mp4');
    expect(MESSAGES_PER_PAGE).toBe(20);
    expect(MAX_SYNC_RETRIES).toBe(3);
    expect(OFFLINE_QUEUE_STORAGE_KEY).toContain('offline_queue');
    expect(AUTO_REFRESH_INTERVAL_MS).toBe(30000);
    expect(ACKNOWLEDGMENT_MESSAGE_PATTERN.test('Message reçu')).toBe(true);
    expect(MESSAGE_COLORS.user).toBe('#059669');
    expect(MESSAGE_DIMENSIONS.bubbleBorderRadius).toBe(16);
    expect(TYPING_INDICATOR_DURATION).toBe(3000);
    expect(IMAGE_COMPRESSION_QUALITY).toBe(0.8);
    expect(IMAGE_MAX_DIMENSIONS.width).toBe(1280);
  });
});
