/** Dates métier AquaCare, exprimées dans le fuseau de la ferme. */
export const AQUACARE_TIME_ZONE = 'Africa/Douala';

export interface BusinessDateTime {
  date: string;
  time: string;
}

interface NumericDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const getNumericDateTimeParts = (
  value: Date = new Date(),
  timeZone: string = AQUACARE_TIME_ZONE,
): NumericDateTimeParts => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
};

const padTwoDigits = (value: number): string => String(value).padStart(2, '0');

export const getBusinessDateTime = (
  value: Date = new Date(),
  timeZone: string = AQUACARE_TIME_ZONE,
): BusinessDateTime => {
  const parts = getNumericDateTimeParts(value, timeZone);
  return {
    date: `${parts.year}-${padTwoDigits(parts.month)}-${padTwoDigits(parts.day)}`,
    time: `${padTwoDigits(parts.hour)}:${padTwoDigits(parts.minute)}`,
  };
};

export const getBusinessIsoDate = (
  value: Date = new Date(),
  timeZone: string = AQUACARE_TIME_ZONE,
): string => getBusinessDateTime(value, timeZone).date;

export const parseBusinessDateTime = (
  localDate: string,
  localTime: string,
  timeZone: string = AQUACARE_TIME_ZONE,
): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) {
    return null;
  }
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = localTime.split(':').map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  const normalized = new Date(desiredUtc);
  if (
    normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() !== month - 1
    || normalized.getUTCDate() !== day
    || normalized.getUTCHours() !== hour
    || normalized.getUTCMinutes() !== minute
  ) {
    return null;
  }

  let candidateMilliseconds = desiredUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const candidateParts = getNumericDateTimeParts(
      new Date(candidateMilliseconds),
      timeZone,
    );
    const candidateAsUtc = Date.UTC(
      candidateParts.year,
      candidateParts.month - 1,
      candidateParts.day,
      candidateParts.hour,
      candidateParts.minute,
    );
    candidateMilliseconds += desiredUtc - candidateAsUtc;
  }

  const candidate = new Date(candidateMilliseconds);
  const candidateParts = getNumericDateTimeParts(candidate, timeZone);
  if (
    candidateParts.year !== year
    || candidateParts.month !== month
    || candidateParts.day !== day
    || candidateParts.hour !== hour
    || candidateParts.minute !== minute
  ) {
    return null;
  }
  return candidate;
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
