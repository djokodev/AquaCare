/**
 * Types TypeScript pour le module aquaculture
 * Bases sur les modeles Django backend et l'API REST
 */

import { Notification as NotificationPayload } from "./notifications";
import type { DeliveryMethod, OrderStatus } from "./commerce";

// =================== TYPES DE BASE ===================

export type Species = "tilapia" | "clarias";
export type CycleStatus = "planned" | "active" | "harvested" | "cancelled";
export type ProductionCycleKind = "standard" | "calibration";
export type CycleOnboardingMode = "new" | "ongoing";
export type CycleHistoryScope = "full_cycle" | "since_tracking_start";
export type ReportType = "daily" | "weekly" | "monthly";
export type ReportStatus = "draft" | "validated" | "pending";
export type ReportScopeType = "cycle" | "unit";
export type ReportScope =
  | {
      scope_type: "cycle";
      cycle_id: string;
      cycle_unit_allocation_id?: never;
    }
  | {
      scope_type: "unit";
      cycle_unit_allocation_id: string;
      cycle_id?: string;
    };
export type EmailReportStatus = "not_sent" | "sent" | "failed";
export type WhatsAppReportStatus = "not_shared" | "shared";
export type SanitaryEventType =
  | "disease"
  | "treatment"
  | "vaccination"
  | "abnormal_mortality"
  | "water_quality"
  | "other";

// =================== MODELES PRINCIPAUX ===================

export interface ProductionCycle {
  id: string;
  client_uuid?: string;
  farm_profile: string;
  cycle_name: string;
  species: Species;
  pond_identifier: string;
  pond_surface_m2?: number | null;
  pond_volume_m3?: number;
  cycle_kind?: ProductionCycleKind;
  cycle_kind_display?: string;
  is_calibration_unit?: boolean;
  total_stocked_count?: number;
  total_stocked_biomass?: number;
  total_transferred_out_count?: number;
  total_transferred_out_biomass?: number;
  infrastructure_type?: string[];

  // Donnees initiales
  start_date: string;
  initial_count: number;
  initial_average_weight: number | null;
  initial_biomass: number | null;
  onboarding_mode?: CycleOnboardingMode;
  tracking_start_date?: string;
  tracking_start_count?: number;
  tracking_start_average_weight?: number;
  tracking_start_biomass?: number;
  tracking_start_biomass_source?: "calculated" | "declared";

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
  days_tracked?: number;
  historical_count_gap?: number;
  has_partial_history?: boolean;
  history_scope?: CycleHistoryScope;
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
    phase_key: "pre_grossissement" | "grossissement";
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

export interface CalibrationTank {
  id: string;
  client_uuid?: string;
  farm_profile: string;
  name: string;
  volume_m3: number;
  is_active: boolean;
  is_occupied: boolean;
  active_session?: ProductionCycle | null;
  active_allocation?: CycleUnitAllocation | null;
  allocations?: CycleUnitAllocation[];
  pending_sync?: boolean;
  created_offline?: boolean;
  synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CalibrationOperation {
  id: string;
  client_uuid: string;
  source_allocation: string;
  destination_allocation: string;
  source_cycle_name?: string;
  source_unit_name?: string;
  destination_cycle_name?: string;
  destination_unit_name?: string;
  calibrated_at: string;
  transferred_count: number;
  transferred_average_weight_g: number;
  transferred_biomass_kg: number;
  size_category?: 'small' | 'medium' | 'large' | 'other' | '';
  notes?: string;
  created_offline?: boolean;
  pending_sync?: boolean;
}

export interface CalibrationRequest {
  client_uuid: string;
  source_allocation_id?: string;
  source_allocation_client_uuid?: string;
  destination_production_unit_id?: string;
  destination_production_unit_client_uuid?: string;
  calibrated_at: string;
  transferred_count: number;
  transferred_average_weight_g?: number;
  sample_count?: number;
  sample_total_weight_g?: number;
  size_category?: 'small' | 'medium' | 'large' | 'other' | '';
  notes?: string;
  created_offline?: boolean;
}

export interface CalibrationResponse {
  operation: CalibrationOperation;
  source_allocation: CycleUnitAllocation;
  destination_allocation: CycleUnitAllocation;
  source_cycle: ProductionCycle;
  destination_cycle: ProductionCycle;
  destination_tank: CalibrationTank;
  warnings: Array<'weight_difference' | 'high_density'>;
  idempotent_replay: boolean;
}

export interface CreateCalibrationTankForm {
  client_uuid?: string;
  name: string;
  volume_m3: number;
  is_active?: boolean;
  created_offline?: boolean;
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
  cycle_unit_allocation?: string | null;
  production_unit?: string | null;
  production_unit_name?: string | null;
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
  final_harvest: FinalHarvestOperation | null;
  final_harvests: FinalHarvestOperation[];
  reconciliation_status: 'pending' | 'reconciled';
  idempotent_replay: boolean;
}

export interface CycleUnitHarvestResponse {
  message: string;
  cycle: ProductionCycle;
  cycle_unit_allocation: CycleUnitAllocation;
  final_harvest: FinalHarvestOperation;
  idempotent_replay: boolean;
}

export interface FinalHarvestOperation {
  id: string;
  client_uuid: string;
  allocation_id: string;
  cycle_id: string;
  harvested_at: string;
  declared_fish_count: number;
  declared_average_weight_g: string;
  declared_biomass_kg: string;
  notes: string;
  reconciliation_status: 'pending' | 'reconciled';
  computed_count_before_harvest?: number | null;
  computed_biomass_before_harvest_kg?: string | null;
  created_offline: boolean;
  synced_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CycleUnitPartialHarvestResponse {
  message: string;
  cycle: ProductionCycle;
  cycle_unit_allocation: CycleUnitAllocation;
  partial_harvest: PartialHarvest;
}

export interface CycleLog {
  id: string;
  cycle: string; // UUID du cycle
  cycle_unit_allocation?: string | null;
  production_unit?: string | null;
  production_unit_name?: string | null;
  production_unit_type?: ProductionUnitType | null;
  production_unit_display_dimension?: string | null;
  log_date: string;
  log_time?: string;
  client_uuid?: string; // Pour synchronisation offline
  server_log_id?: string | null;

  // Donnees de mortalite
  mortality_count?: number;
  mortality_reason?: string;

  // Donnees de croissance (echantillonnage)
  sample_count?: number | null;
  sample_total_weight?: number | null;
  average_weight?: number | null;

  // Alimentation
  feed_quantity?: number | null;
  feed_type?: string;
  feed_size_mm?: number | null;
  feed_reference?: string | null;
  feed_reference_client_uuid?: string | null;
  feeding_times?: string[];

  // Parametres environnementaux
  water_temperature?: number | null;
  dissolved_oxygen?: number | null;
  ph_level?: number | null;
  ammonia_level?: number | null;

  // Observations
  observations?: string;

  // Metadonnees synchronisation
  created_offline: boolean;
  pending_sync?: boolean;
  synced_at?: string;
  created_at: string;
}

export interface FeedingPlan {
  id: string;
  cycle: string;
  cycle_unit_allocation?: string | null;
  production_unit?: string | null;
  production_unit_name?: string | null;
  production_unit_type?: ProductionUnitType | null;
  production_unit_display_dimension?: string | null;
  scope_label?: string;
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
  recommended_feed?: string;
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
  server_log_id?: string | null;
  cycle: string;
  cycle_unit_allocation?: string | null;
  production_unit?: string | null;
  production_unit_name?: string | null;
  production_unit_type?: ProductionUnitType | null;
  production_unit_display_dimension?: string | null;
  event_date: string;
  event_type: SanitaryEventType;
  event_type_display?: string;

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

export type ProductionUnitType = "tank" | "pond" | "cage";
export type ProductionUnitStatus = "active" | "inactive" | "archived";

export interface ProductionUnit {
  id: string;
  client_uuid?: string | null;
  farm_profile: string;
  name: string;
  unit_type: ProductionUnitType;
  purpose?: "production" | "calibration";
  purpose_display?: string;
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

export interface ProductionUnitCreatePayload {
  name: string;
  unit_type: ProductionUnitType;
  volume_m3?: number;
  surface_m2?: number;
  status?: ProductionUnitStatus;
}

export interface CycleLaunchUnitInput {
  local_id: string;
  source: "new" | "existing";
  name?: string;
  unit_type?: ProductionUnitType;
  production_unit_id?: string;
  volume_m3?: number;
  surface_m2?: number;
}

export interface CycleLaunchAllocationInput {
  production_unit_local_id: string;
  fish_count: number;
}

export interface CycleLaunchCalibrationUnitInput {
  client_uuid: string;
  name: string;
  volume_m3: number;
}

export interface CycleTrackingBaselineInput {
  tracking_start_date: string;
  fish_count: number;
  average_weight_g: string;
  biomass_kg?: string | null;
}

export interface CycleLaunchExternalFeedInput {
  client_uuid: string;
  name: string;
  pellet_size_mm: string;
  brand?: string;
  species?: Species;
}

export interface CycleLaunchOpeningStockInput {
  local_id: string;
  feed_reference_id?: string;
  feed_reference_client_uuid?: string;
  external_feed?: CycleLaunchExternalFeedInput;
  quantity_kg: string;
  cost_status: "known" | "unknown";
  total_cost_fcfa: string | null;
  note?: string;
}

export interface CycleLaunchOpeningStockEntry {
  id: string;
  client_uuid: string | null;
  cycle: string;
  feed_reference: string | null;
  quantity_kg: string;
  total_cost_fcfa: string | null;
  entry_date: string;
  entry_kind: "opening_balance" | "manual_supply" | "order_receipt";
  cost_status: "known" | "unknown";
  note: string;
}

export interface CycleLaunchRequest {
  launch_uuid: string;
  launch_kind: "initial_setup" | "additional_cycle";
  production_plan?: {
    annual_production_target_kg: number;
    num_cycles_per_year: number;
    fingerlings_cost_per_unit_fcfa: number;
    planned_selling_price_per_kg_fcfa?: number;
  };
  cycle: {
    onboarding_mode: CycleOnboardingMode;
    cycle_name?: string;
    species: Species;
    start_date: string;
    initial_count: number;
    initial_average_weight?: string | null;
    target_harvest_weight_g?: number;
    planned_cycle_duration_days: number;
    expected_survival_rate_pct: number;
    planned_selling_price_per_kg_fcfa?: number;
    fingerlings_cost_fcfa: number;
    other_operational_costs_fcfa: number;
    planned_feed_bags?: number;
    created_offline: boolean;
  };
  tracking_baseline?: CycleTrackingBaselineInput;
  production_units: CycleLaunchUnitInput[];
  allocations: CycleLaunchAllocationInput[];
  calibration_units?: CycleLaunchCalibrationUnitInput[];
  initial_feed_stocks?: CycleLaunchOpeningStockInput[];
}

export interface CycleLaunchResponse {
  launchUuid: string;
  idempotentReplay: boolean;
  farmProfile: import("@/features/profile/types/profile").FarmProfile;
  productionCycle: ProductionCycle;
  productionUnits: ProductionUnit[];
  cycleUnitAllocations: CycleUnitAllocation[];
  productionUnitIdByLocalId: Record<string, string>;
  openingFeedReferences: FarmFeedReference[];
  openingStockEntries: CycleLaunchOpeningStockEntry[];
  openingStockEntryIdByLocalId: Record<string, string>;
}

export interface ProductionUnitDraft {
  local_id: string;
  name: string;
  unit_type: ProductionUnitType;
  volume_m3?: string;
  surface_m2?: string;
}

export interface ProductionUnitFishAllocationDraft {
  production_unit_local_id: string;
  fish_count: string;
}

export interface ProductionUnitAllocationStatus {
  production_unit_local_id: string;
  fish_count: number | null;
  recommended_capacity: number | null;
  density: number | null;
  density_unit: "m3" | "m2" | null;
  estimated_production_kg: number | null;
  is_over_capacity: boolean;
}

export interface ProductionUnitFishAllocationValidationResult {
  total_fish_count: number | null;
  total_capacity: number | null;
  total_allocated_fish: number;
  global_error: string | null;
  unit_errors: Record<string, string>;
  unit_statuses: ProductionUnitAllocationStatus[];
}

export interface ProductionUnitCompatibilitySummary {
  legacy_infrastructure_type: "etang" | "cage_flottante" | "bac_hors_sol";
  legacy_unit_count: number;
  total_capacity: number | null;
  is_mixed: boolean;
  primary_unit: ProductionUnitDraft | null;
}

export interface CycleUnitAllocation {
  id: string;
  client_uuid?: string | null;
  cycle: string;
  production_unit: string;
  initial_fish_count: number;
  current_fish_count: number;
  initial_biomass_kg?: number | null;
  current_biomass_kg?: number | null;
  status?: "active" | "harvested" | "inactive";
  status_display?: string;
  harvested_at?: string | null;
  final_harvested_at?: string | null;
  final_harvest_date?: string | null;
  final_harvest_notes?: string | null;
  final_fish_count?: number | null;
  final_average_weight_g?: number | null;
  final_biomass_kg?: number | null;
  final_harvest_reconciliation_status?: "pending" | "reconciled" | null;
  final_harvest_computed_count?: number | null;
  session_started_at?: string | null;
  expected_survival_rate_pct?: number | null;
  cycle_name?: string;
  cycle_start_date?: string;
  production_unit_name?: string;
  production_unit_type?: ProductionUnitType;
  production_unit_display_dimension?: string | null;
  production_unit_recommended_capacity?: number | null;
  production_unit_capacity_density_unit?: string | null;
  survival_rate_pct?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CycleUnitAllocationCreatePayload {
  cycle: string;
  production_unit: string;
  initial_fish_count: number;
  current_fish_count?: number;
  initial_biomass_kg?: number;
  current_biomass_kg?: number;
  expected_survival_rate_pct?: number;
}

export interface ProductionUnitDashboardSummary {
  estimated_current_fish_count: number;
  total_mortality_count: number;
  mortality_rate_pct: string | number;
  total_feed_consumed_kg: string | number;
  latest_average_weight_g: string | number | null;
  estimated_current_biomass_kg: string | number | null;
  biomass_data_available: boolean;
  biomass_source: 'latest_weighing' | 'allocation_current' | 'initial_stocking' | 'harvested' | null;
  estimated_market_value_fcfa: string | number | null;
  last_daily_log_date: string | null;
  days_since_last_log: number | null;
  has_today_daily_log: boolean;
  active_sanitary_issues_count: number;
  last_sanitary_event_date: string | null;
  has_unresolved_sanitary_issue: boolean;
}

export interface ProductionUnitDashboard {
  allocation: CycleUnitAllocation;
  summary: ProductionUnitDashboardSummary;
  recent_daily_logs: CycleLog[];
  recent_sanitary_logs: SanitaryLog[];
}

export interface CycleDashboardSummary {
  days_active: number;
  days_tracked: number;
  historical_count_gap: number;
  history_scope: CycleHistoryScope;
  total_allocations: number;
  total_initial_fish_count?: number;
  total_estimated_current_fish_count: number;
  total_mortality_count: number;
  mortality_rate_pct?: string | number;
  total_feed_consumed_kg: string | number;
  estimated_current_biomass_kg: string | number | null;
  biomass_data_available: boolean;
  estimated_market_value_fcfa: string | number | null;
  direct_production_cost_fcfa: string | number;
  cycle_progress_pct: number | null;
  days_remaining: number | null;
  units_with_today_log_count?: number;
  units_with_sanitary_issue_count: number;
  units_with_active_sanitary_issue_count?: number;
  units_missing_today_log_count: number;
  units_missing_biomass_data_count: number;
  last_daily_log_date?: string | null;
  last_sanitary_event_date?: string | null;
  has_allocations: boolean;
  data_source: "unit_allocations" | "legacy_cycle";
}

export interface CycleDashboard {
  cycle: ProductionCycle;
  summary: CycleDashboardSummary;
  allocations: ProductionUnitDashboard[];
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
  channel: "email" | "whatsapp";
  channel_display?: string;
  status: "success" | "failed";
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
  scope_type?: ReportScopeType;
  scope_type_display?: string;
  scope_object_id?: string | null;
  scope_name?: string | null;
  scope_label?: string | null;
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
  calibration_tanks?: CreateCalibrationTankForm[];
  calibration_operations?: CalibrationRequest[];
  final_harvests?: HarvestData[];
  last_sync?: string;
  device_id: string;
}

export interface SyncError {
  type: "cycle" | "cycle_log" | "sanitary_log" | "calibration_tank" | "calibration_operation" | "final_harvest" | "general";
  data?: unknown;
  client_uuid?: string | null;
  code?: string;
  detail?: string | Record<string, unknown>;
  error?: string;
  field?: string;
  errors?: Record<string, string[]>;
}

export interface SyncResponse {
  status: "success" | "partial_success" | "error";
  timestamp: string;
  processed: {
    cycles: number;
    cycle_logs: number;
    cycle_logs_updated?: number;
    sanitary_logs: number;
    calibration_tanks: number;
    calibration_operations: number;
    final_harvests?: number;
  };
  errors: SyncError[];
  accepted?: {
    cycles: string[];
    cycle_logs: string[];
    sanitary_logs: string[];
    calibration_tanks: string[];
    calibration_operations: string[];
    final_harvests: string[];
  };
  items?: Array<{
    type: 'cycle' | 'cycle_log' | 'sanitary_log' | 'calibration_tank' |
      'calibration_operation' | 'final_harvest';
    client_uuid: string;
    status: 'accepted';
    server_id?: string;
    reconciliation_status?: 'pending' | 'reconciled';
    operation_id?: string;
    operation_ids?: string[];
    operation_client_uuids?: string[];
  }>;
  server_updates: {
    cycles: ProductionCycle[];
    cycle_logs: CycleLog[];
    feeding_plans: FeedingPlan[];
    sanitary_logs?: SanitaryLog[];
    calibration_tanks?: CalibrationTank[];
    calibration_operations?: CalibrationOperation[];
    final_harvests?: FinalHarvestOperation[];
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
  cycle_unit_allocation?: string;
  log_date: string;
  mortality_count?: number;
  mortality_reason?: string;
  sample_count?: number | null;
  sample_total_weight?: number | null;
  feed_quantity?: number | null;
  feed_type?: string;
  feed_size_mm?: number | null;
  feed_reference?: string | null;
  feed_reference_client_uuid?: string | null;
  feeding_times?: string[];
  water_temperature?: number | null;
  dissolved_oxygen?: number | null;
  ph_level?: number | null;
  ammonia_level?: number | null;
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
  cycle_unit_allocation?: string;
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
  client_uuid: string;
  allocation_id?: string;
  allocation_client_uuid?: string;
  cycle_id?: string;
  harvest_date: string;
  final_harvested_at: string;
  final_count: number;
  final_average_weight: number;
  total_harvested_weight: number;
  harvest_notes?: string;
  created_offline: boolean;
  allow_pending_reconciliation?: boolean;
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
  package_weight_kg: string;
  quantity_bags: number;
  total_kg: string;
  unit_price: string;
  total_price: string;
  brand: string;
  species: 'tilapia' | 'catfish';
  pellet_size_mm: string;
}

export interface FeedPhase {
  phase_id: string;
  sequence: number;
  phase_status: 'past' | 'current' | 'future' | 'unknown';
  phase_name: string;
  days_range: [number, number];
  planned_days_range: [number, number];
  weight_range_g: [string, string];
  planned_weight_range_g: [string, string];
  pellet_size_mm: string | null;
  duration_days: number;
  planned_duration_days: number;
  planned_consumption_kg: string;
  actual_consumed_kg: string | null;
  estimated_remaining_need_kg: string | null;
  remaining_need_kg: string | null;
  consumed_kg: string | null;
  allocated_stock_kg: string | null;
  allocated_pending_kg: string | null;
  shortfall_kg: string | null;
  surplus_kg: string | null;
  product_available: boolean;
  products: FeedPhaseProduct[];
  total_bags: number | null;
  total_price: string | null;
}

export interface FeedProductStatus {
  product_id: string;
  product_name: string;
  package_weight_kg: number;
  bags_ordered: number;
}

export interface CycleFeedStatus {
  cycle_id: string;
  total_bags_needed: number;
  total_feed_needed_kg: number;
  bags_by_product: FeedProductStatus[];
  total_bags_ordered: number;
  total_feed_consumed_kg: number;
  bags_consumed_equivalent: number;
  bags_remaining_to_order: number;
}

export type CycleStoreStatus = "not_started" | "low" | "check_stock" | "ok";

export interface CycleStorePendingOrder {
  id: string;
  order_number: string;
  status: OrderStatus;
  delivery_method: DeliveryMethod;
  total_bags: number;
  total_fcfa: string;
  estimated_feed_kg: string;
  created_at: string;
}

export interface CycleStoreSummary {
  manual_feed_kg: string;
  received_order_feed_kg: string;
  total_feed_added_kg: string;
  feed_consumed_kg: string;
  estimated_feed_remaining_kg: string;
  feed_expenses_fcfa: string;
  known_feed_expenses_fcfa?: string;
  known_opening_stock_cost_fcfa?: string;
  tracked_feed_expenses_fcfa?: string;
  unknown_cost_entries_count?: number;
  cost_history_complete?: boolean;
  pending_orders_count: number;
  pending_order_amount_fcfa: string;
  pending_order_feed_kg: string;
  total_feed_needed_kg: string | null;
  feed_need_remaining_kg: string | null;
  secured_feed_kg: string | null;
  feed_to_secure_kg: string | null;
  stock_tracking_started_at: string | null;
  unclassified_stock_kg: string;
}

export interface CycleStoreStockItem {
  feed_reference_id: string | null;
  feed_reference_client_uuid?: string | null;
  source: "aquacare_catalog" | "external" | null;
  species: Species | null;
  label: string;
  feed_size_mm: string | null;
  quantity_added_kg: string;
  quantity_consumed_kg: string;
  quantity_available_kg: string;
  pending_sync?: boolean;
}

export interface CycleStoreStockBySize {
  feed_size_mm: string;
  quantity_added_kg: string;
  quantity_consumed_kg: string;
  quantity_available_kg: string;
}

export interface CycleStore {
  cycle_id: string;
  calculation_status: 'available' | 'incomplete' | 'unavailable';
  calculation_source: string;
  calculated_at: string;
  calculation_warnings: string[];
  summary: CycleStoreSummary;
  status: CycleStoreStatus;
  stock_items: CycleStoreStockItem[];
  stock_by_size?: CycleStoreStockBySize[];
  available_pellet_sizes?: string[];
  recommended_pellet_size_mm?: string | null;
  pending_orders: CycleStorePendingOrder[];
  stock_tracking_started_at: string | null;
  unclassified_entries: Array<{
    id: string;
    label: string;
    quantity_kg: string;
    quantity_added_kg: string;
    historical_consumption_kg: string;
    quantity_available_kg: string;
    source?: 'manual' | 'order' | null;
    classification_reason?: 'legacy_manual' | 'legacy_order' | 'order_species_mismatch' | string | null;
    catalog_product_id?: string | null;
    catalog_product_species?: Species | null;
    catalog_product_pellet_size_mm?: string | null;
  }>;
}

export interface FarmFeedReference {
  id: string;
  client_uuid: string | null;
  farm_profile: string;
  source: "aquacare_catalog" | "external";
  catalog_product_id: string | null;
  name: string;
  species: Species;
  pellet_size_mm: string;
  brand: string;
  protein_percentage: string | null;
  lipid_percentage: string | null;
  package_weight_kg: string | null;
}

export interface ExternalFeedPayload {
  name: string;
  species: Species;
  pellet_size_mm: string;
  brand?: string;
  client_uuid?: string;
  created_offline?: boolean;
}

export interface FarmFeedReferenceCreatePayload {
  farm_profile: string;
  source: 'aquacare_catalog' | 'external';
  catalog_product?: string;
  name?: string;
  species?: Species;
  pellet_size_mm?: string;
  brand?: string;
  client_uuid: string;
  created_offline?: boolean;
}

export interface CycleStoreManualStockPayload {
  feed_reference_id?: string;
  feed_reference_client_uuid?: string;
  external_feed?: ExternalFeedPayload;
  quantity_kg: string;
  total_cost_fcfa: string;
  entry_date: string;
  note?: string;
  client_uuid?: string;
  created_offline?: boolean;
}

export interface CycleFeedRecommendation {
  cycle_id: string;
  status: "available" | "incomplete" | "unavailable";
  source: string;
  calculated_at: string;
  summary: {
    planned_total_feed_kg?: string;
    estimated_remaining_need_kg?: string;
    compatible_stock_kg?: string;
    pending_order_kg?: string;
    feed_to_order_kg?: string;
    unclassified_stock_kg?: string;
    unclassified_consumption_kg?: string;
  };
  feeding_phases: FeedPhase[];
  warnings: string[];
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
  dashboardRequest: {
    requestId: string | null;
    farmProfileId: string | null;
  };

  // Statut aliments cycle actif
  cycleFeedStatus: {
    data: CycleFeedStatus | null;
    loading: boolean;
    error: string | null;
    requestedCycleId: string | null;
    currentRequestId: string | null;
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
