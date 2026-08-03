/** Dates métier AquaCare, exprimées dans le fuseau de la ferme. */
export const AQUACARE_TIME_ZONE = 'Africa/Douala';

export const getBusinessIsoDate = (
  value: Date = new Date(),
  timeZone: string = AQUACARE_TIME_ZONE,
): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
};

/** Inclusive day count between two ISO dates (server convention). */
export function inclusiveDaysBetween(startIso: string, endIso: string): number {
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDatePattern.test(startIso) || !isoDatePattern.test(endIso)) {
    return 0;
  }
  const [y1, m1, d1] = startIso.split('-').map(Number);
  const [y2, m2, d2] = endIso.split('-').map(Number);
  const startMs = Date.UTC(y1, m1 - 1, d1);
  const endMs = Date.UTC(y2, m2 - 1, d2);
  const start = new Date(startMs);
  const end = new Date(endMs);
  if (
    start.getUTCFullYear() !== y1 ||
    start.getUTCMonth() !== m1 - 1 ||
    start.getUTCDate() !== d1 ||
    end.getUTCFullYear() !== y2 ||
    end.getUTCMonth() !== m2 - 1 ||
    end.getUTCDate() !== d2
  ) {
    return 0;
  }
  const diffMs = endMs - startMs;
  const diffDays = Math.round(diffMs / 86_400_000);
  return Math.max(0, diffDays + 1);
}

/** Adds a duration whose first day is the start date, matching the backend. */
export function plannedHarvestIsoDate(
  startIso: string,
  durationDays: number,
): string | null {
  if (!Number.isInteger(durationDays) || durationDays <= 0) return null;
  if (inclusiveDaysBetween(startIso, startIso) !== 1) return null;
  const [year, month, day] = startIso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + durationDays - 1);
  return date.toISOString().slice(0, 10);
}

export interface OngoingCycleSchedule {
  totalDurationDays: number;
  plannedHarvestDate: string;
  remainingDurationDays: number;
}

export function getOngoingCycleSchedule(
  startIso: string,
  trackingStartIso: string,
  durationDays: number,
  todayIso: string = getBusinessIsoDate(),
): OngoingCycleSchedule | null {
  const validStart = inclusiveDaysBetween(startIso, startIso) === 1;
  const validTracking =
    inclusiveDaysBetween(trackingStartIso, trackingStartIso) === 1;
  const validToday = inclusiveDaysBetween(todayIso, todayIso) === 1;
  if (!validStart || !validTracking || !validToday) return null;

  const plannedHarvestDate = plannedHarvestIsoDate(startIso, durationDays);
  if (
    !plannedHarvestDate
    || trackingStartIso < startIso
    || trackingStartIso > todayIso
    || trackingStartIso >= plannedHarvestDate
    || plannedHarvestDate < todayIso
  ) {
    return null;
  }
  const remainingDurationDays = inclusiveDaysBetween(
    trackingStartIso,
    plannedHarvestDate,
  );
  if (remainingDurationDays <= 0) return null;
  return {
    totalDurationDays: durationDays,
    plannedHarvestDate,
    remainingDurationDays,
  };
}
