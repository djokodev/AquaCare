import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { ReminderTimeModal } from '../ReminderTimeModal';

const setup = () => {
  const onConfirm = jest.fn();
  const utils = render(
    <ReminderTimeModal visible initialHour={8} initialMinute={30} title="t" onConfirm={onConfirm} onCancel={jest.fn()} />,
  );
  return { onConfirm, ...utils };
};

describe('ReminderTimeModal', () => {
  it('permet de saisir directement les minutes (ex. 02)', () => {
    const { getByTestId, getByText, onConfirm } = setup();
    fireEvent.changeText(getByTestId('reminder-minute-input'), '2');
    fireEvent(getByTestId('reminder-minute-input'), 'blur');
    expect(getByTestId('reminder-minute-input').props.value).toBe('02');
    fireEvent.press(getByText('save'));
    expect(onConfirm).toHaveBeenCalledWith(8, 2);
  });

  it('borne les valeurs saisies (heure max 23, minutes max 59)', () => {
    const { getByTestId, getByText, onConfirm } = setup();
    fireEvent.changeText(getByTestId('reminder-hour-input'), '99');
    fireEvent.changeText(getByTestId('reminder-minute-input'), '75');
    fireEvent.press(getByText('save'));
    expect(onConfirm).toHaveBeenCalledWith(23, 59);
  });

  it('garde le pas de 5 minutes avec les fleches', () => {
    const { getByLabelText, onConfirm, getByText } = setup();
    fireEvent.press(getByLabelText('reminderIncreaseMinute'));
    fireEvent.press(getByText('save'));
    expect(onConfirm).toHaveBeenCalledWith(8, 35);
  });
});
