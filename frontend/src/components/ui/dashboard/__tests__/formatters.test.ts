import {
  DASHBOARD_UNAVAILABLE_VALUE,
  formatDashboardCurrency,
  formatDashboardNumber,
  parseDashboardNumber,
} from '../formatters';

describe('dashboard formatters', () => {
  it('preserve zero and numeric strings', () => {
    expect(parseDashboardNumber(0)).toBe(0);
    expect(parseDashboardNumber('12.5')).toBe(12.5);
    expect(formatDashboardNumber(0, 'fr-FR')).toBe('0');
  });

  it.each([null, undefined, Number.NaN, Number.POSITIVE_INFINITY, '', 'not-a-number'])(
    'renders unavailable for %p',
    (value) => {
      expect(formatDashboardNumber(value, 'fr-FR')).toBe(DASHBOARD_UNAVAILABLE_VALUE);
    },
  );

  it.each([
    [999, '999'],
    [1000, '1\u202f000'],
    [1500, '1\u202f500'],
    [2700, '2\u202f700'],
    [282500, '282\u202f500'],
    [1_250_000_000, '1\u202f250\u202f000\u202f000'],
    [12.5, '12,5'],
    [-1500, '-1\u202f500'],
  ])('formats %p deterministically in French as %s', (value, expected) => {
    expect(formatDashboardNumber(value, 'fr-FR')).toBe(expected);
  });

  it.each([
    [999, '999'],
    [1000, '1,000'],
    [1500, '1,500'],
    [2700, '2,700'],
    [282500, '282,500'],
    [1_250_000_000, '1,250,000,000'],
    [12.5, '12.5'],
    [-1500, '-1,500'],
  ])('formats %p deterministically in English as %s', (value, expected) => {
    expect(formatDashboardNumber(value, 'en-US')).toBe(expected);
  });

  it('formats numeric strings deterministically', () => {
    expect(formatDashboardNumber('2700', 'fr-FR')).toBe('2\u202f700');
    expect(formatDashboardNumber('12.5', 'en-US')).toBe('12.5');
  });

  it('handles long and unexpected negative amounts', () => {
    expect(formatDashboardCurrency(1_250_000_000, 'en-US')).toBe('1,250,000,000');
    expect(formatDashboardCurrency(-5000, 'en-US')).toBe('-5,000');
  });
});
