import type { ReportType } from '@/types/aquaculture';

const REPORT_PERIOD_LENGTH_DAYS: Record<ReportType, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

const parseDateOnlyUtc = (value: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
};

export const getLocalDateISO = (value: Date = new Date()): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export interface CycleReportAvailability {
  available: boolean;
  cycleDay: number;
  daysRemaining: number;
  requiredDays: number;
}

export const getCycleReportAvailability = (params: {
  reportType: ReportType;
  cycleStartDate?: string | null;
  referenceDate: string;
}): CycleReportAvailability | null => {
  const cycleStart = params.cycleStartDate
    ? parseDateOnlyUtc(params.cycleStartDate)
    : null;
  const reference = parseDateOnlyUtc(params.referenceDate);
  if (cycleStart === null || reference === null) {
    return null;
  }

  const cycleDay = Math.floor((reference - cycleStart) / 86_400_000) + 1;
  const requiredDays = REPORT_PERIOD_LENGTH_DAYS[params.reportType];
  const daysRemaining = Math.max(requiredDays - cycleDay, 0);

  return {
    available: cycleDay >= requiredDays,
    cycleDay,
    daysRemaining,
    requiredDays,
  };
};
