import type {
  ProductionUnitAllocationStatus,
  ProductionUnitDraft,
} from '@/types/aquaculture';

export interface ProductionUnitAllocationSummaryGroup {
  unitNames: string[];
  fishCount: number | null;
  density: number | null;
  densityUnit: ProductionUnitAllocationStatus['density_unit'];
  estimatedProductionKg: number | null;
}

const normalizeDimension = (value?: string): number | null => {
  if (!value?.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Regroupe uniquement les unités dont les caractéristiques physiques et
 * l'allocation calculée sont strictement identiques.
 */
export const groupProductionUnitAllocationSummaries = (
  units: ProductionUnitDraft[],
  statuses: ProductionUnitAllocationStatus[] = []
): ProductionUnitAllocationSummaryGroup[] => {
  const groups = new Map<string, ProductionUnitAllocationSummaryGroup>();

  units.forEach((unit, index) => {
    const status = statuses[index];
    const fishCount = status?.fish_count ?? null;
    const density = status?.density ?? null;
    const densityUnit = status?.density_unit ?? null;
    const estimatedProductionKg = status?.estimated_production_kg ?? null;
    const signature = JSON.stringify([
      unit.unit_type,
      normalizeDimension(unit.volume_m3),
      normalizeDimension(unit.surface_m2),
      fishCount,
      density,
      densityUnit,
      estimatedProductionKg,
    ]);
    const existing = groups.get(signature);

    if (existing) {
      existing.unitNames.push(unit.name);
      return;
    }

    groups.set(signature, {
      unitNames: [unit.name],
      fishCount,
      density,
      densityUnit,
      estimatedProductionKg,
    });
  });

  return Array.from(groups.values());
};
