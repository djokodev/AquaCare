import { ProductionCycle } from '@/types/aquaculture';
import { AQUACULTURE_CONSTANTS } from '@/constants/aquaculture';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Terrain-validated selling prices (FCFA/kg) — source: Yaoundé field audit 2026-02
const SELLING_PRICE_BY_SPECIES: Record<string, number> = {
  tilapia: 1800,
  clarias: 2000,
};

export const toSafeNumber = (value: number | string | null | undefined): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const calculateCycleDaysRemaining = (cycle: ProductionCycle | undefined): number | null => {
  if (!cycle) {
    return null;
  }

  if (cycle.planned_harvest_date) {
    const target = new Date(cycle.planned_harvest_date);
    if (Number.isFinite(target.getTime())) {
      const today = new Date();
      const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const startTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
      const diffDays = Math.ceil((startTarget.getTime() - startToday.getTime()) / MS_PER_DAY);
      return Math.max(0, diffDays);
    }
  }

  const plannedDuration = toSafeNumber(cycle.planned_cycle_duration_days);
  const activeDays = toSafeNumber(cycle.days_active);
  if (plannedDuration > 0) {
    return Math.max(0, Math.round(plannedDuration - activeDays));
  }

  return null;
};

export const calculateCycleEstimatedMarketValue = (cycle: ProductionCycle): number => {
  const currentBiomass = toSafeNumber(cycle.current_biomass);
  const sellingPrice = toSafeNumber(cycle.planned_selling_price_per_kg_fcfa) ||
    SELLING_PRICE_BY_SPECIES[cycle.species] || SELLING_PRICE_BY_SPECIES.tilapia;
  return currentBiomass * sellingPrice;
};

export const calculateDashboardBusinessMetrics = (
  cycles: ProductionCycle[],
  focusedCycle?: ProductionCycle
): {
  estimatedMarketValueFcfa: number;
  feedCostConsumedFcfa: number;
  timeRemainingDays: number | null;
  directProductionCostFcfa: number;
} => {
  if (cycles.length === 0) {
    return {
      estimatedMarketValueFcfa: 0,
      feedCostConsumedFcfa: 0,
      timeRemainingDays: null,
      directProductionCostFcfa: 0,
    };
  }

  const estimatedMarketValueFcfa = cycles.reduce((sum, cycle) => {
    const currentBiomass = toSafeNumber(cycle.current_biomass);
    const sellingPrice = toSafeNumber(cycle.planned_selling_price_per_kg_fcfa) ||
      SELLING_PRICE_BY_SPECIES[cycle.species] || SELLING_PRICE_BY_SPECIES.tilapia;
    return sum + currentBiomass * sellingPrice;
  }, 0);

  const feedCostConsumedFcfa = cycles.reduce((sum, cycle) => {
    const backendFeedCost = toSafeNumber(cycle.total_feed_cost);
    if (backendFeedCost > 0) {
      return sum + backendFeedCost;
    }
    return sum + (toSafeNumber(cycle.total_feed_consumed) * AQUACULTURE_CONSTANTS.FEED_PRICE_PER_KG);
  }, 0);

  const totalFingerlingsCostFcfa = cycles.reduce(
    (sum, cycle) => sum + toSafeNumber(cycle.fingerlings_cost_fcfa),
    0
  );

  const directProductionCostFcfa = feedCostConsumedFcfa + totalFingerlingsCostFcfa;
  const metricCycle = focusedCycle || cycles[0];

  return {
    estimatedMarketValueFcfa,
    feedCostConsumedFcfa,
    timeRemainingDays: calculateCycleDaysRemaining(metricCycle),
    directProductionCostFcfa,
  };
};
