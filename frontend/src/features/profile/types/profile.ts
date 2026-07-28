import type { User } from '@/features/auth/types/auth';

export interface FarmProfile {
  id: string;
  farm_name: string;
  certification_status: 'pending' | 'certified' | 'suspended' | 'rejected';
  certification_status_display?: string;
  total_ponds: number;
  total_area_m2?: number;
  water_source?: string;
  main_species?: string;
  annual_production_kg?: number;
  default_feed_price_per_kg?: number;
  latitude?: number | null;
  longitude?: number | null;
  location_address?: string;
  is_certified: boolean;
  annual_production_target_kg?: number | null;
  num_cycles_per_year?: 2 | 3 | null;
  setup_infrastructure_type?: 'etang' | 'cage_flottante' | 'bac_hors_sol' | 'bac_en_sol' | null;
  setup_unit_count?: number | null;
  setup_unit_volume_m3?: number | null;
  setup_unit_surface_m2?: number | null;
  setup_species?: 'tilapia' | 'clarias' | 'autre' | null;
  fingerlings_cost_per_unit_fcfa?: number | null;
  planned_selling_price_per_kg_fcfa?: number | null;
  farm_setup_completed?: boolean;
  created_at: string;
  updated_at: string;
}

type ApiDecimal = number | string;

export interface FarmProfileApiResponse extends Omit<
  FarmProfile,
  | 'total_area_m2'
  | 'annual_production_kg'
  | 'default_feed_price_per_kg'
  | 'latitude'
  | 'longitude'
  | 'annual_production_target_kg'
  | 'setup_unit_count'
  | 'setup_unit_volume_m3'
  | 'setup_unit_surface_m2'
  | 'fingerlings_cost_per_unit_fcfa'
  | 'planned_selling_price_per_kg_fcfa'
> {
  total_area_m2?: ApiDecimal | null;
  annual_production_kg?: ApiDecimal | null;
  default_feed_price_per_kg?: ApiDecimal | null;
  latitude?: ApiDecimal | null;
  longitude?: ApiDecimal | null;
  annual_production_target_kg?: ApiDecimal | null;
  setup_unit_count?: number | string | null;
  setup_unit_volume_m3?: ApiDecimal | null;
  setup_unit_surface_m2?: ApiDecimal | null;
  fingerlings_cost_per_unit_fcfa?: ApiDecimal | null;
  planned_selling_price_per_kg_fcfa?: ApiDecimal | null;
}

export type UpdateUserProfilePayload = Partial<
  Pick<
    User,
    | 'email'
    | 'first_name'
    | 'last_name'
    | 'business_name'
    | 'activity_type'
    | 'region'
    | 'department'
    | 'district'
    | 'city'
    | 'neighborhood'
    | 'intervention_zone'
    | 'legal_status'
    | 'promoter_name'
    | 'age_group'
    | 'language_preference'
  >
>;

export type UpdateFarmProfilePayload = Partial<
  Pick<
    FarmProfile,
    | 'farm_name'
    | 'total_ponds'
    | 'total_area_m2'
    | 'water_source'
    | 'main_species'
    | 'annual_production_kg'
    | 'default_feed_price_per_kg'
    | 'latitude'
    | 'longitude'
    | 'location_address'
  >
>;
