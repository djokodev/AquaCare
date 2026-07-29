import {
  buildCycleSimulationInput,
  buildFarmSetupPayload,
  getCompatibilityCyclesPerYear,
  getCycleProductionEstimate,
  getFingerlingsCapacityStatusPreview,
  getFingerlingsSuggestionPreview,
  getStockingDensityPreview,
  getTotalCapacityPreview,
  hasFarmSetupErrors,
  sanitizePositiveIntegerInput,
  validateFarmSetupForm,
  type FarmSetupFormState,
} from '@/features/aquaculture/utils/farmSetupForm';

const baseForm: FarmSetupFormState = {
  launchRequestId: '00000000-0000-4000-8000-000000000001',
  species: 'tilapia',
  infraType: 'bac_hors_sol',
  unitCount: '5',
  unitVolume: '3',
  unitSurface: '',
  annualTarget: '',
  startDate: '2026-05-14',
  cycleDuration: '180',
  fingerlingsPrice: '50',
  sellingPrice: '2800',
  otherCosts: '0',
  fingerlingsCount: '4500',
  harvestWeight: '350',
  survivalRate: '95',
  productionUnits: [],
  productionUnitAllocations: [],
};

describe('farmSetupForm', () => {
  it.each(['2026-10-28', '2026-10-29'])(
    'refuse une baseline %s égale ou postérieure à la récolte prévue',
    (trackingStartDate) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-30T12:00:00Z'));
      const errors = validateFarmSetupForm({
        ...baseForm,
        onboardingMode: 'ongoing',
        startDate: '2026-06-01',
        cycleDuration: '150',
        historicalInitialCount: '2000',
        fingerlingsCount: '1800',
        trackingStartDate,
        trackingStartAverageWeight: '75',
        productionUnits: [{
          local_id: 'unit-1',
          name: 'Bac 1',
          unit_type: 'tank',
          volume_m3: '20',
        }],
        productionUnitAllocations: [{
          production_unit_local_id: 'unit-1',
          fish_count: '1800',
        }],
      });
      expect(errors.trackingStartDate).toBe(
        'ongoingCyclePlannedHarvestElapsed',
      );
      jest.useRealTimers();
    },
  );

  it('accepte la baseline la veille de la récolte prévue', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-30T12:00:00Z'));
    const errors = validateFarmSetupForm({
      ...baseForm,
      onboardingMode: 'ongoing',
      startDate: '2026-06-01',
      cycleDuration: '150',
      historicalInitialCount: '2000',
      fingerlingsCount: '1800',
      trackingStartDate: '2026-10-27',
      trackingStartAverageWeight: '75',
      productionUnits: [{
        local_id: 'unit-1',
        name: 'Bac 1',
        unit_type: 'tank',
        volume_m3: '20',
      }],
      productionUnitAllocations: [{
        production_unit_local_id: 'unit-1',
        fish_count: '1800',
      }],
    });
    expect(errors.trackingStartDate).toBeUndefined();
    jest.useRealTimers();
  });

  it('valide un formulaire cycle-first complet', () => {
    const errors = validateFarmSetupForm({
      ...baseForm,
      productionUnits: [
        { local_id: 'unit-1', name: 'Bac 1', unit_type: 'tank', volume_m3: '50', surface_m2: '' },
      ],
      productionUnitAllocations: [
        { production_unit_local_id: 'unit-1', fish_count: '4500' },
      ],
    });

    expect(errors).toEqual({});
    expect(hasFarmSetupErrors(errors)).toBe(false);
  });

  it('uses the species recommendation and preserves a valid custom duration', () => {
    expect(getCompatibilityCyclesPerYear({ ...baseForm, species: 'clarias', cycleDuration: '120' })).toBe(2);
    expect(getCompatibilityCyclesPerYear({ ...baseForm, species: 'clarias', cycleDuration: '150' })).toBe(2);
    expect(getCompatibilityCyclesPerYear({ ...baseForm, species: 'tilapia', cycleDuration: '' })).toBe(1);
  });

  it.each([
    ['29', 'createFarmCycleDurationRangeError'],
    ['366', 'createFarmCycleDurationRangeError'],
    ['', 'required'],
  ])('validates cycle duration %s', (cycleDuration, expectedError) => {
    expect(validateFarmSetupForm({ ...baseForm, cycleDuration }).cycleDuration).toBe(expectedError);
  });

  it('sends only a validated numeric duration', () => {
    expect(buildCycleSimulationInput({ ...baseForm, cycleDuration: '150' }).cycle_duration_days).toBe(150);
    expect(buildCycleSimulationInput({ ...baseForm, cycleDuration: 'not-a-number' }).cycle_duration_days).toBeUndefined();
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

  it('refuse les valeurs nulles pour les entiers obligatoires', () => {
    const errors = validateFarmSetupForm({
      ...baseForm,
      unitCount: '0',
      fingerlingsCount: '0',
    });

    expect(errors.unitCount).toBe('createFarmPositiveIntegerError');
    expect(errors.fingerlingsCount).toBe('createFarmPositiveIntegerError');
  });

  it('refuse un effectif supérieur à la limite prise en charge', () => {
    const errors = validateFarmSetupForm({
      ...baseForm,
      fingerlingsCount: '1000001',
    });

    expect(errors.fingerlingsCount).toBe('createFarmFishCountLimitError');
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

  it('utilise les unités de production comme source de capacité', () => {
    const form = {
      ...baseForm,
      infraType: '',
      unitCount: '',
      unitVolume: '',
      unitSurface: '',
      productionUnits: [
        {
          local_id: 'unit-1',
          name: 'Bac 1',
          unit_type: 'tank' as const,
          volume_m3: '3',
        },
        {
          local_id: 'unit-2',
          name: 'Bac 2',
          unit_type: 'tank' as const,
          volume_m3: '3',
        },
        {
          local_id: 'unit-3',
          name: 'Étang principal',
          unit_type: 'pond' as const,
          surface_m2: '120',
        },
      ],
      productionUnitAllocations: [],
      fingerlingsCount: '3000',
    } satisfies FarmSetupFormState;

    expect(getFingerlingsSuggestionPreview(form)?.value).toBe(3000);
    expect(getTotalCapacityPreview(form)).toBe('3000');
    expect(validateFarmSetupForm(form)).toMatchObject({});
  });

  it('bloque les alevins au-dessus de la capacite totale des unites', () => {
    const form = {
      ...baseForm,
      infraType: '',
      unitCount: '',
      unitVolume: '',
      unitSurface: '',
      productionUnits: [
        {
          local_id: 'unit-1',
          name: 'Bac 1',
          unit_type: 'tank' as const,
          volume_m3: '3',
        },
        {
          local_id: 'unit-2',
          name: 'Étang principal',
          unit_type: 'pond' as const,
          surface_m2: '120',
        },
      ],
      productionUnitAllocations: [],
      fingerlingsCount: '2101',
    } satisfies FarmSetupFormState;

    expect(validateFarmSetupForm(form).fingerlingsCount).toBe('createFarmStockingDensityError');
    expect(getFingerlingsSuggestionPreview(form)?.value).toBe(2100);
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

    const status = getFingerlingsCapacityStatusPreview({
      ...baseForm,
      unitCount: '5',
      unitVolume: '3',
      infraType: 'bac_hors_sol',
      fingerlingsCount: '4500',
    });

    expect(status?.level).toBe('ok');
    expect(status?.key).toBe('createFarmCapacityReached');

    const suggestion = getFingerlingsSuggestionPreview({
      ...baseForm,
      unitCount: '5',
      unitVolume: '3',
      infraType: 'bac_hors_sol',
      fingerlingsCount: '',
    });

    expect(suggestion?.value).toBe(4500);
  });

  it('signale une sous-utilisation tres forte comme warning', () => {
    const status = getFingerlingsCapacityStatusPreview({
      ...baseForm,
      unitCount: '5',
      unitVolume: '3',
      infraType: 'bac_hors_sol',
      fingerlingsCount: '4',
    });

    expect(status?.level).toBe('warn');
    expect(status?.key).toBe('createFarmCapacityHighlyUnderused');
  });

  it('bloque explicitement le cas 9000 alevins pour 15 m3', () => {
    const form = {
      ...baseForm,
      unitCount: '5',
      unitVolume: '3',
      infraType: 'bac_hors_sol',
      fingerlingsCount: '9000',
    } satisfies FarmSetupFormState;

    const preview = getStockingDensityPreview(form);
    const errors = validateFarmSetupForm(form);
    const suggestion = getFingerlingsSuggestionPreview(form);
    const status = getFingerlingsCapacityStatusPreview(form);

    expect(preview?.density).toBeCloseTo(600, 1);
    expect(preview?.isOk).toBe(false);
    expect(errors.fingerlingsCount).toBe('createFarmStockingDensityError');
    expect(suggestion?.value).toBe(4500);
    expect(status?.level).toBe('error');
    expect(status?.key).toBe('createFarmCapacityOver');
  });

  it('filtre les caracteres non numeriques dans la saisie entiere', () => {
    expect(sanitizePositiveIntegerInput('abc')).toBe('');
    expect(sanitizePositiveIntegerInput('45abc00')).toBe('4500');
    expect(sanitizePositiveIntegerInput('000')).toBe('0');
    expect(sanitizePositiveIntegerInput('')).toBe('');
  });

  it('construit un payload de simulation compatible cycle-first', () => {
    const input = buildCycleSimulationInput({
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

  it('construit un payload legacy sans melanger surface et volume pour un etang', () => {
    const payload = buildFarmSetupPayload({
      ...baseForm,
      species: 'tilapia',
      infraType: '',
      unitCount: '',
      unitVolume: '',
      unitSurface: '',
      productionUnits: [
        {
          local_id: 'unit-pond',
          name: 'Étang principal',
          unit_type: 'pond',
          surface_m2: '120',
        },
      ],
      productionUnitAllocations: [],
    });

    expect(payload).toMatchObject({
      setup_infrastructure_type: 'etang',
      setup_unit_count: 1,
      setup_unit_volume_m3: undefined,
      setup_unit_surface_m2: 120,
    });
  });

  it('construit un payload legacy volume-only pour un bac', () => {
    const payload = buildFarmSetupPayload({
      ...baseForm,
      species: 'tilapia',
      infraType: '',
      unitCount: '',
      unitVolume: '',
      unitSurface: '',
      productionUnits: [
        {
          local_id: 'unit-tank',
          name: 'Bac principal',
          unit_type: 'tank',
          volume_m3: '3',
        },
      ],
      productionUnitAllocations: [],
    });

    expect(payload).toMatchObject({
      setup_infrastructure_type: 'bac_hors_sol',
      setup_unit_count: 1,
      setup_unit_volume_m3: 3,
      setup_unit_surface_m2: undefined,
    });
  });
});
