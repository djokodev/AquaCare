import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useDispatch, useSelector } from 'react-redux';

import CreateFarmScreen from '../CreateFarmScreen';
import { runCycleSimulation } from '@/features/aquaculture/store/farmSetupSlice';

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

describe('features/aquaculture/screens/CreateFarmScreen', () => {
  const mockDispatch = jest.fn();
  const navigation = {
    navigate: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    (useSelector as unknown as jest.Mock).mockImplementation(
      (selector: (state: any) => unknown) =>
        selector({ farmSetup: { cycleSimulation: { loading: false } } })
    );
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

  it('ajoute une unite puis ouvre la simulation avec les unites en etat', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockDispatch.mockImplementation((action: unknown) => {
      if (typeof action === 'function') {
        return {
          type: runCycleSimulation.fulfilled.type,
          payload: {},
        };
      }
      return action;
    });

    const { getByText, getByPlaceholderText, getAllByPlaceholderText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getByText('createFarmSpeciesTilapia'));
    fireEvent.changeText(getByPlaceholderText('createFarmUnitNamePlaceholder'), 'Bac 1');
    fireEvent.changeText(getAllByPlaceholderText('createFarmUnitVolumePlaceholder')[0], '3');
    fireEvent.press(getByText('+ createFarmAddUnitBtn'));

    expect(getByText('Bac 1')).toBeTruthy();

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
});
