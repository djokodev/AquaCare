import {
  getRejectedCycleLaunchDisplay,
} from '@/features/aquaculture/utils/aquacultureErrorPresenter';
import { en } from '@/i18n/locales/en';
import { fr } from '@/i18n/locales/fr';

const translator =
  (locale: Record<string, string>) =>
  (key: string): string =>
    locale[key] ?? key;

describe('getRejectedCycleLaunchDisplay', () => {
  it('traduit un code métier en français et en anglais', () => {
    expect(getRejectedCycleLaunchDisplay({
      code: 'cycle_launch_unit_already_allocated',
      t: translator(fr),
    }).cause).toBe(fr.cycleLaunchUnitAlreadyAllocated);
    expect(getRejectedCycleLaunchDisplay({
      code: 'cycle_launch_unit_already_allocated',
      t: translator(en),
    }).cause).toBe(en.cycleLaunchUnitAlreadyAllocated);
  });

  it('utilise un message inconnu seulement comme fallback contrôlé', () => {
    expect(getRejectedCycleLaunchDisplay({
      code: 'unknown_code',
      message: 'La configuration doit être corrigée.',
      httpStatus: 400,
      t: translator(fr),
    }).cause).toBe('La configuration doit être corrigée.');
    expect(getRejectedCycleLaunchDisplay({
      code: 'unknown_code',
      message: '{"internal":"secret"}',
      t: translator(fr),
    }).cause).toBe(fr.cycleLaunchRejectedGenericCause);
  });
});
