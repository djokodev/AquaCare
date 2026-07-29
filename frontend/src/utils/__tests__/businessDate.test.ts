import { getBusinessIsoDate, inclusiveDaysBetween } from '@/utils/businessDate';

describe('getBusinessIsoDate', () => {
  it('uses the AquaCare farm timezone for dates near midnight UTC', () => {
    expect(getBusinessIsoDate(new Date('2026-07-28T23:30:00.000Z'))).toBe('2026-07-29');
  });

  it('keeps a date unchanged during the Douala business day', () => {
    expect(getBusinessIsoDate(new Date('2026-07-28T12:00:00.000Z'))).toBe('2026-07-28');
  });
});

describe('inclusiveDaysBetween', () => {
  it('returns 10 days for July 1 to July 10', () => {
    expect(inclusiveDaysBetween('2026-07-01', '2026-07-10')).toBe(10);
  });

  it('returns 1 day for same start and end date', () => {
    expect(inclusiveDaysBetween('2026-07-01', '2026-07-01')).toBe(1);
  });

  it('returns 0 for end before start', () => {
    expect(inclusiveDaysBetween('2026-07-10', '2026-07-01')).toBe(0);
  });
});
