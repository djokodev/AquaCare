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
