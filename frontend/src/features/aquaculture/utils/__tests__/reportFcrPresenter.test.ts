import {
  resolveFcrUnavailableLabel,
} from '@/features/aquaculture/utils/reportFcrPresenter';
import { en } from '@/i18n/locales/en';
import { fr } from '@/i18n/locales/fr';

const translator =
  (locale: Record<string, string>) =>
  (key: string): string =>
    locale[key] ?? key;

describe('resolveFcrUnavailableLabel', () => {
  it.each([
    ['no_feed_observation', 'fcrUnavailableNoFeedObservation'],
    ['incomplete_feed_data', 'fcrUnavailableIncompleteFeedData'],
    ['incomplete_harvest_data', 'fcrUnavailableIncompleteHarvestData'],
    ['non_positive_biomass_gain', 'fcrUnavailableNonPositiveBiomassGain'],
  ] as const)('résout %s en français et anglais', (reason, key) => {
    expect(resolveFcrUnavailableLabel(reason, translator(fr))).toBe(fr[key]);
    expect(resolveFcrUnavailableLabel(reason, translator(en))).toBe(en[key]);
  });

  it('utilise le fallback générique pour une raison inconnue', () => {
    expect(resolveFcrUnavailableLabel('unknown', translator(fr))).toBe(
      fr.fcrUnavailableGeneric,
    );
  });

  it('distingue une consommation explicitement nulle', () => {
    expect(resolveFcrUnavailableLabel(null, translator(en), {
      dataComplete: true,
      totalFeed: 0,
    })).toBe(en.fcrUnavailableZeroFeedObserved);
  });
});
