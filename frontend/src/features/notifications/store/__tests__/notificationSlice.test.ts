import { configureStore } from '@reduxjs/toolkit';
import notificationReducer, {
  clearError,
  updateUnreadCount,
  resetNotificationState,
  fetchNotifications,
  fetchNotificationsSilent,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllReadNotifications,
} from '../notificationSlice';
import { notificationsService } from '@/services/notificationsService';

jest.mock('@/services/notificationsService', () => ({
  notificationsService: {
    getNotifications: jest.fn(),
    markNotificationAsRead: jest.fn(),
    markAllNotificationsAsRead: jest.fn(),
    deleteNotification: jest.fn(),
    deleteAllReadNotifications: jest.fn(),
  },
}));

describe('features/notifications/store/notificationSlice', () => {
  const mockService = notificationsService as jest.Mocked<typeof notificationsService>;

  const notifs = [
    {
      id: 'n1',
      notification_type: 'alert',
      title: 'Alerte',
      message: 'Qualite eau',
      metadata: {},
      channels: ['in_app'],
      scheduled_for: '2026-02-20T09:00:00Z',
      is_sent: true,
      is_read: false,
      created_at: '2026-02-20T09:00:00Z',
      updated_at: '2026-02-20T09:00:00Z',
    },
    {
      id: 'n2',
      notification_type: 'info',
      title: 'Info',
      message: 'Ration',
      metadata: {},
      channels: ['in_app'],
      scheduled_for: '2026-02-20T09:00:00Z',
      is_sent: true,
      is_read: true,
      read_at: '2026-02-20T10:00:00Z',
      created_at: '2026-02-20T09:00:00Z',
      updated_at: '2026-02-20T10:00:00Z',
    },
  ] as any;

  const createStore = () =>
    configureStore({
      reducer: { notifications: notificationReducer },
    });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clearError, updateUnreadCount, resetNotificationState', () => {
    let state: any = {
      ...notificationReducer(undefined, { type: '@@INIT' }),
      notifications: notifs,
      error: 'boom',
      unreadCount: 999,
    };

    state = notificationReducer(state, clearError());
    expect(state.error).toBeNull();

    state = notificationReducer(state, updateUnreadCount());
    expect(state.unreadCount).toBe(1);

    state = notificationReducer(state, resetNotificationState());
    expect(state.notifications).toHaveLength(0);
    expect(state.unreadCount).toBe(0);
  });

  it('fetchNotifications success et reject', async () => {
    const store = createStore();

    mockService.getNotifications.mockResolvedValueOnce(notifs);
    await store.dispatch(fetchNotifications() as any);

    let state = store.getState().notifications;
    expect(state.notifications).toHaveLength(2);
    expect(state.unreadCount).toBe(1);
    expect(state.loading).toBe(false);

    mockService.getNotifications.mockRejectedValueOnce({
      response: { data: { detail: 'Erreur API' } },
    } as any);
    await store.dispatch(fetchNotifications() as any);

    state = store.getState().notifications;
    expect(state.error).toBe('Erreur API');
    expect(state.loading).toBe(false);
  });

  it('fetchNotificationsSilent met a jour sans loading', async () => {
    const store = createStore();
    mockService.getNotifications.mockResolvedValueOnce([notifs[0]] as any);

    await store.dispatch(fetchNotificationsSilent() as any);

    const state = store.getState().notifications;
    expect(state.notifications).toHaveLength(1);
    expect(state.unreadCount).toBe(1);
    expect(state.loading).toBe(false);
  });

  it('markNotificationAsRead met a jour une notification cible', async () => {
    const store = configureStore({
      reducer: { notifications: notificationReducer },
      preloadedState: {
        notifications: {
          ...notificationReducer(undefined, { type: '@@INIT' }),
          notifications: notifs,
          unreadCount: 1,
        },
      },
    });

    const updated = { ...notifs[0], is_read: true, read_at: '2026-02-20T11:00:00Z' };
    mockService.markNotificationAsRead.mockResolvedValueOnce(updated as any);

    await store.dispatch(markNotificationAsRead('n1') as any);

    const state = store.getState().notifications;
    expect(state.notifications.find((n) => n.id === 'n1')?.is_read).toBe(true);
    expect(state.unreadCount).toBe(0);
  });

  it('markAllNotificationsAsRead, deleteNotification et deleteAllReadNotifications', async () => {
    const store = configureStore({
      reducer: { notifications: notificationReducer },
      preloadedState: {
        notifications: {
          ...notificationReducer(undefined, { type: '@@INIT' }),
          notifications: notifs,
          unreadCount: 1,
        },
      },
    });

    mockService.markAllNotificationsAsRead.mockResolvedValueOnce({ count: 2 } as any);
    await store.dispatch(markAllNotificationsAsRead() as any);

    let state = store.getState().notifications;
    expect(state.unreadCount).toBe(0);
    expect(state.notifications.every((n) => n.is_read)).toBe(true);

    mockService.deleteNotification.mockResolvedValueOnce(undefined as any);
    await store.dispatch(deleteNotification('n1') as any);

    state = store.getState().notifications;
    expect(state.notifications.some((n) => n.id === 'n1')).toBe(false);

    mockService.deleteAllReadNotifications.mockResolvedValueOnce(undefined as any);
    await store.dispatch(deleteAllReadNotifications() as any);

    state = store.getState().notifications;
    expect(state.notifications).toHaveLength(0);
  });

  // ========== F1: Clock skew — read_at ne doit pas être inventé côté client ==========
  it('[F1] markAllNotificationsAsRead.fulfilled : read_at reste null pour les notifs non lues', async () => {
    const unreadNotif = {
      id: 'u1',
      notification_type: 'alert',
      title: 'Non lue',
      message: 'Test',
      metadata: {},
      channels: ['in_app'],
      scheduled_for: '2026-02-20T09:00:00Z',
      is_sent: true,
      is_read: false,
      read_at: null,
      created_at: '2026-02-20T09:00:00Z',
      updated_at: '2026-02-20T09:00:00Z',
    };

    const store = configureStore({
      reducer: { notifications: notificationReducer },
      preloadedState: {
        notifications: {
          ...notificationReducer(undefined, { type: '@@INIT' }),
          notifications: [unreadNotif] as any,
          unreadCount: 1,
        },
      },
    });

    mockService.markAllNotificationsAsRead.mockResolvedValueOnce({ count: 1 } as any);
    await store.dispatch(markAllNotificationsAsRead() as any);

    const state = store.getState().notifications;
    const updated = state.notifications.find((n) => n.id === 'u1');
    expect(updated?.is_read).toBe(true);
    // read_at NE doit PAS être un timestamp inventé côté client
    expect(updated?.read_at).toBeNull();
  });

  it('[F1] markAllNotificationsAsRead.fulfilled : read_at déjà défini est conservé', async () => {
    const alreadyReadNotif = {
      id: 'r1',
      notification_type: 'info',
      title: 'Déjà lue',
      message: 'Test',
      metadata: {},
      channels: ['in_app'],
      scheduled_for: '2026-02-20T09:00:00Z',
      is_sent: true,
      is_read: true,
      read_at: '2026-02-20T10:00:00Z',
      created_at: '2026-02-20T09:00:00Z',
      updated_at: '2026-02-20T10:00:00Z',
    };

    const store = configureStore({
      reducer: { notifications: notificationReducer },
      preloadedState: {
        notifications: {
          ...notificationReducer(undefined, { type: '@@INIT' }),
          notifications: [alreadyReadNotif] as any,
          unreadCount: 0,
        },
      },
    });

    mockService.markAllNotificationsAsRead.mockResolvedValueOnce({ count: 0 } as any);
    await store.dispatch(markAllNotificationsAsRead() as any);

    const state = store.getState().notifications;
    const updated = state.notifications.find((n) => n.id === 'r1');
    expect(updated?.read_at).toBe('2026-02-20T10:00:00Z');
  });

  // ========== F3: Clés i18n dans les erreurs thunk ==========
  it('[F3] fetchNotifications.rejected : utilise la clé i18n loadError comme fallback', async () => {
    const store = createStore();
    mockService.getNotifications.mockRejectedValueOnce(new Error('Network error'));
    await store.dispatch(fetchNotifications() as any);

    const state = store.getState().notifications;
    expect(state.error).toBe('loadError');
  });

  it('[F3] markNotificationAsRead.rejected : utilise la clé i18n markReadError comme fallback', async () => {
    const store = createStore();
    mockService.markNotificationAsRead.mockRejectedValueOnce(new Error('fail'));
    await store.dispatch(markNotificationAsRead('n1') as any);

    const state = store.getState().notifications;
    expect(state.error).toBe('markReadError');
  });

  it('[F3] markAllNotificationsAsRead.rejected : utilise la clé i18n markAllReadError', async () => {
    const store = createStore();
    mockService.markAllNotificationsAsRead.mockRejectedValueOnce(new Error('fail'));
    await store.dispatch(markAllNotificationsAsRead() as any);

    const state = store.getState().notifications;
    expect(state.error).toBe('markAllReadError');
  });

  it('[F3] deleteNotification.rejected : utilise la clé i18n deleteError', async () => {
    const store = createStore();
    mockService.deleteNotification.mockRejectedValueOnce(new Error('fail'));
    await store.dispatch(deleteNotification('n1') as any);

    const state = store.getState().notifications;
    expect(state.error).toBe('deleteError');
  });

  it('[F3] deleteAllReadNotifications.rejected : utilise la clé i18n deleteAllReadError', async () => {
    const store = createStore();
    mockService.deleteAllReadNotifications.mockRejectedValueOnce(new Error('fail'));
    await store.dispatch(deleteAllReadNotifications() as any);

    const state = store.getState().notifications;
    expect(state.error).toBe('deleteAllReadError');
  });

  it('[F3] fetchNotificationsSilent.rejected : utilise la clé i18n loadError', async () => {
    const store = createStore();
    mockService.getNotifications.mockRejectedValueOnce(new Error('silent fail'));
    await store.dispatch(fetchNotificationsSilent() as any);

    const state = store.getState().notifications;
    expect(state.error).toBe('loadError');
  });
});
