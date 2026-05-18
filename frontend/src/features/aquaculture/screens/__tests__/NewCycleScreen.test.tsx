import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import NewCycleScreen from '../NewCycleScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { offlineService } from '@/services/offlineService';
import { useDispatch } from 'react-redux';
import { useAuth } from '@/hooks/useAuth';
import { parseApiError, hasFieldError, isNetworkError } from '@/utils/errorParser';
import { formatAquacultureErrorWithAction } from '@/features/aquaculture/utils/aquacultureErrorPresenter';

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    createProductionCycle: jest.fn(),
  },
}));

jest.mock('@/services/offlineService', () => ({
  offlineService: {
    hasAnyPendingSync: jest.fn(),
    syncAllOfflineData: jest.fn(),
    saveNewCycleOffline: jest.fn(),
  },
}));

jest.mock('@/utils/errorParser', () => ({
  parseApiError: jest.fn(),
  logApiError: jest.fn(),
  hasFieldError: jest.fn(),
  isNetworkError: jest.fn().mockReturnValue(false),
}));

jest.mock('@/features/aquaculture/utils/aquacultureErrorPresenter', () => ({
  formatAquacultureErrorWithAction: jest.fn(),
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

describe('features/aquaculture/screens/NewCycleScreen', () => {
  const mockDispatch = jest.fn();
  const mockService = aquacultureService as jest.Mocked<typeof aquacultureService>;
  const mockOffline = offlineService as jest.Mocked<typeof offlineService>;
  const mockUseAuth = useAuth as jest.Mock;
  const mockParseApiError = parseApiError as jest.Mock;
  const mockFormatErrorWithAction = formatAquacultureErrorWithAction as jest.Mock;
  const mockHasFieldError = hasFieldError as jest.Mock;
  const mockIsNetworkError = isNetworkError as jest.Mock;
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    mockUseAuth.mockReturnValue({
      farmProfile: { farm_name: 'Ferme Test' },
    });
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
    mockFormatErrorWithAction.mockReturnValue('Erreur formatee');
    mockHasFieldError.mockReturnValue(false);
  });

  const fillValidForm = (getByText: any, getByPlaceholderText: any, getAllByPlaceholderText: any) => {
    const numericInputs = getAllByPlaceholderText('exampleValuePlaceholder');
    fireEvent.press(getByText('tilapia'));
    fireEvent.changeText(getByPlaceholderText('pondNamePlaceholder'), 'Bassin-1');
    fireEvent.changeText(getByPlaceholderText('cycleNamePlaceholder'), 'Cycle Test');
    fireEvent.changeText(numericInputs[0], '120');
    fireEvent.changeText(numericInputs[2], '1500');
    fireEvent.changeText(numericInputs[3], '12');
  };

  it('cree un cycle en ligne avec les donnees converties', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockService.createProductionCycle.mockResolvedValue({ id: 'cycle-1' } as any);

    const { getByText, getByPlaceholderText, getAllByPlaceholderText } = render(
      <NewCycleScreen navigation={navigation} />
    );

    fillValidForm(getByText, getByPlaceholderText, getAllByPlaceholderText);
    fireEvent.press(getByText('createCycle'));

    await waitFor(() => {
      expect(mockService.createProductionCycle).toHaveBeenCalledWith(
        expect.objectContaining({
          cycle_name: 'Cycle Test',
          species: 'tilapia',
          pond_identifier: 'Bassin-1',
          pond_surface_m2: 120,
          initial_count: 1500,
          initial_average_weight: 12,
        })
      );
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'success',
      'cycleCreatedSuccess',
      expect.any(Array)
    );

    const successCall = (alertSpy as jest.Mock).mock.calls.find((call) => call[1] === 'cycleCreatedSuccess');
    const buttons = successCall?.[2] as Array<{ onPress?: () => void }>;
    buttons?.[0]?.onPress?.();
    expect(navigation.replace).toHaveBeenCalledWith(
      'CycleSimulator',
      expect.objectContaining({
        cycleId: 'cycle-1',
      })
    );

    alertSpy.mockRestore();
  });

  it('bascule en sauvegarde offline sur erreur reseau', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockIsNetworkError.mockReturnValueOnce(true);
    mockService.createProductionCycle.mockRejectedValueOnce({ message: 'Network Error' });
    mockOffline.saveNewCycleOffline.mockResolvedValueOnce('offline-1');

    const { getByText, getByPlaceholderText, getAllByPlaceholderText } = render(
      <NewCycleScreen navigation={navigation} />
    );

    fillValidForm(getByText, getByPlaceholderText, getAllByPlaceholderText);
    fireEvent.press(getByText('createCycle'));

    await waitFor(() => {
      expect(mockOffline.saveNewCycleOffline).toHaveBeenCalledWith(
        expect.objectContaining({
          cycle_name: 'Cycle Test',
          species: 'tilapia',
        })
      );
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'success',
      'cycleCreatedOfflineSimulationInfo',
      expect.any(Array)
    );
    alertSpy.mockRestore();
  });

  it('affiche une erreur formatee quand l API renvoie une erreur metier', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const apiError = { response: { data: { initial_count: ['Trop eleve'] } } };
    mockService.createProductionCycle.mockRejectedValueOnce(apiError);
    mockParseApiError.mockReturnValue({
      status: 400,
      message: 'Erreur de validation',
      details: [{ field: 'initial_count', messages: ['Trop eleve'] }],
      rawError: apiError,
    });
    mockFormatErrorWithAction.mockReturnValue('Erreur de validation');

    const { getByText, getByPlaceholderText, getAllByPlaceholderText } = render(
      <NewCycleScreen navigation={navigation} />
    );

    fillValidForm(getByText, getByPlaceholderText, getAllByPlaceholderText);
    fireEvent.press(getByText('createCycle'));

    await waitFor(() => {
      expect(mockParseApiError).toHaveBeenCalledWith(apiError);
      expect(mockFormatErrorWithAction).toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(
        'error',
        'Erreur de validation',
        [{ text: 'ok', style: 'cancel' }]
      );
    });

    alertSpy.mockRestore();
  });
});
