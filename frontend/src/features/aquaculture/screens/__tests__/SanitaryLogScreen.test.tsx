import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import SanitaryLogScreen from '../SanitaryLogScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { offlineService } from '@/services/offlineService';
import { useDispatch, useSelector } from 'react-redux';
import { ProductionCycle } from '@/types/aquaculture';

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    createSanitaryLog: jest.fn(),
  },
}));

jest.mock('@/services/offlineService', () => ({
  offlineService: {
    saveSanitaryLogOffline: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
}));

describe('features/aquaculture/screens/SanitaryLogScreen', () => {
  const mockDispatch = jest.fn();
  const mockService = aquacultureService as jest.Mocked<typeof aquacultureService>;
  const mockOffline = offlineService as jest.Mocked<typeof offlineService>;
  const mockUseSelector = useSelector as unknown as jest.Mock;
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
  } as any;

  const activeCycle: ProductionCycle = {
    id: 'cycle-1',
    farm_profile: 'farm-1',
    cycle_name: 'Cycle Sanitaire',
    species: 'tilapia',
    pond_identifier: 'P1',
    pond_surface_m2: 100,
    start_date: '2026-01-01',
    initial_count: 1000,
    initial_average_weight: 10,
    initial_biomass: 10,
    current_count: 900,
    current_average_weight: 100,
    current_biomass: 90,
    total_feed_consumed: 120,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
  });

  const setSelectorState = (cycles: ProductionCycle[], currentCycle?: ProductionCycle) => {
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

  it('affiche un etat vide sans cycle actif et navigue vers NewCycle', async () => {
    setSelectorState([]);

    const { getByText } = render(<SanitaryLogScreen navigation={navigation} />);

    expect(getByText('noActiveCycles')).toBeTruthy();
    fireEvent.press(getByText('createCycle'));
    expect(navigation.navigate).toHaveBeenCalledWith('NewCycle');
  });

  it('bloque la sauvegarde si le type d evenement est absent', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setSelectorState([activeCycle]);

    const { getByText, getByPlaceholderText } = render(<SanitaryLogScreen navigation={navigation} />);

    fireEvent.changeText(getByPlaceholderText('symptomsPlaceholder'), 'Respiration rapide');
    fireEvent.press(getByText('save'));

    expect(alertSpy).toHaveBeenCalledWith('error', 'selectEventType');
    expect(mockService.createSanitaryLog).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('utilise currentCycle comme cycle par defaut', async () => {
    const otherCycle = {
      ...activeCycle,
      id: 'cycle-2',
      cycle_name: 'Cycle Sanitaire B',
      pond_identifier: 'P2',
    };
    setSelectorState([activeCycle, otherCycle], otherCycle);
    mockService.createSanitaryLog.mockResolvedValueOnce({ id: 'san-2' } as any);

    const { getByText, getByPlaceholderText } = render(<SanitaryLogScreen navigation={navigation} />);

    fireEvent.press(getByText('sanitaryEventOther'));
    fireEvent.changeText(getByPlaceholderText('symptomsPlaceholder'), 'Observation');
    fireEvent.press(getByText('save'));

    await waitFor(() => {
      expect(mockService.createSanitaryLog).toHaveBeenCalledWith(
        'cycle-2',
        expect.objectContaining({
          event_type: 'other',
          symptoms: 'Observation',
        })
      );
    });
  });

  it('cree un log sanitaire en ligne', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setSelectorState([activeCycle]);
    mockService.createSanitaryLog.mockResolvedValueOnce({ id: 'san-1' } as any);

    const { getByText, getByPlaceholderText } = render(<SanitaryLogScreen navigation={navigation} />);

    fireEvent.press(getByText('sanitaryEventOther'));
    fireEvent.changeText(getByPlaceholderText('symptomsPlaceholder'), 'Observation mineure');
    fireEvent.changeText(getByPlaceholderText('exampleAffectedCount'), '12');
    fireEvent.press(getByText('save'));

    await waitFor(() => {
      expect(mockService.createSanitaryLog).toHaveBeenCalledWith(
        'cycle-1',
        expect.objectContaining({
          event_type: 'other',
          symptoms: 'Observation mineure',
          affected_count: 12,
        })
      );
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'success',
      'sanitarySuccessOther',
      expect.any(Array)
    );
    alertSpy.mockRestore();
  });

  it('bascule en offline quand l API est indisponible', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setSelectorState([activeCycle]);
    mockService.createSanitaryLog.mockRejectedValueOnce({ message: 'Network Error' });
    mockOffline.saveSanitaryLogOffline.mockResolvedValueOnce('offline-san-1');

    const { getByText, getByPlaceholderText } = render(<SanitaryLogScreen navigation={navigation} />);

    fireEvent.press(getByText('sanitaryEventTreatment'));
    fireEvent.changeText(getByPlaceholderText('symptomsPlaceholder'), 'Symptomes graves');
    fireEvent.press(getByText('save'));

    await waitFor(() => {
      expect(mockOffline.saveSanitaryLogOffline).toHaveBeenCalledWith(
        'cycle-1',
        expect.objectContaining({
          event_type: 'treatment',
          symptoms: 'Symptomes graves',
        })
      );
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'success',
      expect.stringContaining('offlineSaveMessage'),
      expect.any(Array)
    );
    alertSpy.mockRestore();
  });

  it('affiche les details de validation en cas erreur API', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setSelectorState([activeCycle]);
    mockService.createSanitaryLog.mockRejectedValueOnce({
      response: {
        data: {
          symptoms: ['Champ requis'],
        },
      },
    });

    const { getByText, getByPlaceholderText } = render(<SanitaryLogScreen navigation={navigation} />);

    fireEvent.press(getByText('sanitaryEventDisease'));
    fireEvent.changeText(getByPlaceholderText('symptomsPlaceholder'), 'Test');
    fireEvent.press(getByText('save'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('symptoms')
      );
    });

    alertSpy.mockRestore();
  });
});
