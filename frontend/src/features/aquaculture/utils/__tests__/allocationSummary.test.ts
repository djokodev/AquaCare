import { groupProductionUnitAllocationSummaries } from '../allocationSummary';

describe('groupProductionUnitAllocationSummaries', () => {
  it('regroupe les unités ayant les mêmes dimensions et la même allocation', () => {
    const groups = groupProductionUnitAllocationSummaries(
      [1, 2, 3].map((index) => ({
        local_id: `unit-${index}`,
        name: `Bac ${index}`,
        unit_type: 'tank' as const,
        volume_m3: '200',
        surface_m2: '',
      })),
      [1, 2, 3].map((index) => ({
        production_unit_local_id: `unit-${index}`,
        fish_count: 60_000,
        recommended_capacity: 60_000,
        density: 300,
        density_unit: 'm3' as const,
        estimated_production_kg: 21_600,
        is_over_capacity: false,
      }))
    );

    expect(groups).toEqual([
      {
        unitNames: ['Bac 1', 'Bac 2', 'Bac 3'],
        fishCount: 60_000,
        density: 300,
        densityUnit: 'm3',
        estimatedProductionKg: 21_600,
      },
    ]);
  });

  it('sépare les unités dont le volume ou l allocation diffère', () => {
    const groups = groupProductionUnitAllocationSummaries(
      [
        { local_id: 'unit-1', name: 'Bac 1', unit_type: 'tank', volume_m3: '200' },
        { local_id: 'unit-2', name: 'Bac 2', unit_type: 'tank', volume_m3: '100' },
        { local_id: 'unit-3', name: 'Bac 3', unit_type: 'tank', volume_m3: '200' },
      ],
      [
        { production_unit_local_id: 'unit-1', fish_count: 60_000, recommended_capacity: 60_000, density: 300, density_unit: 'm3', estimated_production_kg: 21_600, is_over_capacity: false },
        { production_unit_local_id: 'unit-2', fish_count: 30_000, recommended_capacity: 30_000, density: 300, density_unit: 'm3', estimated_production_kg: 10_800, is_over_capacity: false },
        { production_unit_local_id: 'unit-3', fish_count: 50_000, recommended_capacity: 60_000, density: 250, density_unit: 'm3', estimated_production_kg: 18_000, is_over_capacity: false },
      ]
    );

    expect(groups.map((group) => group.unitNames)).toEqual([
      ['Bac 1'],
      ['Bac 2'],
      ['Bac 3'],
    ]);
  });
});
