import type { ProductionCycle } from '@/types/aquaculture';

const toSortableTimestamp = (value?: string): number => {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
};

const compareCycles = (left: ProductionCycle, right: ProductionCycle): number => {
  const leftStart = toSortableTimestamp(left.start_date);
  const rightStart = toSortableTimestamp(right.start_date);
  if (leftStart !== rightStart) {
    return leftStart - rightStart;
  }

  const leftCreated = toSortableTimestamp(left.created_at);
  const rightCreated = toSortableTimestamp(right.created_at);
  if (leftCreated !== rightCreated) {
    return leftCreated - rightCreated;
  }

  const nameDiff = left.cycle_name.localeCompare(right.cycle_name);
  if (nameDiff !== 0) {
    return nameDiff;
  }

  return left.id.localeCompare(right.id);
};

export const sortCyclesForDisplay = (cycles: ProductionCycle[]): ProductionCycle[] =>
  [...cycles].sort(compareCycles);

export const getCycleDisplayRank = (
  cycle: ProductionCycle,
  cycles: ProductionCycle[]
): number => {
  const index = sortCyclesForDisplay(cycles).findIndex((entry) => entry.id === cycle.id);
  return index === -1 ? 1 : index + 1;
};

export const formatCycleDisplayName = (
  cycle: ProductionCycle,
  cycles: ProductionCycle[]
): string => {
  const rank = getCycleDisplayRank(cycle, cycles);
  return `${cycle.cycle_name} #${rank}`;
};
