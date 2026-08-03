type Translator = (key: string) => string;

export type FcrUnavailableReason =
  | 'no_feed_observation'
  | 'incomplete_feed_data'
  | 'incomplete_harvest_data'
  | 'non_positive_biomass_gain';

const FCR_UNAVAILABLE_KEYS: Record<FcrUnavailableReason, string> = {
  no_feed_observation: 'fcrUnavailableNoFeedObservation',
  incomplete_feed_data: 'fcrUnavailableIncompleteFeedData',
  incomplete_harvest_data: 'fcrUnavailableIncompleteHarvestData',
  non_positive_biomass_gain: 'fcrUnavailableNonPositiveBiomassGain',
};

export const resolveFcrUnavailableLabel = (
  reason: string | null | undefined,
  t: Translator,
  options?: {
    dataComplete?: boolean;
    totalFeed?: number | null;
  },
): string => {
  const translationKey = reason
    ? FCR_UNAVAILABLE_KEYS[reason as FcrUnavailableReason]
    : undefined;
  if (translationKey) {
    return t(translationKey);
  }
  if (
    !reason
    && options?.dataComplete === true
    && options.totalFeed === 0
  ) {
    return t('fcrUnavailableZeroFeedObserved');
  }
  return t('fcrUnavailableGeneric');
};

export const resolveFcrScopeLabel = (
  scope: 'full_cycle' | 'since_tracking_start' | null | undefined,
  serverLabel: string | null | undefined,
  t: Translator,
): string =>
  serverLabel
  || (scope === 'since_tracking_start'
    ? t('fcrSinceAquaCare')
    : scope === 'full_cycle'
      ? t('fcrFullStat')
      : t('fcrStat'));
