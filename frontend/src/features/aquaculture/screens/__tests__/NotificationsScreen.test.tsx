import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, AppState } from 'react-native';
import NotificationsScreen from '../NotificationsScreen';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchNotifications,
  fetchNotificationsSilent,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllReadNotifications,
} from '@/features/notifications/store/notificationSlice';
import { Notification } from '@/types/notifications';

jest.mock('react-redux', () => ({
  useDispatch: jest.fn(),
  useSelector: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
  useRoute: jest.fn(() => ({ params: { cycleId: 'cycle-1' } })),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@/features/notifications/store/notificationSlice', () => ({
  fetchNotifications: jest.fn(() => ({ type: 'notifications/fetch' })),
  fetchNotificationsSilent: jest.fn(() => ({ type: 'notifications/fetchSilent' })),
  markNotificationAsRead: jest.fn((id: string) => ({ type: 'notifications/markRead', payload: id })),
  markAllNotificationsAsRead: jest.fn(() => ({ type: 'notifications/markAllRead' })),
  deleteNotification: jest.fn((id: string) => ({ type: 'notifications/delete', payload: id })),
  deleteAllReadNotifications: jest.fn(() => ({ type: 'notifications/deleteAllRead' })),
}));

describe('features/aquaculture/screens/NotificationsScreen', () => {
  const mockDispatch = jest.fn();
  const mockUseSelector = useSelector as unknown as jest.Mock;
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
  } as any;

  const makeNotification = (override: Partial<Notification>): Notification => ({
    id: 'notif-1',
    notification_type: 'feeding_reminder',
    title: 'Rappel alimentation',
    message: 'Distribuer la ration',
    metadata: {},
    channels: ['in_app'],
    scheduled_for: '2026-02-19T10:00:00Z',
    is_sent: true,
    is_read: false,
    created_at: '2026-02-19T09:00:00Z',
    updated_at: '2026-02-19T09:00:00Z',
    ...override,
  });

  const setSelectorState = (state: {
    notifications: Notification[];
    loading: boolean;
    error: string | null;
    unreadCount: number;
  }) => {
    mockUseSelector.mockImplementation((selector: (s: any) => unknown) =>
      selector({
        notifications: state,
        aquaculture: {
          currentCycle: {
            id: 'cycle-1',
            cycle_name: 'Cycle Tilapia 2026',
          },
        },
      })
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useDispatch as unknown as jest.Mock).mockReturnValue(mockDispatch);
    mockDispatch.mockReturnValue({ unwrap: jest.fn().mockResolvedValue(undefined) });
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('affiche l etat erreur et permet retry', () => {
    setSelectorState({
      notifications: [],
      loading: false,
      error: 'Erreur notifications',
      unreadCount: 0,
    });

    const { getByText } = render(<NotificationsScreen navigation={navigation} />);

    expect(getByText('Erreur notifications')).toBeTruthy();
    fireEvent.press(getByText('retry'));
    expect(fetchNotifications).toHaveBeenCalledWith({ cycleId: 'cycle-1' });
  });

  it('filtre les notifications par statut lu/non lu', () => {
    setSelectorState({
      notifications: [
        makeNotification({ id: 'n1', title: 'Notif non lue', is_read: false }),
        makeNotification({ id: 'n2', title: 'Notif lue', is_read: true }),
      ],
      loading: false,
      error: null,
      unreadCount: 1,
    });

    const { getByText, queryByText } = render(<NotificationsScreen navigation={navigation} />);

    expect(getByText('Notif non lue')).toBeTruthy();
    expect(getByText('Notif lue')).toBeTruthy();

    fireEvent.press(getByText('unread'));
    expect(getByText('Notif non lue')).toBeTruthy();
    expect(queryByText('Notif lue')).toBeNull();

    fireEvent.press(getByText('read'));
    expect(getByText('Notif lue')).toBeTruthy();
    expect(queryByText('Notif non lue')).toBeNull();
  });

  it('conserve les données lors d une erreur de refresh', () => {
    setSelectorState({ notifications: [makeNotification({ title: 'Notification conservée' })], loading: false, error: 'loadError', unreadCount: 1 });
    const screen = render(<NotificationsScreen navigation={navigation} />);
    expect(screen.getByText('Notification conservée')).toBeTruthy();
    expect(screen.getByText('loadError')).toBeTruthy();
  });

  it('masque le contexte du cycle dans une notification', () => {
    setSelectorState({
      notifications: [
        makeNotification({
          id: 'n1',
          title: 'Alerte sanitaire',
          metadata: { cycle_name: 'Cycle Tilapia 2026' },
        }),
      ],
      loading: false,
      error: null,
      unreadCount: 1,
    });

    const { queryByText } = render(<NotificationsScreen navigation={navigation} />);

    expect(queryByText('notificationCycleContext')).toBeNull();
  });

  it('marque une notification non lue comme lue', async () => {
    setSelectorState({
      notifications: [makeNotification({ id: 'n1', title: 'Notif non lue', is_read: false })],
      loading: false,
      error: null,
      unreadCount: 1,
    });

    const { getByText } = render(<NotificationsScreen navigation={navigation} />);
    fireEvent.press(getByText('markAsRead'));

    await waitFor(() => {
      expect(markNotificationAsRead).toHaveBeenCalledWith('n1');
      expect(mockDispatch).toHaveBeenCalled();
    });
  });

  it('marque tout comme lu et supprime les notifications', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    setSelectorState({ notifications: [makeNotification({ id: 'n1', is_read: false }), makeNotification({ id: 'n2', is_read: true })], loading: false, error: null, unreadCount: 1 });
    const screen = render(<NotificationsScreen navigation={navigation} />);

    fireEvent.press(screen.getByLabelText('markAllAsRead'));
    let alertCall = (Alert.alert as jest.Mock).mock.calls.at(-1);
    await alertCall[2].find((action: { text: string }) => action.text === 'confirm').onPress();
    expect(markAllNotificationsAsRead).toHaveBeenCalledWith({ cycleId: 'cycle-1' });

    fireEvent.press(screen.getAllByLabelText('deleteNotification')[0]);
    alertCall = (Alert.alert as jest.Mock).mock.calls.at(-1);
    await alertCall[2].find((action: { text: string }) => action.text === 'confirm').onPress();
    expect(deleteNotification).toHaveBeenCalledWith('n1');

    fireEvent.press(screen.getByLabelText('deleteAllRead'));
    alertCall = (Alert.alert as jest.Mock).mock.calls.at(-1);
    await alertCall[2].find((action: { text: string }) => action.text === 'confirm').onPress();
    expect(deleteAllReadNotifications).toHaveBeenCalledWith({ cycleId: 'cycle-1' });
  });

  it('charge et rafraichit les notifications selon le cycle de session', () => {
    setSelectorState({
      notifications: [],
      loading: false,
      error: null,
      unreadCount: 0,
    });

    render(<NotificationsScreen navigation={navigation} />);

    expect(fetchNotifications).toHaveBeenCalledWith({ cycleId: 'cycle-1' });
  });
});
