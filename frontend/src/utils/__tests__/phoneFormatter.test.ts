import { formatCameroonPhone } from '../phoneFormatter';

describe('formatCameroonPhone', () => {
  it('returns empty string for empty input', () => {
    expect(formatCameroonPhone('')).toBe('');
  });

  it('prepends +237 for 9-digit input', () => {
    expect(formatCameroonPhone('652260368')).toBe('+237652260368');
  });

  it('handles 12-digit input starting with 237', () => {
    expect(formatCameroonPhone('237652260368')).toBe('+237652260368');
  });

  it('handles 13-digit input starting with 237', () => {
    expect(formatCameroonPhone('2376522603680')).toBe('+2376522603680');
  });

  it('returns already-formatted +237 number unchanged (passes through raw value)', () => {
    // +237652260368 → digits = 237652260368 (12 digits starting with 237) → +237652260368
    expect(formatCameroonPhone('+237652260368')).toBe('+237652260368');
  });

  it('returns raw value for unrecognized format', () => {
    // e.g. 10 digits not starting with 237
    const raw = '1234567890';
    expect(formatCameroonPhone(raw)).toBe(raw);
  });
});
