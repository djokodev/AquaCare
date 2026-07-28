import { createInstance } from 'i18next';

import { en } from '../locales/en';
import { fr } from '../locales/fr';

describe('report availability translations', () => {
  it.each([
    { language: 'fr', translations: fr, key: 'reportWeeklyUnavailableHint', count: 1, expected: 'Rapport hebdomadaire indisponible. Disponible dans 1 jour.' },
    { language: 'fr', translations: fr, key: 'reportWeeklyUnavailableHint', count: 3, expected: 'Rapport hebdomadaire indisponible. Disponible dans 3 jours.' },
    { language: 'fr', translations: fr, key: 'reportMonthlyUnavailableHint', count: 26, expected: 'Rapport mensuel indisponible. Disponible dans 26 jours.' },
    { language: 'en', translations: en, key: 'reportWeeklyUnavailableHint', count: 1, expected: 'Weekly report unavailable. Available in 1 day.' },
    { language: 'en', translations: en, key: 'reportMonthlyUnavailableHint', count: 26, expected: 'Monthly report unavailable. Available in 26 days.' },
  ] as const)(
    'resolves $language $key with count $count',
    async ({ language, translations, key, count, expected }) => {
      const instance = createInstance();
      await instance.init({
        compatibilityJSON: 'v3',
        lng: language,
        resources: { [language]: { translation: translations } },
      });

      expect(instance.t(key, { count })).toBe(expected);
    }
  );
});
