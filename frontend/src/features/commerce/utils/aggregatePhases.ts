import { SimulatedFeedingPhase } from '@/types/commerce';

export type DisplayPhase = SimulatedFeedingPhase & { pellet_size_label: string };

/**
 * Aggregate feeding phases that share the same phase_name into a single
 * DisplayPhase, merging weight/day ranges, consumption totals and product lists.
 */
export const aggregatePhasesByName = (phases: SimulatedFeedingPhase[]): DisplayPhase[] => {
  type AggregationEntry = {
    phase: DisplayPhase;
    pelletMin: number;
    pelletMax: number;
    productsMap: Map<string, SimulatedFeedingPhase['products'][number]>;
  };

  const grouped = new Map<string, AggregationEntry>();

  phases.forEach((phase) => {
    const existing = grouped.get(phase.phase_name);

    if (!existing) {
      const productsMap = new Map<string, SimulatedFeedingPhase['products'][number]>();
      phase.products.forEach((product) => {
        productsMap.set(product.product_id, { ...product });
      });

      grouped.set(phase.phase_name, {
        phase: {
          ...phase,
          products: phase.products.map((product) => ({ ...product })),
          pellet_size_label: String(phase.pellet_size_mm),
        },
        pelletMin: phase.pellet_size_mm,
        pelletMax: phase.pellet_size_mm,
        productsMap,
      });
      return;
    }

    existing.phase.days_range = [
      Math.min(existing.phase.days_range[0], phase.days_range[0]),
      Math.max(existing.phase.days_range[1], phase.days_range[1]),
    ];
    existing.phase.weight_range_g = [
      Math.min(existing.phase.weight_range_g[0], phase.weight_range_g[0]),
      Math.max(existing.phase.weight_range_g[1], phase.weight_range_g[1]),
    ];
    existing.phase.duration_days += phase.duration_days;
    existing.phase.total_consumption_kg = Number(
      (existing.phase.total_consumption_kg + phase.total_consumption_kg).toFixed(2)
    );
    existing.phase.total_bags += phase.total_bags;
    existing.phase.total_price = Number((existing.phase.total_price + phase.total_price).toFixed(2));

    existing.pelletMin = Math.min(existing.pelletMin, phase.pellet_size_mm);
    existing.pelletMax = Math.max(existing.pelletMax, phase.pellet_size_mm);

    phase.products.forEach((product) => {
      const current = existing.productsMap.get(product.product_id);
      if (!current) {
        existing.productsMap.set(product.product_id, { ...product });
        return;
      }

      current.quantity_bags += product.quantity_bags;
      current.total_kg = Number((current.total_kg + product.total_kg).toFixed(2));
      current.total_price = Number((current.total_price + product.total_price).toFixed(2));
    });
  });

  return Array.from(grouped.values()).map((entry) => {
    const pelletLabel =
      entry.pelletMin === entry.pelletMax
        ? String(entry.pelletMin)
        : `${entry.pelletMin}-${entry.pelletMax}`;

    return {
      ...entry.phase,
      pellet_size_mm: entry.pelletMax,
      pellet_size_label: pelletLabel,
      products: Array.from(entry.productsMap.values()),
      daily_avg_kg:
        entry.phase.duration_days > 0
          ? Number((entry.phase.total_consumption_kg / entry.phase.duration_days).toFixed(2))
          : 0,
    };
  });
};
