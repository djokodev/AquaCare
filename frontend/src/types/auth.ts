// Types basÃ©s sur votre API Django accounts

export interface User {
  id: string;
  phone_number: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  business_name?: string;
  account_type: 'individual' | 'company';
  age_group?: string;
  activity_type?: string;
  region?: string;
  department?: string;
  district?: string;
  city?: string;
  neighborhood?: string;
  legal_status?: string;
  promoter_name?: string;
  intervention_zone?: string;
  language_preference: 'fr' | 'en';
  is_verified: boolean;
  display_name: string;
  is_individual: boolean;
  is_company: boolean;
}

export interface FarmProfile {
  id: string;
  farm_name: string;
  certification_status: 'pending' | 'certified' | 'suspended' | 'rejected';
  total_ponds: number;
  total_area_m2?: number;
  water_source?: string;
  main_species?: string;
  annual_production_kg?: number;
  is_certified: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  login_name?: string;
  phone_number?: string;
  password: string;
}

export interface RegisterRequest {
  phone_number: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  business_name?: string;
  account_type: 'individual' | 'company';
  age_group?: string;
  activity_type?: string;
  region?: string;
  department?: string;
  district?: string;
  city?: string;
  neighborhood?: string;
  legal_status?: string;
  promoter_name?: string;
  intervention_zone?: string;
  language_preference: 'fr' | 'en';
  password: string;
  password_confirm: string;
}

export interface AuthResponse {
  user: User;
  tokens: {
    access: string;
    refresh: string;
  };
  message: string;
}

export interface ApiError {
  message: string;
  details?: Record<string, string[]>;
}



