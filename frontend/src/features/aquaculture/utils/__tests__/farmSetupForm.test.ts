import {
  buildAnnualSimulationInput,
  getCompatibilityCyclesPerYear,
  getCycleProductionEstimate,
  getFingerlingsSuggestionPreview,
  getStockingDensityPreview,
  hasFarmSetupErrors,
  validateFarmSetupForm,
  type FarmSetupFormState,
} from '@/features/aquaculture/utils/farmSetupForm';

const baseForm: FarmSetupFormState = {
  species: 'tilapia',
  infraType: 'bac_hors_sol',
  unitCount: '5',
  unitVolume: '3',
  unitSurface: '',
  annualTarget: '',
  startDate: '2026-05-14',
  fingerlingsPrice: '50',
  sellingPrice: '2800',
  otherCosts: '0',
  fingerlingsCount: '4500',
  harvestWeight: '350',
  survivalRate: '95',
};

describe('farmSetupForm', () => {
  it('valide un formulaire cycle-first complet', () => {
    const errors = validateFarmSetupForm(baseForm);

    expect(errors).toEqual({});
    expect(hasFarmSetupErrors(errors)).toBe(false);
  });

  it('bloque les valeurs numeriques invalides avant appel API', () => {
    const errors = validateFarmSetupForm({
      ...baseForm,
      unitCount: '1.5',
      unitVolume: '-10',
      fingerlingsCount: 'abc',
      harvestWeight: '10',
      survivalRate: '101',
    });

    expect(errors).toMatchObject({
      unitCount: 'createFarmPositiveIntegerError',
      unitVolume: 'createFarmPositiveNumberError',
      fingerlingsCount: 'createFarmPositiveIntegerError',
      harvestWeight: 'createFarmHarvestWeightRangeError',
      survivalRate: 'createFarmSurvivalRateRangeError',
    });
    expect(hasFarmSetupErrors(errors)).toBe(true);
  });

  it('exige le volume pour les infrastructures hors etang', () => {
    const errors = validateFarmSetupForm({
      ...baseForm,
      infraType: 'bac_hors_sol',
      unitSurface: '',
      unitVolume: '',
    });

    expect(errors.unitVolume).toBe('required');
  });

  it('bloque une densite superieure a la capacite du cycle', () => {
    const errors = validateFarmSetupForm({
      ...baseForm,
      unitCount: '5',
      unitVolume: '3',
      infraType: 'bac_hors_sol',
      fingerlingsCount: '4501',
    });

    expect(errors.fingerlingsCount).toBe('createFarmStockingDensityError');
  });

  it('calcule la densite et la suggestion sur le cycle courant', () => {
    const preview = getStockingDensityPreview({
      ...baseForm,
      unitCount: '5',
      unitVolume: '3',
      infraType: 'bac_hors_sol',
      fingerlingsCount: '4500',
    });

    expect(preview?.density).toBeCloseTo(300, 1);
    expect(preview?.isOk).toBe(true);

    const suggestion = getFingerlingsSuggestionPreview({
      ...baseForm,
      unitCount: '5',
      unitVolume: '3',
      infraType: 'bac_hors_sol',
      fingerlingsCount: '',
    });

    expect(suggestion?.value).toBe(4500);
  });

  it('construit un payload de simulation compatible cycle-first', () => {
    const input = buildAnnualSimulationInput({
      ...baseForm,
      species: 'clarias',
      infraType: 'bac_hors_sol',
      unitCount: '5',
      unitVolume: '3',
      unitSurface: '',
      fingerlingsCount: '4500',
    });

    const cycleProduction = getCycleProductionEstimate({
      ...baseForm,
      species: 'clarias',
      infraType: 'bac_hors_sol',
      unitCount: '5',
      unitVolume: '3',
      unitSurface: '',
      fingerlingsCount: '4500',
    });
    const compatibilityCycles = getCompatibilityCyclesPerYear({
      ...baseForm,
      species: 'clarias',
      infraType: 'bac_hors_sol',
      unitCount: '5',
      unitVolume: '3',
      unitSurface: '',
      fingerlingsCount: '4500',
    });

    expect(input).toMatchObject({
      species: 'clarias',
      annual_production_target_kg: cycleProduction ? Number(cycleProduction.toFixed(2)) * compatibilityCycles : 0,
      num_cycles: compatibilityCycles,
      start_date: '2026-05-14',
      expected_survival_rate_pct: 95,
      total_fingerlings_count: 4500 * compatibilityCycles,
    });
  });
});
