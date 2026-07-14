import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import CalibrateCycleScreen from '../CalibrateCycleScreen';
import { aquacultureService } from '@/features/aquaculture/services/aquacultureService';
import { offlineService } from '@/services/offlineService';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key }),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: any) => <View {...props}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('@/features/aquaculture/services/aquacultureService', () => ({
  aquacultureService: {
    getProductionCycle: jest.fn(),
    getCalibrationTanks: jest.fn(),
    calibrateAllocation: jest.fn(),
    prepareOfflineData: jest.fn(() => ({ client_uuid: 'operation-uuid' })),
  },
}));

jest.mock('@/services/offlineService', () => ({
  offlineService: { saveCalibrationOperationOffline: jest.fn() },
}));

describe('CalibrateCycleScreen', () => {
  const service = aquacultureService as jest.Mocked<typeof aquacultureService>;
  const navigation = {
    addListener: jest.fn(() => jest.fn()),
    navigate: jest.fn(),
    goBack: jest.fn(),
  } as any;
  const route = {
    params: {
      sourceCycleId: 'cycle-1',
      sourceCycleUnitAllocationId: 'allocation-1',
      sourceUnitName: 'Bac 1',
      sourceCurrentCount: 1000,
      sourceCurrentBiomassKg: 100,
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    service.getProductionCycle.mockResolvedValue({
      id: 'cycle-1', species: 'clarias', cycle_name: 'Cycle A', current_count: 1000, current_biomass: 100,
    } as any);
    service.getCalibrationTanks.mockResolvedValue([{
      id: 'tank-1', name: 'Bac tri', volume_m3: 10, is_active: true, is_occupied: true,
      active_session: { current_count: 100, current_biomass: 10, current_average_weight: 100 },
    }] as any);
    service.calibrateAllocation.mockResolvedValue({
      destination_allocation: { current_fish_count: 300 }, warnings: ['weight_difference'],
    } as any);
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  it('soumet le formulaire complet depuis une allocation précise et affiche les valeurs serveur', async () => {
    const { getByLabelText, getByText } = render(
      <CalibrateCycleScreen navigation={navigation} route={route} />,
    );

    await waitFor(() => expect(getByText('Bac tri')).toBeTruthy());
    fireEvent.changeText(getByLabelText('transferredFish'), '200');
    fireEvent.changeText(getByLabelText('averageWeightGrams'), '150');
    fireEvent.changeText(getByLabelText('calibrationSampleCount'), '20');
    fireEvent.changeText(getByLabelText('calibrationSampleWeight'), '3000');
    fireEvent.press(getByText('calibrationSize_large'));
    fireEvent.changeText(getByLabelText('calibrationNotes'), 'Tri des gros poissons');

    expect(getByText(/destinationAfterValue/)).toBeTruthy();
    expect(getByText('calibrationWarning_weight_difference')).toBeTruthy();
    fireEvent.press(getByText('confirmCalibration'));

    await waitFor(() => expect(service.calibrateAllocation).toHaveBeenCalledWith(
      'allocation-1',
      expect.objectContaining({
        source_allocation_id: 'allocation-1',
        destination_production_unit_id: 'tank-1',
        transferred_count: 200,
        transferred_average_weight_g: 150,
        sample_count: 20,
        sample_total_weight_g: 3000,
        size_category: 'large',
        notes: 'Tri des gros poissons',
      }),
    ));
    expect(Alert.alert).toHaveBeenCalledWith('calibrationSuccess', expect.stringContaining('calibrationWarning_weight_difference'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('conserve une opération réseau en attente hors ligne', async () => {
    service.calibrateAllocation.mockRejectedValueOnce(new Error('offline'));
    const { getByLabelText, getByText } = render(
      <CalibrateCycleScreen navigation={navigation} route={route} />,
    );
    await waitFor(() => expect(getByText('Bac tri')).toBeTruthy());
    fireEvent.changeText(getByLabelText('transferredFish'), '100');
    fireEvent.changeText(getByLabelText('averageWeightGrams'), '120');
    fireEvent.press(getByText('confirmCalibration'));

    await waitFor(() => expect(offlineService.saveCalibrationOperationOffline).toHaveBeenCalledWith(
      'allocation-1',
      expect.objectContaining({ client_uuid: 'operation-uuid' }),
    ));
  });
});
