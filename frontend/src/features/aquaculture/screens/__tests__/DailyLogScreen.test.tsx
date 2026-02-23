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
    hasPendingSync: jest.fn(),
    syncOfflineLogs: jest.fn(),
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

  const setSelectorCycles = (cycles: ProductionCycle[]) => {
    mockUseSelector.mockImplementation((selector: (state: any) => unknown) =>
      selector({
        aquaculture: {
          dashboardData: {
            active_cycles: cycles,
          },
        },
      })
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    mockOffline.hasPendingSync.mockResolvedValue(false);
    mockOffline.syncOfflineLogs.mockResolvedValue({ success: 0, failed: 0 });
  });

  it('affiche un etat vide sans cycle actif', () => {
    setSelectorCycles([]);

    const { getByText } = render(<DailyLogScreen navigation={navigation} />);

    expect(getByText('noActiveCycles')).toBeTruthy();
    fireEvent.press(getByText('createCycle'));
    expect(navigation.navigate).toHaveBeenCalledWith('NewCycle');
  });

  it('valide sample_count minimum quand sample_total_weight est renseigne', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setSelectorCycles([activeCycle]);

    const { getByText, getByPlaceholderText } = render(<DailyLogScreen navigation={navigation} />);

    fireEvent.changeText(getByPlaceholderText('exampleAffectedCount'), '3');
    fireEvent.changeText(getByPlaceholderText('Ex: 1200'), '150');
    fireEvent.press(getByText('save'));

    expect(alertSpy).toHaveBeenCalledWith('error', 'sampleCountTooLow');
    expect(mockService.createCycleLog).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('valide sample_count requis si sample_total_weight est fourni', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setSelectorCycles([activeCycle]);

    const { getByText, getByPlaceholderText } = render(<DailyLogScreen navigation={navigation} />);

    fireEvent.changeText(getByPlaceholderText('Ex: 1200'), '250');
    fireEvent.press(getByText('save'));

    expect(alertSpy).toHaveBeenCalledWith('error', 'sampleCountRequiredWithWeight');
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
