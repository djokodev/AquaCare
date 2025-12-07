export type NotificationChannel = 'in_app' | 'email' | 'push' | string;

export interface Notification {
  id: string;
  user?: string;
  notification_type: string;
  notification_type_display?: string;
  priority?: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  channels: NotificationChannel[];
  scheduled_for: string;
  sent_at?: string | null;
  is_sent: boolean;
  is_read: boolean;
  read_at?: string | null;
  email_sent_at?: string | null;
  email_error?: string | null;
  push_sent_at?: string | null;
  push_error?: string | null;
  created_at: string;
  updated_at: string;
}
