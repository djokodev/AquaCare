import { createInstance } from 'i18next';

import { en } from '../locales/en';
import { fr } from '../locales/fr';

describe('dashboard translations', () => {
  it.each([
    ['fr', fr, 1, '1 unité sans pesée'],
    ['fr', fr, 2, '2 unités sans pesée'],
    ['en', en, 1, '1 unit has no weighing'],
    ['en', en, 2, '2 units have no weighing'],
  ] as const)('resolves the missing weighing count in %s', async (language, translations, count, expected) => {
    const instance = createInstance();
    await instance.init({
      compatibilityJSON: 'v3',
      lng: language,
      resources: { [language]: { translation: translations } },
    });

    expect(instance.t('dashboardUnitsMissingWeighing', { count })).toBe(expected);
  });
});
