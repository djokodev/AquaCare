import {
  getBusinessIsoDate,
  getOngoingCycleSchedule,
  inclusiveDaysBetween,
  plannedHarvestIsoDate,
} from '@/utils/businessDate';

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

describe('businessDate cycle schedule', () => {
  it('uses the backend inclusive harvest convention', () => {
    expect(plannedHarvestIsoDate('2026-06-01', 150)).toBe('2026-10-28');
    expect(getOngoingCycleSchedule('2026-06-01', '2026-07-20', 150)).toEqual({
      totalDurationDays: 150,
      plannedHarvestDate: '2026-10-28',
      remainingDurationDays: 101,
    });
  });

  it('rejects a tracking baseline on or after harvest', () => {
    expect(getOngoingCycleSchedule('2026-06-01', '2026-10-28', 150)).toBeNull();
    expect(getOngoingCycleSchedule('2026-06-01', '2026-10-29', 150)).toBeNull();
  });

  it('counts two inclusive days on the day before harvest', () => {
    expect(
      getOngoingCycleSchedule(
        '2026-06-01',
        '2026-10-27',
        150,
        '2026-10-27',
      ),
    ).toEqual({
      totalDurationDays: 150,
      plannedHarvestDate: '2026-10-28',
      remainingDurationDays: 2,
    });
  });

  it('rejects a harvest date that has already passed', () => {
    expect(
      getOngoingCycleSchedule(
        '2026-01-01',
        '2026-05-29',
        150,
        '2026-07-29',
      ),
    ).toBeNull();
    expect(
      getOngoingCycleSchedule(
        '2026-07-27',
        '2026-07-27',
        2,
        '2026-07-29',
      ),
    ).toBeNull();
  });

  it('accepts harvest today and a future harvest', () => {
    expect(
      getOngoingCycleSchedule(
        '2026-07-28',
        '2026-07-28',
        2,
        '2026-07-29',
      ),
    ).toEqual({
      totalDurationDays: 2,
      plannedHarvestDate: '2026-07-29',
      remainingDurationDays: 2,
    });
    expect(
      getOngoingCycleSchedule(
        '2026-07-28',
        '2026-07-29',
        3,
        '2026-07-29',
      ),
    ).toEqual({
      totalDurationDays: 3,
      plannedHarvestDate: '2026-07-30',
      remainingDurationDays: 2,
    });
  });

  it('rejects invalid ISO dates instead of normalizing them', () => {
    expect(
      getOngoingCycleSchedule(
        '2026-02-31',
        '2026-03-01',
        150,
        '2026-07-29',
      ),
    ).toBeNull();
    expect(
      getOngoingCycleSchedule(
        '2026-01-01',
        '2026-02-31',
        150,
        '2026-07-29',
      ),
    ).toBeNull();
  });
});
