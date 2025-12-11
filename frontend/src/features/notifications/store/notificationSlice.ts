import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Notification } from '@/types/notifications';
import { notificationsService } from '@/services/notificationsService';

// =================== Ã‰TAT INITIAL ===================

interface NotificationState {
  notifications: Notification[];
  loading: boolean;
  error: string | null;
  unreadCount: number;
}

const initialState: NotificationState = {
  notifications: [],
  loading: false,
  error: null,
  unreadCount: 0,
};

// =================== ACTIONS ASYNC ===================

/**
 * RÃ©cupÃ¨re toutes les notifications de l'utilisateur
 */
export const fetchNotifications = createAsyncThunk(
  'notifications/fetchNotifications',
  async (_, { rejectWithValue }) => {
    try {
      const notifications = await notificationsService.getNotifications();
      return notifications as Notification[];
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors du chargement des notifications');
    }
  }
);

/**
 * Marque une notification comme lue
 */
export const markNotificationAsRead = createAsyncThunk(
  'notifications/markAsRead',
  async (notificationId: string, { rejectWithValue }) => {
    try {
      const notification = await notificationsService.markNotificationAsRead(notificationId);
      return notification;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors du marquage de la notification');
    }
  }
);

/**
 * Marque toutes les notifications comme lues
 */
export const markAllNotificationsAsRead = createAsyncThunk(
  'notifications/markAllAsRead',
  async (_, { rejectWithValue }) => {
    try {
      const result = await notificationsService.markAllNotificationsAsRead();
      return result?.count ?? 0;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors du marquage de toutes les notifications');
    }
  }
);

/**
 * Supprime une notification spÃ©cifique
 */
export const deleteNotification = createAsyncThunk(
  'notifications/deleteNotification',
  async (notificationId: string, { rejectWithValue }) => {
    try {
      await notificationsService.deleteNotification(notificationId);
      return notificationId;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors de la suppression de la notification');
    }
  }
);

/**
 * Supprime toutes les notifications lues
 */
export const deleteAllReadNotifications = createAsyncThunk(
  'notifications/deleteAllRead',
  async (_, { rejectWithValue }) => {
    try {
      await notificationsService.deleteAllReadNotifications();
      return;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors de la suppression des notifications');
    }
  }
);

// =================== SLICE ===================

export const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },

    // Mise Ã  jour locale du compteur de non-lues
    updateUnreadCount: (state) => {
      state.unreadCount = state.notifications.filter(n => !n.is_read).length;
    },

    // Reset complet de l'Ã©tat (utile lors de la dÃ©connexion)
    resetNotificationState: () => initialState,
  },

  extraReducers: (builder) => {
    // ========== FETCH NOTIFICATIONS ==========
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.notifications = action.payload as Notification[];
        state.unreadCount = state.notifications.filter(n => !n.is_read).length;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // ========== FETCH NOTIFICATIONS (SILENT) ==========
      .addCase(fetchNotificationsSilent.fulfilled, (state, action) => {
        state.notifications = action.payload as Notification[];
        state.unreadCount = state.notifications.filter(n => !n.is_read).length;
      })
      .addCase(fetchNotificationsSilent.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      // ========== MARK AS READ ==========
      .addCase(markNotificationAsRead.fulfilled, (state, action) => {
        const updatedNotification = action.payload;
        const index = state.notifications.findIndex(n => n.id === updatedNotification.id);

        if (index !== -1) {
          state.notifications[index] = updatedNotification;
          state.unreadCount = state.notifications.filter(n => !n.is_read).length;
        }
      })
      .addCase(markNotificationAsRead.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      // ========== MARK ALL AS READ ==========
      .addCase(markAllNotificationsAsRead.fulfilled, (state, action) => {
        const now = new Date().toISOString();
        state.notifications = state.notifications.map(n => ({
          ...n,
          is_read: true,
          read_at: n.read_at || now,
        }));
        state.unreadCount = 0;
      })
      .addCase(markAllNotificationsAsRead.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      // ========== DELETE NOTIFICATION ==========
      .addCase(deleteNotification.fulfilled, (state, action) => {
        const deletedId = action.payload;
        const deletedNotification = state.notifications.find(n => n.id === deletedId);

        // Supprimer de la liste
        state.notifications = state.notifications.filter(n => n.id !== deletedId);

        // Recalculer le compteur de notifications non lues
        state.unreadCount = state.notifications.filter(n => !n.is_read).length;
      })
      .addCase(deleteNotification.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      // ========== DELETE ALL READ ==========
      .addCase(deleteAllReadNotifications.fulfilled, (state) => {
        // Supprimer toutes les notifications lues
        state.notifications = state.notifications.filter(n => !n.is_read);
        // Recalculer le compteur (doit rester identique car on supprime que les lues)
        state.unreadCount = state.notifications.filter(n => !n.is_read).length;
      })
      .addCase(deleteAllReadNotifications.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

// =================== EXPORTS ===================

export const {
  clearError,
  updateUnreadCount,
  resetNotificationState,
} = notificationSlice.actions;

export default notificationSlice.reducer;

/**
 * Récupère les notifications sans activer le state "loading"
 * (utile pour le polling silencieux afin d'éviter les spinners automatiques).
 */
export const fetchNotificationsSilent = createAsyncThunk(
  'notifications/fetchNotificationsSilent',
  async (_, { rejectWithValue }) => {
    try {
      const notifications = await notificationsService.getNotifications();
      return notifications as Notification[];
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.detail || 'Erreur lors du chargement des notifications');
    }
  }
);

