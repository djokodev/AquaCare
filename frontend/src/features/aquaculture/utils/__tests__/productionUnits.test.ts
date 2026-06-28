import {
  createIdenticalProductionUnitDrafts,
  createProductionUnitDraft,
  getProductionUnitAllocationProductionEstimate,
  getProductionUnitCapacity,
  getProductionUnitDensityUnit,
  getProductionUnitDisplayDimension,
  getProductionUnitsDensityPreview,
  getProductionUnitsCompatibilitySummary,
  getTotalProductionUnitsCapacity,
  normalizeProductionUnitType,
  suggestProductionUnitFishAllocations,
  validateProductionUnitDraft,
  validateProductionUnitFishAllocations,
} from '@/features/aquaculture/utils/productionUnits';

describe('productionUnits', () => {
  it('calcule la capacite des bacs et cages depuis le volume', () => {
    expect(
      getProductionUnitCapacity({
        unit_type: 'tank',
        volume_m3: 3,
        surface_m2: null,
      })
    ).toBe(900);

    expect(
      getProductionUnitCapacity({
        unit_type: 'cage',
        volume_m3: 4,
        surface_m2: null,
      })
    ).toBe(1200);
  });

  it("calcule la capacite d'un étang depuis la surface", () => {
    expect(
      getProductionUnitCapacity({
        unit_type: 'pond',
        volume_m3: null,
        surface_m2: 120,
      })
    ).toBe(1200);
  });

  it('additionne la capacite de plusieurs unités valides', () => {
    expect(
      getTotalProductionUnitsCapacity([
        { unit_type: 'tank', volume_m3: 3, surface_m2: null },
        { unit_type: 'pond', volume_m3: null, surface_m2: 120 },
        { unit_type: 'cage', volume_m3: 2, surface_m2: null },
      ])
    ).toBe(2700);
  });

  it('cree plusieurs unités identiques avec des noms séquentiels', () => {
    const drafts = createIdenticalProductionUnitDrafts({
      unitType: 'tank',
      count: 3,
      namePrefix: 'Bac',
      volumeM3: '3',
    });

    expect(drafts).toEqual([
      expect.objectContaining({ name: 'Bac 1', unit_type: 'tank', volume_m3: '3' }),
      expect.objectContaining({ name: 'Bac 2', unit_type: 'tank', volume_m3: '3' }),
      expect.objectContaining({ name: 'Bac 3', unit_type: 'tank', volume_m3: '3' }),
    ]);
    expect(getTotalProductionUnitsCapacity(drafts)).toBe(2700);
  });

  it('normalise la compatibilité legacy pour un mix bac et etang', () => {
    const summary = getProductionUnitsCompatibilitySummary([
      createProductionUnitDraft({
        name: 'Bac 1',
        unit_type: 'tank',
        volume_m3: '3',
      }),
      createProductionUnitDraft({
        name: 'Étang principal',
        unit_type: 'pond',
        surface_m2: '120',
      }),
    ]);

    expect(summary).toMatchObject({
      legacy_infrastructure_type: 'bac_hors_sol',
      legacy_unit_count: 2,
      total_capacity: 2100,
      is_mixed: true,
    });
  });

  it('normalise les alias legacy des types d unités', () => {
    expect(normalizeProductionUnitType('bac_hors_sol')).toBe('tank');
    expect(normalizeProductionUnitType('etang')).toBe('pond');
    expect(normalizeProductionUnitType('cage_flottante')).toBe('cage');
  });

  it('retourne l unite de densite adapte a l unité', () => {
    expect(getProductionUnitDensityUnit({ unit_type: 'tank' })).toBe('poissons/m³');
    expect(getProductionUnitDensityUnit({ unit_type: 'pond' })).toBe('poissons/m²');
  });

  it('formate la dimension principale pour l affichage', () => {
    expect(
      getProductionUnitDisplayDimension({
        unit_type: 'tank',
        volume_m3: 3,
        surface_m2: null,
      })
    ).toBe('3.00 m³');

    expect(
      getProductionUnitDisplayDimension({
        unit_type: 'pond',
        volume_m3: null,
        surface_m2: 120,
      })
    ).toBe('120.00 m²');
  });

  it('calcule une densite unique pour des bacs homogènes', () => {
    const preview = getProductionUnitsDensityPreview({
      productionUnits: [
        createProductionUnitDraft({
          name: 'Bac 1',
          unit_type: 'tank',
          volume_m3: '3',
        }),
        createProductionUnitDraft({
          name: 'Bac 2',
          unit_type: 'tank',
          volume_m3: '3',
        }),
        createProductionUnitDraft({
          name: 'Bac 3',
          unit_type: 'tank',
          volume_m3: '3',
        }),
        createProductionUnitDraft({
          name: 'Bac 4',
          unit_type: 'tank',
          volume_m3: '3',
        }),
      ],
      fingerlingsCount: '3600',
    });

    expect(preview).toEqual({
      kind: 'single',
      currentDensity: 300,
      maxDensity: 300,
      unit: 'm3',
      isAtMax: true,
    });
  });

  it('calcule une densite unique pour un mix bac et cage homogène en m3', () => {
    const preview = getProductionUnitsDensityPreview({
      productionUnits: [
        createProductionUnitDraft({
          name: 'Bac 1',
          unit_type: 'tank',
          volume_m3: '3',
        }),
        createProductionUnitDraft({
          name: 'Cage 1',
          unit_type: 'cage',
          volume_m3: '5',
        }),
      ],
      fingerlingsCount: '2400',
    });

    expect(preview).toEqual({
      kind: 'single',
      currentDensity: 300,
      maxDensity: 300,
      unit: 'm3',
      isAtMax: true,
    });
  });

  it('calcule une densite unique pour des etangs homogènes', () => {
    const preview = getProductionUnitsDensityPreview({
      productionUnits: [
        createProductionUnitDraft({
          name: 'Étang 1',
          unit_type: 'pond',
          surface_m2: '100',
        }),
        createProductionUnitDraft({
          name: 'Étang 2',
          unit_type: 'pond',
          surface_m2: '20',
        }),
      ],
      fingerlingsCount: '960',
    });

    expect(preview).toEqual({
      kind: 'single',
      currentDensity: 8,
      maxDensity: 10,
      unit: 'm2',
      isAtMax: false,
    });
  });

  it('signale un setup mixte bac, cage et etang comme non repartissable globalement', () => {
    const preview = getProductionUnitsDensityPreview({
      productionUnits: [
        createProductionUnitDraft({
          name: 'Bac 1',
          unit_type: 'tank',
          volume_m3: '3',
        }),
        createProductionUnitDraft({
          name: 'Cage 1',
          unit_type: 'cage',
          volume_m3: '5',
        }),
        createProductionUnitDraft({
          name: 'Étang principal',
          unit_type: 'pond',
          surface_m2: '120',
        }),
      ],
      fingerlingsCount: '2100',
    });

    expect(preview).toEqual({
      kind: 'mixed',
    });
  });

  it('signale une unité sans nom', () => {
    expect(
      validateProductionUnitDraft({
        local_id: 'local-1',
        name: '',
        unit_type: 'tank',
        volume_m3: '3',
      })
    ).toMatchObject({
      name: 'required',
    });
  });

  it('signale une unité sans dimension', () => {
    expect(
      validateProductionUnitDraft({
        local_id: 'local-2',
        name: 'Bac sans volume',
        unit_type: 'tank',
      })
    ).toMatchObject({
      volume_m3: 'required',
    });

    expect(
      validateProductionUnitDraft({
        local_id: 'local-3',
        name: 'Étang sans surface',
        unit_type: 'pond',
      })
    ).toMatchObject({
      surface_m2: 'required',
    });
  });

  it('signale une dimension invalide', () => {
    expect(
      validateProductionUnitDraft({
        local_id: 'local-4',
        name: 'Bac invalide',
        unit_type: 'tank',
        volume_m3: '-1',
      })
    ).toMatchObject({
      volume_m3: 'createProductionUnitPositiveNumberError',
    });
  });

  it('repartit trois bacs identiques de facon deterministic', () => {
    const units = [
      createProductionUnitDraft({
        name: 'Bac 1',
        unit_type: 'tank',
        volume_m3: '3',
      }),
      createProductionUnitDraft({
        name: 'Bac 2',
        unit_type: 'tank',
        volume_m3: '3',
      }),
      createProductionUnitDraft({
        name: 'Bac 3',
        unit_type: 'tank',
        volume_m3: '3',
      }),
    ];

    expect(
      suggestProductionUnitFishAllocations({
        productionUnits: units,
        totalFishCount: '2700',
      })
    ).toEqual([
      expect.objectContaining({ production_unit_local_id: units[0].local_id, fish_count: '900' }),
      expect.objectContaining({ production_unit_local_id: units[1].local_id, fish_count: '900' }),
      expect.objectContaining({ production_unit_local_id: units[2].local_id, fish_count: '900' }),
    ]);
  });

  it('repartit un bac et un etang a leur capacite maximale', () => {
    const units = [
      createProductionUnitDraft({
        name: 'Bac 1',
        unit_type: 'tank',
        volume_m3: '3',
      }),
      createProductionUnitDraft({
        name: 'Étang 1',
        unit_type: 'pond',
        surface_m2: '120',
      }),
    ];

    expect(
      suggestProductionUnitFishAllocations({
        productionUnits: units,
        totalFishCount: '2100',
      })
    ).toEqual([
      expect.objectContaining({ production_unit_local_id: units[0].local_id, fish_count: '900' }),
      expect.objectContaining({ production_unit_local_id: units[1].local_id, fish_count: '1200' }),
    ]);
  });

  it('repartit un total sous capacite de facon proportionnelle', () => {
    const units = [
      createProductionUnitDraft({
        name: 'Bac 1',
        unit_type: 'tank',
        volume_m3: '3',
      }),
      createProductionUnitDraft({
        name: 'Étang 1',
        unit_type: 'pond',
        surface_m2: '120',
      }),
    ];

    const suggestion = suggestProductionUnitFishAllocations({
      productionUnits: units,
      totalFishCount: '1000',
    });

    expect(suggestion).toEqual([
      expect.objectContaining({ production_unit_local_id: units[0].local_id, fish_count: '429' }),
      expect.objectContaining({ production_unit_local_id: units[1].local_id, fish_count: '571' }),
    ]);
    expect(suggestion?.reduce((total, allocation) => total + Number(allocation.fish_count), 0)).toBe(1000);
    expect(
      suggestion?.every((allocation, index) => {
        const capacity = getProductionUnitCapacity(units[index]);
        return capacity !== null ? Number(allocation.fish_count) <= capacity : false;
      })
    ).toBe(true);
  });

  it('repartit un bac et une cage a pleine capacite', () => {
    const units = [
      createProductionUnitDraft({
        name: 'Bac 1',
        unit_type: 'tank',
        volume_m3: '3',
      }),
      createProductionUnitDraft({
        name: 'Cage 1',
        unit_type: 'cage',
        volume_m3: '5',
      }),
    ];

    expect(
      suggestProductionUnitFishAllocations({
        productionUnits: units,
        totalFishCount: '2400',
      })
    ).toEqual([
      expect.objectContaining({ production_unit_local_id: units[0].local_id, fish_count: '900' }),
      expect.objectContaining({ production_unit_local_id: units[1].local_id, fish_count: '1500' }),
    ]);
  });

  it('repartit un bac, une cage et un etang avec l ordre deterministe', () => {
    const units = [
      createProductionUnitDraft({
        name: 'Bac 1',
        unit_type: 'tank',
        volume_m3: '3',
      }),
      createProductionUnitDraft({
        name: 'Cage 1',
        unit_type: 'cage',
        volume_m3: '5',
      }),
      createProductionUnitDraft({
        name: 'Étang 1',
        unit_type: 'pond',
        surface_m2: '120',
      }),
    ];

    expect(
      suggestProductionUnitFishAllocations({
        productionUnits: units,
        totalFishCount: '3600',
      })
    ).toEqual([
      expect.objectContaining({ production_unit_local_id: units[0].local_id, fish_count: '900' }),
      expect.objectContaining({ production_unit_local_id: units[1].local_id, fish_count: '1500' }),
      expect.objectContaining({ production_unit_local_id: units[2].local_id, fish_count: '1200' }),
    ]);
  });

  it('retourne null si le total demande depasse la capacite totale', () => {
    const units = [
      createProductionUnitDraft({
        name: 'Bac 1',
        unit_type: 'tank',
        volume_m3: '3',
      }),
      createProductionUnitDraft({
        name: 'Étang 1',
        unit_type: 'pond',
        surface_m2: '120',
      }),
    ];

    expect(
      suggestProductionUnitFishAllocations({
        productionUnits: units,
        totalFishCount: '2101',
      })
    ).toBeNull();
  });

  it('bloque une allocation qui depasse la capacite recommandee de l unite', () => {
    const unit = createProductionUnitDraft({
      name: 'Bac 1',
      unit_type: 'tank',
      volume_m3: '3',
    });

    const validation = validateProductionUnitFishAllocations({
      productionUnits: [unit],
      allocations: [
        {
          production_unit_local_id: unit.local_id,
          fish_count: '901',
        },
      ],
      totalFishCount: '901',
      survivalRatePct: '95',
      targetWeightG: '350',
    });

    expect(validation?.unit_errors).toMatchObject({
      [unit.local_id]: 'createFarmProductionUnitRecommendedCapacityExceededError',
    });
    expect(validation?.global_error).toBe('createFarmProductionUnitTotalCapacityExceededError');
  });

  it('bloque une repartition dont la somme ne correspond pas au total demande', () => {
    const units = [
      createProductionUnitDraft({
        name: 'Bac 1',
        unit_type: 'tank',
        volume_m3: '3',
      }),
      createProductionUnitDraft({
        name: 'Bac 2',
        unit_type: 'tank',
        volume_m3: '3',
      }),
      createProductionUnitDraft({
        name: 'Bac 3',
        unit_type: 'tank',
        volume_m3: '3',
      }),
    ];

    const validation = validateProductionUnitFishAllocations({
      productionUnits: units,
      allocations: [
        { production_unit_local_id: units[0].local_id, fish_count: '900' },
        { production_unit_local_id: units[1].local_id, fish_count: '900' },
        { production_unit_local_id: units[2].local_id, fish_count: '800' },
      ],
      totalFishCount: '2700',
      survivalRatePct: '95',
      targetWeightG: '350',
    });

    expect(validation?.total_allocated_fish).toBe(2600);
    expect(validation?.global_error).toBe('createFarmProductionUnitAllocationSumError');
  });

  it('estime correctement la production par unite', () => {
    expect(
      getProductionUnitAllocationProductionEstimate({
        allocation: '900',
        survivalRatePct: '95',
        targetWeightG: '350',
      })
    ).toBe(299.25);
  });
});
