import {
  validateMessageContent,
  validateImageFile,
  validateVideoFile,
  estimateMediaUploadTime,
  formatUploadTime,
  bytesToMB,
  isAcknowledgmentMessage,
  truncateMessageContent,
} from '../estimators';

describe('features/chat/domain/estimators', () => {
  it('validateMessageContent valide contenu vide, long et valide', () => {
    expect(validateMessageContent('').isValid).toBe(false);
    expect(validateMessageContent('x'.repeat(5001)).isValid).toBe(false);
    expect(validateMessageContent('Bonjour').isValid).toBe(true);
  });

  it('validateImageFile controle taille et format', () => {
    expect(validateImageFile(11, 'image/jpeg')).toEqual(
      expect.objectContaining({
        isValid: false,
        errorKey: 'chatMediaImageTooLarge',
        errorParams: { size: 10 },
      })
    );
    expect(validateImageFile(2, 'image/gif')).toEqual(
      expect.objectContaining({ isValid: false, errorKey: 'chatMediaImageInvalidFormat' })
    );
    expect(validateImageFile(2, 'image/png').isValid).toBe(true);
  });

  it('validateVideoFile controle taille et format', () => {
    expect(validateVideoFile(51, 'video/mp4')).toEqual(
      expect.objectContaining({
        isValid: false,
        errorKey: 'chatMediaVideoTooLarge',
        errorParams: { size: 50 },
      })
    );
    expect(validateVideoFile(8, 'video/avi')).toEqual(
      expect.objectContaining({ isValid: false, errorKey: 'chatMediaVideoInvalidFormat' })
    );
    expect(validateVideoFile(8, 'video/quicktime').isValid).toBe(true);
  });

  it('estimateMediaUploadTime et formatUploadTime', () => {
    const shortUpload = estimateMediaUploadTime(1);
    expect(shortUpload.estimatedSeconds).toBe(8);
    expect(shortUpload.isLarge).toBe(false);
    expect(shortUpload.canUpload).toBe(true);

    const largeUpload = estimateMediaUploadTime(25);
    expect(largeUpload.isLarge).toBe(true);
    expect(largeUpload.canUpload).toBe(false);

    expect(formatUploadTime(45)).toBe('45s');
    expect(formatUploadTime(120)).toBe('2m');
    expect(formatUploadTime(130)).toBe('2m 10s');
  });

  it('bytesToMB, isAcknowledgmentMessage et truncateMessageContent', () => {
    expect(bytesToMB(1048576)).toBe(1);
    expect(bytesToMB(1572864)).toBe(1.5);

    expect(isAcknowledgmentMessage('Message reçu, merci')).toBe(true);
    expect(isAcknowledgmentMessage('Message received')).toBe(true);
    expect(isAcknowledgmentMessage('Hello world')).toBe(false);

    expect(truncateMessageContent('short', 10)).toBe('short');
    expect(truncateMessageContent('12345678901', 10)).toBe('1234567890...');
  });
});
