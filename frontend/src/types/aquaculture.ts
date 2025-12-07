/**
 * Types TypeScript pour le module aquaculture
 * BasÃ©s sur les modÃ¨les Django backend et l'API REST
 */

import { Notification as NotificationPayload } from './notifications';

// =================== TYPES DE BASE ===================

export type Species = 'tilapia' | 'clarias';
export type CycleStatus = 'planned' | 'active' | 'harvested' | 'cancelled';
export type SanitaryEventType = 'disease' | 'treatment' | 'vaccination' | 'abnormal_mortality' | 'water_quality' | 'other';

// =================== MODÃˆLES PRINCIPAUX ===================

export interface ProductionCycle {
  id: string;
  farm_profile: string;
  cycle_name: string;
  species: Species;
  pond_identifier: string;
  pond_surface_m2: number;
  pond_volume_m3?: number;

  // DonnÃ©es initiales
  start_date: string;
  initial_count: number;
  initial_average_weight: number;
  initial_biomass: number;

  // DonnÃ©es finales (rÃ©colte)
  end_date?: string;
  final_count?: number;
  final_average_weight?: number;
  final_biomass?: number;

  // DonnÃ©es courantes
  current_count: number;
  current_average_weight: number;
  current_biomass: number;
  total_feed_consumed: number;

  // MÃ©triques calculÃ©es par backend (source unique de vÃ©ritÃ©)
  survival_rate?: number;
  fcr?: number;
  days_active?: number;
  current_density_kg_m3?: number;

  // MÃ©triques avancÃ©es depuis CycleMetrics (backend)
  daily_growth_rate?: number; // g/jour
  specific_growth_rate?: number; // %/jour (SGR)
  average_daily_feed?: number; // kg/jour
  performance_score?: number; // 0-100

  // CoÃ»ts calculÃ©s (backend avec prix configurable)
  total_feed_cost?: number; // FCFA

  status: CycleStatus;

  // MÃ©tadonnÃ©es
  created_at: string;
  updated_at: string;
}

export interface CycleLog {
  id: string;
  cycle: string; // UUID du cycle
  log_date: string;
  log_time?: string;
  client_uuid?: string; // Pour synchronisation offline

  // DonnÃ©es de mortalitÃ©
  mortality_count?: number;
  mortality_reason?: string;

  // DonnÃ©es de croissance (Ã©chantillonnage)
  sample_count?: number;
  sample_total_weight?: number;
  average_weight?: number;

  // Alimentation
  feed_quantity?: number;
  feed_type?: string;

  // ParamÃ¨tres environnementaux
  water_temperature?: number;
  dissolved_oxygen?: number;
  ph_level?: number;

  // Observations
  observations?: string;

  // MÃ©tadonnÃ©es synchronisation
  created_offline: boolean;
  synced_at?: string;
  created_at: string;
}

export interface FeedingPlan {
  id: string;
  cycle: string;
  week_number: number;

  // ParamÃ¨tres de base
  estimated_fish_count: number;
  average_weight: number;
  biomass: number;

  // Recommandations calculÃ©es
  daily_feed_amount: number;
  feeding_rate: number;
  meals_per_day: number;
  feed_per_meal: number;

  // Type d'aliment recommandÃ©
  recommended_feed: string;
  protein_percentage: number;

  // PÃ©riode de validitÃ©
  start_date: string;
  end_date: string;
  is_active: boolean;

  // Notes optionnelles
  notes?: string;

  created_at: string;
}

export interface SanitaryLog {
  id: string;
  cycle: string;
  event_date: string;
  event_type: SanitaryEventType;

  // Description dÃ©taillÃ©e
  symptoms: string;
  affected_count?: number;

  // Traitement appliquÃ©
  treatment_applied?: string;
  medication_used?: string;
  dosage?: string;
  treatment_duration_days?: number;

  // Photo (URL vers l'image uploadÃ©e)
  photo?: string;
  photo_url?: string;

  // Suivi
  resolved: boolean;
  resolution_date?: string;

  // MÃ©tadonnÃ©es
  created_at: string;
  created_offline: boolean;
}

export interface NutritionalGuide {
  id: string;
  species: Species;
  growth_stage: string;
  min_weight: number;
  max_weight: number;
  feeding_rate_percentage: number;
  protein_requirement: number;
  meals_per_day: number;
  feed_size_mm: number;
  recommended_products: string[];
  expected_fcr: number;
  feeding_notes?: string;
}


// =================== DONNÃ‰ES DASHBOARD ===================

export interface DashboardSummary {
  active_cycles_count: number;
  total_biomass: number;
  average_fcr: number;
  average_survival_rate: number;
  total_fish_count: number;
}

export interface ChartData {
  growth: Array<{
    cycle_name: string;
    data: Array<{
      date: string;
      weight: number;
    }>;
  }>;
  mortality: Array<{
    cycle_name: string;
    data: Array<{
      date: string;
      count: number;
      cumulative: number;
    }>;
  }>;
  feed_consumption: Array<{
    cycle_name: string;
    data: Array<{
      date: string;
      daily: number;
      cumulative: number;
    }>;
  }>;
}

export interface DashboardData {
  // MÃ©triques directes (selon l'API Django)
  active_cycles_count: number;
  total_biomass: number;
  total_fish_count: number;
  average_fcr: number;
  average_survival_rate: number;

  // DonnÃ©es dÃ©taillÃ©es
  active_cycles: ProductionCycle[];
  recent_logs: CycleLog[];
  current_feeding_plans: FeedingPlan[];
  pending_notifications: NotificationPayload[];
  charts?: ChartData;
}

// =================== SYNCHRONISATION OFFLINE ===================

export interface SyncPayload {
  cycle_logs: Partial<CycleLog>[];
  sanitary_logs: Partial<SanitaryLog>[];
  new_cycles: Partial<ProductionCycle>[];
  last_sync?: string;
  client_id: string;
}

export interface SyncError {
  type: 'cycle' | 'cycle_log' | 'sanitary_log' | 'general';
  data?: any;
  error: string;
  errors?: Record<string, string[]>;
}

export interface SyncResponse {
  status: 'success' | 'error';
  timestamp: string;
  processed: {
    cycle_logs: number;
    sanitary_logs: number;
    new_cycles: number;
  };
  errors: SyncError[];
  server_updates: {
    cycles: ProductionCycle[];
    logs: CycleLog[];
    feeding_plans: FeedingPlan[];
  };
}

// =================== FORMULAIRES ===================

export interface CreateCycleForm {
  cycle_name: string;
  species: Species;
  pond_identifier: string;
  pond_surface_m2: number;
  pond_volume_m3?: number;
  start_date: string;
  initial_count: number;
  initial_average_weight: number;
}

export interface DailyLogForm {
  log_date: string;
  mortality_count?: number;
  mortality_reason?: string;
  sample_count?: number;
  sample_total_weight?: number;
  feed_quantity?: number;
  feed_type?: string;
  water_temperature?: number;
  dissolved_oxygen?: number;
  ph_level?: number;
  observations?: string;
}

export interface SanitaryLogForm {
  event_date: string;
  event_type: SanitaryEventType;
  symptoms: string;
  affected_count?: number;
  treatment_applied?: string;
  medication_used?: string;
  dosage?: string;
  treatment_duration_days?: number;
  notes?: string; // Commentaires additionnels
  photo?: File | string; // File pour upload, string pour URL existante
}

export interface HarvestData {
  harvest_date: string;
  final_count: number;
  final_average_weight: number;
  total_harvested_weight: number;
  harvest_notes?: string;
}

// =================== STATISTIQUES ===================

export interface CycleStatistics {
  cycle_id: string;
  days_active: number;
  current_metrics: {
    survival_rate: number;
    biomass: number;
    average_weight: number;
    fcr: number;
    daily_growth_rate: number;
    specific_growth_rate: number;
  };
  feed_metrics: {
    total_consumed: number;
    average_daily: number;
    cost_estimate: number;
  };
  mortality_analysis: {
    total: number;
    percentage: number;
    by_week: Record<string, number>;
    main_causes: Array<{
      mortality_reason: string;
      count: number;
    }>;
  };
  growth_performance: Array<{
    day: number;
    date: string;
    weight: number;
    daily_gain: number;
  }>;
}

// =================== Ã‰TATS REDUX ===================

export interface AquacultureState {
  // DonnÃ©es principales
  cycles: ProductionCycle[];
  activeCycles: ProductionCycle[];
  currentCycle?: ProductionCycle;

  // Logs et plans
  cycleLogs: CycleLog[];
  feedingPlans: FeedingPlan[];
  sanitaryLogs: SanitaryLog[];

  // Dashboard
  dashboardData?: DashboardData;

  // Ã‰tat de chargement
  loading: {
    dashboard: boolean;
    cycles: boolean;
    logs: boolean;
    sync: boolean;
  };

  // Erreurs
  error: string | null;

  // Synchronisation offline
  pendingSync: {
    cycleLogs: Partial<CycleLog>[];
    sanitaryLogs: Partial<SanitaryLog>[];
    newCycles: Partial<ProductionCycle>[];
  };
  lastSyncTime?: string;
}
