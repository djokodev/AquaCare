import { apiService } from '@/services/api';
import { Notification } from '@/types/notifications';

type NotificationScope = {
  cycleId?: string | null;
};

type RegisterPushTokenPayload = {
  expo_push_token: string;
  device_id: string;
  device_name?: string;
  platform?: 'ios' | 'android';
};

const buildScopeConfig = (scope?: NotificationScope) => {
  const cycleId = scope?.cycleId?.trim();
  if (!cycleId) {
    return undefined;
  }

  return {
    params: {
      cycle_id: cycleId,
    },
  };
};

class NotificationsService {
  private readonly baseUrl = '/notifications';

  async getNotifications(scope?: NotificationScope): Promise<Notification[]> {
    const config = buildScopeConfig(scope);
    const anyResponse = await (config
      ? apiService.get(`${this.baseUrl}/`, config)
      : apiService.get(`${this.baseUrl}/`)) as any;
    const payload = anyResponse.data as { results?: Notification[] } | Notification[];
    if (Array.isArray(payload)) {
      return payload;
    }
    return payload.results ?? [];
  }

  async markNotificationAsRead(id: string) {
    const response = await apiService.post(`${this.baseUrl}/${id}/mark_read/`) as any;
    return response.data?.notification ?? response.data;
  }

  async markAllNotificationsAsRead(scope?: NotificationScope) {
    const config = buildScopeConfig(scope);
    const response = await (config
      ? apiService.post(`${this.baseUrl}/mark_all_read/`, undefined, config)
      : apiService.post(`${this.baseUrl}/mark_all_read/`)) as any;
    return response.data;
  }

  async deleteNotification(id: string) {
    await apiService.delete(`${this.baseUrl}/${id}/`);
  }

  async deleteAllReadNotifications(scope?: NotificationScope) {
    const config = buildScopeConfig(scope);
    if (config) {
      await apiService.post(`${this.baseUrl}/delete_all_read/`, undefined, config);
      return;
    }
    await apiService.post(`${this.baseUrl}/delete_all_read/`);
  }

  async registerPushToken(payload: RegisterPushTokenPayload) {
    const response = await apiService.post(`${this.baseUrl}/register_push_token/`, payload);
    return response.data;
  }
}

export const notificationsService = new NotificationsService();
