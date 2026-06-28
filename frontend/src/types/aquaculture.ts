/**
 * Types TypeScript pour le module aquaculture
 * Bases sur les modeles Django backend et l'API REST
 */

import { Notification as NotificationPayload } from './notifications';

// =================== TYPES DE BASE ===================

export type Species = 'tilapia' | 'clarias';
export type CycleStatus = 'planned' | 'active' | 'harvested' | 'cancelled';
export type ReportType = 'daily' | 'weekly' | 'monthly';
export type ReportStatus = 'draft' | 'validated' | 'pending';
export type EmailReportStatus = 'not_sent' | 'sent' | 'failed';
export type WhatsAppReportStatus = 'not_shared' | 'shared';
export type SanitaryEventType =
  | 'disease'
  | 'treatment'
  | 'vaccination'
  | 'abnormal_mortality'
  | 'water_quality'
  | 'other';

// =================== MODELES PRINCIPAUX ===================

export interface ProductionCycle {
  id: string;
  client_uuid?: string;
  farm_profile: string;
  cycle_name: string;
  species: Species;
  pond_identifier: string;
  pond_surface_m2: number;
  pond_volume_m3?: number;
  infrastructure_type?: string[];

  // Donnees initiales
  start_date: string;
  initial_count: number;
  initial_average_weight: number;
  initial_biomass: number;

  // Projection economique
  target_harvest_weight_g?: number;
  planned_cycle_duration_days?: number;
  planned_harvest_date?: string;
  planned_feed_bags?: number;
  expected_survival_rate_pct?: number;
  planned_selling_price_per_kg_fcfa?: number;
  fingerlings_cost_fcfa?: number;
  other_operational_costs_fcfa?: number;

  // Donnees finales (recolte)
  end_date?: string;
  final_count?: number;
  final_average_weight?: number;
  final_biomass?: number;

  // Donnees courantes
  current_count: number;
  current_average_weight: number;
  current_biomass: number;
  total_feed_consumed: number;

  // Metriques calculees par backend (source unique de verite)
  survival_rate?: number;
  fcr?: number;
  days_active?: number;
  current_density_kg_m3?: number;

  // Metriques avancees depuis CycleMetrics (backend)
  daily_growth_rate?: number; // g/jour
  specific_growth_rate?: number; // %/jour (SGR)
  average_daily_feed?: number; // kg/jour
  performance_score?: number; // 0-100

  // Couts calcules (backend avec prix configurable)
  total_feed_cost?: number; // FCFA

  // Phase d'alimentation courante (calculée backend)
  feed_phase?: {
    phase_key: 'pre_grossissement' | 'grossissement';
    phase_label: string;
    weight_range_g: [number, number];
    recommended_product: string;
    products: string[];
    protein_pct?: number;
    bag_weight_kg?: number;
    price_per_bag_fcfa?: number | null;
  };

  status: CycleStatus;

  // Recoltes partielles (historique)
  partial_harvests?: PartialHarvest[];

  // Metadonnees
  created_offline?: boolean;
  synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PartialHarvest {
  id: string;
  harvest_date: string;
  count_harvested: number;
  average_weight_g: number;
  total_weight_kg: number;
  sale_price_fcfa_per_kg?: number;
  estimated_revenue_fcfa?: number;
  notes?: string;
  client_uuid?: string;
  created_offline?: boolean;
  synced_at?: string;
  created_at: string;
}

export interface PartialHarvestData {
  harvest_date: string;
  count_harvested: number;
  average_weight_g: number;
  sale_price_fcfa_per_kg?: number;
  notes?: string;
  client_uuid?: string;
  created_offline?: boolean;
}

export interface CycleHarvestResponse {
  message: string;
  cycle: ProductionCycle;
}

export interface CycleLog {
  id: string;
  cycle: string; // UUID du cycle
  log_date: string;
  log_time?: string;
  client_uuid?: string; // Pour synchronisation offline

  // Donnees de mortalite
  mortality_count?: number;
  mortality_reason?: string;

  // Donnees de croissance (echantillonnage)
  sample_count?: number;
  sample_total_weight?: number;
  average_weight?: number;

  // Alimentation
  feed_quantity?: number;
  feed_type?: string;
  feed_size_mm?: number;
  feeding_times?: string[];

  // Parametres environnementaux
  water_temperature?: number;
  dissolved_oxygen?: number;
  ph_level?: number;
  ammonia_level?: number;

  // Observations
  observations?: string;

  // Metadonnees synchronisation
  created_offline: boolean;
  synced_at?: string;
  created_at: string;
}

export interface FeedingPlan {
  id: string;
  cycle: string;
  week_number: number;

  // Parametres de base
  estimated_fish_count: number;
  average_weight: number;
  biomass: number;

  // Recommandations calculees
  daily_feed_amount: number;
  feeding_rate: number;
  meals_per_day: number;
  feed_per_meal: number;

  // Type d'aliment recommande
  recommended_feed: string;
  protein_percentage: number;

  // Periode de validite
  start_date: string;
  end_date: string;
  is_active: boolean;

  // Notes optionnelles
  notes?: string;

  // Traçabilité : température et source utilisées lors de la génération
  temperature_used_c?: number;
  used_default_temperature?: boolean;
  data_source?: string;

  // Champs spécifiques backend (granulométrie)
  feed_size_mm?: number;
  recommended_feed_type?: string;

  created_at: string;
}

export interface SanitaryLog {
  id: string;
  client_uuid?: string;
  cycle: string;
  event_date: string;
  event_type: SanitaryEventType;

  // Description detaillee
  symptoms: string;
  affected_count?: number;

  // Traitement applique
  treatment_applied?: string;
  medication_used?: string;
  dosage?: string;
  treatment_duration_days?: number;

  // Photo (URL vers l'image uploadee)
  photo?: string;
  photo_url?: string;

  // Suivi
  resolved: boolean;
  resolution_date?: string;

  // Metadonnees
  created_at: string;
  created_offline: boolean;
  synced_at?: string;
}

export type ProductionUnitType = 'tank' | 'pond' | 'cage';
export type ProductionUnitStatus = 'active' | 'inactive' | 'archived';

export interface ProductionUnit {
  id: string;
  farm_profile: string;
  name: string;
  unit_type: ProductionUnitType;
  volume_m3?: number | null;
  surface_m2?: number | null;
  status?: ProductionUnitStatus;
  unit_type_display?: string;
  recommended_capacity?: number | null;
  capacity_density_unit?: string | null;
  display_dimension?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductionUnitDraft {
  local_id: string;
  name: string;
  unit_type: ProductionUnitType;
  volume_m3?: string;
  surface_m2?: string;
}

export interface ProductionUnitCompatibilitySummary {
  legacy_infrastructure_type: 'etang' | 'cage_flottante' | 'bac_hors_sol';
  legacy_unit_count: number;
  total_capacity: number | null;
  is_mixed: boolean;
  primary_unit: ProductionUnitDraft | null;
}

export interface CycleUnitAllocation {
  id: string;
  cycle: string;
  production_unit: string;
  initial_fish_count: number;
  current_fish_count: number;
  initial_biomass_kg?: number | null;
  current_biomass_kg?: number | null;
  expected_survival_rate_pct?: number | null;
  cycle_name?: string;
  production_unit_name?: string;
  production_unit_type?: ProductionUnitType;
  production_unit_display_dimension?: string | null;
  production_unit_capacity_density_unit?: string | null;
  production_unit_recommended_capacity?: number | null;
  survival_rate_pct?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CycleUnitAllocationDraft {
  production_unit_local_id: string;
  initial_fish_count: number;
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

export interface ReportDispatchLog {
  id: string;
  channel: 'email' | 'whatsapp';
  channel_display?: string;
  status: 'success' | 'failed';
  status_display?: string;
  recipient: string;
  error_code?: string;
  error_message?: string;
  metadata: Record<string, unknown>;
  dispatched_by?: string | null;
  dispatched_by_name?: string;
  created_at: string;
}

export interface ProductionReport {
  id: string;
  farm_profile: string;
  farm_name?: string;
  report_type: ReportType;
  report_type_display?: string;
  cycle_scope_id?: string | null;
  period_start: string;
  period_end: string;
  status: ReportStatus;
  status_display?: string;
  payload?: Record<string, unknown>;
  pdf_file?: string | null;
  pdf_url?: string | null;
  generated_at?: string | null;
  validated_at?: string | null;
  validated_by?: string | null;
  validated_by_name?: string;
  email_status: EmailReportStatus;
  email_sent_at?: string | null;
  whatsapp_status: WhatsAppReportStatus;
  whatsapp_shared_at?: string | null;
  dispatch_logs?: ReportDispatchLog[];
  created_at: string;
  updated_at: string;
}

// =================== DONNEES DASHBOARD ===================

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
  // Metriques directes (selon l'API Django)
  active_cycles_count: number;
  total_biomass: number;
  total_fish_count: number;
  average_fcr: number;
  average_survival_rate: number;

  // Donnees detaillees
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
  new_cycles: CreateCycleForm[];
  last_sync?: string;
  device_id: string;
}

export interface SyncError {
  type: 'cycle' | 'cycle_log' | 'sanitary_log' | 'general';
  data?: unknown;
  error: string;
  errors?: Record<string, string[]>;
}

export interface SyncResponse {
  status: 'success' | 'partial_success' | 'error';
  timestamp: string;
  processed: {
    cycles: number;
    cycle_logs: number;
    cycle_logs_updated?: number;
    sanitary_logs: number;
  };
  errors: SyncError[];
  server_updates: {
    cycles: ProductionCycle[];
    cycle_logs: CycleLog[];
    feeding_plans: FeedingPlan[];
    sanitary_logs?: SanitaryLog[];
    sync_timestamp?: string;
  };
  device_id?: string;
}

// =================== FORMULAIRES ===================

export interface CreateCycleForm {
  client_uuid?: string;
  cycle_name?: string;
  species: Species;
  pond_identifier: string;
  pond_surface_m2?: number;
  pond_volume_m3?: number;
  infrastructure_type?: string[];
  start_date: string;
  initial_count: number;
  initial_average_weight?: number;
  target_harvest_weight_g?: number;
  planned_cycle_duration_days?: number;
  planned_harvest_date?: string;
  planned_feed_bags?: number;
  expected_survival_rate_pct?: number;
  planned_selling_price_per_kg_fcfa?: number;
  fingerlings_cost_fcfa?: number;
  other_operational_costs_fcfa?: number;
  created_offline?: boolean;
}

export interface ActiveSanitaryIssueGroup {
  cycle_name: string;
  cycle_id: string;
  issues: SanitaryLog[];
}

export interface DailyLogForm {
  client_uuid?: string;
  log_date: string;
  mortality_count?: number;
  mortality_reason?: string;
  sample_count?: number;
  sample_total_weight?: number;
  feed_quantity?: number;
  feed_type?: string;
  feed_size_mm?: number;
  feeding_times?: string[];
  water_temperature?: number;
  dissolved_oxygen?: number;
  ph_level?: number;
  ammonia_level?: number;
  observations?: string;
  created_offline?: boolean;
}

export interface ReactNativeUploadFile {
  uri: string;
  type: string;
  name: string;
}

export interface SanitaryLogForm {
  client_uuid?: string;
  event_date: string;
  event_type: SanitaryEventType;
  symptoms: string;
  affected_count?: number;
  treatment_applied?: string;
  medication_used?: string;
  dosage?: string;
  treatment_duration_days?: number;
  notes?: string; // Commentaires additionnels
  photo?: File | ReactNativeUploadFile | string; // File/objet RN pour upload, string pour URL existante
  created_offline?: boolean;
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

// ── Statut aliments par cycle ───────────────────────────────────────────────

// ── Feed phases (simulation-based ordering) ──────────────────────────────

export interface FeedPhaseProduct {
  product_id: string;
  product_name: string;
  package_weight_kg: number;
  quantity_bags: number;
  total_kg: number;
  unit_price: number;
  total_price: number;
  brand: string;
}

export interface FeedPhase {
  phase_name: string;
  days_range: [number, number];
  weight_range_g: [number, number];
  pellet_size_mm: number;
  duration_days: number;
  total_consumption_kg: number;
  daily_avg_kg: number;
  products: FeedPhaseProduct[];
  total_bags: number;
  total_price: number;
}

export interface FeedProductStatus {
  product_id: string;
  product_name: string;
  package_weight_kg: number;
  bags_ordered: number;
}

export interface CycleFeedStatus {
  total_bags_needed: number;
  total_feed_needed_kg: number;
  bags_by_product: FeedProductStatus[];
  total_bags_ordered: number;
  total_feed_consumed_kg: number;
  bags_consumed_equivalent: number;
  bags_remaining_to_order: number;
}

// =================== ETATS REDUX ===================

export interface AquacultureState {
  // Donnees principales
  cycles: ProductionCycle[];
  activeCycles: ProductionCycle[];
  currentCycle?: ProductionCycle;

  // Logs et plans
  cycleLogs: CycleLog[];
  feedingPlans: FeedingPlan[];
  sanitaryLogs: SanitaryLog[];

  // Dashboard
  dashboardData?: DashboardData;

  // Statut aliments cycle actif
  cycleFeedStatus: {
    data: CycleFeedStatus | null;
    loading: boolean;
    error: string | null;
  };

  // Etat de chargement
  loading: {
    dashboard: boolean;
    cycles: boolean;
    logs: boolean;
    sync: boolean;
  };

  // Erreurs
  error: string | null;
}
