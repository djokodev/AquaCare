import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import DailyLogScreen from '../DailyLogScreen';
import { useDispatch, useSelector } from 'react-redux';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { offlineService } from '@/services/offlineService';
import { ProductionCycle } from '@/types/aquaculture';

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    createCycleLog: jest.fn(),
  },
}));

jest.mock('@/services/offlineService', () => ({
  offlineService: {
    hasAnyPendingSync: jest.fn(),
    syncAllOfflineData: jest.fn(),
    saveCycleLogOffline: jest.fn(),
  },
}));

jest.mock('@/components/modals/SuccessRewardModal', () => ({
  __esModule: true,
  default: () => null,
}));

describe('features/aquaculture/screens/DailyLogScreen', () => {
  const mockDispatch = jest.fn();
  const mockUseSelector = useSelector as unknown as jest.Mock;
  const mockService = aquacultureService as jest.Mocked<typeof aquacultureService>;
  const mockOffline = offlineService as jest.Mocked<typeof offlineService>;
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
  } as any;
  const route = {
    params: {
      cycleId: 'cycle-1',
      cycleUnitAllocationId: 'allocation-1',
      productionUnitId: 'unit-1',
      productionUnitName: 'Bac 1',
    },
  } as any;

  const activeCycle: ProductionCycle = {
    id: 'cycle-1',
    farm_profile: 'farm-1',
    cycle_name: 'Cycle 1',
    species: 'tilapia',
    pond_identifier: 'P1',
    pond_surface_m2: 100,
    start_date: '2026-01-01',
    initial_count: 1000,
    initial_average_weight: 10,
    initial_biomass: 10,
    current_count: 900,
    current_average_weight: 120,
    current_biomass: 108,
    total_feed_consumed: 130,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };

  const setSelectorCycles = (cycles: ProductionCycle[], currentCycle?: ProductionCycle) => {
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          dashboardData: {
            active_cycles: cycles,
          },
          currentCycle,
        },
      })
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    mockOffline.hasAnyPendingSync.mockResolvedValue(false);
    mockOffline.syncAllOfflineData.mockResolvedValue({
      success: 0,
      failed: 0,
      details: {
        cycleLogs: { success: 0, failed: 0 },
        newCycles: { success: 0, failed: 0 },
        sanitaryLogs: { success: 0, failed: 0 },
      },
    });
  });

  it('affiche un etat vide sans cycle actif', () => {
    setSelectorCycles([]);

    const { getByText } = render(<DailyLogScreen navigation={navigation} />);

    expect(getByText('noActiveCycles')).toBeTruthy();
    fireEvent.press(getByText('createCycle'));
    expect(navigation.navigate).toHaveBeenCalledWith('CreateFarm');
  });

  it('valide sample_count minimum quand sample_total_weight est renseigne', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setSelectorCycles([activeCycle]);

    const { getByText, getByPlaceholderText } = render(<DailyLogScreen navigation={navigation} />);

    fireEvent.changeText(getByPlaceholderText('exampleAffectedCount'), '3');
    fireEvent.changeText(getByPlaceholderText('sampleWeightPlaceholder'), '150');
    fireEvent.press(getByText('save'));

    expect(alertSpy).toHaveBeenCalledWith('error', 'sampleCountTooLow');
    expect(mockService.createCycleLog).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('utilise currentCycle comme selection par defaut', async () => {
    const otherCycle = {
      ...activeCycle,
      id: 'cycle-2',
      cycle_name: 'Cycle 2',
      pond_identifier: 'P2',
    };
    setSelectorCycles([activeCycle, otherCycle], otherCycle);
    mockService.createCycleLog.mockResolvedValueOnce({ id: 'log-2' } as any);

    const { getByText } = render(<DailyLogScreen navigation={navigation} />);
    fireEvent.press(getByText('save'));

    await waitFor(() => {
      expect(mockService.createCycleLog).toHaveBeenCalledWith(
        'cycle-2',
        expect.objectContaining({
          log_date: expect.any(String),
        })
      );
    });
  });

  it('valide la paire echantillonnage si sample_total_weight est fourni seul', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setSelectorCycles([activeCycle]);

    const { getByText, getByPlaceholderText } = render(<DailyLogScreen navigation={navigation} />);

    fireEvent.changeText(getByPlaceholderText('sampleWeightPlaceholder'), '250');
    fireEvent.press(getByText('save'));

    expect(alertSpy).toHaveBeenCalledWith('error', 'samplingPairRequired');
    alertSpy.mockRestore();
  });

  it('valide la paire echantillonnage si sample_count est fourni seul', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setSelectorCycles([activeCycle]);

    const { getByText, getByPlaceholderText } = render(<DailyLogScreen navigation={navigation} />);

    fireEvent.changeText(getByPlaceholderText('exampleAffectedCount'), '20');
    fireEvent.press(getByText('save'));

    expect(alertSpy).toHaveBeenCalledWith('error', 'samplingPairRequired');
    alertSpy.mockRestore();
  });

  it('cree un log online puis affiche succes', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setSelectorCycles([activeCycle]);
    mockService.createCycleLog.mockResolvedValueOnce({ id: 'log-1' } as any);

    const { getByText } = render(<DailyLogScreen navigation={navigation} />);

    fireEvent.press(getByText('save'));

    await waitFor(() => {
      expect(mockService.createCycleLog).toHaveBeenCalledWith(
        'cycle-1',
        expect.objectContaining({
          log_date: expect.any(String),
        })
      );
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'success',
      'recordSaved',
      expect.any(Array)
    );
    alertSpy.mockRestore();
  });

  it('affiche le contexte d unité et envoie cycle_unit_allocation', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setSelectorCycles([activeCycle]);
    mockService.createCycleLog.mockResolvedValueOnce({ id: 'log-unit' } as any);

    const { getByText } = render(<DailyLogScreen navigation={navigation} route={route} />);

    expect(getByText('productionUnitLogContextTitle')).toBeTruthy();
    expect(getByText('Bac 1')).toBeTruthy();

    fireEvent.press(getByText('save'));

    await waitFor(() => {
      expect(mockService.createCycleLog).toHaveBeenCalledWith(
        'cycle-1',
        expect.objectContaining({
          cycle_unit_allocation: 'allocation-1',
          log_date: expect.any(String),
        })
      );
    });

    alertSpy.mockRestore();
  });

  it('envoie les nouveaux champs et ignore les horaires invalides', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setSelectorCycles([activeCycle]);
    mockService.createCycleLog.mockResolvedValueOnce({ id: 'log-extended' } as any);

    const { getByText, getByPlaceholderText } = render(<DailyLogScreen navigation={navigation} />);

    fireEvent.changeText(getByPlaceholderText('mortalityPlaceholder'), '4');
    fireEvent.changeText(getByPlaceholderText('mortalityReasonPlaceholder'), 'Stress');
    fireEvent.changeText(getByPlaceholderText('feedQuantityPlaceholder'), '12.5');
    fireEvent.changeText(getByPlaceholderText('feedTypePlaceholder'), 'Dibaq');
    fireEvent.changeText(getByPlaceholderText('feedSizeMmPlaceholder'), '2.5');
    fireEvent.changeText(getByPlaceholderText('dissolvedOxygenPlaceholder'), '6.4');
    fireEvent.changeText(getByPlaceholderText('ammoniaLevelPlaceholder'), '0.2');
    fireEvent.changeText(getByPlaceholderText('feedingTimesPlaceholder'), '08:00,99:99,12:30');
    fireEvent.press(getByText('save'));

    await waitFor(() => {
      expect(mockService.createCycleLog).toHaveBeenCalledWith(
        'cycle-1',
        expect.objectContaining({
          mortality_count: 4,
          mortality_reason: 'Stress',
          feed_quantity: 12.5,
          feed_type: 'Dibaq',
          feed_size_mm: 2.5,
          dissolved_oxygen: 6.4,
          ammonia_level: 0.2,
          feeding_times: ['08:00', '12:30'],
        })
      );
    });

    expect(alertSpy).toHaveBeenCalledWith('warning', 'feedingTimesInvalidIgnored');
    alertSpy.mockRestore();
  });

  it('sauvegarde offline sur erreur reseau', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setSelectorCycles([activeCycle]);
    mockService.createCycleLog.mockRejectedValueOnce({ message: 'Network Error' });
    mockOffline.saveCycleLogOffline.mockResolvedValueOnce('offline-log-1');

    const { getByText } = render(<DailyLogScreen navigation={navigation} />);

    fireEvent.press(getByText('save'));

    await waitFor(() => {
      expect(mockOffline.saveCycleLogOffline).toHaveBeenCalledWith(
        'cycle-1',
        expect.objectContaining({
          log_date: expect.any(String),
        })
      );
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'success',
      'recordSavedOffline',
      expect.any(Array)
    );
    alertSpy.mockRestore();
  });
});
