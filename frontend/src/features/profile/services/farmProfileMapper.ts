import type { FarmProfile, FarmProfileApiResponse } from '@/features/profile/types/profile';

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const toNullableNumber = (value: unknown): number | null => {
  return toOptionalNumber(value) ?? null;
};

export const normalizeFarmProfile = (profile: FarmProfileApiResponse): FarmProfile => ({
  ...profile,
  total_area_m2: toOptionalNumber(profile.total_area_m2),
  annual_production_kg: toOptionalNumber(profile.annual_production_kg),
  default_feed_price_per_kg: toOptionalNumber(profile.default_feed_price_per_kg),
  latitude: toNullableNumber(profile.latitude),
  longitude: toNullableNumber(profile.longitude),
  annual_production_target_kg: toNullableNumber(profile.annual_production_target_kg),
  setup_unit_count: toNullableNumber(profile.setup_unit_count),
  setup_unit_volume_m3: toNullableNumber(profile.setup_unit_volume_m3),
  setup_unit_surface_m2: toNullableNumber(profile.setup_unit_surface_m2),
  fingerlings_cost_per_unit_fcfa: toNullableNumber(profile.fingerlings_cost_per_unit_fcfa),
  planned_selling_price_per_kg_fcfa: toNullableNumber(profile.planned_selling_price_per_kg_fcfa),
});
