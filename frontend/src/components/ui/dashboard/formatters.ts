export type DashboardNumericValue = number | string | null | undefined;

export const DASHBOARD_UNAVAILABLE_VALUE = '—';

export function parseDashboardNumber(value: DashboardNumericValue): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatDashboardNumber(
  value: DashboardNumericValue,
  locale: string,
  options: Intl.NumberFormatOptions = {},
): string {
  const parsed = parseDashboardNumber(value);
  if (parsed === null) {
    return DASHBOARD_UNAVAILABLE_VALUE;
  }
  const formatter = new Intl.NumberFormat(locale, { ...options, useGrouping: false });
  const formatted = formatter.format(parsed);
  const match = formatted.match(/^([^\d]*)(\d+)(.*)$/);
  if (!match) return formatted;
  const [, prefix, integer, suffix] = match;
  if (integer.length < 4 || options.useGrouping === false) {
    return formatted;
  }
  const separator = locale.toLowerCase().startsWith('fr') ? '\u202f' : ',';
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return `${prefix}${groupedInteger}${suffix}`;
}

export function formatDashboardCurrency(
  value: DashboardNumericValue,
  locale: string,
): string {
  return formatDashboardNumber(value, locale, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

export function formatDashboardPercent(value: DashboardNumericValue, locale: string): string {
  const parsed = parseDashboardNumber(value);
  if (parsed === null) return DASHBOARD_UNAVAILABLE_VALUE;
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(parsed);
  return locale.toLowerCase().startsWith('fr') ? `${formatted}\u00a0%` : `${formatted}%`;
}
