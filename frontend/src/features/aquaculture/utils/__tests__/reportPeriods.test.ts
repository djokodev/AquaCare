import {
  getCycleReportAvailability,
  getLocalDateISO,
} from '@/features/aquaculture/utils/reportPeriods';

describe('reportPeriods', () => {
  it('rend le rapport journalier disponible dès le premier jour', () => {
    expect(getCycleReportAvailability({
      reportType: 'daily',
      cycleStartDate: '2026-07-16',
      referenceDate: '2026-07-16',
    })).toMatchObject({ available: true, cycleDay: 1, daysRemaining: 0 });
  });

  it.each([
    ['2026-07-19', false, 4, 3],
    ['2026-07-22', true, 7, 0],
    ['2026-07-23', true, 8, 0],
    ['2026-07-29', true, 14, 0],
  ])('calcule la disponibilité hebdomadaire au %s', (referenceDate, available, cycleDay, daysRemaining) => {
    expect(getCycleReportAvailability({
      reportType: 'weekly',
      cycleStartDate: '2026-07-16',
      referenceDate,
    })).toMatchObject({ available, cycleDay, daysRemaining });
  });

  it.each([
    ['2026-08-13', false, 29, 1],
    ['2026-08-14', true, 30, 0],
    ['2026-09-13', true, 60, 0],
  ])('calcule la disponibilité mensuelle au %s', (referenceDate, available, cycleDay, daysRemaining) => {
    expect(getCycleReportAvailability({
      reportType: 'monthly',
      cycleStartDate: '2026-07-16',
      referenceDate,
    })).toMatchObject({ available, cycleDay, daysRemaining });
  });

  it('retourne null pour une date invalide ou absente', () => {
    expect(getCycleReportAvailability({
      reportType: 'weekly',
      cycleStartDate: null,
      referenceDate: '2026-07-22',
    })).toBeNull();
    expect(getCycleReportAvailability({
      reportType: 'weekly',
      cycleStartDate: '2026-02-30',
      referenceDate: '2026-07-22',
    })).toBeNull();
  });

  it('formate une date locale sans conversion UTC', () => {
    expect(getLocalDateISO(new Date(2026, 6, 16, 23, 30))).toBe('2026-07-16');
  });
});
