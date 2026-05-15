import {
  buildAnnualSimulationInput,
  hasFarmSetupErrors,
  validateFarmSetupForm,
  type FarmSetupFormState,
} from '@/features/aquaculture/utils/farmSetupForm';

const baseForm: FarmSetupFormState = {
  species: 'tilapia',
  infraType: 'etang',
  unitCount: '2',
  unitVolume: '',
  unitSurface: '100',
  annualTarget: '1000',
  startDate: '2026-05-14',
  fingerlingsPrice: '50',
  sellingPrice: '2800',
  otherCosts: '0',
  fingerlingsCount: '3000',
  harvestWeight: '350',
  survivalRate: '95',
};

describe('farmSetupForm', () => {
  it('valide un formulaire etang complet', () => {
    const errors = validateFarmSetupForm(baseForm);

    expect(errors).toEqual({});
    expect(hasFarmSetupErrors(errors)).toBe(false);
  });

  it('bloque les valeurs numeriques invalides avant appel API', () => {
    const errors = validateFarmSetupForm({
      ...baseForm,
      unitCount: '1.5',
      unitSurface: '-10',
      annualTarget: 'abc',
      harvestWeight: '10',
      survivalRate: '101',
    });

    expect(errors).toMatchObject({
      unitCount: 'createFarmPositiveIntegerError',
      unitSurface: 'createFarmPositiveNumberError',
      annualTarget: 'createFarmPositiveNumberError',
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

  it('construit un payload de simulation apres validation', () => {
    const input = buildAnnualSimulationInput(baseForm, 2);

    expect(input).toMatchObject({
      species: 'tilapia',
      annual_production_target_kg: 1000,
      num_cycles: 2,
      start_date: '2026-05-14',
      expected_survival_rate_pct: 95,
    });
  });
});
