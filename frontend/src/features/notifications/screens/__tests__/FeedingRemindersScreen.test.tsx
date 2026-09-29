import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import FeedingRemindersScreen from '../FeedingRemindersScreen';
import { useFeedingReminders } from '../../reminders/useFeedingReminders';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../../reminders/useFeedingReminders', () => ({ useFeedingReminders: jest.fn() }));

const mockHook = useFeedingReminders as jest.MockedFunction<typeof useFeedingReminders>;

const baseState = () => ({
  settings: {
    enabled: true,
    times: [
      { id: 'a', hour: 8, minute: 30 },
      { id: 'b', hour: 16, minute: 30 },
    ],
    days: [1, 2, 3, 4, 5, 6, 7],
    bypassDnd: false,
  },
  loading: false,
  status: 'scheduled' as const,
  canAddTime: true,
  setEnabled: jest.fn(() => Promise.resolve('scheduled' as const)),
  saveTime: jest.fn(() => Promise.resolve('scheduled' as const)),
  removeTime: jest.fn(() => Promise.resolve('scheduled' as const)),
  toggleDay: jest.fn(() => Promise.resolve('scheduled' as const)),
  setBypassDnd: jest.fn(() => Promise.resolve('scheduled' as const)),
});

describe('FeedingRemindersScreen', () => {
  const navigation = { goBack: jest.fn() } as any;

  it('affiche les heures programmees et l etat actif', () => {
    mockHook.mockReturnValue(baseState());
    const { getByText } = render(<FeedingRemindersScreen navigation={navigation} />);

    expect(getByText('08h30')).toBeTruthy();
    expect(getByText('16h30')).toBeTruthy();
    expect(getByText('remindersActive')).toBeTruthy();
  });

  it('active les rappels via l interrupteur', () => {
    const state = { ...baseState(), settings: { ...baseState().settings, enabled: false } };
    mockHook.mockReturnValue(state);
    const { getByLabelText } = render(<FeedingRemindersScreen navigation={navigation} />);

    fireEvent(getByLabelText('remindersEnable'), 'valueChange', true);

    expect(state.setEnabled).toHaveBeenCalledWith(true);
  });

  it('ajoute une heure avec le selecteur', () => {
    const state = baseState();
    mockHook.mockReturnValue(state);
    const { getAllByText, getByLabelText, getByText } = render(<FeedingRemindersScreen navigation={navigation} />);

    fireEvent.press(getAllByText('reminderAddTime')[0]);
    fireEvent.press(getByLabelText('reminderIncreaseHour'));
    fireEvent.press(getByLabelText('reminderIncreaseMinute'));
    fireEvent.press(getByText('save'));

    expect(state.saveTime).toHaveBeenCalledWith({ id: undefined, hour: 13, minute: 5 });
  });

  it('demande confirmation avant de supprimer une heure', () => {
    const state = baseState();
    mockHook.mockReturnValue(state);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    const { getAllByLabelText } = render(<FeedingRemindersScreen navigation={navigation} />);

    fireEvent.press(getAllByLabelText('reminderDeleteTime')[0]);

    expect(state.removeTime).toHaveBeenCalledWith('a');
    alertSpy.mockRestore();
  });

  it('change les jours', () => {
    const state = baseState();
    mockHook.mockReturnValue(state);
    const { getByLabelText } = render(<FeedingRemindersScreen navigation={navigation} />);

    fireEvent.press(getByLabelText('weekdaySun'));

    expect(state.toggleDay).toHaveBeenCalledWith(1);
  });

  it('propose d ouvrir les reglages si les notifications sont bloquees', () => {
    mockHook.mockReturnValue({ ...baseState(), status: 'permission_denied' });
    const { getByText } = render(<FeedingRemindersScreen navigation={navigation} />);

    expect(getByText('remindersPermissionDenied')).toBeTruthy();
    expect(getByText('openSettings')).toBeTruthy();
  });
});
