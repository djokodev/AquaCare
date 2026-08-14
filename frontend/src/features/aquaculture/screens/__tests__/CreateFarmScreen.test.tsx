import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useDispatch, useSelector } from 'react-redux';

import CreateFarmScreen from '../CreateFarmScreen';
import { runCycleSimulation } from '@/features/aquaculture/store/farmSetupSlice';
import { offlineService } from '@/services/offlineService';

let mockLanguage = 'fr';
const mockGetProducts = jest.fn();
const mockGetFarmFeedReferences = jest.fn();
const OFFLINE_SETUP_INTEGRATION_TIMEOUT_MS = 10_000;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'days') return mockLanguage === 'fr' ? 'jours' : 'days';
      if (key === 'required') return mockLanguage === 'fr' ? 'Ce champ est requis' : 'This field is required';
      return key;
    },
    i18n: { language: mockLanguage },
  }),
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock('@/services/offlineService', () => ({
  offlineService: {
    isOnline: jest.fn(),
    saveCycleLaunchOffline: jest.fn(),
    updatePendingCycleLaunch: jest.fn(),
  },
}));

jest.mock('@/features/commerce/services/commerceApi', () => ({
  __esModule: true,
  default: {
    getProducts: (...args: unknown[]) => mockGetProducts(...args),
  },
}));

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getFarmFeedReferences: (...args: unknown[]) => mockGetFarmFeedReferences(...args),
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    farmProfile: { id: 'farm-1', farm_name: 'Ferme Test' },
  }),
}));

describe('features/aquaculture/screens/CreateFarmScreen', () => {
  const mockDispatch = jest.fn();
  const mockOffline = offlineService as jest.Mocked<typeof offlineService>;
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    reset: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
  } as any;

  const mockSimulationSuccess = () => {
    mockDispatch.mockImplementation((action: unknown) => {
      if (typeof action === 'function') {
        return {
          type: runCycleSimulation.fulfilled.type,
          payload: {},
        };
      }
      return action;
    });
  };

  beforeEach(() => {
    mockLanguage = 'fr';
    jest.clearAllMocks();
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    mockOffline.isOnline.mockResolvedValue(true);
    mockOffline.saveCycleLaunchOffline.mockResolvedValue('launch-1');
    mockOffline.updatePendingCycleLaunch.mockResolvedValue();
    mockGetProducts.mockImplementation(({ species }: { species: string }) =>
      Promise.resolve(
        species === 'catfish'
          ? [
              { pellet_size_mm: '2.00' },
              { pellet_size_mm: '6.00' },
              { pellet_size_mm: '9.00' },
            ]
          : [
              { pellet_size_mm: '1.35' },
              { pellet_size_mm: '2.00' },
              { pellet_size_mm: '4.00' },
            ],
      ),
    );
    mockGetFarmFeedReferences.mockResolvedValue([
      { species: 'clarias', pellet_size_mm: '3.50' },
    ]);
    (useSelector as unknown as jest.Mock).mockImplementation(
      (selector: (state: any) => unknown) =>
        selector({
          farmSetup: { cycleSimulation: { loading: false } },
          auth: {
            isAuthenticated: false,
            user: null,
            farmProfile: { farm_name: 'Ferme Test' },
            isLoading: false,
            error: null,
          },
        })
    );
  });

  it.each([
    ['new', false],
    ['ongoing', true],
  ])(
    'sauvegarde un setup initial %s sans simulation quand le réseau est absent',
    async (_mode, ongoing) => {
      mockOffline.isOnline.mockResolvedValue(false);
      const { getAllByText, getByPlaceholderText, getByTestId, getByText } =
        render(<CreateFarmScreen navigation={navigation} />);

      fireEvent.press(getByText('createFarmSpeciesTilapia'));
      if (ongoing) {
        fireEvent.press(getByText('ongoingCycleMode'));
      }
      fireEvent.press(getAllByText('productionUnitTypeTank')[0]);
      fireEvent.changeText(
        getByPlaceholderText('createFarmUnitNamePlaceholder'),
        'Bac offline',
      );
      fireEvent.changeText(
        getByPlaceholderText('createFarmUnitVolumePlaceholder'),
        '3',
      );
      fireEvent.press(getByText('+ createFarmAddUnitBtn'));
      fireEvent.changeText(
        getByPlaceholderText('createFarmFingerlingsCountPlaceholderMax'),
        '900',
      );
      if (ongoing) {
        fireEvent.press(getByTestId('createFarmStartDate'));
        fireEvent.press(getByTestId('createFarmStartDate-previous-month'));
        fireEvent.press(getByTestId('createFarmStartDate-day-2026-07-01'));
        fireEvent.press(getByText('confirm'));
        fireEvent.changeText(
          getByTestId('createFarmHistoricalInitialCount'),
          '1000',
        );
        fireEvent.changeText(
          getByTestId('createFarmTrackingStartWeight'),
          '50',
        );
      }

      fireEvent.press(getByTestId('createFarmSimulateButton'));

      await waitFor(() => {
        expect(mockOffline.saveCycleLaunchOffline).toHaveBeenCalledWith(
          expect.objectContaining({
            launch_kind: 'initial_setup',
            cycle: expect.objectContaining({
              onboarding_mode: ongoing ? 'ongoing' : 'new',
              created_offline: true,
            }),
          }),
          { attempted: false },
        );
      });
      expect(mockDispatch).not.toHaveBeenCalled();
    },
    OFFLINE_SETUP_INTEGRATION_TIMEOUT_MS,
  );

  it('préserve la baseline et les allocations pendant une édition offline', async () => {
    const pendingPayload = {
      launch_uuid: '11111111-1111-4111-8111-111111111111',
      launch_kind: 'initial_setup',
      production_plan: {
        annual_production_target_kg: 1200,
        num_cycles_per_year: 2,
        fingerlings_cost_per_unit_fcfa: 50,
      },
      cycle: {
        onboarding_mode: 'ongoing',
        species: 'tilapia',
        start_date: '2026-06-01',
        initial_count: 2000,
        initial_average_weight: null,
        planned_cycle_duration_days: 180,
        expected_survival_rate_pct: 95,
        fingerlings_cost_fcfa: 100000,
        other_operational_costs_fcfa: 0,
        created_offline: true,
      },
      tracking_baseline: {
        tracking_start_date: '2026-07-20',
        fish_count: 1850,
        average_weight_g: '50.00',
        biomass_kg: null,
      },
      production_units: [{
        local_id: 'unit-local-1',
        source: 'new',
        name: 'Bac hydraté',
        unit_type: 'tank',
        volume_m3: 10,
      }],
      allocations: [{
        production_unit_local_id: 'unit-local-1',
        fish_count: 1850,
      }],
      initial_feed_stocks: [],
    } as any;
    const route = {
      params: {
        offlineLaunch: pendingPayload,
        editingOfflineLaunchId: pendingPayload.launch_uuid,
      },
    } as any;
    const { getByPlaceholderText, getByTestId } = render(
      <CreateFarmScreen navigation={navigation} route={route} />,
    );

    await waitFor(() => {
      expect(
        getByPlaceholderText('createFarmFingerlingsCountPlaceholderMax').props
          .value,
      ).toBe('1850');
    });
    fireEvent.press(getByTestId('createFarmSimulateButton'));

    await waitFor(() => {
      expect(mockOffline.updatePendingCycleLaunch).toHaveBeenCalledWith(
        pendingPayload.launch_uuid,
        expect.objectContaining({
          launch_uuid: pendingPayload.launch_uuid,
          tracking_baseline: expect.objectContaining({ fish_count: 1850 }),
          allocations: [{
            production_unit_local_id: 'unit-local-1',
            fish_count: 1850,
          }],
        }),
      );
    });
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('affiche le nom de la ferme en haut du flux', () => {
    const { getByText } = render(<CreateFarmScreen navigation={navigation} />);

    expect(getByText('currentFarm')).toBeTruthy();
    expect(getByText('Ferme Test')).toBeTruthy();
    expect(getByText('createFarmTitle')).toBeTruthy();
  });

  it('simplifie la déclaration du stock pour un cycle déjà en cours', async () => {
    const screen = render(<CreateFarmScreen navigation={navigation} />);

    fireEvent.press(screen.getByText('ongoingCycleMode'));
    expect(
      screen.getByTestId('createFarmStartDate').props.accessibilityValue,
    ).toEqual({ text: 'selectDate' });
    expect(screen.queryByText(/ongoingCycleActualStartDate/)).toBeNull();
    expect(screen.getByText(/declaredHistory/)).toBeTruthy();
    expect(screen.getByText(/trackingStartSituation/)).toBeTruthy();
    expect(
      screen.getByTestId('createFarmTrackingStartDate').props.accessibilityValue,
    ).not.toEqual({ text: 'selectDate' });
    expect(
      screen.queryByText('ongoingCycleTrackingDateInvalid'),
    ).toBeNull();
    fireEvent.press(screen.getByText('createFarmSpeciesTilapia'));
    await waitFor(() => {
      expect(
        screen.getByTestId('createFarmOpeningStockPelletSize-1.35'),
      ).toBeTruthy();
    });

    expect(
      screen.queryByText('preTrackingEventsNotReconstructed'),
    ).toBeNull();
    expect(screen.queryByText('knownCost')).toBeNull();
    expect(screen.queryByText('unknownCost')).toBeNull();
    expect(screen.getByText('stockCostHint')).toBeTruthy();

    fireEvent.changeText(
      screen.getByTestId('createFarmOpeningStockName'),
      'Aliment local',
    );
    fireEvent.press(
      screen.getByTestId('createFarmOpeningStockPelletSize-4'),
    );
    fireEvent.changeText(
      screen.getByTestId('createFarmOpeningStockQuantity'),
      '25',
    );
    fireEvent.changeText(
      screen.getByTestId('createFarmOpeningStockCost'),
      '12000',
    );
    fireEvent.press(screen.getByText('addOpeningStock'));

    expect(screen.getByText('4 mm · 25 kg · knownCost')).toBeTruthy();
  });

  it('adapte les granulométries au catalogue de l espèce sélectionnée', async () => {
    const screen = render(<CreateFarmScreen navigation={navigation} />);

    fireEvent.press(screen.getByText('ongoingCycleMode'));
    fireEvent.press(screen.getByText('createFarmSpeciesTilapia'));
    await waitFor(() => {
      expect(
        screen.getByTestId('createFarmOpeningStockPelletSize-1.35'),
      ).toBeTruthy();
    });
    expect(
      screen.queryByTestId('createFarmOpeningStockPelletSize-6'),
    ).toBeNull();

    fireEvent.press(screen.getByText('createFarmSpeciesClarias'));
    await waitFor(() => {
      expect(
        screen.getByTestId('createFarmOpeningStockPelletSize-6'),
      ).toBeTruthy();
      expect(
        screen.getByTestId('createFarmOpeningStockPelletSize-3.5'),
      ).toBeTruthy();
    });
    expect(
      screen.queryByTestId('createFarmOpeningStockPelletSize-1.35'),
    ).toBeNull();
    expect(mockGetProducts).toHaveBeenCalledWith({ species: 'tilapia' });
    expect(mockGetProducts).toHaveBeenCalledWith({ species: 'catfish' });
  });

  it('permet de préparer les bacs de calibrage sans perdre le formulaire', () => {
    const { getByText, getByTestId } = render(<CreateFarmScreen navigation={navigation} />);

    expect(getByText('prepareCalibrationTanks')).toBeTruthy();
    fireEvent.changeText(getByTestId('createFarmCalibrationName'), 'Bac tri A');
    fireEvent.changeText(getByTestId('createFarmCalibrationVolume'), '10');
    fireEvent.press(getByTestId('createFarmAddCalibrationUnit'));

    expect(getByText('Bac tri A')).toBeTruthy();
    expect(getByTestId('createFarmCycleDurationInput')).toBeTruthy();
    expect(navigation.navigate).not.toHaveBeenCalledWith('CalibrationTanks');
  });

  it('permet de revenir au dashboard via la fleche de retour', () => {
    const { getByTestId } = render(<CreateFarmScreen navigation={navigation} />);

    fireEvent.press(getByTestId('createFarmBackButton'));

    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('revient au dashboard racine si la pile ne permet pas un retour', () => {
    navigation.canGoBack.mockReturnValue(false);
    const { getByTestId } = render(<CreateFarmScreen navigation={navigation} />);

    fireEvent.press(getByTestId('createFarmBackButton'));

    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  });

  it('n selectionne aucun type par defaut dans les deux formulaires', () => {
    const { queryByPlaceholderText, getByPlaceholderText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    expect(queryByPlaceholderText('createFarmUnitVolumePlaceholder')).toBeNull();
    expect(queryByPlaceholderText('createFarmUnitSurfacePlaceholder')).toBeNull();
    expect(getByPlaceholderText('createFarmBulkUnitCountPlaceholder').props.value).toBe('');
  });

  it.each([
    ['createFarmSpeciesClarias', '120', 'createFarmCycleDurationClariasPlaceholder'],
    ['createFarmSpeciesTilapia', '180', 'createFarmCycleDurationTilapiaPlaceholder'],
  ])('préremplit la durée recommandée pour %s', (speciesLabel, expected, placeholder) => {
    const { getByText, getByTestId } = render(<CreateFarmScreen navigation={navigation} />);

    fireEvent.press(getByText(speciesLabel));

    expect(getByTestId('createFarmCycleDurationInput').props.value).toBe(expected);
    expect(getByTestId('createFarmCycleDurationInput').props.placeholder).toBe(placeholder);
  });

  it('change le défaut d espèce tant que la durée n est pas personnalisée', () => {
    const { getByText, getByTestId } = render(<CreateFarmScreen navigation={navigation} />);

    fireEvent.press(getByText('createFarmSpeciesTilapia'));
    fireEvent.press(getByText('createFarmSpeciesClarias'));

    expect(getByTestId('createFarmCycleDurationInput').props.value).toBe('120');
  });

  it('conserve une durée personnalisée lors du changement d espèce', () => {
    const { getByText, getByTestId } = render(<CreateFarmScreen navigation={navigation} />);
    const durationInput = getByTestId('createFarmCycleDurationInput');

    fireEvent.press(getByText('createFarmSpeciesClarias'));
    fireEvent.changeText(durationInput, '150abc');
    fireEvent.press(getByText('createFarmSpeciesTilapia'));

    expect(getByTestId('createFarmCycleDurationInput').props.value).toBe('150');
  });

  it.each([
    ['', 'Ce champ est requis'],
    ['29', 'createFarmCycleDurationRangeError'],
    ['0', 'createFarmCycleDurationRangeError'],
    ['366', 'createFarmCycleDurationRangeError'],
  ])('affiche une erreur de durée pour %s', (value, errorKey) => {
    const { getByText, getByTestId, queryByText } = render(<CreateFarmScreen navigation={navigation} />);

    fireEvent.press(getByText('createFarmSpeciesClarias'));
    fireEvent.changeText(getByTestId('createFarmCycleDurationInput'), value);

    expect(queryByText(errorKey)).toBeTruthy();
  });

  it('expose unité, aide et accessibilité pour la durée', () => {
    const { getByText, getByTestId } = render(<CreateFarmScreen navigation={navigation} />);
    fireEvent.press(getByText('createFarmSpeciesClarias'));
    const input = getByTestId('createFarmCycleDurationInput');

    expect(getByText('createFarmCycleDurationHint')).toBeTruthy();
    expect(input.props.accessibilityLabel).toBe('createFarmCycleDurationLabel');
    expect(input.props.accessibilityHint).toBe('createFarmCycleDurationHint');
  });

  it('synchronise l erreur visible et l annonce accessible pour un champ vide', () => {
    const { getByText, getByTestId } = render(<CreateFarmScreen navigation={navigation} />);
    fireEvent.press(getByText('createFarmSpeciesClarias'));
    const input = getByTestId('createFarmCycleDurationInput');
    fireEvent.changeText(input, '');

    expect(input.props.accessibilityState).toEqual({ invalid: true });
    expect(input.props.accessibilityValue.text).toBe('Ce champ est requis');
    expect(getByText('Ce champ est requis')).toBeTruthy();
  });

  it('annonce la plage pour 29 et la valeur avec son unité pour 150', () => {
    const { getByText, getByTestId, queryByText } = render(
      <CreateFarmScreen navigation={navigation} />
    );
    fireEvent.press(getByText('createFarmSpeciesClarias'));
    const input = getByTestId('createFarmCycleDurationInput');

    fireEvent.changeText(input, '29');
    expect(input.props.accessibilityState).toEqual({ invalid: true });
    expect(input.props.accessibilityValue.text).toBe('createFarmCycleDurationRangeError');
    expect(queryByText('createFarmCycleDurationRangeError')).toBeTruthy();

    fireEvent.changeText(input, '150');
    expect(input.props.accessibilityState).toEqual({ invalid: false });
    expect(input.props.accessibilityValue.text).toBe('150 jours');
    expect(queryByText('createFarmCycleDurationRangeError')).toBeNull();
  });

  it('annonce la durée en anglais avec days', () => {
    mockLanguage = 'en';
    const { getByText, getByTestId } = render(<CreateFarmScreen navigation={navigation} />);
    fireEvent.press(getByText('createFarmSpeciesClarias'));
    const input = getByTestId('createFarmCycleDurationInput');
    fireEvent.changeText(input, '150');

    expect(input.props.accessibilityValue.text).toBe('150 days');
  });

  it('clic sur Bac selectionne puis deselectionne le type', () => {
    const { getAllByText, queryByPlaceholderText, getByPlaceholderText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getAllByText('productionUnitTypeTank')[0]);
    expect(getByPlaceholderText('createFarmUnitVolumePlaceholder')).toBeTruthy();

    fireEvent.press(getAllByText('productionUnitTypeTank')[0]);
    expect(queryByPlaceholderText('createFarmUnitVolumePlaceholder')).toBeNull();
  });

  it('bloque la continuation sans aucune unite de production', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByText } = render(<CreateFarmScreen navigation={navigation} />);
    fireEvent.press(getByText('createFarmSimulateBtn'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('error', 'createFarmAtLeastOneUnitError');
      expect(navigation.navigate).not.toHaveBeenCalled();
    });

    alertSpy.mockRestore();
  });

  it('signale visuellement la limite d alevins avant la simulation', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getAllByText, getByPlaceholderText, getByText, queryByText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getByText('createFarmSpeciesTilapia'));
    fireEvent.press(getAllByText('productionUnitTypeTank')[0]);
    fireEvent.changeText(getByPlaceholderText('createFarmUnitNamePlaceholder'), 'Bac 1');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitVolumePlaceholder'), '3');
    fireEvent.press(getByText('+ createFarmAddUnitBtn'));
    fireEvent.changeText(
      getByPlaceholderText('createFarmFingerlingsCountPlaceholderMax'),
      '1000001'
    );

    expect(getByText('createFarmFishCountLimitError')).toBeTruthy();
    expect(queryByText('createFarmCapacityOver')).toBeNull();
    expect(queryByText('createFarmStockingDensityError')).toBeNull();

    fireEvent.press(getByText('createFarmSimulateBtn'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'error',
        'createFarmFingerlingsCountLabel : createFarmFishCountLimitError'
      );
      expect(navigation.navigate).not.toHaveBeenCalledWith(
        'CycleSimulation',
        expect.anything()
      );
    });

    alertSpy.mockRestore();
  });

  it('ajoute une unite puis ouvre la simulation avec les unites en etat', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockSimulationSuccess();

    const { getByText, getByPlaceholderText, getAllByText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getByText('createFarmSpeciesTilapia'));
    fireEvent.press(getAllByText('productionUnitTypeTank')[0]);
    fireEvent.changeText(getByPlaceholderText('createFarmUnitNamePlaceholder'), 'Bac 1');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitVolumePlaceholder'), '3');
    fireEvent.press(getByText('+ createFarmAddUnitBtn'));

    expect(getAllByText('Bac 1').length).toBeGreaterThan(0);

    fireEvent.changeText(
      getByPlaceholderText('createFarmFingerlingsCountPlaceholderMax'),
      '300'
    );
    fireEvent.press(getByText('createFarmSimulateBtn'));

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith(
        'CycleSimulation',
        expect.objectContaining({
          formData: expect.objectContaining({
            productionUnits: [
              expect.objectContaining({
                name: 'Bac 1',
                unit_type: 'tank',
                volume_m3: '3',
              }),
            ],
          }),
        })
      );
    });

    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('garde la surface pour un etang sans la convertir en volume', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockSimulationSuccess();

    const { getAllByText, getByPlaceholderText, getByText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getByText('createFarmSpeciesTilapia'));
    fireEvent.press(getAllByText('productionUnitTypePond')[0]);
    fireEvent.changeText(getByPlaceholderText('createFarmUnitNamePlaceholder'), 'Étang principal');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitSurfacePlaceholder'), '120');
    fireEvent.press(getByText('+ createFarmAddUnitBtn'));

    await waitFor(() => {
      expect(getAllByText('Étang principal').length).toBeGreaterThan(0);
    });

    fireEvent.changeText(
      getByPlaceholderText('createFarmFingerlingsCountPlaceholderMax'),
      '1200'
    );
    fireEvent.press(getByText('createFarmSimulateBtn'));

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith(
        'CycleSimulation',
        expect.objectContaining({
          formData: expect.objectContaining({
            unitSurface: '120',
            unitVolume: '',
            productionUnits: [
              expect.objectContaining({
                name: 'Étang principal',
                unit_type: 'pond',
                surface_m2: '120',
                volume_m3: '',
              }),
            ],
          }),
        })
      );
    });

    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('annuler reinitialise le formulaire single', () => {
    const { getAllByText, getByPlaceholderText, queryByPlaceholderText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getAllByText('productionUnitTypeTank')[0]);
    fireEvent.changeText(getByPlaceholderText('createFarmUnitNamePlaceholder'), 'Bac 1');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitVolumePlaceholder'), '3');
    fireEvent.press(getAllByText('cancel')[0]);

    expect(getByPlaceholderText('createFarmUnitNamePlaceholder').props.value).toBe('');
    expect(queryByPlaceholderText('createFarmUnitVolumePlaceholder')).toBeNull();
    expect(getAllByText('createFarmNoUnitTypeSelected').length).toBeGreaterThan(0);
  });

  it('annuler reinitialise le formulaire bulk', () => {
    const { getAllByText, getByPlaceholderText, queryByPlaceholderText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getAllByText('productionUnitTypeTank')[1]);
    fireEvent.changeText(getByPlaceholderText('createFarmBulkUnitCountPlaceholder'), '5');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitVolumePlaceholder'), '3');
    fireEvent.press(getAllByText('cancel')[1]);

    expect(getByPlaceholderText('createFarmBulkUnitCountPlaceholder').props.value).toBe('');
    expect(queryByPlaceholderText('createFarmUnitVolumePlaceholder')).toBeNull();
    expect(getAllByText('createFarmNoUnitTypeSelected').length).toBeGreaterThan(0);
  });

  it('refuse un ajout en lot qui créerait un nom déjà utilisé', () => {
    const { getAllByText, getByPlaceholderText, getByText, queryByText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getAllByText('productionUnitTypePond')[0]);
    fireEvent.changeText(getByPlaceholderText('createFarmUnitNamePlaceholder'), 'Bac 1');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitSurfacePlaceholder'), '120');
    fireEvent.press(getByText('+ createFarmAddUnitBtn'));

    fireEvent.press(getAllByText('productionUnitTypeTank')[1]);
    fireEvent.changeText(getByPlaceholderText('createFarmBulkUnitCountPlaceholder'), '2');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitVolumePlaceholder'), '200');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitBaseNamePlaceholder'), 'Bac');
    fireEvent.press(getByText('+ createFarmAddUnitsIdenticalBtn'));

    expect(getByText('createFarmProductionUnitDuplicateNameError')).toBeTruthy();
    expect(queryByText('Bac 2')).toBeNull();
  });

  it('propose automatiquement le total et la répartition à pleine capacité', async () => {
    const { getAllByDisplayValue, getAllByText, getByPlaceholderText, getByText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getAllByText('productionUnitTypePond')[0]);
    fireEvent.changeText(getByPlaceholderText('createFarmUnitNamePlaceholder'), 'Étang 1');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitSurfacePlaceholder'), '120');
    fireEvent.press(getByText('+ createFarmAddUnitBtn'));

    fireEvent.press(getAllByText('productionUnitTypeTank')[1]);
    fireEvent.changeText(getByPlaceholderText('createFarmBulkUnitCountPlaceholder'), '2');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitVolumePlaceholder'), '200');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitBaseNamePlaceholder'), 'Bac');
    fireEvent.press(getByText('+ createFarmAddUnitsIdenticalBtn'));

    await waitFor(() => {
      expect(getByPlaceholderText('createFarmFingerlingsCountPlaceholderMax').props.value).toBe('121200');
      expect(getAllByDisplayValue('1200')).toHaveLength(1);
      expect(getAllByDisplayValue('60000')).toHaveLength(2);
    });
  });

  it('permet la simulation meme si le formulaire bulk a ete touche apres ajout', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockSimulationSuccess();

    const { getByText, getByPlaceholderText, getAllByText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getByText('createFarmSpeciesTilapia'));
    fireEvent.press(getAllByText('productionUnitTypeTank')[1]);
    fireEvent.changeText(getByPlaceholderText('createFarmBulkUnitCountPlaceholder'), '3');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitVolumePlaceholder'), '3');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitBaseNamePlaceholder'), 'Bac');
    fireEvent.press(getByText('+ createFarmAddUnitsIdenticalBtn'));

    fireEvent.press(getAllByText('productionUnitTypeTank')[1]);
    fireEvent.changeText(
      getByPlaceholderText('createFarmFingerlingsCountPlaceholderMax'),
      '2700'
    );
    fireEvent.press(getByText('createFarmSimulateBtn'));

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith(
        'CycleSimulation',
        expect.objectContaining({
          formData: expect.objectContaining({
            fingerlingsCount: '2700',
            productionUnits: [
              expect.objectContaining({ name: 'Bac 1', unit_type: 'tank', volume_m3: '3' }),
              expect.objectContaining({ name: 'Bac 2', unit_type: 'tank', volume_m3: '3' }),
              expect.objectContaining({ name: 'Bac 3', unit_type: 'tank', volume_m3: '3' }),
            ],
          }),
        })
      );
    });

    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('affiche la section de repartition et pre-remplit trois bacs a 900', async () => {
    mockSimulationSuccess();

    const { getAllByDisplayValue, getByPlaceholderText, getByText, getAllByText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getByText('createFarmSpeciesTilapia'));
    fireEvent.press(getAllByText('productionUnitTypeTank')[1]);
    fireEvent.changeText(getByPlaceholderText('createFarmBulkUnitCountPlaceholder'), '3');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitVolumePlaceholder'), '3');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitBaseNamePlaceholder'), 'Bac');
    fireEvent.press(getByText('+ createFarmAddUnitsIdenticalBtn'));

    fireEvent.changeText(
      getByPlaceholderText('createFarmFingerlingsCountPlaceholderMax'),
      '2700'
    );

    await waitFor(() => {
      expect(getByText('createFarmProductionUnitAllocationSectionTitle')).toBeTruthy();
      expect(getAllByDisplayValue('900')).toHaveLength(3);
    });
  });

  it('pre-remplit un bac et un etang selon leur capacite', async () => {
    mockSimulationSuccess();

    const { getAllByDisplayValue, getByPlaceholderText, getByText, getAllByText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getByText('createFarmSpeciesTilapia'));
    fireEvent.press(getAllByText('productionUnitTypeTank')[0]);
    fireEvent.changeText(getByPlaceholderText('createFarmUnitNamePlaceholder'), 'Bac 1');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitVolumePlaceholder'), '3');
    fireEvent.press(getByText('+ createFarmAddUnitBtn'));

    fireEvent.press(getAllByText('productionUnitTypePond')[0]);
    fireEvent.changeText(getByPlaceholderText('createFarmUnitNamePlaceholder'), 'Étang principal');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitSurfacePlaceholder'), '120');
    fireEvent.press(getByText('+ createFarmAddUnitBtn'));

    fireEvent.changeText(
      getByPlaceholderText('createFarmFingerlingsCountPlaceholderMax'),
      '2100'
    );

    await waitFor(() => {
      expect(getAllByDisplayValue('900')).toHaveLength(1);
      expect(getAllByDisplayValue('1200')).toHaveLength(1);
    });
  });

  it('bloque la simulation quand une allocation depasse la capacite de son unite', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockSimulationSuccess();

    const { getAllByDisplayValue, getByPlaceholderText, getByText, getAllByText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getByText('createFarmSpeciesTilapia'));
    fireEvent.press(getAllByText('productionUnitTypeTank')[0]);
    fireEvent.changeText(getByPlaceholderText('createFarmUnitNamePlaceholder'), 'Bac 1');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitVolumePlaceholder'), '3');
    fireEvent.press(getByText('+ createFarmAddUnitBtn'));

    fireEvent.press(getAllByText('productionUnitTypePond')[0]);
    fireEvent.changeText(getByPlaceholderText('createFarmUnitNamePlaceholder'), 'Étang principal');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitSurfacePlaceholder'), '120');
    fireEvent.press(getByText('+ createFarmAddUnitBtn'));

    fireEvent.changeText(
      getByPlaceholderText('createFarmFingerlingsCountPlaceholderMax'),
      '2100'
    );

    await waitFor(() => {
      expect(getAllByDisplayValue('900')).toHaveLength(1);
      expect(getAllByDisplayValue('1200')).toHaveLength(1);
    });

    fireEvent.changeText(getAllByDisplayValue('900')[0], '901');
    fireEvent.changeText(getAllByDisplayValue('1200')[0], '1199');
    fireEvent.press(getByText('createFarmSimulateBtn'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'error',
        'Bac 1 : createFarmProductionUnitRecommendedCapacityExceededError'
      );
      expect(navigation.navigate).not.toHaveBeenCalledWith('CycleSimulation', expect.anything());
    });

    alertSpy.mockRestore();
  });

  it('bloque la simulation quand la somme repartie ne correspond pas au total', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockSimulationSuccess();

    const { getAllByDisplayValue, getByPlaceholderText, getByText, getAllByText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getByText('createFarmSpeciesTilapia'));
    fireEvent.press(getAllByText('productionUnitTypeTank')[1]);
    fireEvent.changeText(getByPlaceholderText('createFarmBulkUnitCountPlaceholder'), '3');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitVolumePlaceholder'), '3');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitBaseNamePlaceholder'), 'Bac');
    fireEvent.press(getByText('+ createFarmAddUnitsIdenticalBtn'));

    fireEvent.changeText(
      getByPlaceholderText('createFarmFingerlingsCountPlaceholderMax'),
      '2700'
    );

    await waitFor(() => {
      expect(getAllByDisplayValue('900')).toHaveLength(3);
    });

    fireEvent.changeText(getAllByDisplayValue('900')[0], '800');
    fireEvent.press(getByText('createFarmSimulateBtn'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'error',
        'createFarmProductionUnitAllocationSumError'
      );
      expect(navigation.navigate).not.toHaveBeenCalledWith('CycleSimulation', expect.anything());
    });

    alertSpy.mockRestore();
  });

  it('restaure la repartition recommandee apres reset', async () => {
    mockSimulationSuccess();

    const { getAllByDisplayValue, getByPlaceholderText, getByText, getAllByText } =
      render(<CreateFarmScreen navigation={navigation} />);

    fireEvent.press(getAllByText('productionUnitTypeTank')[1]);
    fireEvent.changeText(getByPlaceholderText('createFarmBulkUnitCountPlaceholder'), '3');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitVolumePlaceholder'), '3');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitBaseNamePlaceholder'), 'Bac');
    fireEvent.press(getByText('+ createFarmAddUnitsIdenticalBtn'));

    fireEvent.changeText(
      getByPlaceholderText('createFarmFingerlingsCountPlaceholderMax'),
      '2700'
    );

    await waitFor(() => {
      expect(getAllByDisplayValue('900')).toHaveLength(3);
    });

    fireEvent.changeText(getAllByDisplayValue('900')[0], '800');
    fireEvent.press(getByText('createFarmProductionUnitAllocationResetBtn'));

    await waitFor(() => {
      expect(getAllByDisplayValue('900')).toHaveLength(3);
    });
  });

  it('passe en mode edition et pre-remplit les champs', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockSimulationSuccess();

    const { getAllByText, getByPlaceholderText, getByText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getAllByText('productionUnitTypeTank')[0]);
    fireEvent.changeText(getByPlaceholderText('createFarmUnitNamePlaceholder'), 'Bac 1');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitVolumePlaceholder'), '3');
    fireEvent.press(getByText('+ createFarmAddUnitBtn'));

    fireEvent.press(getByText('createFarmEditUnitAction'));

    await waitFor(() => {
      expect(getByText('createFarmEditUnitTitle')).toBeTruthy();
      expect(getByPlaceholderText('createFarmUnitNamePlaceholder').props.value).toBe('Bac 1');
      expect(getByPlaceholderText('createFarmUnitVolumePlaceholder').props.value).toBe('3');
    });

    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('ne rend plus de badge numerique dans les cartes', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockSimulationSuccess();

    const { getAllByText, getByPlaceholderText, getByText, queryByText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getAllByText('productionUnitTypeTank')[0]);
    fireEvent.changeText(getByPlaceholderText('createFarmUnitNamePlaceholder'), 'Bac 1');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitVolumePlaceholder'), '3');
    fireEvent.press(getByText('+ createFarmAddUnitBtn'));

    await waitFor(() => {
      expect(queryByText('1')).toBeNull();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
