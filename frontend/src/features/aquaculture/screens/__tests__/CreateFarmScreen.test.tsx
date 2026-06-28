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
    jest.clearAllMocks();
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    (useSelector as unknown as jest.Mock).mockImplementation(
      (selector: (state: any) => unknown) =>
        selector({ farmSetup: { cycleSimulation: { loading: false } } })
    );
  });

  it('n selectionne aucun type par defaut dans les deux formulaires', () => {
    const { queryByPlaceholderText, getByPlaceholderText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    expect(queryByPlaceholderText('createFarmUnitVolumePlaceholder')).toBeNull();
    expect(queryByPlaceholderText('createFarmUnitSurfacePlaceholder')).toBeNull();
    expect(getByPlaceholderText('createFarmBulkUnitCountPlaceholder').props.value).toBe('');
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

  it('garde la surface pour un etang sans la convertir en volume', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockSimulationSuccess();

    const { getByText, getByPlaceholderText, getAllByText } = render(
      <CreateFarmScreen navigation={navigation} />
    );

    fireEvent.press(getByText('createFarmSpeciesTilapia'));
    fireEvent.press(getAllByText('productionUnitTypePond')[0]);
    fireEvent.changeText(getByPlaceholderText('createFarmUnitNamePlaceholder'), 'Étang principal');
    fireEvent.changeText(getByPlaceholderText('createFarmUnitSurfacePlaceholder'), '120');
    fireEvent.press(getByText('+ createFarmAddUnitBtn'));

    await waitFor(() => {
      expect(getByText('Étang principal')).toBeTruthy();
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
