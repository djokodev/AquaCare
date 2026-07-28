import { getBusinessIsoDate } from '@/utils/businessDate';

describe('getBusinessIsoDate', () => {
  it('uses the AquaCare farm timezone for dates near midnight UTC', () => {
    expect(getBusinessIsoDate(new Date('2026-07-28T23:30:00.000Z'))).toBe('2026-07-29');
  });

  it('keeps a date unchanged during the Douala business day', () => {
    expect(getBusinessIsoDate(new Date('2026-07-28T12:00:00.000Z'))).toBe('2026-07-28');
  });
});
