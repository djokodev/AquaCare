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
  return new Intl.NumberFormat(locale, options).format(parsed);
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
