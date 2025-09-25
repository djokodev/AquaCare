/**
 * Types TypeScript pour le module aquaculture
 * Basés sur les modèles Django backend et l'API REST
 */

// =================== TYPES DE BASE ===================

export type Species = 'tilapia' | 'clarias';
export type CycleStatus = 'planned' | 'active' | 'harvested' | 'cancelled';
export type SanitaryEventType = 'disease' | 'treatment' | 'vaccination' | 'abnormal_mortality' | 'water_quality' | 'other';
export type NotificationType = 'feeding_reminder' | 'sampling_reminder' | 'treatment_reminder' | 'cycle_milestone';

// =================== MODÈLES PRINCIPAUX ===================

export interface ProductionCycle {
  id: string;
  farm_profile: string;
  cycle_name: string;
  species: Species;
  pond_identifier: string;
  pond_surface_m2: number;
  pond_volume_m3?: number;

  // Données initiales
  start_date: string;
  initial_count: number;
  initial_average_weight: number;
  initial_biomass: number;

  // Données finales (récolte)
  end_date?: string;
  final_count?: number;
  final_average_weight?: number;
  final_biomass?: number;

  // Données courantes
  current_count: number;
  current_average_weight: number;
  current_biomass: number;
  total_feed_consumed: number;

  // Métriques calculées
  survival_rate?: number;
  fcr?: number;
  status: CycleStatus;

  // Métadonnées
  created_at: string;
  updated_at: string;
}

export interface CycleLog {
  id: string;
  cycle: string; // UUID du cycle
  log_date: string;
  log_time?: string;
  client_uuid?: string; // Pour synchronisation offline

  // Données de mortalité
  mortality_count?: number;
  mortality_reason?: string;

  // Données de croissance (échantillonnage)
  sample_count?: number;
  sample_total_weight?: number;
  average_weight?: number;

  // Alimentation
  feed_quantity?: number;
  feed_type?: string;

  // Paramètres environnementaux
  water_temperature?: number;
  dissolved_oxygen?: number;
  ph_level?: number;

  // Observations
  observations?: string;

  // Métadonnées synchronisation
  created_offline: boolean;
  synced_at?: string;
  created_at: string;
}

export interface FeedingPlan {
  id: string;
  cycle: string;
  week_number: number;

  // Paramètres de base
  estimated_fish_count: number;
  average_weight: number;
  biomass: number;

  // Recommandations calculées
  daily_feed_amount: number;
  feeding_rate: number;
  meals_per_day: number;
  feed_per_meal: number;

  // Type d'aliment recommandé
  recommended_feed: string;
  protein_percentage: number;

  // Période de validité
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

  // Description détaillée
  symptoms: string;
  affected_count?: number;

  // Traitement appliqué
  treatment_applied?: string;
  medication_used?: string;
  dosage?: string;
  treatment_duration_days?: number;

  // Photo (URL vers l'image uploadée)
  photo?: string;
  photo_url?: string;

  // Suivi
  resolved: boolean;
  resolution_date?: string;

  // Métadonnées
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
  recommended_products: string[];
  feeding_notes?: string;
}

export interface Notification {
  id: string;
  user: string;
  cycle?: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  scheduled_for: string;
  sent_at?: string;
  read_at?: string;
  is_sent: boolean;
  is_read: boolean;
}

// =================== DONNÉES DASHBOARD ===================

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
  // Métriques directes (selon l'API Django)
  active_cycles_count: number;
  total_biomass: number;
  total_fish_count: number;
  average_fcr: number;
  average_survival_rate: number;

  // Données détaillées
  active_cycles: ProductionCycle[];
  recent_logs: CycleLog[];
  current_feeding_plans: FeedingPlan[];
  pending_notifications: Array<{
    id: string;
    title: string;
    message: string;
    type: NotificationType;
    scheduled_for: string;
  }>;
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

// =================== ÉTATS REDUX ===================

export interface AquacultureState {
  // Données principales
  cycles: ProductionCycle[];
  activeCycles: ProductionCycle[];
  currentCycle?: ProductionCycle;

  // Logs et plans
  cycleLogs: CycleLog[];
  feedingPlans: FeedingPlan[];
  sanitaryLogs: SanitaryLog[];

  // Dashboard
  dashboardData?: DashboardData;

  // État de chargement
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