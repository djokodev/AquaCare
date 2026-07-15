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

  it('localizes French and English integers and decimals', () => {
    expect(formatDashboardNumber(2700, 'fr-FR')).toMatch(/2[\s\u202f]700/u);
    expect(formatDashboardNumber(2700, 'en-US')).toBe('2,700');
    expect(formatDashboardNumber(12.5, 'fr-FR')).toBe('12,5');
    expect(formatDashboardNumber(12.5, 'en-US')).toBe('12.5');
  });

  it('handles long and unexpected negative amounts', () => {
    expect(formatDashboardCurrency(1_250_000_000, 'en-US')).toBe('1,250,000,000');
    expect(formatDashboardCurrency(-5000, 'en-US')).toBe('-5,000');
  });
});
