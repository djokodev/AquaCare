import { formatEditableNumber, parseLocalizedNumber } from '../localizedNumber';

describe('localizedNumber', () => {
  it.each([
    ['16,8', 16.8],
    ['16.8', 16.8],
    ['0,2', 0.2],
    ['7,2', 7.2],
    [' 12,50 ', 12.5],
  ])('parse %s without truncating decimals', (raw, expected) => {
    expect(parseLocalizedNumber(raw)).toEqual({ kind: 'valid', value: expected });
  });

  it.each(['16,8,2', '16.8.2', 'abc', '1 000,5'])('rejects malformed number %s', (raw) => {
    expect(parseLocalizedNumber(raw)).toEqual({ kind: 'invalid' });
  });

  it('distinguishes an empty value from an invalid value', () => {
    expect(parseLocalizedNumber('  ')).toEqual({ kind: 'empty' });
  });

  it('formats an existing decimal for the active input locale', () => {
    expect(formatEditableNumber(16.8, true)).toBe('16,8');
    expect(formatEditableNumber(16.8, false)).toBe('16.8');
  });
});
