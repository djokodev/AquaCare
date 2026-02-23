import { notificationsService } from '../notificationsService';
import { apiService } from '../api';

jest.mock('../api', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('services/notificationsService', () => {
  const mockApi = apiService as jest.Mocked<typeof apiService>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getNotifications gere payload array et payload pagine', async () => {
    mockApi.get
      .mockResolvedValueOnce({ data: [{ id: 'n1' }] } as any)
      .mockResolvedValueOnce({ data: { results: [{ id: 'n2' }] } } as any);

    const arrayData = await notificationsService.getNotifications();
    const pagedData = await notificationsService.getNotifications();

    expect(arrayData).toEqual([{ id: 'n1' }]);
    expect(pagedData).toEqual([{ id: 'n2' }]);
    expect(mockApi.get).toHaveBeenCalledWith('/notifications/');
  });

  it('markNotificationAsRead extrait notification ou data brut', async () => {
    mockApi.post
      .mockResolvedValueOnce({ data: { notification: { id: 'n1', is_read: true } } } as any)
      .mockResolvedValueOnce({ data: { id: 'n2', is_read: true } } as any);

    const nested = await notificationsService.markNotificationAsRead('n1');
    const plain = await notificationsService.markNotificationAsRead('n2');

    expect(nested.id).toBe('n1');
    expect(plain.id).toBe('n2');
    expect(mockApi.post).toHaveBeenNthCalledWith(1, '/notifications/n1/mark_read/');
    expect(mockApi.post).toHaveBeenNthCalledWith(2, '/notifications/n2/mark_read/');
  });

  it('markAll, deleteNotification, deleteAllRead et registerPushToken', async () => {
    mockApi.post
      .mockResolvedValueOnce({ data: { count: 3 } } as any)
      .mockResolvedValueOnce({ data: {} } as any)
      .mockResolvedValueOnce({ data: { saved: true } } as any);
    mockApi.delete.mockResolvedValueOnce(undefined as any);

    const markAll = await notificationsService.markAllNotificationsAsRead();
    await notificationsService.deleteNotification('n1');
    await notificationsService.deleteAllReadNotifications();
    const registered = (await notificationsService.registerPushToken({
      expo_push_token: 'ExponentPushToken[abc]',
      device_id: 'device-1',
      device_name: 'iPhone',
      platform: 'ios',
    })) as any;

    expect(markAll.count).toBe(3);
    expect(registered.saved).toBe(true);
    expect(mockApi.post).toHaveBeenNthCalledWith(1, '/notifications/mark_all_read/');
    expect(mockApi.delete).toHaveBeenCalledWith('/notifications/n1/');
    expect(mockApi.post).toHaveBeenNthCalledWith(2, '/notifications/delete_all_read/');
    expect(mockApi.post).toHaveBeenNthCalledWith(3, '/notifications/register_push_token/', {
      expo_push_token: 'ExponentPushToken[abc]',
      device_id: 'device-1',
      device_name: 'iPhone',
      platform: 'ios',
    });
  });
});
