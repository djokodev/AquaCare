import { formatCompactEmail } from '../accountProfilePresentation';

describe('formatCompactEmail', () => {
  it('shortens a long local part and keeps the domain', () => {
    expect(formatCompactEmail('djoko.dev.pro@gmail.com')).toBe('djoko…@gmail.com');
  });

  it('keeps short emails unchanged', () => {
    expect(formatCompactEmail('jean@gmail.com')).toBe('jean@gmail.com');
    expect(formatCompactEmail('djokod@gmail.com')).toBe('djokod@gmail.com');
  });

  it('handles empty or malformed values', () => {
    expect(formatCompactEmail('')).toBe('');
    expect(formatCompactEmail(undefined)).toBe('');
    expect(formatCompactEmail('sans-arobase')).toBe('sans-arobase');
  });
});
